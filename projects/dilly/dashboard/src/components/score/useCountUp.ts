"use client";

import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 0 → target over durationMs, ease-out, requestAnimationFrame */
export function useCountUp(target: number, durationMs = 1000, enabled = true): number {
  const [v, setV] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
      setV(Math.round(target));
      return;
    }
    fromRef.current = 0;
    startRef.current = null;
    let frame: number;

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const e = easeOutCubic(t);
      setV(Math.round(fromRef.current + (target - fromRef.current) * e));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, enabled]);

  return v;
}
