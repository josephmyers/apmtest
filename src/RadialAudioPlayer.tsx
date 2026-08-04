import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import CloseIcon from "@mui/icons-material/Close";
import { audioManager, type AudioHandle } from "./audioManager";

interface RadialAudioPlayerProps {
  /**
   * A resolved blob, or a loader invoked on the first play — the loader runs at most once per
   * mount, so pass a `key` if the underlying audio identity can change.
   */
  audio: Blob | null | (() => Promise<Blob | null>);
  onPlayingChange?: (playing: boolean) => void;
  disabled?: boolean;
  size?: number;
  /** When set, render as a removable chip (subtle background + an X button). */
  onRemove?: () => void;
  errorTooltip?: string;
  variant?: "primary";
  ariaLabel?: string;
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
  variant,
  ariaLabel,
}: RadialAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handleRef = useRef<AudioHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  // 0–100 playback progress.
  const [progress, setProgress] = useState(0);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  // What a loader resolved to, once it has run.
  const [loadedAudio, setLoadedAudio] = useState<Blob | null>(null);

  const lazy = typeof audio === "function";
  const blob = lazy ? loadedAudio : audio;

  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setLoadState("idle");
    if (!blob) {
      audioRef.current = null;
      handleRef.current = null;
      return;
    }
    const url = URL.createObjectURL(blob);
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
    const onError = () => setLoadState("error");
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    // A loader only ever runs from a click on play, so start as soon as its blob is ready.
    if (lazy) audioManager.play(handle);

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
  }, [blob, lazy]);

  const toggle = async () => {
    const el = audioRef.current;
    const handle = handleRef.current;
    if (!el || !handle) {
      if (typeof audio !== "function" || loadState !== "idle") return;
      setLoadState("loading");
      try {
        const loaded = await audio();
        if (loaded) setLoadedAudio(loaded);
        else setLoadState("error");
      } catch {
        setLoadState("error");
      }
      return;
    }
    if (el.paused) audioManager.play(handle);
    else audioManager.stop();
  };

  let button;
  if ((!lazy && audio === null) || loadState === "error") {
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
          aria-label={ariaLabel}
          disabled={disabled || loadState === "loading"}
          variant={variant}
          sx={{ width: size, height: size, border: playing ? 0 : 2 }}
        >
          {loadState === "loading" ? (
            <CircularProgress size={size / 2} thickness={5} />
          ) : playing ? (
            <PauseIcon />
          ) : (
            <PlayArrowIcon />
          )}
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
