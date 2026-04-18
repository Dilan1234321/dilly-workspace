/**
 * useTheme — user-selectable accent color.
 *
 * Beta testers asked: "can I make it pink / customize the look?" This
 * hook is the foundation. Pick an accent from THEMES, the choice
 * persists to AsyncStorage, and surfaces that opt in get repainted.
 *
 * Rollout strategy:
 *   v1: hero accents, primary CTAs, and brand chips on the highest-
 *       traffic screens read theme via useAccent(). Everything else
 *       keeps the default indigo token. This is intentional — we want
 *       the accent to feel like a personal touch on hero surfaces,
 *       not paint every pixel in the app.
 *   v2+: more surfaces subscribe over time.
 *
 * Default theme matches the brand (Indigo #2B3A8E).
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'dilly_theme_accent_v1';

export interface Theme {
  id: string;
  label: string;
  /** Primary brand accent — used for CTAs, hero icons, active chips. */
  accent: string;
  /** Lighter translucent accent — used for backgrounds / chip fills. */
  accentSoft: string;
  /** Border accent — used for hover / selected outlines. */
  accentBorder: string;
  /** Emoji fingerprint so the theme picker looks like a picker, not a swatch grid. */
  fingerprint: string;
}

export const THEMES: Theme[] = [
  {
    id: 'indigo',
    label: 'Dilly Indigo',
    accent: '#2B3A8E',
    accentSoft: 'rgba(43,58,142,0.10)',
    accentBorder: 'rgba(43,58,142,0.30)',
    fingerprint: '●',
  },
  {
    id: 'rose',
    label: 'Rose',
    accent: '#E11D74',
    accentSoft: 'rgba(225,29,116,0.10)',
    accentBorder: 'rgba(225,29,116,0.30)',
    fingerprint: '●',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    accent: '#0E9F6E',
    accentSoft: 'rgba(14,159,110,0.10)',
    accentBorder: 'rgba(14,159,110,0.30)',
    fingerprint: '●',
  },
  {
    id: 'gold',
    label: 'Amber',
    accent: '#B45309',
    accentSoft: 'rgba(180,83,9,0.10)',
    accentBorder: 'rgba(180,83,9,0.30)',
    fingerprint: '●',
  },
  {
    id: 'violet',
    label: 'Violet',
    accent: '#7C3AED',
    accentSoft: 'rgba(124,58,237,0.10)',
    accentBorder: 'rgba(124,58,237,0.30)',
    fingerprint: '●',
  },
  {
    id: 'slate',
    label: 'Graphite',
    accent: '#1F2937',
    accentSoft: 'rgba(31,41,55,0.10)',
    accentBorder: 'rgba(31,41,55,0.30)',
    fingerprint: '●',
  },
];

const DEFAULT_THEME = THEMES[0];

/* Module-level pub/sub so theme changes propagate without React
   Context (matches the pattern used by useDillyOverlay, usePaywall). */
type Listener = (t: Theme) => void;
const _listeners = new Set<Listener>();
let _current: Theme = DEFAULT_THEME;
let _hydrated = false;

async function _hydrate() {
  if (_hydrated) return;
  _hydrated = true;
  try {
    const id = await AsyncStorage.getItem(STORAGE_KEY);
    if (!id) return;
    const found = THEMES.find(t => t.id === id);
    if (found) {
      _current = found;
      _listeners.forEach(l => l(_current));
    }
  } catch {}
}

/** Switch the active theme and persist. */
export async function setTheme(id: string) {
  const found = THEMES.find(t => t.id === id);
  if (!found) return;
  _current = found;
  _listeners.forEach(l => l(_current));
  try { await AsyncStorage.setItem(STORAGE_KEY, id); } catch {}
}

/** Read the current theme. Triggers re-render when it changes. */
export function useTheme(): Theme {
  const [theme, setLocal] = useState<Theme>(_current);
  useEffect(() => {
    _hydrate();
    const listener: Listener = (t) => setLocal(t);
    _listeners.add(listener);
    // Sync in case hydration finished between render and effect.
    setLocal(_current);
    return () => { _listeners.delete(listener); };
  }, []);
  return theme;
}

/** Convenience: just the accent color. */
export function useAccent(): string {
  return useTheme().accent;
}
