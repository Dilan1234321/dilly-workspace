"use client";

import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD_PX = 80;
const TOP_EPSILON_PX = 10;
const MAX_PULL_DISPLAY_PX = 120;
const RELOAD_DELAY_MS = 420;
/** Pull distance below this hides the logo (reduces flicker at scroll top). */
const PULL_SHOW_MIN_PX = 8;

function isAtScrollTop(): boolean {
  if (typeof window === "undefined") return false;
  const doc = document.documentElement;
  const y = window.scrollY ?? doc.scrollTop ?? document.body.scrollTop ?? 0;
  return y < TOP_EPSILON_PX;
}

/**
 * At scroll top, pull down to reload. Shows Dilly logo while pulling; oval ring spins while refresh runs.
 */
export function GlobalPullToRefresh() {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const atTopRef = useRef(false);
  const trackingRef = useRef(false);
  const reloadScheduledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (reloadScheduledRef.current) return;
      startYRef.current = e.touches[0].clientY;
      atTopRef.current = isAtScrollTop();
      trackingRef.current = true;
      if (!atTopRef.current) setPullPx(0);
    };

    const onMove = (e: TouchEvent) => {
      if (!trackingRef.current || !atTopRef.current || reloadScheduledRef.current) return;
      if (e.touches.length !== 1) return;
      const pull = Math.max(0, e.touches[0].clientY - startYRef.current);
      setPullPx(Math.min(pull, MAX_PULL_DISPLAY_PX));
    };

    const onEnd = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      const t = e.changedTouches[0];
      const pull = t ? Math.max(0, t.clientY - startYRef.current) : 0;
      const voiceBusy =
        typeof document !== "undefined" && document.body?.dataset?.dillyVoiceBusy === "1";
      const shouldRefresh =
        atTopRef.current &&
        pull >= PULL_THRESHOLD_PX &&
        !reloadScheduledRef.current &&
        !voiceBusy;

      if (shouldRefresh) {
        reloadScheduledRef.current = true;
        setRefreshing(true);
        setPullPx(Math.max(pull, PULL_THRESHOLD_PX));
        window.setTimeout(() => {
          window.location.reload();
        }, RELOAD_DELAY_MS);
      } else {
        setPullPx(0);
      }
      atTopRef.current = false;
    };

    const onCancel = () => {
      if (reloadScheduledRef.current) return;
      trackingRef.current = false;
      atTopRef.current = false;
      setPullPx(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, []);

  const visible = refreshing || pullPx > PULL_SHOW_MIN_PX;
  const opacity = refreshing ? 1 : Math.min(1, (pullPx - PULL_SHOW_MIN_PX) / 55);
  const translateY =
    refreshing ? Math.min(pullPx, MAX_PULL_DISPLAY_PX) + 4 : Math.min(pullPx, MAX_PULL_DISPLAY_PX) * 0.85;

  if (!visible) return null;

  return (
    <div
      className="ptr-pull-refresh fixed left-0 right-0 z-[9998] flex justify-center pointer-events-none"
      style={{
        top: 0,
        paddingTop: "max(env(safe-area-inset-top, 0px), 10px)",
        opacity,
        transform: `translate3d(0, ${translateY}px, 0)`,
        transition: refreshing ? "opacity 0.2s ease" : "opacity 0.12s ease",
      }}
      aria-hidden
    >
      <div className="relative flex items-center justify-center" style={{ width: 148, height: 56 }}>
        {refreshing ? (
          <svg
            className="ptr-pull-refresh-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[148px] h-[58px] overflow-visible"
            viewBox="0 0 148 58"
            aria-hidden
          >
            <g className="ptr-pull-refresh-oval-spin">
              <ellipse
                cx="74"
                cy="29"
                rx="68"
                ry="23"
                fill="none"
                stroke="var(--te-gold)"
                strokeWidth="2.5"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="22 78"
              />
            </g>
          </svg>
        ) : null}
        <img
          src="/dilly-logo.png"
          alt=""
          className="relative z-10 h-9 w-auto max-w-[min(132px,70vw)] object-contain select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
