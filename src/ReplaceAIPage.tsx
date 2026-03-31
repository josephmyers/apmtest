import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAuth } from "./AuthContext";
import {
  activatePassageVersion,
  createPassageVersion,
  fetchAudio,
  fetchReplacementAudio,
  fetchVersionAudio,
  getReplacements,
  listPassageVersions,
  saveReplacement,
  updateReplacement,
  deleteReplacement,
  type PassageVersion,
} from "./api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import AddReplacementDialog from "./AddReplacementDialog";
import PageHeader from "./PageHeader";
import { formatTime } from "./formatTime";
import Axios from "axios";
import { replaceAudioSegment, compressToMp3, toBase64 } from "./audioUtils";
import { pollTask } from "./pollTask";

interface ReplaceAIPageState {
  passageId: number;
  passageReference: string;
  projectName: string;
  speaker?: string | null;
  //todo remove?
  sectionPassages?: { id: number; reference: string; speaker: string | null }[];
  passageVersion?: PassageVersion | null;
}

interface Replacement {
  id: number;
  title: string;
  note: string;
  name: string;
  selection: { start: number; end: number };
  audio: Blob;
  original: boolean;
}

interface OffsetEntry {
  composedStart: number;
  composedEnd: number;
  offset: number;
}

/** Map a time in composed-audio space back to original-passage time. */
function composedToOriginalTime(t: number, offsetMap: OffsetEntry[]): number {
  let prevOffset = 0;
  for (const entry of offsetMap) {
    if (t < entry.composedStart) return t - prevOffset;
    if (t <= entry.composedEnd) return entry.composedStart - prevOffset;
    prevOffset = entry.offset;
  }
  return t - prevOffset;
}

/** Map a time in original-passage space to composed-audio time. */
function originalToComposedTime(t: number, offsetMap: OffsetEntry[]): number {
  let prevOffset = 0;
  for (const entry of offsetMap) {
    const originalStart = entry.composedStart - prevOffset;
    if (t <= originalStart) return t + prevOffset;
    prevOffset = entry.offset;
  }
  return t + prevOffset;
}

export default function ReplaceAIPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const state = (location.state ?? {}) as ReplaceAIPageState;

  const passageId = state.passageId ?? 0;
  const projectName = state.projectName ?? "";
  const passageVersion = state.passageVersion ?? null;

  const playerRef = useRef<AudioPlayerHandle>(null);
  const [passageAudio, setPassageAudio] = useState<{
    blob: Blob;
    version: PassageVersion | null;
  } | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingReplacement, setEditingReplacement] =
    useState<Replacement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [rendered, setRendered] = useState<{ version: PassageVersion; blob: Blob } | null>(null);
  const [showRendered, setShowRendered] = useState(false);

  const [composedAudio, setComposedAudio] = useState<Blob | null>(null);
  const [highlights, setHighlights] = useState<
    { start: number; end: number; color: string }[]
  >([]);
  const offsetMapRef = useRef<OffsetEntry[]>([]);

  // Load passage audio, rendered audio, and existing replacements on mount
  useEffect(() => {
    if (!token || !passageId) return;
    fetchAudio(token, passageId).then((blob) => {
      if (blob) setPassageAudio({ blob, version: passageVersion });
    });

    getReplacements(token, passageId).then(
      async ({ replacements: repData }) => {
        const withAudio = await Promise.all(
          repData.map(async (r) => {
            const audio = await fetchReplacementAudio(token, r.id);
            if (!audio) return undefined;
            return {
              id: r.id,
              title: r.title,
              note: r.note,
              name: r.name,
              selection: { start: r.selectionStart, end: r.selectionEnd },
              audio: audio,
              original: r.original,
            };
          }),
        );
        setReplacements(withAudio.filter((r) => r !== undefined));
      },
    );

    if (passageVersion?.audioKey) {
      listPassageVersions(token, passageId).then(async ({ versions }) => {
        const renderedVersion = versions.find(
          (v) => v.renderSource === passageVersion.audioKey,
        );
        if (!renderedVersion) return;
        const blob = await fetchVersionAudio(token, renderedVersion.id);
        if (blob) {
          setRendered({ version: renderedVersion, blob });
          setShowRendered(true);
        }
      });
    }
  }, [token, passageId]);

  // Compose all replacement clips into the passage audio
  useEffect(() => {
    if (!passageAudio || replacements.length === 0) {
      setComposedAudio(null);
      setHighlights([]);
      offsetMapRef.current = [];
      return;
    }

    let cancelled = false;

    (async () => {
      const sorted = [...replacements].sort(
        (a, b) => a.selection.start - b.selection.start,
      );

      let current = passageAudio.blob;
      let offset = 0;
      const newHighlights: { start: number; end: number; color: string }[] = [];
      const newOffsetMap: OffsetEntry[] = [];

      for (const r of sorted) {
        const adjustedStart = r.selection.start + offset;
        const adjustedEnd = r.selection.end + offset;
        const { blob, replacementDuration } = await replaceAudioSegment(
          current,
          adjustedStart,
          adjustedEnd,
          r.audio,
        );
        current = blob;
        const replacedDuration = r.selection.end - r.selection.start;
        offset += replacementDuration - replacedDuration;

        newHighlights.push({
          start: adjustedStart,
          end: adjustedStart + replacementDuration,
          color: "#ff660091",
        });
        newOffsetMap.push({
          composedStart: adjustedStart,
          composedEnd: adjustedStart + replacementDuration,
          offset,
        });
      }

      if (!cancelled) {
        setComposedAudio(current);
        setHighlights(newHighlights);
        offsetMapRef.current = newOffsetMap;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [passageAudio, replacements]);

  const handleBack = () => navigate("/dashboard");

  const handleExit = () => {
    navigate("/record", { state });
  };

  const handleDialogContinue = async (data: {
    title: string;
    note: string;
    name: string;
    selection: { start: number; end: number };
    replacementDuration: number;
    audio: Blob;
    original: boolean;
  }) => {
    setSaving(true);
    try {
      const isEdit = !!editingReplacement;
      const newSelection = {
        start: composedToOriginalTime(
          data.selection.start,
          offsetMapRef.current,
        ),
        end: composedToOriginalTime(data.selection.end, offsetMapRef.current),
      };

      const audioChanged = !isEdit || data.audio !== editingReplacement.audio;
      const mp3Blob = audioChanged
        ? await compressToMp3(
            new File([data.audio], "replacement.webm", {
              type: data.audio.type,
            }),
            64,
          )
        : undefined;

      if (isEdit) {
        const { replacement } = await updateReplacement(
          token!,
          editingReplacement.id,
          data.title,
          data.note,
          data.name,
          newSelection.start,
          newSelection.end,
          mp3Blob,
          data.original,
        );
        setReplacements((prev) =>
          prev.map((r) =>
            r.id === replacement.id
              ? {
                  ...r,
                  title: data.title,
                  note: data.note,
                  name: data.name,
                  audio: mp3Blob ?? r.audio,
                  selection: newSelection,
                  original: data.original,
                }
              : r,
          ),
        );
      } else {
        const { replacement } = await saveReplacement(
          token!,
          passageId,
          data.title,
          data.note,
          data.name,
          newSelection.start,
          newSelection.end,
          mp3Blob!,
          data.original,
        );
        setReplacements((prev) => [
          ...prev,
          {
            id: replacement.id,
            title: data.title,
            note: data.note,
            name: data.name,
            selection: newSelection,
            audio: mp3Blob!,
            original: data.original,
          },
        ]);
      }

      playerRef.current?.updateSelection({
        start: data.selection.start,
        end: data.selection.start + data.replacementDuration,
      });
      setAddDialogOpen(false);
      setEditingReplacement(null);
    } catch {
      // save/update failed — dialog stays open
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReplacement = async (id: number) => {
    setSaving(true);
    try {
      await deleteReplacement(token!, id);
      setReplacements((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // deletion failed — leave list unchanged
    } finally {
      setSaving(false);
    }
  };

  const buildReplacementPayloads = async (reps: Replacement[]) => {
    return Promise.all(
      reps.map(async (r) => {
        const file = new File([r.audio], "replacement.mp3", {
          type: r.audio.type,
        });
        const dataUrl = await toBase64(file);
        return {
          start: r.selection.start,
          end: r.selection.end,
          audio_format: "wav",
          audio_base64: dataUrl.split(",")[1],
        };
      }),
    );
  };

  const renderReplacements = async () => {
    if (!passageAudio) return;
    const file = new File([passageAudio.blob], "passage.wav", { type: passageAudio.blob.type });
    setRendering(true);
    try {
      const base64String = await toBase64(file);
      const replacementPayloads = await buildReplacementPayloads(replacements);
      const payload = {
        fileName: file.name,
        contentType: file.type,
        data: base64String.split(",")[1],
        replacements: JSON.stringify(replacementPayloads),
      };
      const res = await Axios.post(
        "https://api-dev.audioprojectmanager.org/api/aero/infilling",
        payload,
      );
      const taskId: string = res?.data;

      const renderedBlob = await pollTask(
        `https://api-dev.audioprojectmanager.org/api/aero/infilling/${taskId}`,
      );
      const { version } = await createPassageVersion(
        token!,
        passageId,
        renderedBlob,
        { renderSource: true, activate: false },
      );
      setRendered({ version, blob: renderedBlob });
      setShowRendered(true);
    } catch (err) {
      console.error("renderReplacements error:", err);
    } finally {
      setRendering(false);
    }
  };

  const handleUseThisVersion = async () => {
    if (!rendered) return;
    await activatePassageVersion(token!, rendered.version.id);
    navigate("/record", { state });
  };

  const handleDownloadAudio = () => {
    const blob = showRendered ? rendered?.blob : (composedAudio ?? passageAudio?.blob);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.passageReference ?? "audio"}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuAnchorEl(null);
  };

  const handleEditClick = (r: Replacement) => {
    setSelection({
      start: originalToComposedTime(r.selection.start, offsetMapRef.current),
      end: originalToComposedTime(r.selection.end, offsetMapRef.current),
    });
    setEditingReplacement(r);
    setAddDialogOpen(true);
  };

  const previousRecordings = useMemo(
    () =>
      replacements
        .filter((r) => r.original)
        .map((r) => ({
          id: r.id,
          title: r.title,
          note: r.note,
          name: r.name,
          audio: r.audio,
        })),
    [replacements],
  );

  type ReplacementRow =
    | { type: "existing"; replacement: Replacement; sortKey: number }
    | { type: "add"; sortKey: number };

  const replacementRows = useMemo(() => {
    const rows: ReplacementRow[] = replacements.map((r) => ({
      type: "existing" as const,
      replacement: r,
      sortKey: r.selection.start,
    }));

    if (selection) {
      const isSelectionStartingOverReplacement = replacements.some((r) => {
        const startInComposed = originalToComposedTime(
          r.selection.start,
          offsetMapRef.current,
        );
        return Math.abs(startInComposed - selection.start) < 0.2;
      });
      if (!isSelectionStartingOverReplacement) {
        const selOrigStart = composedToOriginalTime(
          selection.start,
          offsetMapRef.current,
        );
        rows.push({ type: "add", sortKey: selOrigStart });
      }
    }

    return rows.sort((a, b) => a.sortKey - b.sortKey);
  }, [replacements, selection]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      {/* ─── Header ───────────────────────────────────────────── */}
      <PageHeader title={projectName} onBack={handleBack}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            bgcolor: "#9fc5e8",
            px: 1.5,
            py: 1,
            gap: 1,
          }}
        >
          <Backdrop
            open={rendering}
            sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
          >
            <CircularProgress color="inherit" />
          </Backdrop>
          <GraphicEqIcon />
          <Typography sx={{ fontWeight: 600 }}>Replace (AI)</Typography>

          <Box
            sx={{ display: "flex", alignItems: "center", ml: "auto", gap: 1 }}
          >
            {saving ? (
              <CircularProgress size={16} />
            ) : (
              <CloudDoneOutlinedIcon fontSize="small" />
            )}
            <Typography variant="body2">
              {saving ? "Saving…" : "Saved"}
            </Typography>
          </Box>

          <Button
            size="small"
            onClick={handleExit}
            sx={{
              ml: 1,
              border: "1px solid rgba(0,0,0,0.23)",
            }}
          >
            Exit
          </Button>

          <IconButton
            size="small"
            onClick={(e) => setMenuAnchorEl(e.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={() => setMenuAnchorEl(null)}
          >
            <MenuItem onClick={handleDownloadAudio}>Download Audio</MenuItem>
          </Menu>
        </Box>
      </PageHeader>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          px: 2,
          pt: 2,
        }}
      >
        {/* Audio player */}
        <AudioPlayer
          ref={playerRef}
          audioSource={
            showRendered
              ? rendered!.blob
              : (composedAudio ?? passageAudio?.blob ?? undefined)
          }
          height={80}
          enableDragSelection
          showReplaceAI={false}
          onSelectionChange={showRendered ? undefined : setSelection}
          highlights={showRendered ? [] : highlights}
        />

        {/* Rendered audio toggle */}
        {rendered && (
          <FormControlLabel
            control={
              <Switch
                checked={showRendered}
                onChange={(_, checked) => setShowRendered(checked)}
              />
            }
            label="See Rendered Audio"
            sx={{ ml: "auto", mr: 0 }}
          />
        )}

        {/* Replacement rows + Add Replacement row in chronological order */}
        {!showRendered &&
          replacementRows.map((row) =>
            row.type === "add" ? (
              <Stack
                key="add-replacement"
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mt: 1 }}
              >
                <Typography variant="body2">
                  {formatTime(selection!.start)} - {formatTime(selection!.end)}
                </Typography>
                <Box
                  sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}
                >
                  <Button
                    variant="primary"
                    sx={{ width: "100%", maxWidth: 500 }}
                    onClick={() => setAddDialogOpen(true)}
                  >
                    <AddIcon />
                    Add Replacement
                  </Button>
                </Box>
              </Stack>
            ) : (
              <Stack
                key={row.replacement.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mt: 1 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {row.replacement.title}
                </Typography>
                <Typography variant="body2">
                  {formatTime(
                    originalToComposedTime(
                      row.replacement.selection.start,
                      offsetMapRef.current,
                    ),
                  )}{" "}
                  -{" "}
                  {formatTime(
                    originalToComposedTime(
                      row.replacement.selection.end,
                      offsetMapRef.current,
                    ),
                  )}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <IconButton
                  size="small"
                  onClick={() => handleEditClick(row.replacement)}
                  disabled={saving}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteReplacement(row.replacement.id)}
                  disabled={saving}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ),
          )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Helper text */}
        {showRendered && (
          <Typography variant="body2" sx={{ textAlign: "center", my: 16 }}>
            Review and click Use This Version when ready.
            <br />
            Toggle{" "}
            <Switch size="small" checked sx={{ verticalAlign: "middle" }} /> if
            you need to go back to editing.
          </Typography>
        )}
        {!showRendered && !selection && replacements.length === 0 && (
          <Typography variant="body2" sx={{ textAlign: "center", my: 16 }}>
            Drag to mark the parts you want to replace
          </Typography>
        )}
      </Box>

      <Box sx={{ px: 2, pb: 3 }}>
        {showRendered ? (
          <Button fullWidth variant="primary" onClick={handleUseThisVersion}>
            Use This Version
          </Button>
        ) : (
          <Button
            fullWidth
            variant={selection ? undefined : "primary"}
            disabled={replacements.length === 0 || rendered !== null}
            onClick={renderReplacements}
          >
            Render Replacements
          </Button>
        )}
      </Box>

      {/* ─── Add / Edit Replacement Dialog ────────────────── */}
      {selection && (
        <AddReplacementDialog
          open={addDialogOpen}
          originalComposedAudio={composedAudio ?? passageAudio?.blob ?? undefined}
          selection={selection}
          speaker={state.speaker ?? ""}
          existingHighlights={highlights.filter(
            // Filter out the existing highlight when editing a replacement
            (h) => h.start !== selection.start && h.end !== selection.end,
          )}
          onCancel={() => {
            setAddDialogOpen(false);
            setEditingReplacement(null);
          }}
          onContinue={handleDialogContinue}
          editData={editingReplacement ?? undefined}
          previousRecordings={previousRecordings}
        />
      )}
    </Box>
  );
}
