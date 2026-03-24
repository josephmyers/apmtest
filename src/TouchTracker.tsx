import { useEffect, useRef, useState } from "react";

const FADE_MS = 200;

interface TouchDot {
  id: number;
  x: number;
  y: number;
  visible: boolean; // drives opacity transition
}

/**
 * Renders visible touch indicators over the entire app, similar to
 * Android's "Show touches" developer option.
 */
export default function TouchTracker() {
  const [dots, setDots] = useState<Map<number, TouchDot>>(new Map());
  const nextId = useRef(0);
  const fadeTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    function handleTouchStart(e: TouchEvent) {
      const identifiers = Array.from(e.changedTouches).map((t) => t.identifier);

      // Add dots with visible=false so the transition has a starting state
      setDots((prev) => {
        const next = new Map(prev);
        for (const touch of Array.from(e.changedTouches)) {
          // Cancel any in-progress fade-out for a re-touched finger
          const timer = fadeTimers.current.get(touch.identifier);
          if (timer !== undefined) {
            clearTimeout(timer);
            fadeTimers.current.delete(touch.identifier);
          }
          next.set(touch.identifier, {
            id: nextId.current++,
            x: touch.clientX,
            y: touch.clientY,
            visible: false,
          });
        }
        return next;
      });

      // Flip to visible on the next frame so the browser sees the opacity:0 first
      requestAnimationFrame(() => {
        setDots((prev) => {
          const next = new Map(prev);
          for (const id of identifiers) {
            const dot = next.get(id);
            if (dot) next.set(id, { ...dot, visible: true });
          }
          return next;
        });
      });
    }

    function handleTouchMove(e: TouchEvent) {
      setDots((prev) => {
        const next = new Map(prev);
        for (const touch of Array.from(e.changedTouches)) {
          const existing = next.get(touch.identifier);
          if (existing) {
            next.set(touch.identifier, {
              ...existing,
              x: touch.clientX,
              y: touch.clientY,
            });
          }
        }
        return next;
      });
    }

    function handleTouchEnd(e: TouchEvent) {
      // Fade out first, then remove after transition
      setDots((prev) => {
        const next = new Map(prev);
        for (const touch of Array.from(e.changedTouches)) {
          const dot = next.get(touch.identifier);
          if (dot) next.set(touch.identifier, { ...dot, visible: false });
        }
        return next;
      });

      for (const touch of Array.from(e.changedTouches)) {
        const id = touch.identifier;
        const timer = setTimeout(() => {
          setDots((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          fadeTimers.current.delete(id);
        }, FADE_MS);
        fadeTimers.current.set(id, timer);
      }
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      fadeTimers.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 99999,
      }}
    >
      {Array.from(dots.values()).map((dot) => (
        <div
          key={dot.id}
          style={{
            position: "absolute",
            left: dot.x,
            top: dot.y,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.35)",
            border: "2px solid rgba(255, 255, 255, 0.85)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            opacity: dot.visible ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease`,
          }}
        />
      ))}
    </div>
  );
}
