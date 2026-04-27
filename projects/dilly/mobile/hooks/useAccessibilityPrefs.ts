/**
 * useAccessibilityPrefs - one place to read iOS accessibility prefs
 * (Bold Text + Reduce Motion + Reduce Transparency) and re-render
 * subscribers when the user toggles them in iOS Settings.
 *
 * Why this exists: native apps respect these prefs everywhere; without
 * them Dilly immediately reads as a third-party app. Components that
 * care can pull `boldText` and bump font weights, or `reduceMotion`
 * and skip animations.
 *
 * AccessibilityInfo emits change events, so the values stay in sync
 * across the app without a manual refresh.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export interface AccessibilityPrefs {
  boldText: boolean;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  screenReaderEnabled: boolean;
}

const DEFAULT: AccessibilityPrefs = {
  boldText: false,
  reduceMotion: false,
  reduceTransparency: false,
  screenReaderEnabled: false,
};

export function useAccessibilityPrefs(): AccessibilityPrefs {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const [bold, motion, trans, sr] = await Promise.all([
          AccessibilityInfo.isBoldTextEnabled?.() ?? Promise.resolve(false),
          AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false),
          AccessibilityInfo.isReduceTransparencyEnabled?.() ?? Promise.resolve(false),
          AccessibilityInfo.isScreenReaderEnabled?.() ?? Promise.resolve(false),
        ]);
        if (cancelled) return;
        setPrefs({
          boldText: !!bold,
          reduceMotion: !!motion,
          reduceTransparency: !!trans,
          screenReaderEnabled: !!sr,
        });
      } catch {}
    };
    read();

    // Subscribe to change events so the hook re-renders when the user
    // toggles a preference in iOS Settings without leaving Dilly.
    const subs: Array<{ remove?: () => void }> = [];
    try {
      subs.push(AccessibilityInfo.addEventListener('boldTextChanged',         (v) => setPrefs(p => ({ ...p, boldText: !!v }))));
      subs.push(AccessibilityInfo.addEventListener('reduceMotionChanged',     (v) => setPrefs(p => ({ ...p, reduceMotion: !!v }))));
      subs.push(AccessibilityInfo.addEventListener('reduceTransparencyChanged', (v) => setPrefs(p => ({ ...p, reduceTransparency: !!v }))));
      subs.push(AccessibilityInfo.addEventListener('screenReaderChanged',     (v) => setPrefs(p => ({ ...p, screenReaderEnabled: !!v }))));
    } catch {}

    return () => {
      cancelled = true;
      for (const s of subs) { try { s?.remove?.(); } catch {} }
    };
  }, []);

  return prefs;
}

/** Bump a font weight by one notch when the user has Bold Text on.
 *  '600' becomes '700', '700' becomes '800', '800' stays at '900', etc.
 *  Pass-through when boldText is false. */
export function boldenWeight(weight: string | number | undefined, boldText: boolean): any {
  if (!boldText || !weight) return weight;
  const map: Record<string, string> = {
    '300': '500',
    '400': '600',
    '500': '700',
    '600': '800',
    '700': '800',
    '800': '900',
    'normal': '600',
    'bold': '900',
  };
  const k = String(weight);
  return map[k] || weight;
}
