"use client";

import { useEffect } from "react";
import { addTimeToday, markWatched } from "@/lib/progress-client";

/**
 * Mounted on the video page. Increments the "time invested today" counter
 * in localStorage every 15 seconds while the tab is visible. Also marks the
 * video as watched after 30 seconds (a reasonable "engaged" threshold).
 *
 * No network chatter, no analytics — pure client-side progress accumulation.
 */
export function WatchTracker({ videoId }: { videoId: string }) {
  useEffect(() => {
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
  }, [videoId]);

  return null;
}
