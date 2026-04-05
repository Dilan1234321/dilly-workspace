"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  DILLY_OPEN_OVERLAY_KEY,
  PENDING_VOICE_KEY,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import {
  SPLASH_FADE_OUT_MS,
  SPLASH_GHOST_FADE_OUT_MS,
} from "@/lib/launch/splashConfig";
import { LoadingScreen } from "./LoadingScreen";
import { SplashScreen } from "./SplashScreen";
import { useSplashState } from "./useSplashState";
import type { SplashState } from "@/lib/launch/splashStates";
import { buildGoldButtonVoicePrompt } from "@/lib/launch/buildSplashVoicePrompt";
import "@/app/launch-tokens.css";

function skipLaunchPath(pathname: string | null): boolean {
  if (!pathname) return true;
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/recruiter") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/invite")
  );
}

export function AppLaunchSequence() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [sequenceT0, setSequenceT0] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [fadeMs, setFadeMs] = useState(SPLASH_FADE_OUT_MS);

  const splash = useSplashState(active ? sequenceT0 : null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
    setMounted(true);
  }, []);

  // Activate on every page load as long as the user has a valid token.
  // No sessionStorage gate — the splash plays every single time.
  useEffect(() => {
    if (!mounted || !pathname) return;
    dilly.isAuthenticated().then((authed) => {
      try {
        if (!authed) return;
        if (skipLaunchPath(pathname)) return;
        setSequenceT0(performance.now());
        setActive(true);
      } catch {
        /* ignore */
      }
    });
  }, [mounted, pathname]);

  const finish = useCallback((nav: () => void, ms: number) => {
    setFadeMs(ms);
    setFadeOut(true);
    window.setTimeout(() => {
      setDismissed(true);
      setActive(false);
      nav();
    }, ms);
  }, []);

  const onPrimary = useCallback(
    (data: SplashState) => {
      const prompt = buildGoldButtonVoicePrompt(data);
      try {
        sessionStorage.setItem(PENDING_VOICE_KEY, prompt);
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
      // Dismiss only — career center is already rendered underneath.
      // DILLY_OPEN_OVERLAY_KEY triggers voice overlay via page.tsx useEffect.
      finish(() => {}, SPLASH_FADE_OUT_MS);
    },
    [finish],
  );

  const onGhost = useCallback(() => {
    // Dismiss only — career center is already rendered underneath.
    finish(() => {}, SPLASH_GHOST_FADE_OUT_MS);
  }, [finish]);

  if (!active || dismissed || sequenceT0 === null) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-[110] ${fadeOut ? "dilly-launch-pass-through" : ""}`}
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: `opacity ${fadeMs}ms ease-out`,
      }}
    >
      <SplashScreen
        sequenceT0={sequenceT0}
        splashData={splash.data}
        readyAt={splash.readyAt}
        onPrimary={onPrimary}
        onGhost={onGhost}
      />
      <LoadingScreen />
    </div>
  );
}
