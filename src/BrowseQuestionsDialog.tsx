import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { type Question, type Answer } from "./api";
import { formatTime } from "./formatTime";
import RadialAudioPlayer from "./RadialAudioPlayer";

interface BrowseQuestionsDialogProps {
  questions: Question[];
  answers: Map<number, Answer>;
  currentIndex: number;
  onClose: () => void;
  onSelectQuestion: (index: number) => void;
}

// Fixed columns so every row (and the header) aligns without CSS subgrid.
const GRID_COLUMNS = "72px 1fr 54px";

export default function BrowseQuestionsDialog({
  questions,
  answers,
  currentIndex,
  onClose,
  onSelectQuestion,
}: BrowseQuestionsDialogProps) {
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);

  const onAnswerPlay = (el: HTMLAudioElement | null) => {
    if (el) {
      if (playingAudio && playingAudio !== el) playingAudio.pause();
      setPlayingAudio(el);
    } else {
      setPlayingAudio(null);
    }
  };

  const rows = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => !unansweredOnly || !answers.has(q.id));

  return (
    <Dialog open onClose={onClose} fullWidth>
      <DialogTitle>Browse Questions</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Please tap a row to view that question on the main screen.
        </Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={unansweredOnly}
              onChange={(e) => setUnansweredOnly(e.target.checked)}
            ></Checkbox>
          }
          slotProps={{ typography: { variant: "body2" } }}
          label="Show unanswered questions only"
        />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: GRID_COLUMNS,
            alignItems: "center",
            columnGap: 1,
            mt: 1,
            textAlign: "center",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Reference
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Title
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Answer
          </Typography>
        </Box>

        {rows.map(({ q, i }) => {
          const answer = answers.get(q.id);
          const isCurrent = i === currentIndex;
          const isRange = q.selectionStart !== q.selectionEnd;
          const reference = isRange
            ? `${formatTime(q.selectionStart)} - ${formatTime(q.selectionEnd)}`
            : formatTime(q.selectionStart);

          return (
            <Box
              key={q.id}
              onClick={() => onSelectQuestion(i)}
              sx={{
                display: "grid",
                gridTemplateColumns: GRID_COLUMNS,
                alignItems: "center",
                cursor: "pointer",
                height: "40px",
                textAlign: "center",
                bgcolor: isCurrent
                  ? "grey.400"
                  : answer
                    ? "grey.100"
                    : "transparent",
                color: answer && !isCurrent ? "text.disabled" : "text.primary",
              }}
            >
              <Typography variant="body2" sx={{ color: "inherit" }}>
                {reference}
              </Typography>
              <Typography variant="body2" sx={{ color: "inherit" }} noWrap>
                {q.title}
              </Typography>
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{ display: "flex", justifyContent: "center" }}
              >
                {answer && (
                  <RadialAudioPlayer
                    audio={answer.audio}
                    size={28}
                    onPlayingChange={onAnswerPlay}
                  />
                )}
              </Box>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "center" }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
