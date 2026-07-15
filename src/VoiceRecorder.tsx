import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Box, useTheme } from "@mui/material";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record";
import { useCountdownGate } from "./CountdownBackdrop";

export type RecorderPhase = "warming" | "recording";

export interface VoiceRecorderHandle {
  stop: () => void;
}

interface VoiceRecorderProps {
  /** Fires once when recording ends (blob) or is canceled / fails (null). */
  onComplete: (blob: Blob | null) => void;
  /** Reports the warmup → recording transition so the caller can swap its control. */
  onPhaseChange?: (phase: RecorderPhase) => void;
  /** Waveform height in px (default 48). */
  height?: number;
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  ({ onComplete, onPhaseChange, height = 48 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const recordRef = useRef<RecordPlugin | null>(null);
    const theme = useTheme();
    const countdown = useCountdownGate();

    const onCompleteRef = useRef(onComplete);
    const onPhaseChangeRef = useRef(onPhaseChange);
    useEffect(() => {
      onCompleteRef.current = onComplete;
    }, [onComplete]);
    useEffect(() => {
      onPhaseChangeRef.current = onPhaseChange;
    }, [onPhaseChange]);

    useImperativeHandle(ref, () => ({
      stop: () => {
        const rec = recordRef.current;
        if (rec && rec.isRecording()) rec.stopRecording();
        else onCompleteRef.current(null); // stopped before recording began
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;
      let cancelled = false;

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: theme.palette.error.main,
        progressColor: theme.palette.error.main,
        cursorWidth: 0,
        barWidth: 2,
        height,
      });
      const record = ws.registerPlugin(
        RecordPlugin.create({ scrollingWaveform: true, renderRecordedAudio: false }),
      );
      recordRef.current = record;
      record.on("record-end", (blob: Blob) => onCompleteRef.current(blob));

      (async () => {
        try {
          onPhaseChangeRef.current?.("warming");
          await record.startMic();
          if (cancelled) return;
          await countdown.start();
          if (cancelled) return;
          await record.startRecording();
          onPhaseChangeRef.current?.("recording");
        } catch {
          if (!cancelled) {
            countdown.cancel();
            onCompleteRef.current(null);
          }
        }
      })();

      return () => {
        cancelled = true;
        recordRef.current = null;
        ws.destroy();
      };
    }, []);

    return (
      <>
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            minWidth: 0,
            height,
            bgcolor: "action.hover",
            borderRadius: 1,
            overflow: "hidden",
          }}
        />
        {countdown.backdrop}
      </>
    );
  },
);
