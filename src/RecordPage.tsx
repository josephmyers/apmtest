import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { useSnackbar } from "./useSnackbar";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";

import StopIcon from "@mui/icons-material/Stop";
import PauseIcon from "@mui/icons-material/Pause";
import ForumIcon from "@mui/icons-material/Forum";
import AddIcon from "@mui/icons-material/Add";

import { useAuth } from "./AuthContext";
import {
  fetchAudio,
  createPassageVersion,
  deletePassageVersion,
  getReplacements,
  listPassageVersions,
  deleteUnversionedReplacements,
  getSpeakers,
  setPassageSpeaker,
  type Speaker,
  type PassageVersion,
} from "./api";
import { compressToMp3 } from "./audioUtils";
import SpeakerDialog from "./SpeakerDialog";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import PageHeader from "./PageHeader";
import StepFooter from "./StepFooter";
import { PassageProvider, usePassage } from "./PassageContext";
import { stepForRoute, type StepNavState } from "./steps";
import VersionsDialog, { type UseVersionResult } from "./VersionsDialog";
import DiscussionsFlyout from "./DiscussionsFlyout";

/**
 * Outer wrapper: keys PassageProvider on passageId so its state
 * fully resets when the user switches passages.
 */
export default function RecordPage() {
  const state = (useLocation().state ?? {}) as StepNavState;
  const passageId = state.passageId;
  return (
    <PassageProvider key={passageId}>
      <RecordPageInner />
    </PassageProvider>
  );
}

function RecordPageInner() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { passage } = usePassage();

  const location = useLocation();
  const nav = location.state as StepNavState;
  const passageId = nav?.passageId ?? 0;
  const passageReference = nav?.passageReference ?? "Unknown Passage";
  const projectName = nav?.projectName ?? "";
  const projectId = nav?.projectId;

  // Audio state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<AudioPlayerHandle>(null);
  const [passageAudio, setPassageAudio] = useState<{
    blob: Blob;
    version: PassageVersion;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [discussionsOpen, setDiscussionsOpen] = useState<boolean | { start: number; end: number }>(false);
  const [discussionsUnread, setDiscussionsUnread] = useState(false);

  const [audioInitialized, setAudioInitialized] = useState(false);
  const [hasUnversionedReplacements, setHasUnversionedReplacements] = useState(false);
  const [hasUnversionedRendering, setHasUnversionedRendering] = useState(false);
  const [versions, setVersions] = useState<PassageVersion[]>([]);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);

  const [speakerDialogOpen, setSpeakerDialogOpen] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  useEffect(() => {
    if (passage?.speaker) setSelectedSpeaker(passage.speaker);
  }, [passage?.speaker]);

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
    if (!token || !passage) {
      return;
    }

    Promise.all([
      fetchAudio(token, passageId),
      listPassageVersions(token, passageId),
    ]).then(([blob, { versions }]) => {
      const sortedVersions = [...versions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setVersions(sortedVersions);
      setHasUnversionedRendering(passage.unversionedRendering != null);
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
    });
    getReplacements(token, passageId, null).then((reps) => {
      setHasUnversionedReplacements(reps.length > 0);
    });
  }, [token, passage]);

  const busy = compressing || uploading;

  function goToReplaceAI(extra?: {
    initialSelection?: { start: number; end: number } | null;
  }) {
    navigate("/replace-ai", {
      state: {
        passageId,
        passageReference,
        projectName,
        speaker: passage?.speaker,
        passageVersion: passageAudio!.version,
        ...extra,
      },
    });
  }

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
    if (!token) return;
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
      deleteUnversionedReplacements(token, passageId);
      setHasUnversionedReplacements(false);
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
    deleteUnversionedReplacements(token, passageId);
    setHasUnversionedReplacements(false);
    setHasUnversionedRendering(false);
    setVersionsDialogOpen(false);
    setSnackMsg("Version loaded!");
  }

  async function handleDeleteVersion(version: PassageVersion) {
    if (!token) return;
    await deletePassageVersion(token, version.id);
    setVersions((prev) => prev.filter((v) => v.id !== version.id));
    if (passageAudio?.version.id === version.id) {
      setPassageAudio(null);
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
      <Backdrop
        open={!audioInitialized}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* ─── Header ───────────────────────────────────────────────── */}
      <PageHeader
        leftIcon="back"
        onLeftClick={() => navigate(projectId ? `/projects/${projectId}` : "/projects")}
        title={projectName}
        racetrack
      />

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
          aria-label="audio file input"
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
            aria-label="select speaker"
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
            aria-label="load from file"
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
                aria-label="replace ai option"
                onClick={() => goToReplaceAI()}
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
                <Box sx={{flex: 1, display: 'flex', flexDirection: 'row'}}>
                  <Box sx={{flex: 1}} />
                  <Typography variant="body2" sx={{ color: "success.main", fontWeight: 500 }}>
                    AI-Rendered
                  </Typography>
                </Box>
              ) : undefined
            }
          />
        </Box>

        {versions.length > 1 && (
          <Box sx={{ px: 2, pt: 1 }}>
            <Button
              aria-label="versions"
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
              aria-label="replace ai"
              startIcon={<GraphicEqIcon />}
              variant={hasUnversionedRendering ? "primary" : undefined}
              onClick={() => goToReplaceAI({ initialSelection: selection })}
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
              role="button"
              aria-label="record"
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
              aria-label="rerecord"
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

        <Stack spacing={1} sx={{ position: "absolute", bottom: 16, right: 16 }}>
          {selection && (
            <IconButton
              aria-label="add discussion at selection"
              variant="floating"
              onClick={() => setDiscussionsOpen(selection)}
            >
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                badgeContent={<AddIcon sx={{ fontSize: 20, ml: 1, mb: 1 }} />}
              >
                <ForumIcon />
              </Badge>
            </IconButton>
          )}
          <IconButton
            aria-label="discussions"
            variant="floating"
            onClick={() => setDiscussionsOpen(true)}
          >
            <Badge variant="dot" invisible={!discussionsUnread}>
              <ForumIcon />
            </Badge>
          </IconButton>
        </Stack>
      </Box>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <StepFooter
        canComplete={Boolean(selectedSpeaker && passageAudio)}
        isCompletePrimary={!hasUnversionedRendering}
        onError={setSnackMsg}
      />

      <DiscussionsFlyout
        open={discussionsOpen}
        onClose={() => setDiscussionsOpen(false)}
        passageId={passageId}
        step={stepForRoute(location.pathname)?.id!}
        projectId={projectId}
        passageAudio={passageAudio?.blob}
        onUnreadChange={setDiscussionsUnread}
      />

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
          if (token && passageId) {
            setPassageSpeaker(token, passageId, speakerName);
          }
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
          hasUnversionedRendering={hasUnversionedRendering}
          onGoToReplaceAI={() => {
            setVersionsDialogOpen(false);
            goToReplaceAI();
          }}
        />
      )}
    </Box>
  );
}
