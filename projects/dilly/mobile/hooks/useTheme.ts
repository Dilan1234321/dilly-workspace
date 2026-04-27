/**
 * useTheme - multi-axis personalization.
 *
 * Six independent axes, each a small enum. Every surface that
 * subscribes reads from `useResolvedTheme()` (or the lighter
 * `useAccent()`) and repaints automatically.
 *
 * Axes:
 *   - accent       : primary brand hue (12 presets)
 *   - surface      : app background family (Cloud / Cream / Slate / Midnight)
 *   - shape        : radius scale (Sharp / Standard / Rounded / Pill)
 *   - typeScale    : font pairing (Dilly / Modern / Editorial / Playful)
 *   - density      : padding scale (Comfortable / Compact)
 *   - accentStyle  : CTA fill style (Solid / Gradient)
 *   - autoDark     : when true, surface overrides to Midnight on system dark
 *
 * Everything persists to AsyncStorage under a single JSON key.
 * Default preserves the current brand look (Indigo / Cloud / Standard
 * / Dilly / Comfortable / Solid / autoDark on).
 *
 * The module-level pub/sub pattern matches useDillyOverlay and
 * usePaywall so non-React code can also trigger repaints.
 */

import { useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setColorsDarkMode } from '../lib/tokens';

const STORAGE_KEY = 'dilly_theme_v2';
// When the current user's theme was written, we stamp the email they
// were signed in as. On next cold-boot we read both - if the email
// matches the currently authed user, we apply locally IMMEDIATELY
// (no flash to default). If it's a different user or unknown, we wait
// for the /profile sync. This is what "remember my customize immediately
// on sign-in" needs: a stored theme tagged to the account it belongs to.
const STORAGE_USER_KEY = 'dilly_theme_v2_user';

/* ─────────────────────────────────────────────────────────────── */
/* Axis enums                                                       */
/* ─────────────────────────────────────────────────────────────── */

export type AccentId =
  | 'indigo' | 'rose' | 'emerald' | 'amber' | 'violet' | 'graphite'
  | 'sky' | 'teal' | 'crimson' | 'plum' | 'forest' | 'navy';

export type SurfaceId =
  | 'cloud' | 'cream' | 'slate' | 'midnight'
  | 'sky' | 'blush' | 'mint' | 'lavender' | 'butter'
  | 'darkblue' | 'oled' | 'carbon' | 'cocoa';
export type ShapeId = 'sharp' | 'standard' | 'rounded' | 'pill';
export type TypeId = 'dilly' | 'modern' | 'editorial' | 'playful';
export type DensityId = 'comfortable' | 'compact';
export type AccentStyleId = 'solid' | 'gradient';

export interface ThemeConfig {
  accent: AccentId;
  surface: SurfaceId;
  shape: ShapeId;
  type: TypeId;
  density: DensityId;
  accentStyle: AccentStyleId;
  /** When true, surface resolves to 'midnight' whenever the system
      is in dark mode. When false, the user's explicit surface wins. */
  autoDark: boolean;
  /** Which dark surface to use when autoDark kicks in. Defaults to
      'midnight'. Only dark-family surfaces are valid here. */
  preferredDark?: SurfaceId;
}

/* ─────────────────────────────────────────────────────────────── */
/* Presets                                                          */
/* ─────────────────────────────────────────────────────────────── */

export interface AccentPreset {
  id: AccentId;
  label: string;
  color: string;
  /** Replacement color used on dark surfaces when `color` is too dark to be
   *  visible. Without this, resolveTheme falls back to '#FFFFFF' which makes
   *  accent-background buttons invisible (white bg + white text). */
  darkColor?: string;
  /** Display name shown in Customize Dilly when the resolved dark-mode color
   *  is significantly different from the stored color. Purely cosmetic - the
   *  stored preference id never changes. */
  darkLabel?: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'indigo',    label: 'Dilly',     color: '#2B3A8E' },
  { id: 'navy',      label: 'Navy',      color: '#0F2A6B', darkColor: '#7EB5FF', darkLabel: 'Cornflower' },
  { id: 'sky',       label: 'Sky',       color: '#0A84FF' },
  { id: 'teal',      label: 'Teal',      color: '#0D9488' },
  { id: 'emerald',   label: 'Emerald',   color: '#0E9F6E' },
  { id: 'forest',    label: 'Forest',    color: '#166534' },
  { id: 'amber',     label: 'Amber',     color: '#B45309' },
  { id: 'crimson',   label: 'Crimson',   color: '#B91C1C' },
  { id: 'rose',      label: 'Rose',      color: '#E11D74' },
  { id: 'plum',      label: 'Plum',      color: '#9D174D' },
  { id: 'violet',    label: 'Violet',    color: '#7C3AED' },
  { id: 'graphite',  label: 'Graphite',  color: '#1F2937', darkColor: '#9CA3AF', darkLabel: 'Slate' },
];

export interface SurfacePreset {
  id: SurfaceId;
  label: string;
  /** True if this is a dark surface - used to flip text colors. */
  dark: boolean;
  /** Primary page background. */
  bg: string;
  /** Slightly elevated surface (cards, form inputs on bg). */
  s1: string;
  /** Mid elevation (cards on s1, selected chips). */
  s2: string;
  /** Higher elevation (menus, popovers). */
  s3: string;
  /** Primary text. */
  t1: string;
  /** Secondary text (labels, subdued). */
  t2: string;
  /** Tertiary text (placeholders, captions). */
  t3: string;
  /** Default border / divider. */
  border: string;
}

export const SURFACE_PRESETS: Record<SurfaceId, SurfacePreset> = {
  cloud: {
    id: 'cloud', label: 'Cloud', dark: false,
    bg: '#FFFFFF', s1: '#F7F8FC', s2: '#EFF0F6', s3: '#E4E6F0',
    t1: '#1A1A2E', t2: 'rgba(26,26,46,0.6)', t3: 'rgba(26,26,46,0.35)',
    border: 'rgba(43,58,142,0.10)',
  },
  cream: {
    id: 'cream', label: 'Cream', dark: false,
    bg: '#FBF8F2', s1: '#F4EFE5', s2: '#EBE4D5', s3: '#DFD5C1',
    t1: '#2A1F12', t2: 'rgba(42,31,18,0.62)', t3: 'rgba(42,31,18,0.35)',
    border: 'rgba(42,31,18,0.12)',
  },
  slate: {
    id: 'slate', label: 'Slate', dark: false,
    bg: '#F4F6FA', s1: '#E9EDF3', s2: '#DEE3EB', s3: '#CFD6E0',
    t1: '#0F172A', t2: 'rgba(15,23,42,0.62)', t3: 'rgba(15,23,42,0.38)',
    border: 'rgba(15,23,42,0.12)',
  },
  midnight: {
    id: 'midnight', label: 'Midnight', dark: true,
    bg: '#0B0F1E', s1: '#151A2E', s2: '#1D2340', s3: '#272D4F',
    t1: '#E8EAF4', t2: 'rgba(232,234,244,0.62)', t3: 'rgba(232,234,244,0.38)',
    border: 'rgba(232,234,244,0.10)',
  },
  // ── Pastels ───────────────────────────────────────────────────
  // Soft, low-saturation backgrounds. Text stays dark (same ink as
  // Cloud) so contrast stays AA-level against the tinted white. s1
  // is a half-shade deeper than bg for cards; s2/s3 step darker for
  // selected chips + popovers.
  sky: {
    id: 'sky', label: 'Sky', dark: false,
    bg: '#EFF7FF', s1: '#E3F0FE', s2: '#D3E7FC', s3: '#BFD8F7',
    t1: '#0F2540', t2: 'rgba(15,37,64,0.60)', t3: 'rgba(15,37,64,0.35)',
    border: 'rgba(15,37,64,0.10)',
  },
  blush: {
    id: 'blush', label: 'Blush', dark: false,
    bg: '#FFF1F5', s1: '#FEE4EC', s2: '#FCD3DE', s3: '#F9BBCB',
    t1: '#3A0F1A', t2: 'rgba(58,15,26,0.60)', t3: 'rgba(58,15,26,0.35)',
    border: 'rgba(58,15,26,0.10)',
  },
  mint: {
    id: 'mint', label: 'Mint', dark: false,
    bg: '#EEFBF3', s1: '#E0F6E8', s2: '#CFEED9', s3: '#B6E3C3',
    t1: '#0B2A18', t2: 'rgba(11,42,24,0.60)', t3: 'rgba(11,42,24,0.35)',
    border: 'rgba(11,42,24,0.10)',
  },
  lavender: {
    id: 'lavender', label: 'Lavender', dark: false,
    bg: '#F4EFFF', s1: '#EAE2FC', s2: '#DCD1F8', s3: '#C9B9F1',
    t1: '#22133F', t2: 'rgba(34,19,63,0.60)', t3: 'rgba(34,19,63,0.35)',
    border: 'rgba(34,19,63,0.10)',
  },
  butter: {
    id: 'butter', label: 'Butter', dark: false,
    bg: '#FFF9E6', s1: '#FDF1CC', s2: '#FBE8AE', s3: '#F6D97E',
    t1: '#3B2A05', t2: 'rgba(59,42,5,0.60)', t3: 'rgba(59,42,5,0.35)',
    border: 'rgba(59,42,5,0.12)',
  },
  // ── Extra dark surfaces ───────────────────────────────────────────
  // Only selectable in Customize Dilly. Each is a complete token set.
  darkblue: {
    id: 'darkblue', label: 'Dark Blue', dark: true,
    bg: '#071329', s1: '#0D1F3C', s2: '#132850', s3: '#1C3566',
    t1: '#E8F0FF', t2: 'rgba(232,240,255,0.62)', t3: 'rgba(232,240,255,0.38)',
    border: 'rgba(232,240,255,0.09)',
  },
  oled: {
    id: 'oled', label: 'OLED Black', dark: true,
    bg: '#000000', s1: '#0C0C0C', s2: '#141414', s3: '#1E1E1E',
    t1: '#FFFFFF', t2: 'rgba(255,255,255,0.65)', t3: 'rgba(255,255,255,0.40)',
    border: 'rgba(255,255,255,0.09)',
  },
  carbon: {
    id: 'carbon', label: 'Carbon', dark: true,
    bg: '#111318', s1: '#1A1D24', s2: '#22262F', s3: '#2C3039',
    t1: '#E6EDF3', t2: 'rgba(230,237,243,0.62)', t3: 'rgba(230,237,243,0.38)',
    border: 'rgba(230,237,243,0.09)',
  },
  cocoa: {
    id: 'cocoa', label: 'Cocoa', dark: true,
    bg: '#130F0C', s1: '#1E1814', s2: '#28201B', s3: '#332822',
    t1: '#F5EFE8', t2: 'rgba(245,239,232,0.62)', t3: 'rgba(245,239,232,0.38)',
    border: 'rgba(245,239,232,0.09)',
  },
};

export interface ShapePreset {
  id: ShapeId;
  label: string;
  /** Radius for tight chips, pills. */
  chip: number;
  /** Radius for inputs, buttons, small cards. */
  sm: number;
  /** Default card radius. */
  md: number;
  /** Hero / modal card radius. */
  lg: number;
}

export const SHAPE_PRESETS: Record<ShapeId, ShapePreset> = {
  sharp:    { id: 'sharp',    label: 'Sharp',    chip: 4,  sm: 6,  md: 8,  lg: 10 },
  standard: { id: 'standard', label: 'Standard', chip: 8,  sm: 10, md: 12, lg: 16 },
  rounded:  { id: 'rounded',  label: 'Rounded',  chip: 14, sm: 16, md: 20, lg: 24 },
  pill:     { id: 'pill',     label: 'Pill',     chip: 999, sm: 999, md: 28, lg: 32 },
};

export interface TypePreset {
  id: TypeId;
  label: string;
  /** Hero / eyebrow font (e.g. big titles). Falls back to system if missing. */
  display: string | undefined;
  /** Body font family, or undefined to use system default. */
  body: string | undefined;
  /** Letter-spacing bump (applied to hero headlines). */
  heroTracking: number;
  /** Hero font weight. */
  heroWeight: '700' | '800' | '900';
}

export const TYPE_PRESETS: Record<TypeId, TypePreset> = {
  // Dilly = Cinzel (Roman capitals, serif, carved-in-stone feel).
  // Editorial = Playfair Display (high-contrast serif, magazine/book
  // feel - totally different shape language from Cinzel). Tester
  // feedback flagged that the two presets looked identical because
  // they were both Cinzel with tracking tweaks. Now genuinely distinct.
  dilly:     { id: 'dilly',     label: 'Dilly',     display: 'Cinzel_700Bold',          body: undefined, heroTracking: -0.4, heroWeight: '700' },
  modern:    { id: 'modern',    label: 'Modern',    display: undefined,                 body: undefined, heroTracking: -0.8, heroWeight: '900' },
  editorial: { id: 'editorial', label: 'Editorial', display: 'PlayfairDisplay_900Black', body: undefined, heroTracking:  0.2, heroWeight: '900' },
  playful:   { id: 'playful',   label: 'Playful',   display: undefined,                 body: undefined, heroTracking: -0.2, heroWeight: '800' },
};

export interface DensityPreset {
  id: DensityId;
  label: string;
  /** Multiplier applied to padding scale. 1.0 = default, 0.82 = compact. */
  scale: number;
}

export const DENSITY_PRESETS: Record<DensityId, DensityPreset> = {
  comfortable: { id: 'comfortable', label: 'Comfortable', scale: 1.0 },
  compact:     { id: 'compact',     label: 'Compact',     scale: 0.82 },
};

export interface AccentStylePreset {
  id: AccentStyleId;
  label: string;
}

export const ACCENT_STYLE_PRESETS: Record<AccentStyleId, AccentStylePreset> = {
  solid:    { id: 'solid',    label: 'Solid' },
  gradient: { id: 'gradient', label: 'Gradient' },
};

/* ─────────────────────────────────────────────────────────────── */
/* Defaults                                                         */
/* ─────────────────────────────────────────────────────────────── */

export const DEFAULT_CONFIG: ThemeConfig = {
  accent: 'indigo',
  surface: 'cloud',
  shape: 'standard',
  type: 'dilly',
  density: 'comfortable',
  accentStyle: 'solid',
  autoDark: true,
};

/* ─────────────────────────────────────────────────────────────── */
/* Resolved theme - what components actually consume                */
/* ─────────────────────────────────────────────────────────────── */

export interface ResolvedTheme {
  config: ThemeConfig;
  systemIsDark: boolean;
  /** Accent color in hex. */
  accent: string;
  /** Translucent tint of accent (~10% alpha) for soft fills. */
  accentSoft: string;
  /** Slightly darker accent border (~30% alpha). */
  accentBorder: string;
  /** Resolved surface palette (respects autoDark). */
  surface: SurfacePreset;
  /** Active shape scale. */
  shape: ShapePreset;
  /** Active typography. */
  type: TypePreset;
  /** Active density multiplier. */
  density: number;
  /** Gradient stops when accentStyle === 'gradient', else null. */
  gradient: [string, string] | null;
}

function hexToAlpha(hex: string, alpha: number): string {
  // Accept #RRGGBB or #RGB. Produce rgba(...). Robust on malformed input.
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex);
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number = 0.15): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return hex;
  const h = m[1];
  const r = Math.max(0, Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount))));
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Relative luminance of a hex color (WCAG formula). Returns 0–1. */
function relativeLuminance(hex: string): number {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(m[1].slice(0, 2), 16));
  const g = toLinear(parseInt(m[1].slice(2, 4), 16));
  const b = toLinear(parseInt(m[1].slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function resolveTheme(config: ThemeConfig, systemIsDark: boolean): ResolvedTheme {
  const shouldForceDark = config.autoDark && systemIsDark;
  let surfaceId: SurfaceId;
  if (shouldForceDark) {
    // Use the user's preferred dark surface, defaulting to midnight.
    const preferred = config.preferredDark ?? 'midnight';
    surfaceId = SURFACE_PRESETS[preferred]?.dark ? preferred : 'midnight';
  } else {
    surfaceId = config.surface;
  }
  const surface = SURFACE_PRESETS[surfaceId];

  // Resolve the accent. When the surface is dark and the chosen accent
  // is very dark (luminance < 0.05 - covers graphite, navy, and any
  // near-black the user might have picked), use the preset's darkColor
  // override. Previously this fell back to '#FFFFFF', which made any
  // button using backgroundColor:accent + white text invisible
  // (white background + white text = nothing visible).
  const rawAccentPreset = ACCENT_PRESETS.find(a => a.id === config.accent) || ACCENT_PRESETS[0];
  const rawAccent = rawAccentPreset.color;
  const accent = (surface.dark && relativeLuminance(rawAccent) < 0.05)
    ? (rawAccentPreset.darkColor ?? '#A0A8B8')
    : rawAccent;

  // Flip the global `colors` Proxy to dark when the resolved surface
  // is dark. Every file that reads `colors.t1` / `colors.bg` will now
  // read from the dark palette without needing per-screen theme wiring.
  // This is the one side-effect in resolveTheme - kept here so the
  // switch happens in the same frame as the theme change, avoiding a
  // flash of the wrong palette.
  setColorsDarkMode(!!surface.dark);

  return {
    config,
    systemIsDark,
    accent,
    accentSoft: hexToAlpha(accent, 0.10),
    accentBorder: hexToAlpha(accent, 0.30),
    surface,
    shape: SHAPE_PRESETS[config.shape],
    type: TYPE_PRESETS[config.type],
    density: DENSITY_PRESETS[config.density].scale,
    gradient: config.accentStyle === 'gradient'
      ? [accent, darken(accent, 0.18)]
      : null,
  };
}

/* ─────────────────────────────────────────────────────────────── */
/* Pub/sub                                                          */
/* ─────────────────────────────────────────────────────────────── */

type Listener = (cfg: ThemeConfig) => void;
const _listeners = new Set<Listener>();
let _config: ThemeConfig = { ...DEFAULT_CONFIG };
let _hydrated = false;

async function _hydrate() {
  if (_hydrated) return;
  _hydrated = true;
  // 1. Local cache first - but only if it's tagged to the currently
  // authed user. Previously we applied the last stored theme blindly,
  // which meant user A's theme would flash to user B on sign-in. Now
  // we compare the stored email tag against the token's email.
  try {
    const [raw, storedUser] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(STORAGE_USER_KEY),
    ]);
    let currentEmail: string | null = null;
    try {
      const { getCurrentUserEmail } = await import('../lib/auth');
      currentEmail = await getCurrentUserEmail();
    } catch {}
    const canUseLocal = !!raw && (
      !storedUser || !currentEmail || storedUser.toLowerCase() === currentEmail
    );
    if (canUseLocal && raw) {
      const parsed = JSON.parse(raw);
      _config = { ...DEFAULT_CONFIG, ...parsed };
      _listeners.forEach(l => l(_config));
    }
  } catch {}
  // 2. Server profile - authoritative across devices. If the user
  // signs in on a new device, this is how their theme follows them.
  // Fire-and-forget, swallow any auth/network error so no-auth boot
  // doesn't break anything.
  try {
    const { dilly } = await import('../lib/dilly');
    const profile: any = await dilly.get('/profile');
    // Cache slim profile signals for client-side splash greeting rotation.
    try {
      const { cacheProfileSlim } = await import('../lib/profileCache');
      cacheProfileSlim(profile).catch(() => {});
    } catch {}
    const serverTheme = profile?.theme;
    if (serverTheme && typeof serverTheme === 'object') {
      const merged = { ...DEFAULT_CONFIG, ..._config, ...serverTheme };
      // Only apply if it's genuinely different from what we already have.
      if (JSON.stringify(merged) !== JSON.stringify(_config)) {
        _config = merged;
        _listeners.forEach(l => l(_config));
        try {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
          const em = (profile?.email || '').toLowerCase();
          if (em) await AsyncStorage.setItem(STORAGE_USER_KEY, em);
        } catch {}
      }
    }
  } catch {}
}

/** Push the current theme to the user's profile on the backend, so
 * it follows them to any device where they sign in. Fire-and-forget;
 * failures here don't rollback the local change. */
async function _persistToBackend(config: ThemeConfig) {
  try {
    const { dilly } = await import('../lib/dilly');
    await dilly.fetch('/profile', {
      method: 'PATCH',
      body: JSON.stringify({ theme: config }),
    });
  } catch {}
}

/** Patch any subset of the theme config. Persists + broadcasts. */
export async function patchTheme(patch: Partial<ThemeConfig>) {
  _config = { ..._config, ...patch };
  _listeners.forEach(l => l(_config));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
    // Tag the stored theme with the current user's email so next
    // sign-in can match-or-discard without flashing default first.
    try {
      const { getCurrentUserEmail } = await import('../lib/auth');
      const em = await getCurrentUserEmail();
      if (em) await AsyncStorage.setItem(STORAGE_USER_KEY, em);
    } catch {}
  } catch {}
  // Don't await - let the UI update instantly, PATCH happens in the
  // background. The server copy is eventual; AsyncStorage is the hot path.
  _persistToBackend(_config);
}

/** Clear cached theme - call on sign-out so the next account on this
 * device hydrates from their own profile, not the previous user's.
 *
 * Important: we KEEP the AsyncStorage copy. The stored theme is tagged
 * to the user email that wrote it (STORAGE_USER_KEY). Next sign-in
 * checks that tag - if it matches, the theme restores instantly; if
 * it doesn't, _hydrate waits for server and overwrites. This is what
 * lets a returning user see their customized theme immediately on
 * sign-in without flashing the default first. */
export async function clearThemeCache() {
  _hydrated = false;
  _config = { ...DEFAULT_CONFIG };
  _listeners.forEach(l => l(_config));
  // Intentionally do NOT remove STORAGE_KEY / STORAGE_USER_KEY here.
}

/** Legacy shim - kept so the simple swatch picker in Settings still works. */
export async function setTheme(accentId: string) {
  await patchTheme({ accent: accentId as AccentId });
}

/** Reset everything to brand defaults. */
export async function resetTheme() {
  await patchTheme({ ...DEFAULT_CONFIG });
}

/** Pick a tasteful-but-random preset on each axis. */
export async function surpriseTheme() {
  const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  await patchTheme({
    accent: rand(ACCENT_PRESETS).id,
    surface: rand(Object.values(SURFACE_PRESETS)).id,
    shape: rand(Object.values(SHAPE_PRESETS)).id,
    type: rand(Object.values(TYPE_PRESETS)).id,
    accentStyle: rand(Object.values(ACCENT_STYLE_PRESETS)).id,
    // density stays where the user put it - too jarring to flip
  });
}

/* ─────────────────────────────────────────────────────────────── */
/* Hooks                                                            */
/* ─────────────────────────────────────────────────────────────── */

/** Low-level config hook. Most screens should use useResolvedTheme. */
export function useThemeConfig(): ThemeConfig {
  const [cfg, setCfg] = useState<ThemeConfig>(_config);
  useEffect(() => {
    _hydrate();
    const listener: Listener = (c) => setCfg(c);
    _listeners.add(listener);
    setCfg(_config);
    return () => { _listeners.delete(listener); };
  }, []);
  return cfg;
}

/**
 * Resolved theme: config + system color scheme → colors, radii, font,
 * density. React to system dark-mode toggles too.
 */
export function useResolvedTheme(): ResolvedTheme {
  const cfg = useThemeConfig();
  const systemScheme = useColorScheme();
  const systemIsDark = systemScheme === 'dark';
  return resolveTheme(cfg, systemIsDark);
}

/** Convenience wrappers - common shortcuts. */
export function useAccent(): string {
  return useResolvedTheme().accent;
}

/* ─────────────────────────────────────────────────────────────── */
/* Legacy API - preserves existing Settings swatch picker behavior. */
/* ─────────────────────────────────────────────────────────────── */

export interface Theme {
  id: string;
  label: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  fingerprint: string;
}

export const THEMES: Theme[] = ACCENT_PRESETS.map(p => ({
  id: p.id,
  label: p.label,
  accent: p.color,
  accentSoft: hexToAlpha(p.color, 0.10),
  accentBorder: hexToAlpha(p.color, 0.30),
  fingerprint: '●',
}));

/** Back-compat for the old useTheme() that returned {accent, …}. */
export function useTheme(): Theme {
  const resolved = useResolvedTheme();
  return {
    id: resolved.config.accent,
    label: ACCENT_PRESETS.find(a => a.id === resolved.config.accent)?.label || 'Dilly',
    accent: resolved.accent,
    accentSoft: resolved.accentSoft,
    accentBorder: resolved.accentBorder,
    fingerprint: '●',
  };
}
