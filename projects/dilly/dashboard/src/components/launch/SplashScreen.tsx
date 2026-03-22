"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DillyAvatar } from "@/components/shared/DillyAvatar";
import { SplashContent, type SplashContentPhaseStyle } from "./SplashContent";
import { EASE, SPLASH } from "@/lib/launch/splashConfig";
import type { SplashState } from "@/lib/launch/splashStates";

const hidden: React.CSSProperties = {
  opacity: 0,
  transform: "translateY(6px)",
};

const hiddenOrb: React.CSSProperties = {
  opacity: 0,
  transform: "scale(0.8)",
};

function computePhase8Abs(sequenceT0: number, readyAt: number | null): number {
  if (readyAt == null) return sequenceT0 + SPLASH.apiFallbackAt;
  const readyRel = readyAt - sequenceT0;
  /* Data before 3500ms from start → keep eyebrow at nominal t=3580 */
  if (readyRel <= SPLASH.gateCheckAt) return sequenceT0 + SPLASH.eyebrowNominalAt;
  return Math.max(sequenceT0 + SPLASH.eyebrowNominalAt, readyAt);
}

type SplashScreenProps = {
  sequenceT0: number;
  splashData: SplashState | null;
  readyAt: number | null;
  onPrimary: (data: SplashState) => void;
  onGhost: () => void;
};

export function SplashScreen({ sequenceT0, splashData, readyAt, onPrimary, onGhost }: SplashScreenProps) {
  const [bgStyle, setBgStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const [orbStyle, setOrbStyle] = useState<React.CSSProperties>(hiddenOrb);
  const [contentPhase, setContentPhase] = useState<SplashContentPhaseStyle>({
    eyebrow: hidden,
    shimmer: { opacity: 0 },
    headline: hidden,
    sub: hidden,
    primary: hidden,
    ghost: hidden,
  });

  const data = splashData;
  const glowGreen = data?.glow_color === "green";
  const phase8Abs = useMemo(() => computePhase8Abs(sequenceT0, readyAt), [sequenceT0, readyAt]);
  const contentTimers = useRef<number[]>([]);

  useEffect(() => {
    const ids: number[] = [];
    const arm = (fn: () => void, delay: number) => {
      ids.push(window.setTimeout(fn, delay));
    };

    const t6 = Math.max(0, sequenceT0 + SPLASH.bgAt - performance.now());
    arm(() => {
      setBgStyle({
        opacity: 1,
        transition: `opacity ${SPLASH.bgDuration}ms ${EASE.out}`,
      });
    }, t6);

    const t7 = Math.max(0, sequenceT0 + SPLASH.orbAt - performance.now());
    arm(() => {
      setOrbStyle({
        opacity: 1,
        transform: "scale(1)",
        transition: `opacity ${SPLASH.orbDuration}ms ${EASE.orbSpring}, transform ${SPLASH.orbDuration}ms ${EASE.orbSpring}`,
      });
    }, t7);

    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [sequenceT0]);

  useEffect(() => {
    if (!data) return;
    const clear = () => contentTimers.current.forEach((id) => window.clearTimeout(id));
    contentTimers.current = [];
    const arm = (fn: () => void, delay: number) => {
      contentTimers.current.push(window.setTimeout(fn, delay));
    };

    const d8 = Math.max(0, phase8Abs - performance.now());
    arm(() => {
      setContentPhase((p) => ({
        ...p,
        eyebrow: {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity ${SPLASH.eyebrowDuration}ms ${EASE.out}, transform ${SPLASH.eyebrowDuration}ms ${EASE.out}`,
        },
      }));
    }, d8);

    arm(() => {
      setContentPhase((p) => ({
        ...p,
        shimmer: {
          opacity: 1,
          transition: `opacity ${SPLASH.shimmerDuration}ms ${EASE.out}`,
        },
      }));
    }, d8 + SPLASH.shimmerDelay);

    arm(() => {
      setContentPhase((p) => ({
        ...p,
        headline: {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity ${SPLASH.headlineDuration}ms ${EASE.headline}, transform ${SPLASH.headlineDuration}ms ${EASE.headline}`,
        },
      }));
    }, d8 + SPLASH.headlineDelay);

    arm(() => {
      setContentPhase((p) => ({
        ...p,
        sub: {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity ${SPLASH.subDuration}ms ${EASE.headline}, transform ${SPLASH.subDuration}ms ${EASE.headline}`,
        },
      }));
    }, d8 + SPLASH.subDelay);

    arm(() => {
      setContentPhase((p) => ({
        ...p,
        primary: {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity ${SPLASH.primaryCtaDuration}ms ${EASE.cta}, transform ${SPLASH.primaryCtaDuration}ms ${EASE.cta}`,
        },
      }));
    }, d8 + SPLASH.primaryCtaDelay);

    arm(() => {
      setContentPhase((p) => ({
        ...p,
        ghost: {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity ${SPLASH.ghostCtaDuration}ms ${EASE.cta}, transform ${SPLASH.ghostCtaDuration}ms ${EASE.cta}`,
        },
      }));
    }, d8 + SPLASH.ghostCtaDelay);

    return clear;
  }, [phase8Abs, data]);

  const bgClass = glowGreen ? "dilly-splash-bg-green" : "dilly-splash-bg-gold";
  const ringName = glowGreen ? "dilly-launch-rpl-green" : "dilly-launch-rpl";

  return (
    <div
      className={`dilly-launch-scope fixed inset-0 z-[90] flex flex-col items-center justify-center px-7 pb-[72px] ${bgClass}`}
      style={bgStyle}
    >
      <div
        className="relative mb-[22px] shrink-0"
        style={{ width: 110, height: 110, ...orbStyle }}
      >
        <div
          className="pointer-events-none absolute rounded-full border border-transparent"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            animation: `${ringName} 2.4s ease-out infinite`,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute rounded-full border border-transparent"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            animation: `${ringName} 2.4s ease-out infinite 0.8s`,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute rounded-full border border-transparent"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            animation: `${ringName} 2.4s ease-out infinite 1.6s`,
          }}
          aria-hidden
        />
        <div
          className="absolute flex items-center justify-center overflow-hidden rounded-full"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 90,
            height: 90,
            zIndex: 2,
            background: "radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--gold) 22%, #1a1204), var(--bg))",
            border: glowGreen ? "1px solid color-mix(in srgb, var(--green) 35%, transparent)" : "1px solid color-mix(in srgb, var(--gold) 35%, transparent)",
            boxShadow: glowGreen
              ? "0 0 20px color-mix(in srgb, var(--green) 12%, transparent), inset 0 1px 0 color-mix(in srgb, var(--green) 20%, transparent)"
              : "0 0 20px color-mix(in srgb, var(--gold) 12%, transparent), inset 0 1px 0 color-mix(in srgb, var(--gold) 20%, transparent)",
          }}
        >
          <DillyAvatar size={90} aria-hidden />
        </div>
      </div>

      {data ? (
        <SplashContent
          data={data}
          phaseStyle={contentPhase}
          onPrimary={() => onPrimary(data)}
          onGhost={onGhost}
        />
      ) : null}
    </div>
  );
}
