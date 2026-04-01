"use client";

import { useEffect, useRef, useState } from "react";
import { dilly } from "@/lib/dilly";
import type { SplashState } from "@/lib/launch/splashStates";
import { SPLASH } from "@/lib/launch/splashConfig";

const FALLBACK_SCORE_GAP: SplashState = {
  state: "score_gap",
  eyebrow: "You're almost there",
  eyebrow_color: "gold",
  eyebrow_pulse: true,
  headline: "You're about 6 pts from the recruiter bar.",
  headline_gold: "the recruiter bar.",
  sub: "Top 25% is where competitive programs start filtering. You're closer than you think.",
  cta_primary: "Close the gap →",
  cta_route: "/voice",
  cta_context: "context=score_gap",
  glow_color: "gold",
  voice_prompt:
    "I'm opening the app and want to close the gap to the recruiter bar. What's the single highest-impact move for me this week based on my profile?",
};

export type UseSplashStateResult = {
  data: SplashState | null;
  readyAt: number | null;
};

/**
 * Fetches splash copy in parallel with the loading animation.
 * `sequenceT0` is null until launch is active — then fetch + fallback timer use the same anchor.
 */
export function useSplashState(sequenceT0: number | null): UseSplashStateResult {
  const [data, setData] = useState<SplashState | null>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (sequenceT0 === null) return;
    settled.current = false;
    let cancelled = false;

    const mark = (payload: SplashState) => {
      if (settled.current || cancelled) return;
      settled.current = true;
      setData(payload);
      setReadyAt(performance.now());
    };

    const run = async () => {
      try {
        const j = await dilly.get<SplashState>("/profile/splash-state");
        if (cancelled) return;
        mark(j);
      } catch {
        if (!cancelled && !settled.current) mark(FALLBACK_SCORE_GAP);
      }
    };

    void run();

    const elapsed = performance.now() - sequenceT0;
    const wait = Math.max(0, SPLASH.apiFallbackAt - elapsed);
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled && !settled.current) mark(FALLBACK_SCORE_GAP);
    }, wait);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [sequenceT0]);

  return { data, readyAt };
}
