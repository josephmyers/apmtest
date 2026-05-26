import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useAuth } from "./AuthContext";
import { useSnackbar } from "./useSnackbar";
import PageHeader from "./PageHeader";
import StepFooter from "./StepFooter";
import { PassageProvider, usePassage } from "./PassageContext";
import { fetchAudio, listPassageVersions, type PassageVersion } from "./api";
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

  useEffect(() => {
    if (!token || !passage) return;
    Promise.all([
      fetchAudio(token, passage.id),
      listPassageVersions(token, passage.id),
    ]).then(([blob, { versions }]) => {
      if (!blob) {
        setAudioInitialized(true);
        return;
      }
      const version = versions.find((v) => v.audioKey === passage.audioKey)!;
      setPassageAudio({ blob, version });
      setAudioInitialized(true);
    });
  }, [token, passage]);

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
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          position: "relative",
          px: 2,
          pt: 2,
        }}
      >
        <AudioPlayer
          ref={playerRef}
          audioSource={passageAudio?.blob ?? undefined}
          height={80}
          enableDragSelection
          onTimeUpdate={setCurrentTime}
          onSelectionChange={setSelection}
          onPlayingChange={setPlaying}
        />

        <Typography variant="body2" sx={{ mt: 1 }}>
          {selection
            ? `${formatTime(selection.start)} - ${formatTime(selection.end)}`
            : formatTime(currentTime)}
        </Typography>

        <Button
          variant="primary"
          fullWidth
          startIcon={<AddIcon />}
          sx={{ mt: 2 }}
          disabled={playing || !passageAudio}
          onClick={() => setAddQuestionOpen(true)}
        >
          Add Question...
        </Button>

        <Box sx={{ textAlign: "center", mt: 6, px: 2 }}>
          <Typography variant="body2">
            Tap + to add a question here. Drag to select a range, or
            double-tap to select all.
          </Typography>
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

      {addQuestionOpen && passageAudio && (
        <AddQuestionDialog
          open={addQuestionOpen}
          passageAudio={passageAudio.blob}
          selection={
            selection ?? { start: currentTime, end: currentTime }
          }
          initialName={passage?.speaker ?? ""}
          onCancel={() => setAddQuestionOpen(false)}
          onContinue={() => {
            /* stub — persist question */
            setAddQuestionOpen(false);
          }}
        />
      )}
    </Box>
  );
}
