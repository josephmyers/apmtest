import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Slider, Stack, Typography } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { formatTime } from "./formatTime";

interface MiniAudioPlayerProps {
  /** The clip to play */
  audio: Blob;
  /** Rendered top-left, above the slider (e.g. title + edit button) */
  label?: React.ReactNode;
  /** Controlled play state */
  playing: boolean;
  /** When the play state changes */
  onPlayingChange: (playing: boolean) => void;
}

/**
 * Lightweight single-clip player: a play/pause button, a draggable position
 * slider that both shows and controls the playhead, and a current/duration
 * readout. Unlike AudioPlayer this uses a plain HTMLAudioElement — no waveform.
 */
export default function MiniAudioPlayer({
  audio,
  label,
  playing,
  onPlayingChange,
}: MiniAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Latest callback for the once-per-clip `ended` listener.
  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  // (Re)create the element whenever the clip changes. Cleanup pauses and frees
  // the object URL — this also stops playback when the row unmounts (group
  // collapses).
  useEffect(() => {
    const url = URL.createObjectURL(audio);
    const el = new Audio(url);
    audioRef.current = el;
    setCurrentTime(0);
    setDuration(0);

    const onLoaded = () => setDuration(el.duration || 0);
    const onTime = () => setCurrentTime(el.currentTime);
    const onEnded = () => onPlayingChangeRef.current(false);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);

    return () => {
      el.pause();
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [audio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.play();
    else audio.pause();
  }, [playing]);

  const handleSeek = (_: Event, value: number | number[]) => {
    const audio = audioRef.current;
    const t = Array.isArray(value) ? value[0] : value;
    if (audio) audio.currentTime = t;
    setCurrentTime(t);
  };

  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <IconButton onClick={() => onPlayingChange(!playing)} sx={{ p: 0 }}>
        {playing ? (
          <PauseIcon fontSize="large" />
        ) : (
          <PlayArrowIcon fontSize="large" />
        )}
      </IconButton>
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{label}</Box>
          <Typography variant="body2" sx={{ flexShrink: 0 }}>
            {`${formatTime(currentTime)}/${formatTime(duration)}`}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center">
          <Slider
            size="small"
            value={currentTime}
            min={0}
            max={duration}
            step={0.01}
            disabled={duration <= 0}
            onChange={handleSeek}
            sx={{ py: 0.5, ml: 0.5, flex: 1 }}
          />
          <Box sx={{ width: 2, flexShrink: 0 }} />
        </Stack>
      </Box>
    </Stack>
  );
}
