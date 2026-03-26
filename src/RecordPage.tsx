import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from "@mui/material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import StopIcon from "@mui/icons-material/Stop";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { useAuth } from "./AuthContext";
import {
  uploadAudio,
  fetchAudio,
  getSpeakers,
  getPassageSpeaker,
  type Speaker,
} from "./api";
import { compressToMp3 } from "./audioUtils";
import SpeakerDialog from "./SpeakerDialog";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import PageHeader from "./PageHeader";

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

  const passageIdFromQuery = Number(
    new URLSearchParams(location.search).get("passageId"),
  );
  const passageId =
    state.passageId ||
    (Number.isFinite(passageIdFromQuery) ? passageIdFromQuery : 0);
  const passageReference = state.passageReference ?? "Unknown Passage";
  const projectName = state.projectName ?? "";
  const sectionPassages = state.sectionPassages ?? [];

  // Audio state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<AudioPlayerHandle>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Passage dropdown state
  const [passageMenuAnchor, setPassageMenuAnchor] =
    useState<null | HTMLElement>(null);

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

  // Load existing audio for this passage on mount
  useEffect(() => {
    if (!token || !passageId) return;
    fetchAudio(token, passageId).then((blob) => {
      if (blob) setAudioBlob(blob);
    });
  }, [token, passageId]);

  // Load saved speaker for this passage on mount
  useEffect(() => {
    if (!token || !passageId) return;
    // Use nav-state speaker as fast initial value
    if (state.speaker) {
      setSelectedSpeaker(state.speaker);
    }
    // Always confirm from the server
    getPassageSpeaker(token, passageId).then((name) => {
      if (name) setSelectedSpeaker(name);
    });
  }, [token, passageId]);

  const busy = compressing || uploading;

  async function handleFileSelected(file: File) {
    if (!token) {
      setSnackMsg("You are not logged in. Please sign in again.");
      return;
    }
    if (!passageId) {
      setSnackMsg(
        "Missing passage ID. Return to Dashboard and open Record from a passage card.",
      );
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
      await uploadAudio(token, passageId, mp3Blob, selectedSpeaker!);

      // Set audio source for playback
      setAudioBlob(mp3Blob);
      setSnackMsg("Audio saved!");
    } catch (err) {
      setSnackMsg(
        err instanceof Error ? err.message : "Failed to process audio",
      );
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
      setSnackMsg(
        "Missing passage ID. Return to Dashboard and open Record from a passage card.",
      );
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
      setSnackMsg(
        "Missing passage ID. Return to Dashboard and open Record from a passage card.",
      );
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
        setSnackMsg(
          "Could not access microphone. Please allow microphone access and try again.",
        );
      }
    } else {
      playerRef.current?.stopRecording();
      setRecording(false);
    }
  }

  async function handleRecordingComplete(blob: Blob) {
    // Set blob for immediate playback (AudioPlayer already rendered it)
    setAudioBlob(blob);
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
      await uploadAudio(token!, passageId, mp3Blob, selectedSpeaker!);
      setAudioBlob(mp3Blob);
      setSnackMsg("Audio saved!");
    } catch (err) {
      setSnackMsg(
        err instanceof Error ? err.message : "Failed to process audio",
      );
    } finally {
      setCompressing(false);
      setUploading(false);
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
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
            <Box
              sx={{ height: 30, flex: 1, display: { xs: "none", md: "block" } }}
            />
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
            startIcon={
              busy ? <CircularProgress size={18} /> : <FolderOpenIcon />
            }
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
            audioSource={audioBlob ?? undefined}
            height={80}
            enableDragSelection
            onRecordingComplete={handleRecordingComplete}
            onReplaceAI={() =>
              navigate("/replace-ai", {
                state: {
                  passageId,
                  passageReference,
                  projectName,
                  speaker: selectedSpeaker,
                  sectionPassages,
                },
              })
            }
          />
        </Box>

        {/* Spacer pushes record button toward bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Record button (disabled, centered) */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 4,
          }}
        >
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
              cursor:
                selectedSpeaker && !busy && !warmingUp ? "pointer" : "default",
              opacity: selectedSpeaker && !busy ? 1 : 0.6,
              transition: "all 0.2s ease",
              "&:hover":
                selectedSpeaker && !busy && !warmingUp ? { opacity: 0.85 } : {},
            }}
          >
            {warmingUp && <CircularProgress size={32} sx={{ color: "#fff" }} />}
            {recording && !warmingUp && (
              <StopIcon sx={{ color: "#fff", fontSize: 36 }} />
            )}
          </Box>
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
          startIcon={<Checkbox size="small" sx={{ p: 0 }} disabled />}
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

      {/* Snackbar for status messages */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg(null)}
        message={snackMsg}
      />

      <SpeakerDialog
        open={speakerDialogOpen}
        token={token}
        options={speakers.map((s) => s.name)}
        initialValue={selectedSpeaker ?? ""}
        onClose={() => setSpeakerDialogOpen(false)}
        onSpeakerSelected={(speakerName) => {
          setSelectedSpeaker(speakerName);
          setSpeakers((prev) => {
            if (prev.some((speaker) => speaker.name === speakerName))
              return prev;
            return [...prev, { name: speakerName }].sort((a, b) =>
              a.name.localeCompare(b.name),
            );
          });
        }}
        onError={setSnackMsg}
      />
    </Box>
  );
}
