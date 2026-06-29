import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Drawer,
  IconButton,
  MenuItem,
  Menu,
  Paper,
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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useAuth } from "./AuthContext";
import {
  getTeamMembers,
  getDiscussions,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  markDiscussionRead,
  getDiscussionMessages,
  createDiscussionMessage,
  deleteDiscussionMessage,
  type TeamMember,
  type Discussion,
  type DiscussionMessage,
  type MessageContent,
  type MessageAudioLink,
} from "./api";
import { AudioPlayer } from "./AudioPlayer";
import MiniAudioPlayer from "./MiniAudioPlayer";
import RadialAudioPlayer from "./RadialAudioPlayer";
import { clipAudio } from "./audioUtils";
import { formatTime } from "./formatTime";
import DiscussionComposer from "./DiscussionComposer";
import EmailAvatar from "./EmailAvatar";

  /** The threads are scoped to passage+step. */
interface DiscussionsFlyoutProps {
  open: boolean | { start: number; end: number };
  onClose: () => void;
  passageId: number;
  step: number;
  passageAudio?: Blob;
  onUnreadChange?: (hasUnread: boolean) => void;
}

// Format a time (in seconds) to a tenth of a second, e.g. 75.36 → "1:15.4".
// Used to seed a new discussion's topic from the selected range.
const formatTenths = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
};

// Parse a clock-style timestamp ("M:SS", "M:SS.s", or "H:MM:SS[.s]") to seconds,
// or null when the text isn't such a timestamp (a bare number won't match).
const parseClockTime = (raw: string): number | null => {
  if (!/^\d+(:\d{1,2})+(\.\d+)?$/.test(raw)) return null;
  return raw.split(":").reduce((acc, part) => acc * 60 + parseFloat(part), 0);
};

// Interpret a topic shaped like "start – end" (e.g. "1:15.4 – 1:20.0", however
// the dash is typed) as a time range. Returns null unless both sides are valid
// timestamps with start before end, so ordinary topics never match — including
// ones a user later edits into the range format.
const parseTimeRange = (topic: string): { start: number; end: number } | null => {
  const parts = topic.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return null;
  const start = parseClockTime(parts[0].trim());
  const end = parseClockTime(parts[1].trim());
  if (start === null || end === null || start >= end) return null;
  return { start, end };
};

// A message's timestamp: clock time for today (e.g. "10:55 AM"), otherwise the
// date too (e.g. "Jun 17, 10:55 AM", or with the year when it isn't this one).
const formatMessageTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;
  const date = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date}, ${time}`;
};

/**
 * Slide-out pane hosting the Discussions workflow for a (passage, step). Loads
 * threads from the backend on mount (so the launcher can badge unread even while
 * closed) and swaps between the thread list, the new/edit form, and a single
 * thread's message view without leaving the flyout.
 */
export default function DiscussionsFlyout({
  open,
  onClose,
  passageId,
  step,
  passageAudio,
  onUnreadChange,
}: DiscussionsFlyoutProps) {
  const { token, user, activeTeamId } = useAuth();

  const [view, setView] = useState<"list" | "form">("list");
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  // Open row-actions menu: the anchor element + the discussion it acts on.
  const [menu, setMenu] = useState<{ anchorEl: HTMLElement; discussion: Discussion } | null>(null);

  // New/edit thread form. `editingId` null = creating a new thread.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [assignee, setAssignee] = useState(""); // assignee email, "" = unassigned
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);

  // Only unresolved threads are listed (resolved are filtered out per spec).
  const visible = discussions.filter((d) => !d.resolved);
  // Category suggestions are derived from existing threads.
  const categoryOptions = Array.from(
    new Set(discussions.map((d) => d.category).filter(Boolean)),
  );

  const loadList = useCallback((idToExpand?: number) => {
    if (!token || !passageId || !step) return;
    setLoadingList(true);
    getDiscussions(token, passageId, step)
      .then((list) =>
        setDiscussions(
          idToExpand == null
            ? list
            : list.map((d) => (d.id === idToExpand ? { ...d, expanded: true } : d)),
        ),
      )
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [token, passageId, step]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!open) return;
    if (typeof open === "object") openCreate(open);
    else setView("list");
  }, [open]);

  useEffect(() => {
    onUnreadChange?.(visible.some((d) => d.unread));
  }, [discussions]);

  useEffect(() => {
    if (!token || !activeTeamId) return;
    getTeamMembers(token, activeTeamId)
      .then(({ members: list }) => setMembers(list))
      .catch(() => {});
  }, [token, activeTeamId]);

  const getUserId = (email: string) =>
    members.find((m) => m.email === email)?.userId ?? null;

  // ─── Form ───────────────────────────────────────────────────────────────

  const openCreate = (range = selection) => {
    setEditingId(null);
    setTopic(range ? `${formatTenths(range.start)} – ${formatTenths(range.end)}` : "");
    setAssignee("");
    setCategory("");
    setText("");
    setAudio(null);
    setView("form");
  };

  const openEdit = (d: Discussion) => {
    setEditingId(d.id);
    setTopic(d.topic);
    setAssignee(d.assigneeEmail ?? "");
    setCategory(d.category);
    setText("");
    setAudio(null);
    setView("form");
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
        const { discussion } = await createDiscussion(token, passageId, step, fields, content);
        loadList(discussion.id);
      }
      setView("list");
    } catch {
      /* surfaced elsewhere; keep the form open */
    }
  };

  // ─── Row actions ──────────────────────────────────────────────────────────

  const closeMenu = () => setMenu(null);

  const handleResolve = async () => {
    if (!token || !menu) return;
    const d = menu.discussion;
    closeMenu();
    try {
      const { discussion } = await updateDiscussion(token, d.id, {
        topic: d.topic,
        category: d.category,
        assigneeId: d.assigneeEmail !== null ? getUserId(d.assigneeEmail) : null,
        resolved: true,
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

  // ─── Render ───────────────────────────────────────────────────────────────

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
        if (reason !== "escapeKeyDown") onClose();
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
              <IconButton size="small" onClick={() => {/* stub */}}>
                <SortIcon />
              </IconButton>
              <IconButton size="small" onClick={() => {/* stub */}}>
                <FilterListIcon />
              </IconButton>
              <IconButton size="small" onClick={() => openCreate()}>
                <AddIcon />
              </IconButton>
              <IconButton size="small" onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </>
          )}
        </Stack>

        {passageAudio && (
          <Box sx={{ mx: 1, mb: 1, p: 0.5, borderColor: "divider", borderWidth: 1, borderStyle: "solid", borderRadius: 2, display: view === "list" ? "block" : "none" }}>
            <AudioPlayer
              audioSource={passageAudio}
              height={48}
              enableDragSelection
              enableZoom={false}
              showUndo={false}
              onSelectionChange={(sel) => setSelection(sel)}
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
              options={categoryOptions}
              value={category}
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
                placeholder="Discussion"
              />
            )}

            <Button variant="primary" fullWidth disabled={!canSubmit} onClick={submitForm}>
              {editingId !== null ? "Save" : "Start Discussion"}
            </Button>
          </Stack>
        )}

        {/* List — stays mounted across views so each row keeps its expand /
            messages / play state; just hidden while the form is open. */}
        <Box sx={{ display: view === "form" ? "none" : "block" }}>
          {loadingList ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
              <CircularProgress />
            </Box>
          ) : visible.length === 0 ? (
            <Box sx={{ textAlign: "center", mt: 6, color: "text.secondary" }}>
              <Typography variant="body2">No discussions yet. Tap + to start one.</Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {visible.map((d) => (
                <Discussion
                  key={d.id}
                  discussion={d}
                  token={token}
                  currentUserId={user?.id ?? null}
                  passageAudio={passageAudio}
                  onMenu={(anchorEl, discussion) => setMenu({ anchorEl, discussion })}
                  onRead={markRead}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

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
        <MenuItem onClick={handleResolve}>Resolve</MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </Menu>
    </Drawer>
  );
}

// ─── Discussion row ──────────────

function Discussion({
  discussion,
  token,
  currentUserId,
  passageAudio,
  onMenu,
  onRead,
}: {
  discussion: Discussion;
  token: string | null;
  currentUserId: number | null;
  passageAudio?: Blob;
  onMenu: (anchorEl: HTMLElement, d: Discussion) => void;
  onRead: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<DiscussionMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAudio, setReplyAudio] = useState<Blob | null>(null);

  useEffect(() => {
    if (discussion.expanded) toggle();
  }, []);

  // If the topic is a time range, clip the passage to it in the background.
  const range = useMemo(() => parseTimeRange(discussion.topic), [discussion.topic]);
  const [clip, setClip] = useState<Blob | null>(null);
  useEffect(() => {
    if (!range || !passageAudio) {
      setClip(null);
      return;
    }
    let cancelled = false;
    clipAudio(passageAudio, range.start, range.end)
      .then((b) => { if (!cancelled) setClip(b.size > 0 ? b : null); })
      .catch(() => { if (!cancelled) setClip(null); });
    return () => { cancelled = true; };
  }, [range, passageAudio]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || !token) return;
    if (messages === null) {
      setLoading(true);
      getDiscussionMessages(token, discussion.id)
        .then(setMessages)
        .catch(() => setMessages([]))
        .finally(() => setLoading(false));
    }
    
    if (discussion.unread) {
      markDiscussionRead(token, discussion.id).catch(() => {});
      onRead(discussion.id);
    }
  };

  const canSend = replyText.trim() !== "" || replyAudio !== null;

  const sendReply = async () => {
    if (!token || !canSend) return;
    const content: MessageContent = replyAudio ? { audio: replyAudio } : { text: replyText.trim() };
    try {
      const { message } = await createDiscussionMessage(token, discussion.id, content);
      const appended = replyAudio ? { ...message, audio: replyAudio } : message;
      setMessages((prev) => [...(prev ?? []), appended]);
      setReplyText("");
      setReplyAudio(null);
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

  return (
    <Paper sx={{ borderRadius: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={toggle}
        sx={{cursor: "pointer", px: 1.5, py: 1, bgcolor: "neutral.light" }}
      >
        {discussion.unread && (
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "info.main", flexShrink: 0 }} />
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
  onDelete,
}: {
  message: DiscussionMessage;
  canDelete: boolean;
  isOwn: boolean;
  isTopicAuthor: boolean;
  onDelete: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box sx={{ flex: 1, minWidth: 0, ml: !isTopicAuthor ? "24px !important" : undefined }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{mb: .5}}>
        <EmailAvatar email={message.authorEmail} />
        <Typography variant="caption" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
          {isOwn ? "Me" : message.authorEmail}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {formatMessageTime(message.createdAt)}
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
              <MenuItem onClick={() => setMenuAnchor(null)}>Edit</MenuItem>
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
        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
          <Typography variant="body2" sx={{ fontStyle: "italic" }}>
            Linked audio:
          </Typography>
          {message.links.map((l, i) => (
            <LinkedAudioButton key={i} link={l} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ─── Linked-audio placeholder ───────────────────────────────────────────────
// A round play button mirroring RadialAudioPlayer's resting look. Disabled for
// now — it becomes a real player once fetching another passage's audio by key
// is wired up (link creation is still stubbed, so this rarely renders yet).
function LinkedAudioButton({ link }: { link: MessageAudioLink }) {
  return (
    <IconButton
      size="small"
      disabled
      aria-label={`linked audio ${link.label}`}
      title={`${link.label} ${formatTime(link.start)}–${formatTime(link.end)}`}
      sx={{ border: 2, width: 34, height: 34 }}
    >
      <PlayArrowIcon fontSize="small" />
    </IconButton>
  );
}
