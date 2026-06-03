import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
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
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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
  type PassageVersion,
  type Question,
} from "./api";
import { type StepNavState } from "./steps";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import MiniAudioPlayer from "./MiniAudioPlayer";
import { formatTime } from "./formatTime";
import AddQuestionDialog from "./AddQuestionDialog";

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

function QAPrepPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { passage } = usePassage();
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const nav = location.state as StepNavState;
  const projectId = nav?.projectId;

  const passageAudioRef = useRef<AudioPlayerHandle>(null);
  const [passageAudio, setPassageAudio] = useState<{ blob: Blob; version: PassageVersion } | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  // The audio that's currently playing
  const [playingAudio, setPlayingAudio] = useState<Blob | null>(null);

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

  const selectGroup = (group: QuestionGroup) => {
    setPlayingAudio(null);
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

  // Where the playhead falls in the sorted group list — the Add Question
  // button sits at this index so it appears between the surrounding groups.
  const addButtonIndex = groups.filter((g) => g.start <= currentTime).length;

  const addQuestionButton = (
    <>
    <Typography variant="body2" sx={{ mb: 1 }}>
      {selection
        ? `${formatTime(selection.start)} - ${formatTime(selection.end)}`
        : formatTime(currentTime)}
    </Typography>
    <Button
      variant="primary"
      fullWidth
      startIcon={<AddIcon />}
      sx={{ mb: 2 }}
      disabled={!!playingAudio || !passageAudio}
      onClick={() => setAddQuestionOpen(true)}
    >
        Add Question...
      </Button>
    </>
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

      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <AudioPlayer
          ref={passageAudioRef}
          audioSource={passageAudio?.blob ?? undefined}
          height={80}
          enableDragSelection
          markers={[...new Set(groups.map((g) => g.start))]}
          onWaveformClick={(_time, marker) => {
            if (marker === undefined) return;
            const g = groups.find((g) => g.start === marker);
            if (!g) return;
            selectGroup(g);
          }}
          onTimeUpdate={setCurrentTime}
          onSelectionChange={setSelection}
          onPlayingChange={(playing) => {
            if (playing) {
              setPlayingAudio(passageAudio?.blob ?? null);
            } else if (playingAudio === passageAudio?.blob) {
              setPlayingAudio(null);
            }
          }}
        />
      </Box>

      <Box
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
                  {!expandedGroupKey && i === addButtonIndex && addQuestionButton}
                  <Paper
                    elevation={1}
                    sx={{
                      mb: 2,
                      borderRadius: 1,
                      overflow: "hidden",
                      py: 0.5,
                      bgcolor: expanded ? "#9fc5e822" : undefined
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
                      {group.questions.map((q) => (
                        <Stack
                          key={q.id}
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          sx={{ px: 1, py: 1 }}
                        >
                          {/* Drag handle — placeholder only, no DnD yet. */}
                          <DragIndicatorIcon
                            fontSize="small"
                            sx={{ color: "text.disabled", cursor: "grab" }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <MiniAudioPlayer
                              audio={q.audio}
                              playing={playingAudio === q.audio}
                              onPlayingChange={(playing) => {
                                if (playing) {
                                  passageAudioRef.current?.pause();
                                  setPlayingAudio(q.audio);
                                } else {
                                  setPlayingAudio(null);
                                }
                              }}
                              label={
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  spacing={0.5}
                                >
                                  <Typography variant="body2" noWrap>
                                    {q.title}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    aria-label="edit question"
                                    onClick={() => setEditingQuestion(q)}
                                  >
                                    <EditOutlinedIcon fontSize="inherit" />
                                  </IconButton>
                                </Stack>
                              }
                            />
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteQuestion(q)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                      <Box sx={{ px: 2, py: 1 }}>
                        <Button
                          fullWidth
                          startIcon={<AddIcon />}
                          disabled={!!playingAudio || !passageAudio}
                          onClick={() => setAddQuestionOpen(true)}
                        >
                          Add Question...
                        </Button>
                      </Box>
                    </Collapse>
                  </Paper>
                </Fragment>
              );
            })}
            {!expandedGroupKey &&
              addButtonIndex === groups.length &&
              addQuestionButton}
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

        <IconButton
          variant="floating"
          sx={{ position: "absolute", bottom: 16, right: 16 }}
          onClick={() => {
            /* stub */
          }}
        >
          <ChatBubbleOutlineIcon />
        </IconButton>
      </Box>

      <StepFooter canComplete onError={setSnackMsg} />

      {snackbarElement}

      {addQuestionOpen && passageAudio && passage && token && (
        <AddQuestionDialog
          open={addQuestionOpen}
          passageAudio={passageAudio.blob}
          selection={
            selection ?? { start: currentTime, end: currentTime }
          }
          initialTitle={`Question ${questions.length + 1}`}
          initialName={passage.speaker ?? ""}
          onCancel={() => setAddQuestionOpen(false)}
          onContinue={async ({ title, name, selection: sel, audio }) => {
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
              setQuestions((prev) =>
                [...prev, q].sort(
                  (a, b) => a.selectionStart - b.selectionStart,
                ),
              );
              
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
                  .sort((a, b) => a.selectionStart - b.selectionStart),
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
