"use client";

import type { ReactNode } from "react";

const SILHOUETTE_FILL = "rgba(179, 167, 157, 0.2)";

/** Palm tree silhouettes - left or right slot */
function PalmTrees({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 280" className={className} aria-hidden>
      <path
        fill={SILHOUETTE_FILL}
        d="M100 20 Q60 80 70 140 Q75 180 50 220 L55 280 L145 280 L150 220 Q125 180 130 140 Q140 80 100 20 Z"
      />
      <path fill={SILHOUETTE_FILL} d="M40 260 L45 200 Q30 220 25 260 Z" />
      <path fill={SILHOUETTE_FILL} d="M160 260 L155 200 Q170 220 175 260 Z" />
    </svg>
  );
}

/** UTampa-style minarets (Moorish towers) */
function Minarets({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 320" className={className} aria-hidden>
      <path
        fill={SILHOUETTE_FILL}
        d="M30 320 L30 120 L50 80 L50 40 L70 20 L70 0 L110 0 L110 20 L130 40 L130 80 L150 120 L150 320 Z"
      />
      <path fill={SILHOUETTE_FILL} d="M60 320 L60 140 L120 140 L120 320 Z" />
    </svg>
  );
}

/** Dolphin silhouette */
function Dolphins({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" className={className} aria-hidden>
      <path
        fill={SILHOUETTE_FILL}
        d="M20 70 Q60 20 120 50 Q180 85 200 60 L210 75 Q180 100 110 80 Q50 60 30 90 Q20 100 20 70 Z"
      />
      <path fill={SILHOUETTE_FILL} d="M80 95 Q100 75 130 85 Q150 95 140 110 Q120 115 95 105 Z" />
    </svg>
  );
}

/** Sunset / sun arc */
function Sun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 160" className={className} aria-hidden>
      <path
        fill={SILHOUETTE_FILL}
        d="M0 160 L0 100 Q30 80 60 90 Q90 100 120 85 Q150 70 180 85 Q210 100 240 90 L240 160 Z"
      />
      <ellipse cx="120" cy="100" rx="50" ry="25" fill={SILHOUETTE_FILL} />
    </svg>
  );
}

/** Waves */
function Waves({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden>
      <path
        fill={SILHOUETTE_FILL}
        d="M0 80 Q50 40 100 80 Q150 120 200 80 L200 140 L0 140 Z"
      />
      <path fill={SILHOUETTE_FILL} d="M0 100 Q40 70 80 100 Q120 130 200 100 L200 140 L0 140 Z" />
    </svg>
  );
}

const SILHOUETTES = [PalmTrees, Minarets, Dolphins, Sun, Waves];

/**
 * Premium onboarding layout: Dilly design system
 * Replaces the old silhouette layout with a clean, dark, on-brand layout
 */
export function OnboardingThemedLayout({
  visualStep,
  children,
}: {
  visualStep: number;
  children: ReactNode;
}) {
  const totalSteps = 8;
  const progress = Math.round(((visualStep + 1) / totalSteps) * 100);

  return (
    <div className="m-onboarding-root">
      <div className="m-onboarding-bg" />
      <div className="m-onboarding-card animate-fade-up">
        <div className="m-progress-bar">
          <div className="m-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {children}
      </div>
    </div>
  );
}
