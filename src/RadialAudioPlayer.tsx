import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { audioManager, type AudioHandle } from "./audioManager";

interface RadialAudioPlayerProps {
  audio: Blob;
  onPlayingChange?: (playing: boolean) => void;
  disabled?: boolean;
  size?: number;
}

/**
 * A round play/pause button ringed by a determinate progress indicator
 */
export default function RadialAudioPlayer({
  audio,
  onPlayingChange,
  disabled = false,
  size = 38,
}: RadialAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handleRef = useRef<AudioHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  // 0–100 playback progress.
  const [progress, setProgress] = useState(0);

  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  useEffect(() => {
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
    setPlaying(false);
    setProgress(0);

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
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.pause();
      audioManager.release(handle);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
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

  return (
    <Box sx={{ position: "relative", display: "inline-flex" }}>
      {playing && (
        <>
          {/* Show progress while playing. */}
          <CircularProgress
            variant="determinate"
            value={100}
            thickness={2}
            size={size}
            sx={{
              color: (theme) => theme.palette.grey[300],
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
          <CircularProgress
            variant="determinate"
            value={progress}
            thickness={2}
            size={size}
            sx={{
              color: (theme) => theme.palette.grey[800],
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
        </>
      )}
      <IconButton
        onClick={toggle}
        size="small"
        disabled={disabled}
        sx={{
          width: size,
          height: size,
          border: playing ? 0 : 2,
        }}
      >
        {playing ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>
    </Box>
  );
}
