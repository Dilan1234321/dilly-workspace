/**
 * Design tokens for Dilly.
 *
 * `colors` is exported as a Proxy so reads like `colors.t1` return the
 * dark-mode value when the active theme surface is dark, and the
 * light-mode value otherwise. This lets every screen keep using
 * `colors.X` without touching each file individually — the Proxy
 * route-reads the active mode at property access time.
 *
 * Caveats:
 *   - Styles defined ONCE at module top-level (e.g. `StyleSheet.create`
 *     outside a component) capture the value at module load and will
 *     still show the light palette. Those need inline style overrides
 *     or to be moved inside the component.
 *   - Inline styles inside component render (`<View style={{ color: colors.t1 }}>`)
 *     re-read the Proxy on every render and pick up the correct palette.
 *
 * `setColorsDarkMode(isDark)` is called from the theme hook whenever
 * the resolved surface changes. Do not set it manually elsewhere.
 */

// ── Light palette ──────────────────────────────────────────────────────────

const lightColors = {
  // Backgrounds: white → cool gray scale
  bg: '#FFFFFF',
  s1: '#F7F8FC',
  s2: '#EFF0F6',
  s3: '#E4E6F0',
  s4: '#D8DAE8',

  // Borders: blue-tinted transparency
  b1: 'rgba(43,58,142,0.06)',
  b2: 'rgba(43,58,142,0.10)',
  b3: 'rgba(43,58,142,0.16)',

  // Text: dark indigo
  t1: '#1A1A2E',
  t2: 'rgba(26,26,46,0.6)',
  t3: 'rgba(26,26,46,0.35)',

  // Brand: Dilly Blue (replaces gold)
  gold: '#2B3A8E',
  golddim: 'rgba(43,58,142,0.08)',
  goldbdr: 'rgba(43,58,142,0.18)',

  // Status colors
  green: '#34C759',
  gdim: 'rgba(52,199,89,0.08)',
  gbdr: 'rgba(52,199,89,0.18)',

  blue: '#0A84FF',
  bdim: 'rgba(10,132,255,0.08)',
  bbdr: 'rgba(10,132,255,0.18)',

  amber: '#FF9F0A',
  adim: 'rgba(255,159,10,0.08)',
  abdr: 'rgba(255,159,10,0.18)',

  coral: '#FF453A',
  cdim: 'rgba(255,69,58,0.08)',
  cbdr: 'rgba(255,69,58,0.18)',

  indigo: '#2B3A8E',
  idim: 'rgba(43,58,142,0.08)',
  ibdr: 'rgba(43,58,142,0.18)',
} as const;

// ── Dark palette ──────────────────────────────────────────────────────────
// Tuned to match the Midnight surface preset. Text is a warm off-white,
// backgrounds are a slate-indigo ladder that gives subtle depth. Status
// colors stay the same hues (iOS convention) since they read fine either
// way. The accent stays light-blue-ish to match DillyFace.

const darkColors = {
  // Backgrounds: slate-indigo ladder
  bg: '#0B0F1E',
  s1: '#151A2E',
  s2: '#1D2340',
  s3: '#262C50',
  s4: '#2F366A',

  // Borders: white-tinted transparency (visible on dark bg)
  b1: 'rgba(255,255,255,0.06)',
  b2: 'rgba(255,255,255,0.10)',
  b3: 'rgba(255,255,255,0.16)',

  // Text: warm off-white so it doesn't glare
  t1: '#E8EAF6',
  t2: 'rgba(232,234,246,0.65)',
  t3: 'rgba(232,234,246,0.40)',

  // Accent in dark mode: light sky-blue for contrast against near-black
  gold: '#8AB4FF',
  golddim: 'rgba(138,180,255,0.12)',
  goldbdr: 'rgba(138,180,255,0.28)',

  // Status colors (same hues, iOS convention)
  green: '#34C759',
  gdim: 'rgba(52,199,89,0.14)',
  gbdr: 'rgba(52,199,89,0.28)',

  blue: '#0A84FF',
  bdim: 'rgba(10,132,255,0.14)',
  bbdr: 'rgba(10,132,255,0.28)',

  amber: '#FF9F0A',
  adim: 'rgba(255,159,10,0.14)',
  abdr: 'rgba(255,159,10,0.28)',

  coral: '#FF453A',
  cdim: 'rgba(255,69,58,0.14)',
  cbdr: 'rgba(255,69,58,0.28)',

  // Indigo accent stays indigo (user-pickable accent lives on the theme
  // system, not here). This is just the token that's historically used
  // as a fallback hardcoded indigo.
  indigo: '#8AB4FF',
  idim: 'rgba(138,180,255,0.12)',
  ibdr: 'rgba(138,180,255,0.28)',
} as const;

// ── Runtime switch ─────────────────────────────────────────────────────────

let _isDark = false;

/** Called by the theme hook whenever the resolved surface changes.
 * Don't call manually. Affects every colors.X read after this point. */
export function setColorsDarkMode(isDark: boolean) {
  _isDark = isDark;
}

/** Proxy: reads from the active palette at property access time. Reads
 * inside component renders or inline styles pick up the dark palette
 * automatically once setColorsDarkMode(true) is called. */
export const colors = new Proxy({} as typeof lightColors, {
  get(_, key: string) {
    const palette = _isDark ? darkColors : lightColors;
    return (palette as any)[key];
  },
  // Don't allow writes. `colors.t1 = '#xxx'` is never the right pattern.
  set() {
    return false;
  },
  has(_, key: string) {
    return key in lightColors;
  },
  ownKeys() {
    return Object.keys(lightColors);
  },
  getOwnPropertyDescriptor(_, key: string) {
    const palette = _isDark ? darkColors : lightColors;
    if (key in palette) {
      return {
        configurable: true,
        enumerable: true,
        value: (palette as any)[key],
        writable: false,
      };
    }
    return undefined;
  },
});

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  full: 999,
};

// Production by default. For local dev: EXPO_PUBLIC_API_BASE=http://localhost:8000
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.trydilly.com';
