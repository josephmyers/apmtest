import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { useSnackbar } from "./useSnackbar";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";

import StopIcon from "@mui/icons-material/Stop";
import PauseIcon from "@mui/icons-material/Pause";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { useAuth } from "./AuthContext";
import {
  fetchAudio,
  createPassageVersion,
  deletePassageVersion,
  getPassage,
  getReplacements,
  listPassageVersions,
  fetchVersionAudio,
  deleteUnversionedReplacements,
  getSpeakers,
  type Speaker,
  type PassageVersion,
} from "./api";
import { compressToMp3 } from "./audioUtils";
import SpeakerDialog from "./SpeakerDialog";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import PageHeader from "./PageHeader";
import VersionsDialog, { type UseVersionResult } from "./VersionsDialog";

interface RecordPageState {
  passageId: number;
  passageReference: string;
  projectName: string;
  speaker?: string | null;
  sectionPassages?: { id: number; reference: string; speaker: string | null }[];
}

/** Hardcoded step colours for the racetrack indicator */
const STEP_COLORS = [
  "#111",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
];

/**
 * Thin wrapper that keys the real page on passageId so React fully
 * unmounts / remounts whenever the user switches passages.
 */
export default function RecordPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as RecordPageState;
  const passageId = state.passageId;

  return <RecordPageInner key={passageId} />;
}

function RecordPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const state = (location.state ?? {}) as RecordPageState;

  const passageIdFromQuery = Number(new URLSearchParams(location.search).get("passageId"));
  const passageId =
    state.passageId || (Number.isFinite(passageIdFromQuery) ? passageIdFromQuery : 0);
  const passageReference = state.passageReference ?? "Unknown Passage";
  const projectName = state.projectName ?? "";
  const sectionPassages = state.sectionPassages ?? [];

  // Audio state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<AudioPlayerHandle>(null);
  const [passageAudio, setPassageAudio] = useState<{
    blob: Blob;
    version: PassageVersion;
  } | null>(null);
  const [renderSource, setRenderSource] = useState<{
    blob: Blob;
    version: PassageVersion;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  const [audioInitialized, setAudioInitialized] = useState(false);
  const [hasUnversionedReplacements, setHasUnversionedReplacements] = useState(false);
  const [versions, setVersions] = useState<PassageVersion[]>([]);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);

  // Passage dropdown state
  const [passageMenuAnchor, setPassageMenuAnchor] = useState<null | HTMLElement>(null);

  // Speaker state
  const [speakerDialogOpen, setSpeakerDialogOpen] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  // Fetch speakers list on mount
  useEffect(() => {
    if (!token) return;
    getSpeakers(token)
      .then((data) => setSpeakers(data.speakers))
      .catch(() => {
        /* silent — list will just be empty */
      });
  }, [token]);

  // Load existing audio, passage details, and versions on mount
  useEffect(() => {
    if (!token || !passageId) {
      setAudioInitialized(true);
      return;
    }
    // Use nav-state speaker as fast initial value
    if (state.speaker) {
      setSelectedSpeaker(state.speaker);
    }
    Promise.all([
      fetchAudio(token, passageId),
      getPassage(token, passageId),
      listPassageVersions(token, passageId),
    ]).then(([blob, { passage }, { versions }]) => {
      const sortedVersions = [...versions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setVersions(sortedVersions);
      if (passage.speaker) setSelectedSpeaker(passage.speaker);
      if (!blob) {
        setAudioInitialized(true);
        return;
      }
      const version = versions.find((v) => v.audioKey === passage.audioKey);
      if (!version) {
        setAudioInitialized(true);
        return;
      }
      setPassageAudio({ blob, version });
      setAudioInitialized(true);

      const renderSourceVersion = versions.find((v) => v.audioKey === version.renderSource);
      if (renderSourceVersion) {
        fetchVersionAudio(token, renderSourceVersion.id).then((rsBlob) => {
          if (rsBlob) setRenderSource({ blob: rsBlob, version: renderSourceVersion });
        });
      }
    });
    getReplacements(token, passageId, null).then((reps) => {
      setHasUnversionedReplacements(reps.length > 0);
    });
  }, [token, passageId]);

  const busy = compressing || uploading;

  async function handleFileSelected(file: File) {
    if (!token) {
      setSnackMsg("You are not logged in. Please sign in again.");
      return;
    }
    if (!passageId) {
      setSnackMsg("Missing passage ID. Return to Dashboard and open Record from a passage card.");
      return;
    }
    try {
      setCompressing(true);
      const mp3Blob = await compressToMp3(file, 64);

      // Netlify Functions have a ~6 MB body limit (AWS Lambda)
      const MAX_UPLOAD = 5.5 * 1024 * 1024;
      if (mp3Blob.size > MAX_UPLOAD) {
        const sizeMB = (mp3Blob.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Compressed audio is ${sizeMB} MB — exceeds the 5.5 MB upload limit. Try a shorter recording.`,
        );
      }

      setCompressing(false);
      setUploading(true);
      const { version } = await createPassageVersion(token, passageId, mp3Blob, {
        activate: true,
        speaker: selectedSpeaker!,
      });

      // Set audio source for playback
      setPassageAudio({ blob: mp3Blob, version });
      setVersions((prev) => [version, ...prev.filter((v) => v.id !== version.id)]);
      setRenderSource(null);
      setSnackMsg("Audio saved!");
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : "Failed to process audio");
    } finally {
      setCompressing(false);
      setUploading(false);
    }
  }

  function handleLoadFromFileClick() {
    if (!token) {
      setSnackMsg("You are not logged in. Please sign in again.");
      return;
    }
    if (!passageId) {
      setSnackMsg("Missing passage ID. Return to Dashboard and open Record from a passage card.");
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleRecordToggle() {
    if (compressing || uploading) return;
    if (!token) {
      setSnackMsg("You are not logged in. Please sign in again.");
      return;
    }
    if (!passageId) {
      setSnackMsg("Missing passage ID. Return to Dashboard and open Record from a passage card.");
      return;
    }
    if (!selectedSpeaker) return;

    if (!recording) {
      try {
        setWarmingUp(true);
        await playerRef.current?.startRecording();
        setWarmingUp(false);
        setRecording(true);
      } catch {
        setWarmingUp(false);
        setSnackMsg("Could not access microphone. Please allow microphone access and try again.");
      }
    } else {
      playerRef.current?.stopRecording();
      setRecording(false);
    }
  }

  async function handleRecordingComplete(blob: Blob) {
    // Compress and upload
    try {
      setCompressing(true);
      const file = new File([blob], "recording.webm", { type: blob.type });
      const mp3Blob = await compressToMp3(file, 64);

      const MAX_UPLOAD = 5.5 * 1024 * 1024;
      if (mp3Blob.size > MAX_UPLOAD) {
        const sizeMB = (mp3Blob.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Compressed audio is ${sizeMB} MB — exceeds the 5.5 MB upload limit. Try a shorter recording.`,
        );
      }

      setCompressing(false);
      setUploading(true);
      const { version } = await createPassageVersion(token!, passageId, mp3Blob, {
        activate: true,
        speaker: selectedSpeaker!,
      });
      setPassageAudio({ blob: mp3Blob, version });
      setVersions((prev) => [version, ...prev.filter((v) => v.id !== version.id)]);
      setRenderSource(null);
      setSnackMsg("Audio saved!");
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : "Failed to process audio");
    } finally {
      setCompressing(false);
      setUploading(false);
    }
  }

  async function handleVersionSelected(data: UseVersionResult) {
    if (!token) return;
    setPassageAudio({ blob: data.blob, version: data.version });
    setRenderSource(data.renderSource);
    deleteUnversionedReplacements(token, passageId);
    setHasUnversionedReplacements(false);
    setVersionsDialogOpen(false);
    setSnackMsg("Version activated!");
  }

  async function handleDeleteVersion(version: PassageVersion) {
    if (!token) return;
    await deletePassageVersion(token, version.id);
    setVersions((prev) => prev.filter((v) => v.id !== version.id));
    if (passageAudio?.version.id === version.id) {
      setPassageAudio(null);
      setRenderSource(null);
    }
    if (renderSource?.version.id === version.id) {
      setRenderSource(null);
    }
    setSnackMsg("Version deleted.");
  }

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
      {/* ─── Header ───────────────────────────────────────────────── */}
      <PageHeader title={projectName} onBack={() => navigate("/dashboard")}>
        {/* Racetrack row */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pb: 1,
            px: 2,
          }}
        >
          <Box
            sx={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              width: "100%",
            }}
          >
            {/* Passage dropdown — always a flex item; sits on top on large screens */}
            <Box sx={{ flexShrink: 0, position: "relative", zIndex: 1, mr: 1 }}>
              <Button
                size="small"
                endIcon={<ArrowDropDownIcon />}
                sx={{
                  whiteSpace: "nowrap",
                  minWidth: "auto",
                }}
                onClick={(e) => setPassageMenuAnchor(e.currentTarget)}
              >
                {passageReference}
              </Button>
              <Menu
                anchorEl={passageMenuAnchor}
                open={Boolean(passageMenuAnchor)}
                onClose={() => setPassageMenuAnchor(null)}
              >
                {sectionPassages.map((p) => (
                  <MenuItem
                    key={p.id}
                    selected={p.id === passageId}
                    onClick={() => {
                      setPassageMenuAnchor(null);
                      if (p.id !== passageId) {
                        navigate("/record", {
                          state: {
                            passageId: p.id,
                            passageReference: p.reference,
                            projectName,
                            speaker: p.speaker,
                            sectionPassages,
                          },
                        });
                      }
                    }}
                  >
                    {p.reference}
                  </MenuItem>
                ))}
              </Menu>
            </Box>

            {/* Parallelograms
                - Small screens: flex item starting at dropdown edge, scrolls right
                - Large screens: absolutely spans full row width (behind dropdown) */}
            <Box
              sx={{
                overflowX: "auto",
                display: "flex",
                // small: regular flex item, left-aligned so scroll works correctly
                flex: { xs: 1, md: "none" },
                justifyContent: { xs: "flex-start", md: "center" },
                // large: absolute to cover full width including dropdown
                position: { md: "absolute" },
                left: { md: 0 },
                right: { md: 0 },
              }}
            >
              {STEP_COLORS.map((color, i) => (
                <Box
                  key={i}
                  sx={{
                    flex: "0 0 80px",
                    height: 30,
                    bgcolor: color,
                    mr: -0.25,
                    clipPath: "polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)",
                  }}
                />
              ))}
            </Box>

            {/* Spacer gives the row its height on large screens (absolute children don't contribute) */}
            <Box sx={{ height: 30, flex: 1, display: { xs: "none", md: "block" } }} />
          </Box>
          <Typography sx={{ mt: 1, fontWeight: 500 }}>Record</Typography>
        </Box>
      </PageHeader>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          position: "relative",
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
            e.target.value = ""; // reset so same file can be re-selected
          }}
        />

        {/* Select Speaker & Load from File */}
        <Box sx={{ display: "flex", gap: 1, p: 2 }}>
          <Button
            variant={selectedSpeaker ? undefined : "primary"}
            startIcon={<PersonOutlineIcon />}
            sx={{ width: "100%", maxWidth: 260 }}
            onClick={() => {
              setSpeakerDialogOpen(true);
            }}
          >
            {selectedSpeaker || "Select Speaker..."}
          </Button>
          <Button
            startIcon={busy ? <CircularProgress size={18} /> : <FolderOpenIcon />}
            sx={{ width: "100%", maxWidth: 260 }}
            disabled={busy || !selectedSpeaker || recording}
            onClick={handleLoadFromFileClick}
          >
            {busy ? "Uploading..." : "Load from File..."}
          </Button>
        </Box>

        {/* Audio player / waveform */}
        <Box sx={{ px: 2 }}>
          <AudioPlayer
            ref={playerRef}
            audioSource={passageAudio?.blob ?? undefined}
            height={80}
            enableDragSelection
            onSelectionChange={(sel) => setSelection(sel)}
            onRecordingComplete={handleRecordingComplete}
            menuItems={
              <MenuItem
                onClick={() =>
                  navigate("/replace-ai", {
                    state: {
                      passageId,
                      passageReference,
                      projectName,
                      speaker: selectedSpeaker,
                      sectionPassages,
                      passageVersion: renderSource?.version ?? passageAudio?.version ?? null,
                    },
                  })
                }
              >
                <ListItemIcon>
                  <GraphicEqIcon />
                </ListItemIcon>
                <ListItemText>
                  {hasUnversionedReplacements ? "Resume Replace (AI)" : "Replace (AI)"}
                </ListItemText>
              </MenuItem>
            }
            topRowLabel={
              passageAudio?.version.renderSource ? (
                <Typography variant="body2" sx={{ color: "success.main", fontWeight: 500 }}>
                  AI-Rendered
                </Typography>
              ) : undefined
            }
          />
        </Box>

        {versions.length > 1 && (
          <Box sx={{ px: 2, pt: 1 }}>
            <Button
              startIcon={<InsertDriveFileOutlinedIcon />}
              onClick={() => setVersionsDialogOpen(true)}
            >
              Versions...
            </Button>
          </Box>
        )}

        {/* Replace (AI) */}
        {(hasUnversionedReplacements || selection) && (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
            <Button
              startIcon={<GraphicEqIcon />}
              onClick={() =>
                navigate("/replace-ai", {
                  state: {
                    passageId,
                    passageReference,
                    projectName,
                    speaker: selectedSpeaker,
                    sectionPassages,
                    passageVersion: renderSource?.version ?? passageAudio?.version ?? null,
                    initialSelection: selection,
                  },
                })
              }
            >
              {hasUnversionedReplacements ? "Resume Replace (AI)" : "Replace (AI)"}
            </Button>
          </Box>
        )}

        {/* Spacer pushes record button toward bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Record */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 4,
          }}
        >
          {audioInitialized && (!passageAudio ? (
            <Box
              onClick={handleRecordToggle}
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: recording || warmingUp ? "none" : "25px solid",
                borderColor: selectedSpeaker ? "alert.main" : "#d0d0d0",
                bgcolor: recording || warmingUp ? "alert.main" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: selectedSpeaker && !busy && !warmingUp ? "pointer" : "default",
                opacity: selectedSpeaker && !busy ? 1 : 0.6,
                transition: "all 0.2s ease",
                "&:hover": selectedSpeaker && !busy && !warmingUp ? { opacity: 0.85 } : {},
              }}
            >
              {warmingUp && <CircularProgress size={32} sx={{ color: "#fff" }} />}
              {recording && !warmingUp && <StopIcon sx={{ color: "#fff", fontSize: 36 }} />}
            </Box>
          ) : (
            <Button
              onClick={() => {
                if (selection) {
                  setSnackMsg("Recording is not supported while there is a selected time range.");
                  return;
                }
                handleRecordToggle();
              }}
              sx={{
                width: 120,
                height: 64,
                fontSize: "1.1rem !important",
                fontWeight: 600,
                color: selection ? "#9e9e9e" : "alert.main",
                opacity: selectedSpeaker && !busy ? 1 : 0.6,
                cursor: selectedSpeaker && !busy && !warmingUp ? "pointer" : "default",
                
                "&:hover":
                  selectedSpeaker && !busy && !warmingUp && !selection
                    ? {}
                    : { bgcolor: "#fff" },
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
          ))}
        </Box>

        {/* Floating Discussions button */}
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

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "#eee",
          px: 1,
          py: 1,
        }}
      >
        <Box sx={{ width: 90 }} />

        <Button
          startIcon={<Checkbox size="small" sx={{ p: 0, "&.Mui-disabled": { color: "inherit" } }} disabled />}
          variant="primary"
          onClick={() => {
            /* stub */
          }}
        >
          Step Complete
        </Button>

        <Button
          endIcon={<ChevronRightIcon />}
          onClick={() => {
            /* stub */
          }}
        >
          Next
        </Button>
      </Box>

      {snackbarElement}

      <SpeakerDialog
        open={speakerDialogOpen}
        token={token}
        options={speakers.map((s) => s.name)}
        initialValue={selectedSpeaker ?? ""}
        onClose={() => setSpeakerDialogOpen(false)}
        onSpeakerSelected={(speakerName) => {
          setSelectedSpeaker(speakerName);
          setSpeakers((prev) => {
            if (prev.some((speaker) => speaker.name === speakerName)) return prev;
            return [...prev, { name: speakerName }].sort((a, b) => a.name.localeCompare(b.name));
          });
        }}
        onError={setSnackMsg}
      />

      {versionsDialogOpen && (
        <VersionsDialog
          open={versionsDialogOpen}
          token={token!}
          versions={versions}
          activeAudioKey={passageAudio?.version.audioKey!}
          passageReference={passageReference}
          speakerName={selectedSpeaker!}
          onClose={() => setVersionsDialogOpen(false)}
          onMessage={setSnackMsg}
          onUseVersion={handleVersionSelected}
          onDeleteVersion={handleDeleteVersion}
        />
      )}
    </Box>
  );
}
