import { useEffect, useRef, useState } from "react";
import { Backdrop, Portal, Typography } from "@mui/material";

interface CountdownBackdropProps {
  /** Shows the backdrop; each false→true transition restarts the count at `seconds`. */
  open: boolean;
  /** Starting count value. */
  seconds: number;
  /** Fires once per open when the count reaches 0. */
  onComplete: () => void;
}

/** Fullscreen countdown overlay shown while the mic warms up before recording. */
function CountdownBackdrop({ open, seconds, onComplete }: CountdownBackdropProps) {
  const [count, setCount] = useState(seconds);

  // Held in a ref so parent re-renders don't restart the interval.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!open) {
      setCount(seconds); // reset while hidden so a reopen never flashes a stale digit
      return;
    }
    let current = seconds;
    const id = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        clearInterval(id);
        onCompleteRef.current();
      } else {
        setCount(current);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [open, seconds]);

  return (
    <Portal>
      <Backdrop
        open={open}
        transitionDuration={{ enter: 120, exit: 0 }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
        role="timer"
      >
        <Typography
          sx={{
            fontSize: "8rem",
            fontWeight: 600,
            lineHeight: 1,
            color: "common.white",
            userSelect: "none",
          }}
        >
          {count}
        </Typography>
      </Backdrop>
    </Portal>
  );
}

/**
 * Countdown gate shown while the mic preps for recording. Callers acquire
 * the mic first and only `start()` the prep once recording is possible, so the
 * countdown always runs to completion under normal use.
 */
export function useCountdownGate(seconds = 3) {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<(() => void) | null>(null);

  const start = () => {
    setOpen(true);
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
    });
  };
  const cancel = () => {
    setOpen(false);
    resolveRef.current = null;
  };
  const handleComplete = () => {
    setOpen(false); // hide the backdrop the moment the count reaches 0
    resolveRef.current?.();
    resolveRef.current = null;
  };

  const backdrop = (
    <CountdownBackdrop open={open} seconds={seconds} onComplete={handleComplete} />
  );
  return { backdrop, start, cancel };
}
