/** Skip entire launch (loading + splash) for this tab session once set. */
export const SPLASH_SESSION_KEY = "dilly_splash_shown";

/** Easing strings (CSS transition-timing-function). */
export const EASE = {
  wordmark: "cubic-bezier(0.16, 1, 0.3, 1)",
  out: "ease-out",
  barFill: "cubic-bezier(0.4, 0, 0.2, 1)",
  glow: "cubic-bezier(0.34, 1.1, 0.64, 1)",
  exit: "cubic-bezier(0.4, 0, 0.2, 1)",
  orbSpring: "cubic-bezier(0.34, 1.35, 0.64, 1)",
  headline: "cubic-bezier(0.16, 1, 0.3, 1)",
  cta: "cubic-bezier(0.34, 1.2, 0.64, 1)",
} as const;

/** Loading screen timeline (ms from sequence start). */
export const LOADING = {
  blackHold: 180,
  /** Phase 1 — wordmark */
  wordmarkAt: 180,
  wordmarkDuration: 600,
  /** Phase 2 — tagline */
  taglineAt: 620,
  taglineDuration: 500,
  /** Phase 3 — bar */
  barWrapAt: 900,
  barWrapDuration: 400,
  barFillAt: 1100,
  barFillDuration: 1800,
  /** Phase 4 — gold glow */
  glowAt: 2200,
  glowDuration: 1200,
  /** Phase 5 — exit */
  exitAt: 2900,
  exitDuration: 700,
} as const;

/** Splash timeline (ms from sequence start). Phases 8+ shift when splash API is late — use deltas from phase 8. */
export const SPLASH = {
  bgAt: 3000,
  bgDuration: 600,
  orbAt: 3200,
  orbDuration: 500,
  /** Nominal eyebrow start if API ready before t=3500 */
  eyebrowNominalAt: 3580,
  /** Do not start text stagger before this if API still pending */
  gateCheckAt: 3500,
  /** Fallback state + force text if API still pending */
  apiFallbackAt: 6500,
  /** Offsets from phase 8 (eyebrow) for subsequent elements */
  shimmerDelay: 140,
  headlineDelay: 240,
  subDelay: 410,
  primaryCtaDelay: 580,
  ghostCtaDelay: 720,
  shimmerDuration: 300,
  eyebrowDuration: 380,
  headlineDuration: 400,
  subDuration: 380,
  primaryCtaDuration: 380,
  ghostCtaDuration: 320,
} as const;

export const SPLASH_FADE_OUT_MS = 300;
export const SPLASH_GHOST_FADE_OUT_MS = 350;
