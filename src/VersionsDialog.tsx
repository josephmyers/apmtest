import { useEffect, useState } from "react";
import {
  Avatar,
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Radio,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { activateVersion, fetchVersionAudio, type PassageVersion } from "./api";
import { audioManager } from "./audioManager";
import RadialAudioPlayer from "./RadialAudioPlayer";

export interface UseVersionResult {
  version: PassageVersion;
  blob: Blob;
  renderSource: { blob: Blob; version: PassageVersion } | null;
}

interface VersionsDialogProps {
  open: boolean;
  token: string;
  versions: PassageVersion[];
  activeAudioKey: string;
  passageReference: string;
  speakerName: string;
  onClose: () => void;
  onMessage: (message: string) => void;
  onUseVersion: (data: UseVersionResult) => void;
  onDeleteVersion: (version: PassageVersion) => Promise<void>;
  hasUnversionedRendering: boolean;
  onGoToReplaceAI: () => void;
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
  hasUnversionedRendering,
  onGoToReplaceAI,
}: VersionsDialogProps) {
  const [selectedAudioKey, setSelectedAudioKey] = useState<string>(activeAudioKey);
  const [deletingVersionId, setDeletingVersionId] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    if (!open) return;
    setSelectedAudioKey(activeAudioKey);
  }, [activeAudioKey, open]);

  useEffect(() => {
    if (open) return;
    audioManager.stop();
  }, [open]);

  function handleDialogClose() {
    audioManager.stop();
    onClose();
  }

  async function handleUseVersion() {
    const selectedVersion = versions.find((v) => v.audioKey === selectedAudioKey);
    if (!selectedVersion || isBusy) return;

    setIsBusy(true);
    try {
      audioManager.stop();
      if (selectedAudioKey === activeAudioKey) {
        handleDialogClose();
        return;
      }

      await activateVersion(token, selectedVersion.id);

      const blob = await fetchVersionAudio(token, selectedVersion.id);
      if (!blob) {
        onMessage("Could not load audio for this version.");
        return;
      }

      let renderSource: { blob: Blob; version: PassageVersion } | null = null;
      const sourceVersion = versions.find(
        (v) => v.audioKey === selectedVersion.renderSource,
      );
      if (sourceVersion) {
        const sourceBlob = await fetchVersionAudio(token, sourceVersion.id);
        if (sourceBlob) {
          renderSource = { blob: sourceBlob, version: sourceVersion };
        }
      }

      onUseVersion({ version: selectedVersion, blob, renderSource });
    } catch {
      onMessage("Could not activate this version.");
    } finally {
      setIsBusy(false);
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
    if (deletingVersionId !== null || isBusy) return;
    setDeletingVersionId(version.id);
    try {
      audioManager.stop();
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
    <Dialog open={open} onClose={handleDialogClose} fullWidth>
      <Backdrop open={isBusy} sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}>
        <CircularProgress color="inherit" />
      </Backdrop>
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
                    <Box onClick={(event) => event.stopPropagation()}>
                      <RadialAudioPlayer
                        audio={() => fetchVersionAudio(token, version.id)}
                        size={24}
                        disabled={isBusy}
                        ariaLabel={`play ${version.audioKey}`}
                        errorTooltip="Could not load audio for this version."
                      />
                    </Box>

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
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
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
                      disabled={isBusy}
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
                          disabled={deletingVersionId === version.id || isBusy}
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
                  disabled={isBusy}
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
      {hasUnversionedRendering && selectedAudioKey !== activeAudioKey && (
        <Box sx={{ px: 3, pb: 1, pt: 2 }}>
          <Typography
            variant="body2"
            sx={{ color: "error.main", fontWeight: 600 }}
          >
            You have an unsaved AI rendering that will be lost if you
            switch to a different version.{" "}
            <Link
              component="button"
              type="button"
              onClick={onGoToReplaceAI}
              sx={{
                color: "error.main",
                fontWeight: 600,
                verticalAlign: "baseline",
              }}
            >
              Click here
            </Link>{" "}
            to go to it.
          </Typography>
        </Box>
      )}
      <DialogActions>
        <Button onClick={handleDialogClose} disabled={isBusy}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!selectedAudioKey || isBusy}
          onClick={handleUseVersion}
        >
          Use This Version
        </Button>
      </DialogActions>
    </Dialog>
  );
}
