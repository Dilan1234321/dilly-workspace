"use client";

import { useEffect, useRef } from "react";
import {
  addTimeToday,
  markWatched,
  getResumePosition,
  setResumePosition,
  clearResumePosition,
} from "@/lib/progress-client";

type YTPlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
};
type YTEvent = { data: number; target: YTPlayer };

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: YTEvent) => void;
          };
        },
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Cache the iframe API load across instances
let apiPromise: Promise<void> | null = null;
function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });
  return apiPromise;
}

/**
 * Wraps the YouTube IFrame Player API so the video resumes where the user
 * left off. Also the single source of truth for watch-time tracking and
 * streak + last-watched beacon firing.
 *
 * Why the whole thing: a plain <iframe src=".../embed/...?start=N"> also
 * works, but we can't read the current playhead from a plain iframe to
 * persist resume points mid-watch. The IFrame API gives us getCurrentTime().
 */
export function VideoPlayer({
  videoId,
  cohortSlug,
  title,
}: {
  videoId: string;
  cohortSlug: string | null;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;
    let saveInterval: number | null = null;
    let timeInterval: number | null = null;
    let elapsed = 0;
    let markedWatched = false;

    // Fire the streak + last-watched beacon once on mount.
    if (cohortSlug) {
      fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, cohort: cohortSlug }),
        keepalive: true,
      }).catch(() => null);
    }

    (async () => {
      await loadYouTubeAPI();
      if (cancelled || !containerRef.current || !window.YT?.Player) return;

      const resumeAt = getResumePosition(videoId);
      const player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          start: resumeAt > 5 ? Math.floor(resumeAt) : 0,
        },
        events: {
          onReady: (e) => {
            playerRef.current = e.target;
            if (resumeAt > 5) {
              e.target.seekTo(resumeAt, true);
            }
          },
          onStateChange: (e) => {
            const state = e.data;
            const ENDED = window.YT?.PlayerState.ENDED ?? 0;
            if (state === ENDED) {
              clearResumePosition(videoId);
            }
          },
        },
      });
      playerRef.current = player;

      // Persist playhead every 5 seconds — tiny localStorage writes.
      saveInterval = window.setInterval(() => {
        const p = playerRef.current;
        if (!p) return;
        try {
          const t = p.getCurrentTime();
          const d = p.getDuration();
          // If within the last 10 seconds, treat as finished.
          if (d && t > 0 && d - t < 10) {
            clearResumePosition(videoId);
          } else if (t > 5) {
            setResumePosition(videoId, t);
          }
        } catch {
          /* player not ready */
        }
      }, 5_000);

      // Watch-time counter: 15s ticks while the tab is visible.
      timeInterval = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        addTimeToday(15);
        elapsed += 15;
        if (!markedWatched && elapsed >= 30) {
          markWatched(videoId, elapsed);
          markedWatched = true;
        }
      }, 15_000);
    })();

    // Save playhead on unload as a final flush.
    const onBeforeUnload = () => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        if (t > 5) setResumePosition(videoId, t);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelled = true;
      if (saveInterval) window.clearInterval(saveInterval);
      if (timeInterval) window.clearInterval(timeInterval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      onBeforeUnload(); // final save on unmount (client-side nav away)
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [videoId, cohortSlug]);

  return (
    <div className="relative aspect-video bg-black">
      <div ref={containerRef} className="h-full w-full" aria-label={title} />
    </div>
  );
}
