import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
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
  /** Default title to seed (and submit) if the user doesn't type one */
  initialTitle: string;
  /** Default name to seed the Name field with */
  initialName?: string;
  /** Existing recording to seed (edit mode); when set, Continue is enabled immediately */
  initialAudio?: Blob;
  /** Dialog heading (default: "Add Question") */
  dialogTitle?: string;
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
  initialTitle,
  initialName = "",
  initialAudio,
  dialogTitle = "Add Question",
  onCancel,
  onContinue,
}: AddQuestionDialogProps) {
  const questionPlayerRef = useRef<AudioPlayerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialTitle);
  const [name, setName] = useState(initialName);
  const [questionAudio, setQuestionAudio] = useState<Blob | null>(
    initialAudio ?? null,
  );
  const [currentSelection, setCurrentSelection] = useState(selection);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setName(initialName);
      setQuestionAudio(initialAudio ?? null);
      setCurrentSelection(selection);
    }
  }, [open]);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onContinue({
      title: title.trim() || initialTitle,
      name: name.trim(),
      selection: currentSelection,
      audio: questionAudio!,
    });
  };

  const canContinue = Boolean(questionAudio);

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
      <DialogTitle sx={{px: 2}}>{dialogTitle}</DialogTitle>
      <DialogContent sx={{px: 2}}>
        <AudioPlayer
          audioSource={passageAudio}
          height={60}
          stickySelection={currentSelection}
          shouldStopAfterStickySelection={
            currentSelection.start !== currentSelection.end
          }
          onSelectionChange={(sel) => {
            setCurrentSelection(sel!);
          }}
          formatTimeDisplay={(currentTime, duration) =>
            `${formatTime(currentTime)}/${formatTime(duration || 0)}`
          }
        />

        <Box sx={{ mt: 8 }}>
          <AudioPlayer
            ref={questionPlayerRef}
            audioSource={questionAudio ?? undefined}
            height={60}
            enableZoom={false}
            showRecordButton
            showTrash
            showUndo={false}
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
                alignItems="center"
                sx={{ flex: 1, ml: 2 }}
              >
                <TextField
                  name="title"
                  placeholder={initialTitle}
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
