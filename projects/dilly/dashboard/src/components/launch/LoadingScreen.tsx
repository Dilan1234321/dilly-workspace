"use client";

import { useEffect, useRef } from "react";
import { EASE, LOADING } from "@/lib/launch/splashConfig";

type LoadingScreenProps = {
  className?: string;
  onExitComplete?: () => void;
};

/**
 * Full-screen loading phase (z-index 100). Sequenced via rAF + transition (no keyframes for sequence).
 */
export function LoadingScreen({ className = "", onExitComplete }: LoadingScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const barWrapRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);
  const exitCalled = useRef(false);

  useEffect(() => {
    const timers: number[] = [];
    const word = wordRef.current;
    const tag = tagRef.current;
    const barWrap = barWrapRef.current;
    const barFill = barFillRef.current;
    const glow = glowRef.current;
    const root = rootRef.current;
    if (!word || !tag || !barWrap || !barFill || !glow || !root) return;

    const armExitListener = () => {
      const onEnd = (e: TransitionEvent) => {
        if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;
        root.removeEventListener("transitionend", onEnd);
        if (!exitCalled.current) {
          exitCalled.current = true;
          onExitComplete?.();
        }
      };
      root.addEventListener("transitionend", onEnd);
    };

    timers.push(
      window.setTimeout(() => {
        word.style.transition = `opacity ${LOADING.wordmarkDuration}ms ${EASE.wordmark}, transform ${LOADING.wordmarkDuration}ms ${EASE.wordmark}`;
        word.style.opacity = "1";
        word.style.transform = "scale(1)";
      }, LOADING.wordmarkAt),
    );

    timers.push(
      window.setTimeout(() => {
        tag.style.transition = `opacity ${LOADING.taglineDuration}ms ${EASE.out}`;
        tag.style.opacity = "1";
      }, LOADING.taglineAt),
    );

    timers.push(
      window.setTimeout(() => {
        barWrap.style.transition = `opacity ${LOADING.barWrapDuration}ms ${EASE.out}`;
        barWrap.style.opacity = "1";
      }, LOADING.barWrapAt),
    );

    timers.push(
      window.setTimeout(() => {
        barFill.style.transition = `width ${LOADING.barFillDuration}ms ${EASE.barFill}`;
        barFill.style.width = "100%";
      }, LOADING.barFillAt),
    );

    timers.push(
      window.setTimeout(() => {
        glow.style.transition = `opacity ${LOADING.glowDuration}ms ${EASE.glow}, transform ${LOADING.glowDuration}ms ${EASE.glow}`;
        glow.style.opacity = "1";
        glow.style.transform = "translate(-50%, -50%) scale(1)";
      }, LOADING.glowAt),
    );

    timers.push(
      window.setTimeout(() => {
        root.style.pointerEvents = "none";
        armExitListener();
        root.style.transition = `opacity ${LOADING.exitDuration}ms ${EASE.exit}, transform ${LOADING.exitDuration}ms ${EASE.exit}`;
        root.style.opacity = "0";
        root.style.transform = "translateY(-8px)";
      }, LOADING.exitAt),
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [onExitComplete]);

  return (
    <div
      ref={rootRef}
      className={`dilly-launch-scope fixed inset-0 z-[100] flex flex-col items-center justify-center ${className}`}
      style={{
        background: "var(--bg)",
        opacity: 1,
        transform: "translateY(0)",
      }}
    >
      <div
        ref={glowRef}
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 320,
          height: 320,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) scale(0)",
          opacity: 0,
          background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 18%, transparent) 0%, transparent 65%)",
        }}
        aria-hidden
      />
      <div
        ref={wordRef}
        style={{
          fontFamily: "var(--font-playfair), 'Playfair Display', serif",
          fontSize: 38,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--gold)",
          opacity: 0,
          transform: "scale(0.94)",
        }}
      >
        Dilly
      </div>
      <div
        ref={tagRef}
        style={{
          marginTop: 6,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--gold) 45%, transparent)",
          opacity: 0,
        }}
      >
        Career readiness, measured
      </div>
      <div
        ref={barWrapRef}
        className="overflow-hidden"
        style={{
          width: 52,
          height: 1.5,
          marginTop: 32,
          borderRadius: 999,
          background: "var(--golddim)",
          opacity: 0,
        }}
      >
        <div
          ref={barFillRef}
          style={{
            height: "100%",
            width: "0%",
            borderRadius: 999,
            background: "linear-gradient(to right, color-mix(in srgb, var(--gold) 40%, transparent), var(--gold))",
          }}
        />
      </div>
    </div>
  );
}
