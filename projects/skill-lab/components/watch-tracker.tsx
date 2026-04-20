"use client";

import { useEffect } from "react";
import { addTimeToday, markWatched } from "@/lib/progress-client";

/**
 * Mounted on the video page. Three jobs, all client-side:
 *   1. Fires a one-time POST /api/activity so the server bumps the streak
 *      cookie + writes last-watched. Server components can't mutate cookies.
 *   2. Increments localStorage "time invested today" every 15s while visible.
 *   3. Marks the video as "watched" after 30s of engaged time.
 *
 * No network chatter beyond the single initial beacon.
 */
export function WatchTracker({
  videoId,
  cohort,
}: {
  videoId: string;
  cohort: string | null;
}) {
  useEffect(() => {
    // Fire-and-forget. Errors are silent — losing a streak bump isn't critical.
    if (cohort) {
      fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, cohort }),
        keepalive: true,
      }).catch(() => null);
    }

    let elapsed = 0;
    let markedWatched = false;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      addTimeToday(15);
      elapsed += 15;
      if (!markedWatched && elapsed >= 30) {
        markWatched(videoId, elapsed);
        markedWatched = true;
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [videoId, cohort]);

  return null;
}
