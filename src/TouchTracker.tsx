import { useEffect, useState } from "react";

export default function TouchTracker() {
  const [touches, setTouches] = useState<TouchList | null>(null);

  useEffect(() => {
    const update = (e: TouchEvent) => setTouches(e.touches);
    const opts = { passive: true } as const;
    for (const evt of ["touchstart", "touchmove", "touchend", "touchcancel"] as const) {
      window.addEventListener(evt, update, opts);
    }
    return () => {
      for (const evt of ["touchstart", "touchmove", "touchend", "touchcancel"] as const) {
        window.removeEventListener(evt, update);
      }
    };
  }, []);

  // Only support two touches at once
  const dots = touches ? Array.from(touches).slice(0, 2) : [];

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 99999 }}>
      {dots.map((t, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: t.clientX,
            top: t.clientY,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.35)",
            border: "2px solid rgba(255, 255, 255, 0.85)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
