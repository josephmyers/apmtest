import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import StopIcon from "@mui/icons-material/Stop";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import { formatTime } from "./formatTime";

interface AddQuestionDialogProps {
  open: boolean;
  /** The passage audio shown in the upper waveform */
  passageAudio: Blob;
  /** Range or play-marker imported from the parent.
   *  When no range is selected on the parent, start === end (a marker). */
  selection: { start: number; end: number };
  /** Default name to seed the Name field with */
  initialName?: string;
  onCancel: () => void;
  onContinue: (data: {
    title: string;
    name: string;
    selection: { start: number; end: number };
    audio: Blob;
  }) => void;
}

export default function AddQuestionDialog({
  open,
  passageAudio,
  selection,
  initialName = "",
  onCancel,
  onContinue,
}: AddQuestionDialogProps) {
  const questionPlayerRef = useRef<AudioPlayerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [name, setName] = useState(initialName);
  const [questionAudio, setQuestionAudio] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setName(initialName);
      setQuestionAudio(null);
      setRecording(false);
      setWarmingUp(false);
    }
  }, [open]);

  const handleRecordToggle = async () => {
    if (warmingUp) return;
    if (!recording) {
      try {
        setWarmingUp(true);
        await questionPlayerRef.current?.startRecording();
        setWarmingUp(false);
        setRecording(true);
      } catch {
        setWarmingUp(false);
      }
    } else {
      questionPlayerRef.current?.stopRecording();
      setRecording(false);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onContinue({
      title: title.trim(),
      name: name.trim(),
      selection,
      audio: questionAudio!,
    });
  };

  const canContinue = Boolean(title.trim()) && Boolean(questionAudio) && !recording && !warmingUp;

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && onCancel()}
      fullWidth
      maxWidth="sm"
      sx={{ "& .MuiDialog-paper": { minWidth: 335 } }}
      slotProps={{
        paper: {
          component: "form",
          onSubmit: handleSubmit
        },
      }}
    >
      <DialogTitle sx={{px: 2}}>Add Question</DialogTitle>
      <DialogContent sx={{px: 2}}>
        <AudioPlayer
          audioSource={passageAudio}
          height={60}
          stickySelection={selection}
          shouldStopAfterStickySelection={selection.start !== selection.end}
          formatTimeDisplay={(currentTime, duration) =>
            `${formatTime(currentTime)}/${formatTime(duration || 0)}`
          }
        />

        <Box sx={{ mt: 2 }}>
          <AudioPlayer
            ref={questionPlayerRef}
            audioSource={questionAudio ?? undefined}
            height={60}
            enableZoom={false}
            showTrash
            formatTimeDisplay={(currentTime, duration) =>
              `${formatTime(currentTime)}/${formatTime(duration || 0)}`
            }
            onAudioChange={(blob) => setQuestionAudio(blob)}
            menuItems={
              <MenuItem onClick={() => fileInputRef.current?.click()}>
                <ListItemIcon>
                  <CloudUploadOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Load from File...</ListItemText>
              </MenuItem>
            }
            topRowLabel={
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ flex: 1, ml: 1 }}
              >
                <TextField
                  name="title"
                  placeholder="Question 1"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Stack>
            }
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setQuestionAudio(file);
              e.target.value = "";
            }}
          />
        </Box>

        {/* ─── Name ───────────────────────────────────────────────── */}
        <TextField
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          sx={{ mt: 1, maxWidth: "120px" }}
        />

        {/* ─── Big record button ─────────────────────────────── */}
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Box
            onClick={handleRecordToggle}
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: recording || warmingUp ? "none" : "25px solid",
              borderColor: "alert.main",
              bgcolor: recording || warmingUp ? "alert.main" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: warmingUp ? "default" : "pointer",
              transition: "all 0.2s ease",
              "&:hover": warmingUp ? {} : { opacity: 0.85 },
            }}
          >
            {warmingUp && <CircularProgress size={32} sx={{ color: "#fff" }} />}
            {recording && !warmingUp && (
              <StopIcon sx={{ color: "#fff", fontSize: 36 }} />
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          variant={canContinue ? "primary" : undefined}
          disabled={!canContinue}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
