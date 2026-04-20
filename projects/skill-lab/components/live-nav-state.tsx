"use client";

import { useEffect, useState } from "react";
import { loadTimeToday, formatMinutes } from "@/lib/progress-client";

/**
 * Tiny live chip in the nav showing "time invested today". Updates every
 * 30s so it feels alive, not static.
 */
export function TimeInvestedChip() {
  const [sec, setSec] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setSec(loadTimeToday().sec);
    tick();
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("storage", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", tick);
    };
  }, []);

  if (sec === null || sec < 60) return null;
  return (
    <span className="chip chip-mint" title="Time invested today">
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-mint)]" />
      {formatMinutes(sec)} today
    </span>
  );
}

/**
 * Displays the server-known streak. Visually alive via a pulse animation on
 * the dot when the streak is 3+.
 */
export function StreakChip({ streak }: { streak: number }) {
  if (!streak) return null;
  const hot = streak >= 3;
  return (
    <span
      className={hot ? "chip chip-accent" : "chip"}
      title={`${streak}-day streak`}
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (hot ? "bg-[color:var(--color-accent)] animate-pulse" : "bg-white/40")
        }
      />
      {streak}-day streak
    </span>
  );
}
