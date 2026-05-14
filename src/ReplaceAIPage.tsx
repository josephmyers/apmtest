import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HideSourceIcon from "@mui/icons-material/HideSource";
import UndoIcon from "@mui/icons-material/Undo";
import { useAuth } from "./AuthContext";
import { useSnackbar } from "./useSnackbar";
import {
  associateReplacementsWithVersion,
  createPassageVersion,
  deleteUnversionedReplacements,
  discardUnversionedRendering,
  fetchAudio,
  fetchVersionAudio,
  fetchUnversionedRendering,
  getPassage,
  getReplacements,
  listPassageVersions,
  saveReplacement,
  storePassageStaged,
  updateReplacement,
  deleteReplacement,
  type PassageVersion,
} from "./api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import AddReplacementDialog from "./AddReplacementDialog";
import PageHeader from "./PageHeader";
import { formatTime } from "./formatTime";
import Axios from "axios";
import { composeReplacements, compressToMp3, toBase64 } from "./audioUtils";
import { pollTask } from "./pollTask";

interface ReplaceAIPageState {
  passageId: number;
  passageReference: string;
  projectName: string;
  speaker?: string | null;
  //todo remove?
  sectionPassages?: { id: number; reference: string; speaker: string | null }[];
  passageVersion?: PassageVersion | null;
  initialSelection?: { start: number; end: number } | null;
}

interface Replacement {
  id: number;
  title: string;
  note: string;
  name: string;
  selection: { start: number; end: number };
  audio: Blob;
  original: boolean;
  versionId: number | null;
}

type UndoEntry = { type: "edit" | "delete"; before: Replacement };

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
    if (t < entry.composedEnd) return entry.composedStart - prevOffset;
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
  const initialSelection = state.initialSelection ?? null;

  const { setSnackMsg, snackbarElement } = useSnackbar();
  const playerRef = useRef<AudioPlayerHandle>(null);
  const initialSelectionHandled = useRef(false);
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
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [showRendered, setShowRendered] = useState(false);
  const [hasUnversionedRendering, setHasUnversionedRendering] = useState(false);
  // The active replacements are not necessarily what's saved in the DB, though they often are. They are the Reset target.
  // If you have unversioned replacements and an unversioned rendering, where DB changes happen immediately, if you edit the replacements, how do you Reset?
  const [activeReplacements, setActiveReplacements] = useState<Replacement[]>([]);
  const [isBusy, setIsBusy] = useState(true);

  const [versionNote, setVersionNote] = useState("");
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  const [composedAudio, setComposedAudio] = useState<Blob | null>(null);
  const [highlights, setHighlights] = useState<
    { start: number; end: number; color: string }[]
  >([]);
  const offsetMapRef = useRef<OffsetEntry[]>([]);
  const pendingExitRef = useRef<{ path: string | number; options?: { state: any } } | null>(null);

  // When editing a replacement, holds the composed audio/highlights/offsetMap
  // computed from all replacements EXCEPT the one being edited.
  const editSourceRef = useRef<{
    blob: Blob;
    highlights: { start: number; end: number; color: string }[];
    offsetMap: OffsetEntry[];
  } | null>(null);

const haveReplacementsChanged = useMemo(() => {
  if (replacements.length !== activeReplacements.length) return true;
  return replacements.some(r =>
    !activeReplacements.find(s =>
      r.title === s.title &&
      r.note === s.note &&
      r.name === s.name &&
      r.selection.start === s.selection.start &&
      r.selection.end === s.selection.end &&
      r.original === s.original &&
      r.audio === s.audio
    )
  );
}, [renderedBlob, replacements, activeReplacements]);

  // If they have rendered but unversioned audio, but the replacements have changed since that rendering, it would be very strange to
  // exit and return to a rendered audio that doesn't match the set of replacements, especially if the rendering is unversioned.
  // If you have unversioned replacements and an unversioned rendering, where DB changes happen immediately, if you edit the replacements, you can't Reset
  const shouldGuardNavigation = !!renderedBlob && haveReplacementsChanged;

  // Load passage audio, rendered audio, and existing replacements on mount
  useEffect(() => {
    if (!token || !passageId) return;
    setIsBusy(true);
    
    fetchVersionAudio(token, passageVersion?.id ?? passageId).then((blob) => {
      if (blob) setPassageAudio({ blob, version: passageVersion });
    });

    Promise.all([
      getReplacements(token, passageId, null),
      listPassageVersions(token, passageId),
    ]).then(async ([unversionedReplacements, { versions }]) => {
      const { passage } = await getPassage(token, passageId);
      const activeVersion = versions.find((v) => v.audioKey === passage.audioKey)!;

      const versionedReps = await getReplacements(
        token,
        passageId,
        activeVersion.id,
      );
      setVersionNote(activeVersion.note);

      // If there's an unversioned blob, that's the latest; otherwise, use the active audio
      const unversionedBlob = await fetchUnversionedRendering(token!, passageId);
      const renderedBlob = unversionedBlob ?? (activeVersion.renderSource ? await fetchAudio(token!, passageId) : null);
      setRenderedBlob(renderedBlob);
      setHasUnversionedRendering(!!unversionedBlob);

      if (unversionedReplacements.length > 0) {
        setReplacements(unversionedReplacements);
        setActiveReplacements(unversionedReplacements);
      } else {
        // No unversioned replacements — make unversioned copies of active replacements
        // Copy each replacement as unversioned (no versionId)
        const copies = await Promise.all(
          versionedReps.map(async (r) => {
            const { replacement } = await saveReplacement(
              token, passageId, r.title, r.note, r.name,
              r.selection.start, r.selection.end, r.audio, r.original,
            );
            const { selectionStart, selectionEnd, versionId: _v, ...rest } = replacement;
            return { ...rest, selection: { start: selectionStart, end: selectionEnd }, audio: r.audio };
          }),
        );

        setReplacements(copies.filter(Boolean) as Replacement[]);
        setActiveReplacements(versionedReps);
      }
    }).finally(() => {
      setIsBusy(false);
    });
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

    composeReplacements(passageAudio.blob, replacements).then((result) => {
      if (!cancelled) {
        setComposedAudio(result.blob);
        setHighlights(result.highlights);
        offsetMapRef.current = result.offsetMap;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [passageAudio, replacements]);

  const guardedNavigate = (path: string | number, options?: { state: any }) => {
    if (shouldGuardNavigation) {
      pendingExitRef.current = { path, options };
      setConfirmExitOpen(true);
    } else if (typeof path === "number") {
      navigate(path);
    } else {
      navigate(path, options);
    }
  };

  const confirmExit = async () => {
    setConfirmExitOpen(false);
    const dest = pendingExitRef.current;
    pendingExitRef.current = null;
    if (!dest) return;
    await handleReset();
    if (typeof dest.path === "number") {
      navigate(dest.path);
    } else {
      navigate(dest.path, dest.options);
    }
  };

  const handleBack = () => guardedNavigate(-1);

  const handleExit = () => guardedNavigate("/record", { state });

  // Guard browser refresh / tab close
  useEffect(() => {
    if (!shouldGuardNavigation) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldGuardNavigation]);

  // Guard browser back button
  useEffect(() => {
    if (!shouldGuardNavigation) return;
    window.history.pushState(null, "", window.location.href);
    const handler = () => {
      window.history.pushState(null, "", window.location.href);
      pendingExitRef.current = { path: "/record", options: { state } };
      setConfirmExitOpen(true);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [shouldGuardNavigation]);

  useEffect(() => {
    if (!initialSelection || initialSelectionHandled.current) return;
    if (isBusy) return;
    if (replacements.length > 0 && !composedAudio) return;

    initialSelectionHandled.current = true;

    const hasConflict = replacements.some(
      (r) => initialSelection.start < r.selection.end && initialSelection.end > r.selection.start,
    );
    if (hasConflict) {
      setSnackMsg("Your selection overlaps an existing replacement and can't be applied.");
      return;
    }

    playerRef.current?.updateSelection({
      start: originalToComposedTime(initialSelection.start, offsetMapRef.current),
      end: originalToComposedTime(initialSelection.end, offsetMapRef.current),
    });
  }, [isBusy, composedAudio, replacements]);

  useEffect(() => {
    if (!selection) return;
    const hasConflict = replacements.some(
      (r) => selection.start < r.selection.end && selection.end > r.selection.start,
    );
    if (hasConflict) {
      playerRef.current?.updateSelection(null);
      playerRef.current?.setTime(0);
      playerRef.current?.resetZoom();
    }
  }, [replacements]);

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
      // When editing, selection coordinates are in edit-excluded composed time,
      // so we must use the edit-excluded offset map to convert back to original time.
      const activeOffsetMap = isEdit ? (editSourceRef.current?.offsetMap ?? []) : offsetMapRef.current;
      const newSelection = {
        start: composedToOriginalTime(data.selection.start, activeOffsetMap),
        end: composedToOriginalTime(data.selection.end, activeOffsetMap),
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
        setUndoStack((prev) => [...prev, { type: "edit", before: editingReplacement! }]);
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
            versionId: null,
          },
        ]);
      }

      setAddDialogOpen(false);
      setEditingReplacement(null);
      editSourceRef.current = null;
    } catch {
      // save/update failed — dialog stays open
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReplacement = async (id: number) => {
    const target = replacements.find((r) => r.id === id);
    if (!target) return;
    setSaving(true);
    try {
      await deleteReplacement(token!, id);
      setUndoStack((prev) => [...prev, { type: "delete", before: target }]);
      setReplacements((prev) => prev.filter((r) => r.id !== id));
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setSaving(true);
    try {
      if (entry.type === "edit") {
        const current = replacements.find((r) => r.id === entry.before.id);
        const audioChanged = current?.audio !== entry.before.audio;
        await updateReplacement(
          token!,
          entry.before.id,
          entry.before.title,
          entry.before.note,
          entry.before.name,
          entry.before.selection.start,
          entry.before.selection.end,
          audioChanged ? entry.before.audio : undefined,
          entry.before.original,
        );
        setReplacements((prev) =>
          prev.map((r) => (r.id === entry.before.id ? entry.before : r)),
        );
        setUndoStack((prev) => prev.slice(0, -1));
      } else {
        const { replacement } = await saveReplacement(
          token!,
          passageId,
          entry.before.title,
          entry.before.note,
          entry.before.name,
          entry.before.selection.start,
          entry.before.selection.end,
          entry.before.audio,
          entry.before.original,
        );
        const newId = replacement.id;
        const oldId = entry.before.id;
        setUndoStack((prev) =>
          prev.slice(0, -1).map((e) =>
            e.before.id === oldId ? { ...e, before: { ...e.before, id: newId } } : e,
          ),
        );
        setReplacements((prev) => [...prev, { ...entry.before, id: newId }]);
      }

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

  const [confirmRenderOpen, setConfirmRenderOpen] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false); // I'm pretty sure we still need this
  const [confirmDiscardExitOpen, setConfirmDiscardExitOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleRenderClick = () => {
    if (hasUnversionedRendering) {
      setConfirmRenderOpen(true);
    } else {
      renderReplacements();
    }
  };

  const renderReplacements = async () => {
    setConfirmRenderOpen(false);
    if (!passageAudio) return;
    const file = new File([passageAudio.blob], "passage.wav", { type: passageAudio.blob.type });
    setIsBusy(true);
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
      await storePassageStaged(token!, passageId, renderedBlob);
      setActiveReplacements([...replacements]);
      setRenderedBlob(renderedBlob);
      setHasUnversionedRendering(true);
      setUndoStack([]);
      setShowRendered(true);
      setVersionNote("");
    } catch (err) {
      console.error("renderReplacements error:", err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUseThisVersion = async () => {
    if (!renderedBlob) return;
    setIsBusy(true);
    const { version } = await createPassageVersion(
      token!, passageId, renderedBlob,
      { renderSource: passageVersion?.audioKey, activate: true, note: versionNote },
    );
    await associateReplacementsWithVersion(token!, passageId, version.id);
    setIsBusy(false);
    navigate("/record", { state });
  };

  const handleDiscardAndExit = () => {
    setMenuAnchorEl(null);
    setConfirmDiscardExitOpen(true);
  };

  const confirmDiscardAndExit = async () => {
    setConfirmDiscardExitOpen(false);
    setIsBusy(true);
    try {
      await deleteUnversionedReplacements(token!, passageId);
      await discardUnversionedRendering(token!, passageId);
      navigate("/record", { state });
    } finally {
      setIsBusy(false);
    }
  };

  const handleEditClick = async (r: Replacement) => {
    if (!passageAudio) return;
    const otherReplacements = replacements.filter((rep) => rep.id !== r.id);
    editSourceRef.current = await composeReplacements(passageAudio.blob, otherReplacements);
    // Selection in edit-excluded composed audio time
    setSelection({
      start: originalToComposedTime(r.selection.start, editSourceRef.current.offsetMap),
      end: originalToComposedTime(r.selection.end, editSourceRef.current.offsetMap),
    });
    setEditingReplacement(r);
    setAddDialogOpen(true);
  };

  const handleReset = async () => {
    setIsBusy(true);
    try {
      await deleteUnversionedReplacements(token!, passageId);
      const resaved = await Promise.all(
        activeReplacements.map(async (r) => {
          const { replacement } = await saveReplacement(
            token!, passageId, r.title, r.note, r.name,
            r.selection.start, r.selection.end, r.audio, r.original,
          );
          return { ...r, id: replacement.id };
        }),
      );
      setReplacements(resaved);
      setActiveReplacements(resaved);
      setUndoStack([]);

      playerRef.current?.setTime(0);
      playerRef.current?.updateSelection(null);
    } finally {
      setIsBusy(false);
    }
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
        "@supports (height: 100dvh)": {
          height: "100dvh",
        },
      }}
    >
      <Backdrop
        open={isBusy}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* ─── Header ───────────────────────────────────────────── */}
      <PageHeader leftIcon="back" onLeftClick={handleBack} title={projectName}>
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
            <MenuItem onClick={handleDiscardAndExit}>
              <HideSourceIcon fontSize="small" sx={{ mr: 1 }} />
              Discard and Exit
            </MenuItem>
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
              ? renderedBlob!
              : (composedAudio ?? passageAudio?.blob ?? undefined)
          }
          height={80}
          enableDragSelection
          onSelectionChange={showRendered ? undefined : setSelection}
          highlights={showRendered ? [] : highlights}
        />

        {/* Rendered audio toggle / Reset */}
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
          {undoStack.length > 0 && !showRendered && (
            <IconButton size="small" onClick={handleUndo}>
              <UndoIcon fontSize="small" />
            </IconButton>
          )}
          {haveReplacementsChanged ? (
            <Button onClick={() => setConfirmResetOpen(true)}>Reset</Button>
          ) : (
            renderedBlob && (
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
            )
          )}
        </Box>

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

        {/* Helper text — absolutely positioned so it doesn't shift when rows appear above */}
        <Box
          sx={{
            position: "absolute",
            top: 400,
            left: 16,
            right: 16,
            textAlign: "center",
          }}
        >
          {showRendered && (
            <Typography variant="body2">
              Review and click Use This Version when ready.
              <br />
              Toggle{" "}
              <Switch
                size="small"
                checked
                sx={{ verticalAlign: "middle", pointerEvents: "auto" }}
              />{" "}
              if you need to go back to editing.
            </Typography>
          )}
          {!showRendered && !selection && replacements.length === 0 && (
            <Typography variant="body2">
              Drag to mark the parts you want to replace
            </Typography>
          )}
          {!showRendered && selection && replacements.length === 0 && (
            <Typography variant="body2">
              Tap + to add replacement here
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ px: 2, pb: 3 }}>
        {showRendered ? (
          <>
            <TextField
              fullWidth
              placeholder="Add an optional note for this version..."
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              disabled={!hasUnversionedRendering}
              size="small"
              sx={{ mb: 1 }}
            />
            <Button fullWidth variant="primary" onClick={handleUseThisVersion} disabled={!hasUnversionedRendering}>
              Use This Version
            </Button>
          </>
        ) : (
          <Button
            fullWidth
            variant={replacementRows.some((r) => r.type === "add") ? undefined : "primary"}
            disabled={replacements.length === 0 || (renderedBlob !== null && !haveReplacementsChanged)}
            onClick={handleRenderClick}
          >
            Render Replacements
          </Button>
        )}
      </Box>

      {/* ─── Confirm Reset Dialog ─────────────────────────── */}
      <Dialog open={confirmResetOpen} onClose={() => setConfirmResetOpen(false)}>
        <DialogContent>
          <DialogContentText>
            {renderedBlob
              ? "Reset will discard your changes and restore the replacements to the last rendering."
              : "Reset will discard your changes and reset to when this page loaded."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetOpen(false)} variant="primary">Cancel</Button>
          <Button onClick={() => { setConfirmResetOpen(false); handleReset(); }}>Reset</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Confirm Re-render Dialog ─────────────────────── */}
      <Dialog open={confirmRenderOpen} onClose={() => setConfirmRenderOpen(false)}>
        <DialogContent>
          <DialogContentText>
            Rendering will overwrite your existing rendered audio.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRenderOpen(false)} variant="primary">Cancel</Button>
          <Button onClick={renderReplacements}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Confirm Exit Dialog ──────────────────────────── */}
      <Dialog open={confirmExitOpen} onClose={() => setConfirmExitOpen(false)}>
        <DialogContent>
          <DialogContentText>
            You have made changes to the replacements on this page. If you leave without rendering, those
            changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmExitOpen(false)} variant="primary">Cancel</Button>
          <Button onClick={confirmExit}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Confirm Discard And Exit Dialog ──────────────── */}
      <Dialog
        open={confirmDiscardExitOpen}
        onClose={() => setConfirmDiscardExitOpen(false)}
      >
        <DialogContent>
          <DialogContentText>
            All your progress will be permanently deleted. Replacement markings
            and rendered audio not selected for "Use This Version" will be removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDiscardExitOpen(false)}
            variant="primary"
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button onClick={confirmDiscardAndExit} disabled={isBusy}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Add / Edit Replacement Dialog ────────────────── */}
      {selection && addDialogOpen && (
        <AddReplacementDialog
          open={addDialogOpen}
          originalComposedAudio={
            editSourceRef.current?.blob ?? composedAudio ?? passageAudio!.blob
          }
          selection={selection}
          speaker={state.speaker ?? ""}
          existingHighlights={
            editingReplacement
              ? (editSourceRef.current?.highlights ?? [])
              : highlights.filter(
                  (h) => h.start !== selection.start && h.end !== selection.end,
                )
          }
          onCancel={() => {
            setAddDialogOpen(false);
            setEditingReplacement(null);
            editSourceRef.current = null;
          }}
          onContinue={handleDialogContinue}
          editData={editingReplacement ?? undefined}
          previousRecordings={previousRecordings}
        />
      )}

      {snackbarElement}
    </Box>
  );
}
