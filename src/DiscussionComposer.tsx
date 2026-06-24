import { useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import AttachmentIcon from '@mui/icons-material/Attachment';
import MiniAudioPlayer from "./MiniAudioPlayer";
import {
  VoiceRecorder,
  type RecorderPhase,
  type VoiceRecorderHandle,
} from "./VoiceRecorder";

interface DiscussionComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  audio: Blob | null;
  onAudioChange: (audio: Blob | null) => void;
  placeholder?: string;
  /** If provided, enables a Send button */
  onSend?: () => void;
}

/**
 * Messaging-style content composer, supporting mutually exclusive text and audio.
 */
export default function DiscussionComposer({
  text,
  onTextChange,
  audio,
  onAudioChange,
  placeholder = "",
  onSend,
}: DiscussionComposerProps) {
  const recorderRef = useRef<VoiceRecorderHandle>(null);
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<RecorderPhase>("warming");
  const [linkOpen, setLinkOpen] = useState(false);

  if (recording) {
    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <VoiceRecorder
          ref={recorderRef}
          onPhaseChange={setPhase}
          onComplete={(blob) => {
            setRecording(false);
            if (blob) onAudioChange(blob);
          }}
        />
        <IconButton
          aria-label={phase === "warming" ? "warming up" : "stop recording"}
          variant="outlined"
          disabled={phase === "warming"}
          onClick={() => recorderRef.current?.stop()}
        >
          {phase === "warming" ? (
            <CircularProgress size={24} sx={{ color: "error.main" }} />
          ) : (
            <StopIcon sx={{ color: "error.main" }} />
          )}
        </IconButton>
      </Stack>
    );
  }

  const sendButton = onSend ? (
    <IconButton variant="outlined" onClick={onSend}>
      <SendIcon />
    </IconButton>
  ) : null;

  return (
    <Stack spacing={0.5}>
      {audio ? (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <MiniAudioPlayer audio={audio} />
          </Box>
          <IconButton
            aria-label="delete recording"
            variant="outlined"
            onClick={() => {
              onAudioChange(null);
            }}
          >
            <CloseIcon />
          </IconButton>
          {sendButton}
        </Stack>
      ) : (
        <Stack direction="row" alignItems="center" spacing={1}>
          <TextField
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={placeholder}
            size="small"
            fullWidth
            multiline
            maxRows={4}
          />
          {text === "" ? (
            <IconButton
              aria-label="record voice"
              variant="outlined"
              onClick={() => {
                setPhase("warming");
                setRecording(true);
              }}
            >
              <MicIcon />
            </IconButton>
          ) : (
            sendButton
          )}
        </Stack>
      )}

      <Box>
        <IconButton size="small" aria-label="link audio" onClick={() => setLinkOpen(true)}>
          <AttachmentIcon fontSize="small" sx={{rotate: "-45deg"}} />
        </IconButton>
      </Box>

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)}>
        <DialogTitle>Link audio</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Linking a selected range of other audio isn’t available yet.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
