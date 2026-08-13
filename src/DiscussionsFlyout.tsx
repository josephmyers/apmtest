import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  FormGroup,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Menu,
  Paper,
  Radio,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ForumIcon from "@mui/icons-material/Forum";
import SortIcon from "@mui/icons-material/Sort";
import FilterListIcon from "@mui/icons-material/FilterList";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useAuth } from "./AuthContext";
import {
  getTeamMembers,
  getDiscussions,
  fetchAudio,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  markDiscussionRead,
  getDiscussionMessages,
  createDiscussionMessage,
  updateDiscussionMessage,
  deleteDiscussionMessage,
  type TeamMember,
  type Discussion,
  type DiscussionMessage,
  type MessageContent,
  type MessageAudioLink,
} from "./api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import MiniAudioPlayer from "./MiniAudioPlayer";
import RadialAudioPlayer from "./RadialAudioPlayer";
import { clipAudio } from "./audioUtils";
import {
  formatTime,
  parseTimeRange,
  rangeLabel,
  applyRangeToText,
  formatShortDateTime,
  type TimeRange,
} from "./formatTime";
import DiscussionComposer from "./DiscussionComposer";
import { useResolvedLinks } from "./useResolvedLinks";
import EmailAvatar from "./EmailAvatar";
import { getStepById } from "./steps";

interface DiscussionsFlyoutProps {
  open: boolean | TimeRange;
  onClose: () => void;
  passageId: number;
  step: number;
  projectId?: number;
  passageAudio?: Blob;
  markers?: number[];
  onUnreadChange?: (hasUnread: boolean) => void;
}

type SortKey = "topic" | "assignee" | "newest" | "oldest";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "topic", label: "Topic" },
  { key: "assignee", label: "Assignee" },
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
];

// Deterministic swatch color for a passage+step: every discussion from the same
// passage+step shares one color. Hue is hashed from the key; fixed saturation +
// lightness keep the colors harmonious (never garish) however many appear.
const passageStepColor = (passageId: number, step: number): string => {
  const key = `${passageId}:${step}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
};

/**
 * Slide-out pane hosting the Discussions workflow for a passage+step.
 */
export default function DiscussionsFlyout({
  open,
  onClose,
  passageId,
  step,
  projectId,
  passageAudio,
  markers,
  onUnreadChange,
}: DiscussionsFlyoutProps) {
  const { token, user, activeTeamId } = useAuth();

  const [view, setView] = useState<"list" | "form">("list");
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);
  // Open row-actions menu: the anchor element + the discussion it acts on.
  const [menu, setMenu] = useState<{ anchorEl: HTMLElement; discussion: Discussion } | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("oldest");
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);

  // Filters
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [allSteps, setAllSteps] = useState(false);
  const [allPassages, setAllPassages] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set()); // "" = Uncategorized; empty = All
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // New/edit thread form. `editingId` null = creating a new thread.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [assignee, setAssignee] = useState(""); // assignee email, "" = unassigned
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [links, setLinks] = useState<MessageAudioLink[]>([]);

  const [discussionsWithUnsentMessagesById, setDiscussionsWithUnsentMessagesById] = useState<Set<number>>(new Set());
  const [confirmClose, setConfirmClose] = useState(false);
  const onUnsentChanged = useCallback((id: number, hasDraft: boolean) => {
    setDiscussionsWithUnsentMessagesById((prev) => {
      if (prev.has(id) === hasDraft) return prev;
      const next = new Set(prev);
      if (hasDraft) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const requestClose = () => {
    if (discussionsWithUnsentMessagesById.size > 0) setConfirmClose(true);
    else onClose();
  };

  const shownDiscussions = discussions
    .filter((d) => d.resolved === showResolved)
    .filter((d) => categoryFilter.size === 0 || categoryFilter.has(d.category))
    .sort((a, b) => {
      switch (sortBy) {
        case "topic":    return a.topic.localeCompare(b.topic) || a.id - b.id;
        case "assignee": return (a.assigneeEmail ?? "￿").localeCompare(b.assigneeEmail ?? "￿") || a.id - b.id;
        case "newest":   return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
        case "oldest":   return a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
      }
    });

  const categoryOptions = [
    "",
    ...Array.from(new Set(discussions.map((d) => d.category).filter(Boolean))),
  ];

  const filtersActive =
    showResolved || allSteps || allPassages || categoryFilter.size > 0;

  // Resolve a passage's audio for clip previews: the current passage reuses the
  // already-loaded blob; other passages (shown via All Passages/Steps) are
  // fetched once and cached.
  const audioCache = useRef<Map<number, Promise<Blob | null>>>(new Map());
  const getPassageAudio = useCallback(
    (pid: number): Promise<Blob | null> => {
      if (pid === passageId) return Promise.resolve(passageAudio ?? null);
      const cache = audioCache.current;
      let pending = cache.get(pid);
      if (!pending) {
        pending = token ? fetchAudio(token, pid) : Promise.resolve(null);
        cache.set(pid, pending);
      }
      return pending;
    },
    [passageId, passageAudio, token],
  );

  const loadList = useCallback((idToExpand?: number) => {
    if (!token || !passageId || !step) return;
    setLoadingList(true);
    getDiscussions(token, passageId, step, {
      allSteps,
      projectId: allPassages ? projectId : undefined,
    })
      .then((list) =>
        setDiscussions(
          idToExpand == null
            ? list
            : list.map((d) => (d.id === idToExpand ? { ...d, expanded: true } : d)),
        ),
      )
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [token, passageId, step, allSteps, allPassages, projectId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!open) return;
    if (typeof open === "object") openCreate(open);
    else setView("list");
  }, [open]);

  useEffect(() => {
    onUnreadChange?.(
      discussions.some(
        (d) => d.passageId === passageId && d.step === step && !d.resolved && d.unread,
      ),
    );
  }, [discussions]);

  useEffect(() => {
    if (!token || !activeTeamId) return;
    getTeamMembers(token, activeTeamId)
      .then(({ members: list }) => setMembers(list))
      .catch(() => {});
  }, [token, activeTeamId]);

  const getUserId = (email: string) =>
    members.find((m) => m.email === email)?.userId ?? null;

  const openCreate = (range = selection) => {
    setEditingId(null);
    setTopic(range ? rangeLabel(range) : "");
    setAssignee("");
    setCategory("");
    setText("");
    setAudio(null);
    setLinks([]);
    setView("form");
    audioPlayerRef.current?.updateSelection(range);
  };

  const openEdit = (d: Discussion) => {
    setEditingId(d.id);
    setTopic(d.topic);
    setAssignee(d.assigneeEmail ?? "");
    setCategory(d.category);
    setText("");
    setAudio(null);
    setView("form");
    audioPlayerRef.current?.updateSelection(parseTimeRange(d.topic));
  };

  const canSubmit =
    topic.trim() !== "" &&
    (editingId !== null || text.trim() !== "" || audio !== null);

  const submitForm = async () => {
    if (!token || !canSubmit) return;
    const fields = {
      topic: topic.trim(),
      category: category.trim(),
      assigneeId: assignee ? getUserId(assignee) : null,
    };
    try {
      if (editingId !== null) {
        const d = discussions.find((x) => x.id === editingId)!;
        const { discussion } = await updateDiscussion(token, editingId, {
          ...fields,
          resolved: d.resolved
        });
        updateDiscussionState(discussion);
      } else {
        const content: MessageContent = audio ? { audio } : { text: text.trim() };
        const { discussion } = await createDiscussion(token, passageId, step, fields, content, links);
        loadList(discussion.id);
      }
      setView("list");
    } catch {
      /* surfaced elsewhere; keep the form open */
    }
  };

  const closeMenu = () => setMenu(null);

  const handleToggleResolved = async () => {
    if (!token || !menu) return;
    const d = menu.discussion;
    closeMenu();
    try {
      const { discussion } = await updateDiscussion(token, d.id, {
        topic: d.topic,
        category: d.category,
        assigneeId: d.assigneeEmail !== null ? getUserId(d.assigneeEmail) : null,
        resolved: !d.resolved,
      });
      updateDiscussionState(discussion);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async () => {
    if (!token || !menu) return;
    const id = menu.discussion.id;
    closeMenu();
    try {
      await deleteDiscussion(token, id);
      setDiscussions((prev) => prev.filter((x) => x.id !== id));
    } catch {
      /* ignore */
    }
  };

  const markRead = (id: number) =>
    setDiscussions((prev) => prev.map((x) => (x.id === id ? { ...x, unread: false } : x)));

  const updateDiscussionState = (discussion: Discussion) =>
    setDiscussions((prev) => prev.map((x) => (x.id === discussion.id ? discussion : x)));

  const headerTitle =
    view === "form"
      ? editingId !== null
        ? "Edit Discussion"
        : "New Discussion"
      : "Discussions";

  return (
    <Drawer
      anchor="right"
      open={!!open}
      ModalProps={{ keepMounted: true }}
      onClose={(_e, reason) => {
        if (reason !== "escapeKeyDown") requestClose();
      }}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "95%", sm: 420 },
            maxWidth: "100%",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      {/* ─── Docked header ─────────────────────────────────────────── */}
      <Box sx={{ flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
          {view === "list" ? (
            <ForumIcon sx={{ mx: "2px !important" }} />
          ) : (
            <IconButton
              size="small"
              aria-label="back"
              onClick={() => (typeof open === "object" ? onClose() : setView("list"))}
              sx={{ px: "2px !important" }}
            >
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }} noWrap>
            {headerTitle}
          </Typography>
          {view === "list" && (
            <>
              <IconButton size="small" onClick={(e) => setSortAnchor(e.currentTarget)}>
                <SortIcon />
              </IconButton>
              <IconButton size="small" onClick={(e) => setFilterAnchor(e.currentTarget)}>
                <Badge variant="dot" invisible={!filtersActive}>
                  <FilterListIcon />
                </Badge>
              </IconButton>
              <IconButton size="small" onClick={() => openCreate()}>
                <AddIcon />
              </IconButton>
              <IconButton size="small" onClick={requestClose}>
                <CloseIcon />
              </IconButton>
            </>
          )}
        </Stack>

        {passageAudio && (
          <Box sx={{ mx: 1, mb: 1, p: 0.5, borderColor: "divider", borderWidth: 1, borderStyle: "solid", borderRadius: 2 }}>
            <AudioPlayer
              label="discussion"
              ref={audioPlayerRef}
              audioSource={passageAudio}
              markers={markers}
              height={48}
              enableDragSelection
              enableZoom={false}
              showUndo={false}
              onSelectionChange={(sel) => {
                setSelection(sel);
                // In the form, selecting or clearing a range adds/removes it in the topic.
                if (view === "form") setTopic((t) => applyRangeToText(t, sel));
              }}
              formatTimeDisplay={(t, d) => `${formatTime(t)} / ${formatTime(d || 0)}`}
            />
          </Box>
        )}
      </Box>

      {/* ─── Body ──────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
        {view === "form" && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              size="small"
              fullWidth
              autoFocus
            />
            <TextField
              label="Assignee"
              select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              size="small"
              fullWidth
            >
              <MenuItem value="">
                <em>Unassigned</em>
              </MenuItem>
              {members.map((m) => (
                <MenuItem key={m.userId} value={m.email}>
                  {m.email}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              freeSolo
              size="small"
              options={categoryOptions.filter(Boolean)}
              value={category || null}
              onChange={(_e, v) => setCategory(v ?? "")}
              onInputChange={(_e, v) => setCategory(v)}
              renderInput={(params) => <TextField {...params} label="Category" fullWidth />}
            />

            {/* The opening message is only set when creating. */}
            {editingId === null && (
              <DiscussionComposer
                text={text}
                onTextChange={setText}
                audio={audio}
                onAudioChange={setAudio}
                links={links}
                onLinksChange={setLinks}
                passageId={passageId}
                projectId={projectId!}
                placeholder="Discussion"
              />
            )}

            <Button variant="primary" fullWidth disabled={!canSubmit} onClick={submitForm}>
              {editingId !== null ? "Save" : "Start Discussion"}
            </Button>
          </Stack>
        )}

        <Box sx={{ display: view === "form" ? "none" : "block" }}>
          {loadingList ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
              <CircularProgress />
            </Box>
          ) : shownDiscussions.length === 0 ? (
            <Box sx={{ textAlign: "center", mt: 6, color: "text.secondary" }}>
              <Typography variant="body2">No discussions yet. Tap + to start one.</Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {shownDiscussions.map((d) => (
                <Discussion
                  key={d.id}
                  discussion={d}
                  token={token}
                  currentUserId={user?.id ?? null}
                  currentPassageId={passageId}
                  currentStep={step}
                  projectId={projectId!}
                  getPassageAudio={getPassageAudio}
                  onMenu={(anchorEl, discussion) => setMenu({ anchorEl, discussion })}
                  onRead={markRead}
                  onUnsentChanges={onUnsentChanged}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {/* ─── Sort menu ────────────────────────────────────────────────── */}
      <Menu anchorEl={sortAnchor} open={sortAnchor !== null} onClose={() => setSortAnchor(null)}>
        {SORT_OPTIONS.map((o) => (
          <MenuItem
            key={o.key}
            onClick={() => {
              setSortBy(o.key);
              setSortAnchor(null);
            }}
          >
            <ListItemIcon>
              <Radio
                edge="start"
                size="small"
                checked={sortBy === o.key}
                tabIndex={-1}
                disableRipple
              />
            </ListItemIcon>
            <ListItemText>{o.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* ─── Shared row-actions menu ──────────────────────────────────── */}
      <Menu anchorEl={menu?.anchorEl ?? null} open={menu !== null} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menu) openEdit(menu.discussion);
            closeMenu();
          }}
        >
          Edit
        </MenuItem>
        <MenuItem onClick={handleToggleResolved}>
          {menu?.discussion.resolved ? "Reopen" : "Resolve"}
        </MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </Menu>

      {/* ─── Filter menu ──────────────────────────────────────────────── */}
      <Menu anchorEl={filterAnchor} open={filterAnchor !== null} onClose={() => setFilterAnchor(null)}>
        <FilterCheckItem
          label="Resolved"
          checked={showResolved}
          onToggle={() => setShowResolved((v) => !v)}
        />
        <FilterCheckItem
          label="All Steps"
          checked={allSteps}
          onToggle={() => setAllSteps((v) => !v)}
        />
        <FilterCheckItem
          label="All Passages"
          checked={allPassages}
          disabled={!projectId}
          onToggle={() => setAllPassages((v) => !v)}
        />
        {/* Category menu option */}
        <MenuItem onClick={() => { setFilterAnchor(null); setCategoryDialogOpen(true); }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 2 }}>
            <Typography sx={{ flexShrink: 0 }}>Category</Typography>
            <Box sx={{ flex: "1 1 0", maxWidth: "80px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "end", mr: "6px" }}>
              {categoryFilter.size > 1 ? (
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    bgcolor: "neutral.black",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {categoryFilter.size}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" noWrap sx={{mt: "2px"}}>
                  {categoryFilter.size === 0 ? "All" : ([...categoryFilter][0] || "Uncategorized")}
                </Typography>
              )}
            </Box>
          </Box>
        </MenuItem>
      </Menu>

      <Dialog open={confirmClose} onClose={() => setConfirmClose(false)} fullWidth maxWidth="xs">
        <DialogTitle>Confirm Close</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            You have unsent messages. Are you sure you want to close?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant='primary' onClick={() => setConfirmClose(false)}>Stay Open</Button>
          <Button
            onClick={() => {
              setConfirmClose(false);
              onClose();
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {categoryDialogOpen && (
        <CategoryFilterDialog
          options={categoryOptions}
          selected={categoryFilter}
          onCancel={() => setCategoryDialogOpen(false)}
          onSave={(next) => {
            setCategoryFilter(next);
            setCategoryDialogOpen(false);
          }}
        />
      )}
    </Drawer>
  );
}

function FilterCheckItem({
  label,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <MenuItem disabled={disabled} onClick={onToggle}>
      <ListItemText>{label}</ListItemText>
      <ListItemIcon>
        <Checkbox edge="end" size="small" checked={checked} tabIndex={-1} disableRipple />
      </ListItemIcon>
    </MenuItem>
  );
}

function CategoryFilterDialog({
  options,
  selected,
  onSave,
  onCancel,
}: {
  options: string[];
  selected: Set<string>;
  onSave: (next: Set<string>) => void;
  onCancel: () => void;
}) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(() => new Set(selected));

  const toggle = (value: string) =>
    setSelectedOptions((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const handleSave = () =>
    onSave(new Set([...selectedOptions].filter((v) => options.includes(v))));

  return (
    <Dialog open onClose={onCancel} fullWidth>
      <DialogTitle>Filter by Category</DialogTitle>
      <DialogContent>
        <FormGroup>
          {options.map((value) => (
            <FormControlLabel
              key={value || "__uncategorized__"}
              control={<Checkbox checked={selectedOptions.has(value)} onChange={() => toggle(value)} />}
              label={value || "Uncategorized"}
            />
          ))}
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Discussion row ──────────────

function Discussion({
  discussion,
  token,
  currentUserId,
  currentPassageId,
  currentStep,
  projectId,
  getPassageAudio,
  onMenu,
  onRead,
  onUnsentChanges
}: {
  discussion: Discussion;
  token: string | null;
  currentUserId: number | null;
  currentPassageId: number;
  currentStep: number;
  projectId: number;
  getPassageAudio: (passageId: number) => Promise<Blob | null>;
  onMenu: (anchorEl: HTMLElement, d: Discussion) => void;
  onRead: (id: number) => void;
  onUnsentChanges: (id: number, hasDraft: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<DiscussionMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAudio, setReplyAudio] = useState<Blob | null>(null);
  const [replyLinks, setReplyLinks] = useState<MessageAudioLink[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (discussion.expanded) toggle();
  }, []);

  // If the topic is a time range, clip the passage to it in the background.
  const range = useMemo(() => parseTimeRange(discussion.topic), [discussion.topic]);
  const [clip, setClip] = useState<Blob | null>(null);
  useEffect(() => {
    if (!range) {
      setClip(null);
      return;
    }
    let cancelled = false;
    getPassageAudio(discussion.passageId)
      .then((blob) => (blob ? clipAudio(blob, range.start, range.end) : null))
      .then((b) => { if (!cancelled) setClip(b && b.size > 0 ? b : null); })
      .catch(() => { if (!cancelled) setClip(null); });
    return () => { cancelled = true; };
  }, [range, discussion.passageId, getPassageAudio]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || !token) return;
    if (messages === null) {
      setLoading(true);
      getDiscussionMessages(token, discussion.id)
        .then(setMessages)
        .catch(() => setMessages([]))
        .finally(() => {
          setLoading(false);
          root.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }
    
    if (discussion.unread) {
      markDiscussionRead(token, discussion.id).catch(() => {});
      onRead(discussion.id);
    }
  };

  const canSend = replyText.trim() !== "" || replyAudio !== null;

  useEffect(() => onUnsentChanges(discussion.id, canSend), [canSend, discussion.id, onUnsentChanges]);
  // Clear on unmount, i.e. resolve and delete
  useEffect(() => () => onUnsentChanges(discussion.id, false), [discussion.id, onUnsentChanges]);

  const sendReply = async () => {
    if (!token || !canSend) return;
    const content: MessageContent = replyAudio ? { audio: replyAudio } : { text: replyText.trim() };
    try {
      const { message } = await createDiscussionMessage(token, discussion.id, content, replyLinks);
      setMessages((prev) => [...(prev ?? []), message]);
      setReplyText("");
      setReplyAudio(null);
      setReplyLinks([]);
    } catch {
      /* keep the draft */
    }
  };

  const removeMessage = async (m: DiscussionMessage) => {
    if (!token) return;
    try {
      await deleteDiscussionMessage(token, m.id);
      setMessages((prev) => (prev ?? []).filter((x) => x.id !== m.id));
    } catch {
      /* ignore */
    }
  };

  // Persist an edit emitted by the edit dialog, then swap the updated message
  // into the list. Throws on failure so the dialog stays open.
  const saveMessage = async (
    id: number,
    content: MessageContent,
    links: MessageAudioLink[],
  ) => {
    if (!token) return;
    const { message } = await updateDiscussionMessage(token, id, content, links);
    setMessages((prev) => (prev ?? []).map((x) => (x.id === message.id ? message : x)));
  };

  const showLocation =
    discussion.passageId !== currentPassageId || discussion.step !== currentStep;
  const hasCategory = !!discussion.category;
  const showSecondLine = showLocation || hasCategory;

  return (
    <Paper ref={root} sx={{ borderRadius: 2 }}>
      <Box
        onClick={toggle}
        sx={{
          position: "relative",
          cursor: "pointer",
          px: 1.5,
          py: 1,
          bgcolor: "neutral.light",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {discussion.unread && (
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
          )}
          {clip && (
            <Box
              sx={{ display: "flex", justifyContent: "center" }}
              onClick={(e) => e.stopPropagation()}
            >
              <RadialAudioPlayer audio={clip} size={24} />
            </Box>
          )}
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: discussion.unread ? 700 : 500 }}
            noWrap
          >
            {discussion.topic}
          </Typography>
          <ExpandMoreIcon
            fontSize="small"
            sx={{
              color: "text.secondary",
              transition: "transform 0.2s",
              transform: expanded ? "rotate(180deg)" : "none",
              marginRight: "auto !important"
            }}
          />
          
          {discussion.assigneeEmail && <EmailAvatar email={discussion.assigneeEmail} />}
          <IconButton
            size="small"
            aria-label="discussion actions"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e.currentTarget, discussion);
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Stack>

        {showSecondLine &&
          (showLocation ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{ my: 0.75 }}
            >
              <Box
                sx={{
                  width: 11,
                  height: 11,
                  borderRadius: "2px",
                  bgcolor: passageStepColor(discussion.passageId, discussion.step),
                  flexShrink: 0,
                }}
              />
              <Typography variant="caption" color="text.secondary" noWrap>
                {discussion.passageReference} · {getStepById(discussion.step)?.title}
              </Typography>
            </Stack>
          ) : (
            // Category but no location line: reserve one caption line of height so a
            // header is only ever one or two lines tall.
            <Typography variant="caption" noWrap sx={{ mt: 0.5, display: "block" }}>
              &nbsp;
            </Typography>
          ))}

        {hasCategory && (
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              right: 6,
              maxWidth: "150px",
              bgcolor: "neutral.lightGrey",
              px: 1,
              pt: 0.25,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12
            }}
          >
            <Typography variant="caption" noWrap sx={{ display: "block" }}>
              {discussion.category}
            </Typography>
          </Box>
        )}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{m: 1.5}}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={3}>
              {(messages ?? []).map((m, _, messages) => (
                <MessageRow
                  key={m.id}
                  canDelete={messages.length > 1}
                  message={m}
                  isOwn={m.authorId === currentUserId}
                  isTopicAuthor={m.authorId === messages[0].authorId}
                  passageId={discussion.passageId}
                  projectId={projectId}
                  onSave={(content, links) => saveMessage(m.id, content, links)}
                  onDelete={() => removeMessage(m)}
                />
              ))}
            </Stack>
          )}

          {/* Inline reply, below the messages. The composer shows the Send button. */}
          <Box sx={{ mt: 1.5 }}>
            <DiscussionComposer
              text={replyText}
              onTextChange={setReplyText}
              audio={replyAudio}
              onAudioChange={setReplyAudio}
              links={replyLinks}
              onLinksChange={setReplyLinks}
              passageId={discussion.passageId}
              projectId={projectId}
              onSend={sendReply}
            />
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ─── One message within a thread ────────────────────────────────────────────

function MessageRow({
  message,
  canDelete,
  isOwn,
  isTopicAuthor,
  passageId,
  projectId,
  onSave,
  onDelete,
}: {
  message: DiscussionMessage;
  canDelete: boolean;
  isOwn: boolean;
  isTopicAuthor: boolean;
  passageId: number;
  projectId: number;
  onSave: (content: MessageContent, links: MessageAudioLink[]) => Promise<void>;
  onDelete: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const linkClips = useResolvedLinks(message.links);
  return (
    <Box sx={{ flex: 1, minWidth: 0, ml: !isTopicAuthor ? "24px !important" : undefined }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <EmailAvatar email={message.authorEmail} />
        <Typography variant="caption" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
          {isOwn ? "Me" : message.authorEmail}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {formatShortDateTime(message.createdAt)}
        </Typography>
        {isOwn && (
          <>
            <IconButton
              size="small"
              aria-label="message actions"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ml: "auto !important"}}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={menuAnchor !== null}
              onClose={() => setMenuAnchor(null)}
            >
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setEditOpen(true);
                }}
              >
                Edit
              </MenuItem>
              {canDelete && (
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    onDelete();
                  }}
                >
                  Delete
                </MenuItem>
              )}
            </Menu>
          </>
        )}
      </Stack>
      {message.body && (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {message.body}
        </Typography>
      )}
      {message.audio && (
        <Box sx={{ ml: -1, mr: 1 }}>
          <MiniAudioPlayer audio={message.audio} />
        </Box>
      )}
      {message.links.length > 0 && (
        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ justifyContent: "end", mt: 0.5 }}>
          <Typography variant="caption" sx={{ fontStyle: "italic" }}>
            Linked audio:
          </Typography>
          {linkClips === null ? (
            <CircularProgress size={20} />
          ) : (
            message.links.map((_, i) => (
              <RadialAudioPlayer
                key={i}
                audio={linkClips[i] ?? null}
                size={24}
                errorTooltip="The original audio has been deleted."
              />
            ))
          )}
        </Stack>
      )}

      {editOpen && (
        <MessageEditDialog
          message={message}
          passageId={passageId}
          projectId={projectId}
          onSave={onSave}
          onClose={() => setEditOpen(false)}
        />
      )}
    </Box>
  );
}

// ─── Edit-message dialog ─────────────────────────────────────────────────────

function MessageEditDialog({
  message,
  passageId,
  projectId,
  onSave,
  onClose,
}: {
  message: DiscussionMessage;
  passageId: number;
  projectId: number;
  onSave: (content: MessageContent, links: MessageAudioLink[]) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(message.body ?? "");
  const [audio, setAudio] = useState<Blob | null>(message.audio);
  const [links, setLinks] = useState<MessageAudioLink[]>(message.links);

  const canSave = text.trim() !== "" || audio !== null;

  const handleSave = async () => {
    if (!canSave) return;
    const content: MessageContent = audio ? { audio } : { text: text.trim() };
    try {
      await onSave(content, links);
      onClose();
    } catch {
      /* keep the dialog open */
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Edit Message</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <DiscussionComposer
          text={text}
          onTextChange={setText}
          audio={audio}
          onAudioChange={setAudio}
          links={links}
          onLinksChange={setLinks}
          passageId={passageId}
          projectId={projectId}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canSave} onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
