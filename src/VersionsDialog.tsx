import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Radio,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import PlayCircleOutline from "@mui/icons-material/PlayCircleOutline";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { fetchVersionAudio, type PassageVersion } from "./api";

interface VersionsDialogProps {
  open: boolean;
  token: string;
  versions: PassageVersion[];
  activeAudioKey: string;
  passageReference: string;
  speakerName: string;
  onClose: () => void;
  onMessage: (message: string) => void;
  onUseVersion: (version: PassageVersion) => void;
  onDeleteVersion: (version: PassageVersion) => Promise<void>;
}

export default function VersionsDialog({
  open,
  token,
  versions,
  activeAudioKey,
  passageReference,
  speakerName,
  onClose,
  onMessage,
  onUseVersion,
  onDeleteVersion,
}: VersionsDialogProps) {
  const [selectedAudioKey, setSelectedAudioKey] = useState<string>(activeAudioKey);
  const [previewPlayingVersionId, setPreviewPlayingVersionId] = useState<number | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    if (!open) return;
    setSelectedAudioKey(activeAudioKey);
  }, [activeAudioKey, open]);

  useEffect(() => {
    if (open) return;
    stop();
  }, [open]);

  async function togglePlayVersion(version: PassageVersion) {
    if (!token) return;

    if (previewPlayingVersionId === version.id) {
      stop();
      return;
    }

    try {
      stop();
      const blob = await fetchVersionAudio(token, version.id);
      if (!blob) {
        onMessage("Could not load audio for this version.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        previewAudioRef.current = null;
        setPreviewPlayingVersionId(null);
      };
      setPreviewPlayingVersionId(version.id);
      await audio.play();
    } catch {
      onMessage("Could not play this version.");
      stop();
    }
  }

  function formatVersionDateTime(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  }

  function getSpeakerInitials(name: string | null) {
    if (!name?.trim()) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  function stop() {
    if (previewAudioRef.current) {
      URL.revokeObjectURL(previewAudioRef.current.src);
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewPlayingVersionId(null);
  }

  async function download(version: PassageVersion) {
    if (!token) return;
    const blob = await fetchVersionAudio(token, version.id);
    if (!blob) {
      onMessage("Could not load audio for download.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = version.audioKey;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeVersion(version: PassageVersion) {
    if (deletingVersionId !== null) return;
    setDeletingVersionId(version.id);
    try {
      stop();
      await onDeleteVersion(version);
      if (selectedAudioKey === version.audioKey) {
        const fallback = versions.find((v) => v.id !== version.id);
        setSelectedAudioKey(fallback?.audioKey ?? "");
      }
    } catch {
      onMessage("Could not delete this version.");
    } finally {
      setDeletingVersionId(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>Versions</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {versions.map((version) => {
            const selected = selectedAudioKey === version.audioKey;
            return (
              <Box
                key={version.id}
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                }}
              >
                <Box
                  onClick={() => setSelectedAudioKey(version.audioKey)}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    border: 1,
                    borderColor: selected ? "primary.main" : "divider",
                    borderRadius: 1,
                    p: 1.25,
                    cursor: "pointer",
                    bgcolor: selected ? "action.selected" : "background.paper",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      mb: 0.75,
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePlayVersion(version);
                      }}
                    >
                      {previewPlayingVersionId === version.id ? (
                        <StopCircleOutlinedIcon />
                      ) : (
                        <PlayCircleOutline />
                      )}
                    </IconButton>

                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                        {version.audioKey}
                      </Typography>
                      <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
                        {passageReference}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
                        {formatVersionDateTime(version.createdAt)}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          color: "text.secondary",
                          height: "20px"
                        }}
                      >
                        {version.note}
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mt: 0.5,
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        download(version);
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {version.renderSource && (
                        <Typography
                          variant="caption"
                          sx={{ color: "success.main", fontWeight: 600 }}
                        >
                          AI-Rendered
                        </Typography>
                      )}
                      {!isMobile && (
                        <IconButton
                          size="small"
                          disabled={deletingVersionId === version.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeVersion(version);
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      )}
                      <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>
                        {getSpeakerInitials(speakerName)}
                      </Avatar>
                    </Box>
                  </Box>
                </Box>

                <Radio
                  checked={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAudioKey(version.audioKey);
                  }}
                />
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!selectedAudioKey}
          onClick={() => onUseVersion(versions.find((v) => v.audioKey === selectedAudioKey)!)}
        >
          Use This Version
        </Button>
      </DialogActions>
    </Dialog>
  );
}
