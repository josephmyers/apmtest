import { Fragment, useEffect, useRef, useState } from "react";
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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
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
  type PassageVersion,
  type Question,
} from "./api";
import { type StepNavState } from "./steps";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
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

function QAPrepPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { passage } = usePassage();
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const nav = location.state as StepNavState;
  const projectId = nav?.projectId;

  const playerRef = useRef<AudioPlayerHandle>(null);
  const [passageAudio, setPassageAudio] = useState<{ blob: Blob; version: PassageVersion } | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);
  const [playingAudio, setPlayingAudio] = useState<{
    id: number;
    audio: HTMLAudioElement;
    url: string;
  } | null>(null);

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

  // Tear down a clip when it's replaced/cleared or on unmount. Setting a new
  // playingAudio (or null) pauses and frees the previous one.
  useEffect(() => {
    if (!playingAudio) return;
    const { audio, url } = playingAudio;
    return () => {
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [playingAudio]);

  // Collapse question if play moves outside it.
  useEffect(() => {
    // If the expanded question is a range and the time is still inside it, leave it.
    const expanded = questions.find((x) => x.id === expandedQuestionId);
    if (
      expanded &&
      expanded.selectionStart !== expanded.selectionEnd &&
      currentTime >= expanded.selectionStart &&
      currentTime <= expanded.selectionEnd
    ) {
      return;
    }
    const q = questions.find(
      (x) => Math.abs(currentTime - x.selectionStart) <= 0.1,
    );
    if (!q) setExpandedQuestionId(null);
  }, [currentTime, expandedQuestionId, questions]);

  const selectQuestion = (q: Question) => {
    setPlayingAudio(null);
    setExpandedQuestionId(q.id);
    if (q.selectionStart !== q.selectionEnd) {
      playerRef.current?.updateSelection({ start: q.selectionStart, end: q.selectionEnd });
    } else {
      playerRef.current?.updateSelection(null);
      playerRef.current?.setTime(q.selectionStart);
    }
  };

  const playQuestionAudio = (q: Question) => {
    const url = URL.createObjectURL(q.audio);
    const audio = new Audio(url);
    audio.onended = () =>
      setPlayingAudio((cur) => (cur?.audio === audio ? null : cur));
    audio.play();
    setPlayingAudio({ id: q.id, audio, url });
  };

  // Where the playhead falls in the sorted question list — the Add Question
  // button sits at this index so it appears between the surrounding questions.
  const addButtonIndex = questions.filter(
    (q) => q.selectionStart <= currentTime,
  ).length;

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
      disabled={playing || !passageAudio}
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
          ref={playerRef}
          audioSource={passageAudio?.blob ?? undefined}
          height={80}
          enableDragSelection
          markers={questions.map((q) => q.selectionStart)}
          onWaveformClick={(_time, marker) => {
            if (marker === undefined) return;
            const q = questions.find((q) => q.selectionStart === marker);
            if (!q) return;
            selectQuestion(q);
          }}
          onTimeUpdate={setCurrentTime}
          onSelectionChange={setSelection}
          onPlayingChange={(p) => {
            setPlaying(p);
            if (p) setPlayingAudio(null);
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          position: "relative",
          px: 2,
        }}
      >
        <List dense disablePadding sx={{ mt: 1 }}>
          {questions.map((q, i) => {
            const isMarker = q.selectionStart === q.selectionEnd;
            const expanded = expandedQuestionId === q.id;
            return (
              <Fragment key={q.id}>
                {!expandedQuestionId && i === addButtonIndex && addQuestionButton}
                <Paper
                  elevation={1}
                  sx={{
                    mb: 2,
                    borderRadius: 1,
                    overflow: "hidden",
                    py: 0.5
                  }}
                >
                  <ListItemButton
                    disabled={expanded}
                    sx={{opacity: "1 !important"}}
                    onClick={() => selectQuestion(q)}
                  >
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {isMarker
                        ? formatTime(q.selectionStart)
                        : `${formatTime(q.selectionStart)} – ${formatTime(q.selectionEnd)}`}
                    </Typography>
                    {!expanded && <ExpandMoreIcon fontSize="small" />}
                  </ListItemButton>
                  <Collapse in={expanded} unmountOnExit>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ px: 2, py: 1 }}
                    >
                      <IconButton
                        size="small"
                        onClick={() =>
                          playingAudio?.id === q.id
                            ? setPlayingAudio(null)
                            : playQuestionAudio(q)
                        }
                      >
                        {playingAudio?.id === q.id ? (
                          <StopIcon />
                        ) : (
                          <PlayArrowIcon />
                        )}
                      </IconButton>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {q.title}
                      </Typography>
                    </Stack>
                  </Collapse>
                </Paper>
              </Fragment>
            );
          })}
          {!expandedQuestionId &&
            addButtonIndex === questions.length &&
            addQuestionButton}
        </List>

        {questions.length === 0 && !expandedQuestionId && (
          <Box sx={{ textAlign: "center", mt: 6, px: 2 }}>
            <Typography variant="body2">
              Tap + to add a question here. Drag to select a range, or
              double-tap to select all.
            </Typography>
          </Box>
        )}

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
              
              playerRef.current?.setTime(sel.start);
              playerRef.current?.updateSelection(sel.start === sel.end ? null : sel);
              playerRef.current?.resetZoom();

              setAddQuestionOpen(false);
            } catch (err) {
              setSnackMsg(err instanceof Error ? err.message : "Failed to save question");
            }
          }}
        />
      )}
    </Box>
  );
}
