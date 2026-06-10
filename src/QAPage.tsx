import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import StopIcon from "@mui/icons-material/Stop";
import { useAuth } from "./AuthContext";
import { useSnackbar } from "./useSnackbar";
import PageHeader from "./PageHeader";
import StepFooter from "./StepFooter";
import { PassageProvider, usePassage } from "./PassageContext";
import { fetchAudio, getQuestions, type Question } from "./api";
import { type StepNavState } from "./steps";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import { formatTime } from "./formatTime";

/**
 * Thin wrapper that keys PassageProvider on passageId so its state resets
 * whenever the user switches passages.
 */
export default function QAPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as StepNavState;
  return (
    <PassageProvider key={state.passageId}>
      <QAPageInner />
    </PassageProvider>
  );
}

function QAPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { passage } = usePassage();
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const nav = location.state as StepNavState;
  const projectId = nav?.projectId;

  const passageRef = useRef<AudioPlayerHandle>(null);
  const answerRef = useRef<AudioPlayerHandle>(null);
  const promptAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [passageAudio, setPassageAudio] = useState<Blob | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [hasListenedToPassage, setHasListenedToPassage] = useState(false);
  const [speaker, setSpeaker] = useState<string | null>("");
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, Blob>>(new Map());
  const [recording, setRecording] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  // 0–100 playback progress through the current question's prompt audio.
  const [promptProgress, setPromptProgress] = useState(0);
  // Question ids whose prompt the user has started playing (page lifetime).
  const [listened, setListened] = useState<Set<number>>(new Set());

  // The single source currently playing (or null).
  const [playingAudio, setPlayingAudio] = useState<{ pause: () => void } | null>(null);
  const playingAudioRef = useRef<{ pause: () => void } | null>(null);
  useEffect(() => {
    playingAudioRef.current = playingAudio;
  }, [playingAudio]);

  // Init
  useEffect(() => {
    if (!token || !passage) return;
    Promise.all([
      fetchAudio(token, passage.id),
      getQuestions(token, passage.id),
    ]).then(([blob, qs]) => {
      setQuestions(qs);
      setPassageAudio(blob);
      setSpeaker(passage.speaker)
      setAudioInitialized(true);
    });
  }, [token, passage]);

  const currentQuestion = questions[currentIndex];

  // (Re)create the prompt audio element for the current question. Cleanup on
  // question change pauses + frees the URL, which also stops the prompt.
  useEffect(() => {
    if (!currentQuestion) return;
    const url = URL.createObjectURL(currentQuestion.audio);
    const el = new Audio(url);
    promptAudioRef.current = el;
    setPromptProgress(0);
    const clearIfCurrent = () => {
      if (playingAudioRef.current === el) setPlayingAudio(null);
    };
    const onTime = () => {
      setPromptProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
    };
    el.addEventListener("ended", clearIfCurrent);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.pause();
      el.removeEventListener("ended", clearIfCurrent);
      el.removeEventListener("timeupdate", onTime);
      URL.revokeObjectURL(url);
      promptAudioRef.current = null;
      clearIfCurrent();
    };
  }, [currentQuestion]);

  const onPlay = (source: { pause: () => void } | null) => {
    if (playingAudio) playingAudio.pause();
    setPlayingAudio(source);
  };

  const toggleQuestion = () => {
    const el = promptAudioRef.current;
    if (!el) return;
    if (playingAudio === el) {
      onPlay(null);
      setListened((prev) =>
        prev.has(currentQuestion.id) ? prev : new Set(prev).add(currentQuestion.id),
      );
    } else {
      onPlay(el);
      el.play();
    }
  };

  const goToQuestion = (index: number) => {
    onPlay(null);
    setCurrentIndex(index);
    
    const q = questions[index];
    const isRange = q.selectionStart !== q.selectionEnd;
    passageRef.current?.updateSelection(
      isRange ? { start: q.selectionStart, end: q.selectionEnd } : null,
    );
    passageRef.current?.setTime(q.selectionStart);
  };

  const toggleRecording = async () => {
    if (warmingUp || !speaker) return;
    if (!recording && !answers.has(currentQuestion.id) && !questionListened) return;
    if (!recording) {
      try {
        onPlay(null);

        setWarmingUp(true);
        await answerRef.current?.startRecording();
        setWarmingUp(false);
        setRecording(true);
      } catch {
        setWarmingUp(false);
        setSnackMsg(
          "Could not access microphone. Please allow microphone access and try again.",
        );
      }
    } else {
      answerRef.current?.stopRecording();
      setRecording(false);
    }
  };

  const setAnswer = (id: number, blob: Blob | null) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      if (blob) next.set(id, blob);
      else next.delete(id);
      return next;
    });
  };

  const markers = useMemo(
    () => [...new Set(questions.map((q) => q.selectionStart))],
    [questions],
  );

  const answered = answers.size;
  const percent =
    questions.length > 0 ? Math.round((answered / questions.length) * 100) : 0;
  const promptPlaying = playingAudio != null && playingAudio === promptAudioRef.current;
  const questionListened = !!currentQuestion && listened.has(currentQuestion.id);
  const canRecord = !!speaker && questionListened;
  const showFooter = !hasListenedToPassage || questions.length === 0 || percent === 100;
  const prevDisabled = currentIndex === 0 || recording || warmingUp;
  const playDisabled = recording || warmingUp;
  const nextDisabled =
    currentIndex === questions.length - 1 || recording || warmingUp;

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
          ref={passageRef}
          audioSource={passageAudio ?? undefined}
          height={80}
          markers={markers}
          onFinish={() => {
            const shouldStartQuestions = !hasListenedToPassage;
            setHasListenedToPassage(true);
            if (shouldStartQuestions) goToQuestion(0);
          }}
          enableDragSelection
          onPlayingChange={(playing) => {
            if (playing) {
              onPlay(passageRef.current);
            } else if (playingAudio === passageRef.current) {
              setPlayingAudio(null);
            }
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          px: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!hasListenedToPassage ? (
          <Box sx={{ textAlign: "center", mt: 8, px: 2 }}>
            <Typography variant="body2">
              Start by tapping ▶ to listen to the audio in full. When you are
              done, you will be asked to answer some questions about what you
              heard.
            </Typography>
          </Box>
        ) : questions.length === 0 ? (
          <Box sx={{ textAlign: "center", mt: 8, px: 2 }}>
            <Typography variant="body2">
              No questions for this passage.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box
              sx={{
                alignSelf: "center",
                border: 1,
                borderColor: "rgba(0,0,0,0.2)",
                borderRadius: 1,
                px: 2,
                py: 0.5,
              }}
            >
              <Typography variant="body2">
                Question {currentIndex + 1} of {questions.length}
              </Typography>
            </Box>

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              spacing={8}
            >
              <IconButton
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={prevDisabled}
                size="small"
                sx={{ border: 2 }}
              >
                <NavigateBeforeIcon />
              </IconButton>
              <Box sx={{ position: "relative", display: "inline-flex" }}>
                {promptPlaying && (
                  <>
                    {/* Grey track + black progress replace the border while playing. */}
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      thickness={2}
                      size={38}
                      sx={{
                        color: (theme) => theme.palette.grey[300],
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                    />
                    <CircularProgress
                      variant="determinate"
                      value={promptProgress}
                      thickness={2}
                      size={38}
                      sx={{ color: (theme) => theme.palette.grey[700], position: "absolute", top: 0, left: 0 }}
                    />
                  </>
                )}
                <IconButton
                  onClick={toggleQuestion}
                  size="small"
                  disabled={playDisabled}
                  sx={{
                    width: 38,
                    height: 38,
                    border: promptPlaying ? 0 : 2,
                  }}
                >
                  {promptPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
              </Box>
              <IconButton
                onClick={() => goToQuestion(currentIndex + 1)}
                disabled={nextDisabled}
                size="small"
                sx={{ border: 2 }}
              >
                <NavigateNextIcon />
              </IconButton>
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              spacing={1}
            >
              <Box sx={{ position: "relative", display: "inline-flex" }}>
                <CircularProgress
                  variant="determinate"
                  value={100}
                  size={20}
                  sx={{ color: (theme) => theme.palette.grey[300] }}
                />
                <CircularProgress
                  variant="determinate"
                  value={percent}
                  size={20}
                  sx={{ color: (theme) => theme.palette.grey[700], position: "absolute", left: 0 }}
                />
              </Box>
              <Typography variant="body2">{percent}% Answered</Typography>
            </Stack>

            <Box sx={{ mt: 1 }}>
              <AudioPlayer
                key={currentQuestion.id}
                ref={answerRef}
                audioSource={answers.get(currentQuestion.id) ?? undefined}
                height={60}
                enableZoom={false}
                showTrash
                showUndo={false}
                formatTimeDisplay={(currentTime, duration) =>
                  `${formatTime(currentTime)}/${formatTime(duration || 0)}`
                }
                onPlayingChange={(playing) => {
                  if (playing) {
                    onPlay(answerRef.current);
                  } else if (playingAudio === answerRef.current) {
                    setPlayingAudio(null);
                  }
                }}
                onAudioChange={(blob) => setAnswer(currentQuestion.id, blob)}
                menuItems={
                  <MenuItem onClick={() => fileInputRef.current?.click()}>
                    <ListItemIcon>
                      <CloudUploadOutlinedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Load from File...</ListItemText>
                  </MenuItem>
                }
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAnswer(currentQuestion.id, file);
                  e.target.value = "";
                }}
              />
            </Box>

            <TextField
              placeholder="Name"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              size="small"
              sx={{ maxWidth: "110px", mt: "4px !important" }}
            />

            {/* Record */}
            <Box sx={{ display: "flex", justifyContent: "center", mt: "-8px !important", pb: 1 }}>
              {!answers.has(currentQuestion.id) ? (
                <Box
                  onClick={toggleRecording}
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    border: recording || warmingUp ? "none" : "25px solid",
                    borderColor: canRecord ? "alert.main" : "#d0d0d0",
                    bgcolor: recording || warmingUp ? "alert.main" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: canRecord && !warmingUp ? "pointer" : "default",
                    opacity: canRecord ? 1 : 0.6,
                    transition: "all 0.2s ease",
                    "&:hover": canRecord && !warmingUp ? { opacity: 0.85 } : {},
                  }}
                >
                  {warmingUp && <CircularProgress size={32} sx={{ color: "#fff" }} />}
                  {recording && !warmingUp && (
                    <StopIcon sx={{ color: "#fff", fontSize: 36 }} />
                  )}
                </Box>
              ) : (
                <Button
                  onClick={toggleRecording}
                  sx={{
                    width: 120,
                    height: 64,
                    fontSize: "1.1rem !important",
                    fontWeight: 600,
                    color: "alert.main",
                    opacity: speaker ? 1 : 0.6,
                    cursor: speaker && !warmingUp ? "pointer" : "default",
                  }}
                >
                  {warmingUp ? (
                    <CircularProgress size={28} sx={{ color: "alert.main" }} />
                  ) : recording ? (
                    <PauseIcon sx={{ fontSize: 32 }} />
                  ) : (
                    "RERECORD"
                  )}
                </Button>
              )}
            </Box>
          </Stack>
        )}
      </Box>

      {showFooter && (
        <StepFooter canComplete={hasListenedToPassage} onError={setSnackMsg} />
      )}

      {snackbarElement}
    </Box>
  );
}
