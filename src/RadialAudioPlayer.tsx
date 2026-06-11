import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";

interface RadialAudioPlayerProps {
  audio: Blob;
  onPlayingChange: (playingAudio: HTMLAudioElement | null) => void;
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
    setPlaying(false);
    setProgress(0);

    const onTime = () => {
      setProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      onPlayingChangeRef.current(null);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.pause();
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
    if (!el) return;
    if (el.paused) {
      el.play();
      onPlayingChange(el);
    } else {
      el.pause();
      onPlayingChange(null);
    }
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
              color: (theme) => theme.palette.grey[700],
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
