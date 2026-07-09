import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Badge,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ForumIcon from "@mui/icons-material/Forum";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "./AuthContext";
import { useSnackbar } from "./useSnackbar";
import PageHeader from "./PageHeader";
import StepFooter from "./StepFooter";
import { PassageProvider, usePassage } from "./PassageContext";
import {
  fetchAudio,
  getQuestions,
  listPassageVersions,
  saveQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  type PassageVersion,
  type Question,
} from "./api";
import { stepForRoute, type StepNavState } from "./steps";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import MiniAudioPlayer from "./MiniAudioPlayer";
import { audioManager, useIsAudioPlaying } from "./audioManager";
import { formatTime } from "./formatTime";
import AddQuestionDialog from "./AddQuestionDialog";
import DiscussionsFlyout from "./DiscussionsFlyout";

/**
 * Thin wrapper that keys PassageProvider on passageId so its state resets
 * whenever the user switches passages.
 */
export default function QAPrepPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as StepNavState;
  return (
    <PassageProvider key={state.passageId}>
      <QAPrepPageInner />
    </PassageProvider>
  );
}

interface QuestionGroup {
  key: string; // `${start}_${end}`
  start: number;
  end: number;
  questions: Question[];
}

/**
 * Display comparator, mirroring the server's `ORDER BY`
 */
function byDisplayOrder(a: Question, b: Question): number {
  return (
    a.selectionStart - b.selectionStart ||
    a.selectionEnd - b.selectionEnd ||
    (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
  );
}

function SortableQuestionRow({
  q,
  showDragHandle,
  onEdit,
  onDelete,
}: {
  q: Question;
  showDragHandle: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  return (
    <Stack
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        px: 1,
        py: 1,
        position: "relative",
        zIndex: isDragging ? 1 : 0,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {showDragHandle && (
        <DragIndicatorIcon
          fontSize="small"
          sx={{ color: "text.disabled", cursor: "grab", touchAction: "none" }}
          {...attributes}
          {...listeners}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <MiniAudioPlayer
          audio={q.audio}
          label={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2" noWrap>
                {q.title}
              </Typography>
              <IconButton size="small" aria-label="edit question" onClick={onEdit}>
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
            </Stack>
          }
        />
      </Box>
      <IconButton size="small" onClick={onDelete}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function QAPrepPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { passage } = usePassage();
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const nav = location.state as StepNavState;
  const projectId = nav?.projectId;

  const passageAudioRef = useRef<AudioPlayerHandle>(null);
  const expandedRowRef = useRef<HTMLDivElement>(null);
  const [passageAudio, setPassageAudio] = useState<{ blob: Blob; version: PassageVersion } | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [discussionsOpen, setDiscussionsOpen] = useState<boolean | { start: number; end: number }>(false);
  const [discussionsUnread, setDiscussionsUnread] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [speaker, setSpeaker] = useState<string>("");
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const isAudioPlaying = useIsAudioPlaying();

  // Grouped view of `questions`. Display-only.
  const groups = useMemo<QuestionGroup[]>(() => {
    const map = new Map<string, QuestionGroup>();
    for (const q of questions) {
      const key = `${q.selectionStart}_${q.selectionEnd}`;
      let g = map.get(key);
      if (!g) {
        g = { key, start: q.selectionStart, end: q.selectionEnd, questions: [] };
        map.set(key, g);
      }
      g.questions.push(q);
    }
    return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  }, [questions]);

  useEffect(() => {
    if (!token || !passage) return;
    Promise.all([
      fetchAudio(token, passage.id),
      listPassageVersions(token, passage.id),
      getQuestions(token, passage.id),
    ]).then(([blob, { versions }, qs]) => {
      setQuestions(qs);

      const latestQuestion = qs.reduce<Question | null>(
        (a, q) => (a && a.id > q.id ? a : q),
        null,
      );
      setSpeaker(latestQuestion ? latestQuestion.name : passage.speaker ?? "");

      // Open the first "0 group" if present
      const zeroGroup = qs
        .filter((q) => q.selectionStart <= 0.001)
        .sort((a, b) => a.selectionStart - b.selectionStart || a.selectionEnd - b.selectionEnd)[0];
      if (zeroGroup) setExpandedGroupKey(`${zeroGroup.selectionStart}_${zeroGroup.selectionEnd}`);

      if (!blob) {
        setAudioInitialized(true);
        return;
      }
      const version = versions.find((v) => v.audioKey === passage.audioKey)!;
      setPassageAudio({ blob, version });
      setAudioInitialized(true);
    });
  }, [token, passage]);

  // Collapse the row if play moves outside it.
  useEffect(() => {
    // If the expanded row is a range and the time is still inside it, leave it.
    const expanded = groups.find((g) => g.key === expandedGroupKey);
    if (
      expanded &&
      expanded.start !== expanded.end &&
      currentTime >= expanded.start &&
      currentTime <= expanded.end
    ) {
      return;
    }
    const near = groups.some((g) => Math.abs(currentTime - g.start) <= 0.1);
    if (!near) setExpandedGroupKey(null);
  }, [currentTime, expandedGroupKey, groups]);

  // Scroll the newly-expanded row into view
  useEffect(() => {
    if (expandedGroupKey) {
      expandedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [expandedGroupKey]);

  const selectGroup = (group: QuestionGroup) => {
    audioManager.stop();
    setExpandedGroupKey(group.key);
    if (group.start !== group.end) {
      passageAudioRef.current?.updateSelection({ start: group.start, end: group.end });
    } else {
      passageAudioRef.current?.updateSelection(null);
      passageAudioRef.current?.setTime(group.start);
    }
  };

  const handleDeleteQuestion = async (q: Question) => {
    if (!token) return;
    try {
      await deleteQuestion(token, q.id);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : "Failed to delete question");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = async (group: QuestionGroup, event: DragEndEvent) => {
    const { active, over } = event;
    if (!token || !over || active.id === over.id) return;
    const ids = group.questions.map((q) => q.id);
    const oldIndex = ids.indexOf(active.id as number);
    const newIndex = ids.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    const newIds = arrayMove(ids, oldIndex, newIndex);
    try {
      await reorderQuestions(token, newIds);
      const order = new Map(newIds.map((id, i) => [id, i]));
      setQuestions((prev) =>
        prev
          .map((q) => (order.has(q.id) ? { ...q, sortOrder: order.get(q.id)! } : q))
          .sort(byDisplayOrder),
      );
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : "Failed to reorder questions");
    }
  };

  // Workaround a currentTime issue where dragging region end briefly changes currentTime.
  // Use selection start when available.
  const trueStart = selection ? selection.start : currentTime;
  const addButtonIndex = groups.filter((g) => g.start <= trueStart).length;

  // A double-tap "select all" region covers the whole waveform, so a tap on the
  // waveform can't clear it (the region swallows the click). As an escape hatch, a
  // tap anywhere on the page that isn't interactive clears this selection.
  const selectionIsEntirePassage =
    !!selection &&
    duration > 0 &&
    selection.start <= 0.001 &&
    selection.end >= duration - 0.001;
  const handlePageClick = (e: MouseEvent) => {
    if (!selectionIsEntirePassage) return;
    if ((e.target as HTMLElement).closest("button, a, .MuiButtonBase-root")) return;
    passageAudioRef.current?.updateSelection(null);
  };

  const timeDisplay = (
    <Typography variant="body2" sx={{ mb: 1 }}>
      {selection
        ? `${formatTime(selection.start)} - ${formatTime(selection.end)}`
        : formatTime(currentTime)}
    </Typography>
  );
  const addQuestionButton = (
    <Button
      variant={expandedGroupKey ? undefined : "primary"}
      fullWidth
      startIcon={<AddIcon />}
      sx={{ mb: 2 }}
      disabled={isAudioPlaying || !passageAudio}
      onClick={() => setAddQuestionOpen(true)}
    >
      Add Question at {selection
        ? `${formatTime(selection.start)} - ${formatTime(selection.end)}`
        : formatTime(currentTime)}...
    </Button>
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        "@supports (height: 100dvh)": {
          height: "100dvh",
        },
      }}
    >
      <Backdrop
        open={!audioInitialized}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <PageHeader
        leftIcon="back"
        onLeftClick={() => navigate(projectId ? `/projects/${projectId}` : "/projects")}
        title={nav?.projectName ?? ""}
        racetrack
      />

      <Box
        onClick={handlePageClick}
        sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <AudioPlayer
          ref={passageAudioRef}
          audioSource={passageAudio?.blob ?? undefined}
          height={80}
          enableDragSelection
          selectAllOnDoubleClick
          markers={[...new Set(groups.map((g) => g.start))]}
          onReady={setDuration}
          onWaveformClick={(_time, marker) => {
            if (marker === undefined) return;
            const g = groups.find((g) => g.start === marker);
            if (!g) return;
            selectGroup(g);
          }}
          onTimeUpdate={setCurrentTime}
          onSelectionChange={current => {
            if (expandedGroupKey && selection) {
              if (current && !questions.find(q => q.selectionStart === current.start && q.selectionEnd === current.end)) {
                // If a range row was expanded and now the selection has changed (not matching a question), collapse
                setExpandedGroupKey(null);
              }
            }
            setSelection(current);
          }}
        />
      </Box>

      <Box
        onClick={handlePageClick}
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            px: 2,
          }}
        >
          <List dense disablePadding sx={{ mt: 1 }}>
            {groups.map((group, i) => {
              const isMarker = group.start === group.end;
              const expanded = expandedGroupKey === group.key;
              return (
                <Fragment key={group.key}>
                  {!expandedGroupKey && i === addButtonIndex && timeDisplay && addQuestionButton}
                  <Paper
                    ref={expanded ? expandedRowRef : undefined}
                    elevation={1}
                    sx={{
                      mb: 2,
                      borderRadius: 1,
                      overflow: "hidden",
                      py: 0.5,
                      bgcolor: expanded
                        ? (theme) => theme.palette.secondary.light
                        : undefined
                    }}
                  >
                    <ListItemButton
                      disabled={expanded}
                      sx={{opacity: "1 !important"}}
                      onClick={() => selectGroup(group)}
                    >
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {isMarker
                          ? formatTime(group.start)
                          : `${formatTime(group.start)} – ${formatTime(group.end)}`}
                      </Typography>
                      {!expanded && <ExpandMoreIcon fontSize="small" />}
                    </ListItemButton>
                    <Collapse in={expanded} unmountOnExit>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleDragEnd(group, e)}
                      >
                        <SortableContext
                          items={group.questions.map((q) => q.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {group.questions.map((q) => (
                            <SortableQuestionRow
                              key={q.id}
                              q={q}
                              showDragHandle={group.questions.length > 1}
                              onEdit={() => setEditingQuestion(q)}
                              onDelete={() => handleDeleteQuestion(q)}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      <Box sx={{ px: 2, py: 1 }}>
                        {addQuestionButton}
                      </Box>
                    </Collapse>
                  </Paper>
                </Fragment>
              );
            })}
            {!expandedGroupKey && addButtonIndex === groups.length && timeDisplay && addQuestionButton}
          </List>

          {questions.length === 0 && !expandedGroupKey && (
            <Box sx={{ textAlign: "center", mt: 6, px: 2 }}>
              <Typography variant="body2">
                Tap + to add a question here. Drag to select a range, or
                double-tap to select all.
              </Typography>
            </Box>
          )}
        </Box>

        <Stack spacing={1} sx={{ position: "absolute", bottom: 16, right: 16 }}>
          {selection && (
            <IconButton
              variant="floating"
              onClick={() => setDiscussionsOpen(selection)}
            >
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                badgeContent={<AddIcon sx={{ fontSize: 20, ml: 1, mb: 1 }} />}
              >
                <ForumIcon />
              </Badge>
            </IconButton>
          )}
          <IconButton
            variant="floating"
            onClick={() => setDiscussionsOpen(true)}
          >
            <Badge variant="dot" invisible={!discussionsUnread}>
              <ForumIcon />
            </Badge>
          </IconButton>
        </Stack>
      </Box>

      <StepFooter canComplete onError={setSnackMsg} />

      <DiscussionsFlyout
        open={discussionsOpen}
        onClose={() => setDiscussionsOpen(false)}
        passageId={passage?.id ?? 0}
        step={stepForRoute(location.pathname)?.id!}
        projectId={projectId}
        passageAudio={passageAudio?.blob}
        onUnreadChange={setDiscussionsUnread}
      />

      {snackbarElement}

      {addQuestionOpen && passageAudio && passage && token && (
        <AddQuestionDialog
          open={addQuestionOpen}
          passageAudio={passageAudio.blob}
          selection={
            selection ?? { start: currentTime, end: currentTime }
          }
          initialTitle={`Question ${questions.length + 1}`}
          initialName={speaker}
          onCancel={() => setAddQuestionOpen(false)}
          onContinue={async ({ title, name, selection: sel, audio }) => {
            setSpeaker(name);
            try {
              const q = await saveQuestion(
                token,
                passage.id,
                title,
                name,
                sel.start,
                sel.end,
                audio,
              );
              setQuestions((prev) => [...prev, q].sort(byDisplayOrder));
              setExpandedGroupKey(`${sel.start}_${sel.end}`);

              passageAudioRef.current?.setTime(sel.start);
              passageAudioRef.current?.updateSelection(sel.start === sel.end ? null : sel);
              passageAudioRef.current?.resetZoom();

              setAddQuestionOpen(false);
            } catch (err) {
              setSnackMsg(err instanceof Error ? err.message : "Failed to save question");
            }
          }}
        />
      )}

      {editingQuestion && token && (
        <AddQuestionDialog
          open
          dialogTitle="Edit Question"
          passageAudio={passageAudio!.blob}
          selection={{
            start: editingQuestion.selectionStart,
            end: editingQuestion.selectionEnd,
          }}
          initialTitle={editingQuestion.title}
          initialName={editingQuestion.name}
          initialAudio={editingQuestion.audio}
          onCancel={() => setEditingQuestion(null)}
          onContinue={async ({ title, name, selection: sel, audio }) => {
            try {
              const updated = await updateQuestion(
                token,
                editingQuestion.id,
                title,
                name,
                sel.start,
                sel.end,
                audio,
              );
              setQuestions((prev) =>
                prev
                  .map((x) => (x.id === editingQuestion.id ? updated : x))
                  .sort(byDisplayOrder),
              );
              setEditingQuestion(null);
            } catch (err) {
              setSnackMsg(err instanceof Error ? err.message : "Failed to update question");
            }
          }}
        />
      )}
    </Box>
  );
}
