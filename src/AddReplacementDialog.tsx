import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ExpandMore, PriorityHigh } from "@mui/icons-material";

import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import RadialAudioPlayer from "./RadialAudioPlayer";
import {
  mapPreviewTimeToOriginalTime,
  replaceAudioSegment,
} from "./audioUtils";

interface AddReplacementDialogProps {
  open: boolean;
  /** The original composed passage audio */
  originalComposedAudio: Blob;
  /** The selection range from the parent ReplaceAIPage */
  selection: { start: number; end: number };
  /** The passage speaker */
  speaker?: string;
  /** Highlight regions from pre-existing replacements (in preview/composed time) */
  existingHighlights?: { start: number; end: number; color: string }[];
  onCancel: () => void;
  onContinue: (data: {
    title: string;
    note: string;
    name: string;
    selection: { start: number; end: number };
    replacementDuration: number;
    audio: Blob;
    original: boolean;
  }) => void;
  /** When editing, supply the existing replacement data */
  editData?: {
    id: number;
    title: string;
    note: string;
    audio: Blob;
  };
  /** Original replacements available to load from history */
  previousRecordings?: Array<{
    id: number;
    title: string;
    note: string;
    name: string;
    audio: Blob;
  }>;
}

export default function AddReplacementDialog({
  open,
  originalComposedAudio,
  selection,
  speaker = "",
  existingHighlights = [],
  onCancel,
  onContinue,
  editData,
  previousRecordings = [],
}: AddReplacementDialogProps) {
  const passagePlayerRef = useRef<AudioPlayerHandle>(null);
  const replacementPlayerRef = useRef<AudioPlayerHandle>(null);

  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(
    null,
  );
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [hasOpenedHistory, setHasOpenedHistory] = useState(false);
  const [replacementAudio, setReplacementAudio] = useState<Blob | null>(null);
  const [appliedReplacementAudio, setAppliedReplacementAudio] =
    useState<Blob | null>(null);
  const [previewAudio, setPreviewAudio] = useState<Blob | undefined>(
    originalComposedAudio,
  );
  /** This is in preview time */
  const [stickySelection, setStickySelection] = useState(selection);
  const [replacing, setReplacing] = useState(false);

  // Tracks where the replacement ends in the original/starting audio's timeline.
  // Needed because after a replacement the preview waveform has a different
  // duration than the original, so dragged selection coordinates must be mapped
  // back to original-time before calling replaceAudioSegment.
  // You only need to track the end, since the start can simply be the preview start.
  const [originalSegmentEnd, setOriginalSegmentEnd] = useState<number | null>(
    null,
  );

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(editData?.title ?? "");
      setTitleError(false);
      setNote(editData?.note ?? "");
      setName(speaker);
      setSelectedHistoryId(null);
      setReplacementAudio(null);
      setAppliedReplacementAudio(editData?.audio ?? null);
      setStickySelection(selection);
      setReplacing(false);
      setOriginalSegmentEnd(editData ? selection.end : null);

      if (editData) {
        // Source audio doesn't include the edited replacement, so compose an
        // initial preview by splicing the replacement into the source audio.
        replaceAudioSegment(
          originalComposedAudio,
          selection.start,
          selection.end,
          editData.audio,
        ).then(({ blob, replacementDuration }) => {
          setPreviewAudio(blob);
          setStickySelection({
            start: selection.start,
            end: selection.start + replacementDuration,
          });
        }).catch(() => {
          // Fallback: show source audio as-is
          setPreviewAudio(originalComposedAudio);
        });
      } else {
        setPreviewAudio(originalComposedAudio);
      }
    }
  }, [open]);

  const handleSetAsReplacement = async () => {
    if (!replacementAudio || !originalComposedAudio) return;

    setReplacing(true);
    try {
      passagePlayerRef.current?.pushUndo({ appliedReplacementAudio, originalSegmentEnd });

      // stickySelection.start is always in original-time (audio with no replacement).
      // For .end, use the tracked original
      // end if a replacement was already applied, otherwise the selection end.
      const startInOriginal = stickySelection.start;
      const endInOriginal = originalSegmentEnd ?? stickySelection.end;

      const { blob, replacementDuration } = await replaceAudioSegment(
        originalComposedAudio,
        startInOriginal,
        endInOriginal,
        replacementAudio,
      );
      setPreviewAudio(blob);
      setStickySelection({
        start: startInOriginal,
        end: startInOriginal + replacementDuration,
      });
      setOriginalSegmentEnd(endInOriginal);
      setAppliedReplacementAudio(replacementAudio);
    } catch {
      // Replacement failed — leave audio unchanged
    } finally {
      setReplacing(false);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedNote = note.trim();
    const trimmedName = name.trim();
    const isOriginal = editData
      ? !previousRecordings.some(
          (r) =>
            r.id !== editData.id &&
            r.title === trimmedTitle &&
            r.note === trimmedNote,
        )
      : !previousRecordings.some(
          (r) => r.title === trimmedTitle && r.note === trimmedNote,
        );
    onContinue({
      title: trimmedTitle,
      note: trimmedNote,
      name: trimmedName,
      selection: {
        start: stickySelection.start,
        end: originalSegmentEnd ?? stickySelection.end,
      },
      replacementDuration: stickySelection.end - stickySelection.start,
      audio: appliedReplacementAudio!,
      original: isOriginal,
    });
  };

  const hasUnappliedChanges = replacementAudio !== appliedReplacementAudio;
  const canApplyReplacement =
    Boolean(replacementAudio) &&
    !replacing &&
    replacementAudio !== editData?.audio;
  const isAudioChanged = originalSegmentEnd !== null;
  const canContinue =
    Boolean(title.trim()) && isAudioChanged && Boolean(appliedReplacementAudio);

  // Shift existing highlights that fall after the splice point to account
  // for the duration change introduced by the new replacement.
  const adjustedHighlights = (() => {
    if (!isAudioChanged) return existingHighlights;
    // delta = endInPreview - endInOriginal
    const delta = stickySelection.end - originalSegmentEnd;
    return existingHighlights.map((h) =>
      h.start >= originalSegmentEnd
        ? { ...h, start: h.start + delta, end: h.end + delta }
        : h,
    );
  })();

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
          onSubmit: handleSubmit,
          onInvalid: (e: React.SyntheticEvent) => {
            if ((e.target as HTMLInputElement).name === "title") {
              setTitleError(true);
            }
          },
        },
      }}
    >
      <DialogTitle>
        {editData ? "Edit Replacement" : "Add Replacement"}
      </DialogTitle>
      <DialogContent>
        <AudioPlayer
          label="replacement passage"
          ref={passagePlayerRef}
          audioSource={previewAudio}
          height={60}
          stickySelection={stickySelection}
          shouldStopAfterStickySelection={!appliedReplacementAudio}
          highlights={[
            ...adjustedHighlights,
            ...(isAudioChanged
              ? [
                  {
                    start: stickySelection.start,
                    end: stickySelection.end,
                    color: "#ff660091",
                  },
                ]
              : []),
          ]}
          onAudioChange={(audio, undoPayload) => {
            setPreviewAudio(audio ?? undefined);
            if (undoPayload !== undefined) {
              const { appliedReplacementAudio: prev, originalSegmentEnd: prevEnd } =
                undoPayload as { appliedReplacementAudio: Blob | null; originalSegmentEnd: number | null };
              setAppliedReplacementAudio(prev);
              setOriginalSegmentEnd(prevEnd);
            } else if (!audio || audio === originalComposedAudio) {
              setAppliedReplacementAudio(null);
              setOriginalSegmentEnd(null);
            }
          }}
          onSelectionChange={async (sel, source) => {
            if (!sel || !originalComposedAudio) return;
            if (source === "user" && appliedReplacementAudio) {
              setReplacing(true);
              // The user dragged the replacement on the preview waveform.
              // Convert preview-time coordinates to original-time before
              // re-applying the replacement against the original audio.
              const startInOriginal = mapPreviewTimeToOriginalTime(
                sel.start,
                stickySelection.start,
                stickySelection.end,
                originalSegmentEnd!,
              );
              const endInOriginal = mapPreviewTimeToOriginalTime(
                sel.end,
                stickySelection.start,
                stickySelection.end,
                originalSegmentEnd!,
              );
              try {
                const { blob, replacementDuration } = await replaceAudioSegment(
                  originalComposedAudio,
                  startInOriginal,
                  endInOriginal,
                  appliedReplacementAudio,
                );
                setPreviewAudio(blob);
                setStickySelection({
                  start: startInOriginal,
                  end: startInOriginal + replacementDuration,
                });
                setOriginalSegmentEnd(endInOriginal);
              } catch (e) {
                console.log(e);
                setStickySelection(sel);
              } finally {
                setReplacing(false);
              }
            } else {
              setStickySelection(sel);
            }
          }}
        />

        {/* ─── Previous Replacement Recordings ──────────────── */}
        <Accordion
          variant="outlined"
          disabled={previousRecordings.length === 0}
          expanded={historyExpanded}
          onChange={(_, expanded) => {
            setHistoryExpanded(expanded);
            if (expanded) setHasOpenedHistory(true);
          }}
          sx={{ mt: 2 }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography>Previous Replacements</Typography>
              {previousRecordings.length > 0 && !hasOpenedHistory && (
                <Box
                  sx={{
                    mb: .5,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PriorityHigh sx={{ color: "white", fontSize: 14 }} />
                </Box>
              )}
            </Box>
          </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List dense disablePadding sx={{ height: 100, overflowY: "auto" }}>
                {previousRecordings.map((r) => (
                  <ListItemButton
                    key={r.id}
                    selected={selectedHistoryId === r.id}
                    onClick={() => {
                      setSelectedHistoryId(r.id);
                      setTitle(r.title);
                      setNote(r.note);
                      setName(r.name);
                      setReplacementAudio(r.audio);
                    }}
                    sx={{ height: 36, p: 0 }}
                  >
                    <Box
                      sx={{ display: "flex", flexShrink: 0, mx: 1.5 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RadialAudioPlayer audio={r.audio} size={22} />
                    </Box>
                    <ListItemText
                      primary={`${r.title}${r.note ? ` — ${r.note}` : ""}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            </AccordionDetails>
        </Accordion>

        {/* ─── Title & Note ─────────────────────────────────── */}
        <Stack direction="row" spacing={2} sx={{ my: 2 }}>
          <TextField
            name="title"
            label="Title"
            required
            error={titleError}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError && e.target.value.trim()) setTitleError(false);
            }}
            sx={{ flex: 1 }}
            size="small"
          />
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ flex: 1 }}
            size="small"
          />
        </Stack>

        {/* ─── Replacement waveform ──────────────────────────────── */}
        <AudioPlayer
          label="replacement"
          ref={replacementPlayerRef}
          audioSource={
            (selectedHistoryId
              ? previousRecordings.find((r) => r.id === selectedHistoryId)
                  ?.audio
              : undefined) ?? editData?.audio
          }
          height={60}
          enableDragSelection
          showRecordButton
          showCut
          showTrash
          showSilence
          enableZoom={false}
          onAudioChange={setReplacementAudio}
        />

        {/* ─── Name + Set as Replacement ────────────────────── */}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <Button
            disabled={!canApplyReplacement}
            variant={
              canApplyReplacement && hasUnappliedChanges
                ? "primary"
                : undefined
            }
            size="small"
            onClick={handleSetAsReplacement}
          >
            Set as Replacement
          </Button>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          variant={canContinue && !hasUnappliedChanges ? "primary" : undefined}
          disabled={!isAudioChanged}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
