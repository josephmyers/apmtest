import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import CloseIcon from "@mui/icons-material/Close";
import { audioManager, type AudioHandle } from "./audioManager";

interface RadialAudioPlayerProps {
  audio: Blob | null;
  onPlayingChange?: (playing: boolean) => void;
  disabled?: boolean;
  size?: number;
  /** When set, render as a removable chip (subtle background + an X button). */
  onRemove?: () => void;
  errorTooltip?: string;
}

/**
 * A round play/pause button ringed by a determinate progress indicator
 */
export default function RadialAudioPlayer({
  audio,
  onPlayingChange,
  disabled = false,
  size = 38,
  onRemove,
  errorTooltip = "Audio unavailable.",
}: RadialAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handleRef = useRef<AudioHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  // 0–100 playback progress.
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setLoadError(false);
    if (!audio) {
      audioRef.current = null;
      handleRef.current = null;
      return;
    }
    const url = URL.createObjectURL(audio);
    const el = new Audio(url);
    audioRef.current = el;
    const handle: AudioHandle = {
      play: () => el.play(),
      stop: () => {
        el.pause();
        el.currentTime = 0;
      },
    };
    handleRef.current = handle;

    const onTime = () => {
      setProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
    };
    const onPlay = () => {
      setPlaying(true);
      onPlayingChangeRef.current?.(true);
    };
    const onPause = () => {
      setPlaying(false);
      audioManager.release(handle);
      onPlayingChangeRef.current?.(false);
    };
    const onEnded = () => {
      setPlaying(false);
      audioManager.release(handle);
      onPlayingChangeRef.current?.(false);
    };
    const onError = () => setLoadError(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    return () => {
      el.pause();
      audioManager.release(handle);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [audio]);

  const toggle = () => {
    const el = audioRef.current;
    const handle = handleRef.current;
    if (!el || !handle) return;
    if (el.paused) audioManager.play(handle);
    else audioManager.stop();
  };

  let button;
  if (audio === null || loadError) {
    button = (
      <Tooltip title={errorTooltip}>
        <span>
          <IconButton
            disabled
            sx={{
              width: size,
              height: size,
              border: 2,
              "&.Mui-disabled": { color: "error.main", borderColor: "error.main" },
            }}
          >
            <LinkOffIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    );
  } else {
    button = (
      <Box sx={{ position: "relative", display: "inline-flex" }}>
        {playing && (
          <>
            {/* Show progress while playing. */}
            <CircularProgress
              variant="determinate"
              value={100}
              thickness={2}
              size={size}
              sx={{ color: (theme) => theme.palette.grey[300], position: "absolute", top: 0, left: 0 }}
            />
            <CircularProgress
              variant="determinate"
              value={progress}
              thickness={2}
              size={size}
              sx={{ color: (theme) => theme.palette.grey[800], position: "absolute", top: 0, left: 0 }}
            />
          </>
        )}
        <IconButton
          onClick={toggle}
          size="small"
          disabled={disabled}
          sx={{ width: size, height: size, border: playing ? 0 : 2 }}
        >
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Box>
    );
  }

  if (!onRemove) return button;

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        bgcolor: "neutral.lightGrey",
        borderRadius: 2,
        px: 0.25,
      }}
    >
      {button}
      <IconButton size="small" aria-label="remove" onClick={onRemove}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
