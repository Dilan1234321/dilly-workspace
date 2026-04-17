/**
 * useAppMode — React hook exposing the user's current AppMode.
 *
 * Reads the profile once on mount + refetches on focus. Result feeds
 * the tab bar (_layout.tsx) and any home screen that switches layout
 * per mode.
 *
 * Caching:
 *   - Module-level variable `_memMode` holds the last resolved mode
 *     for the life of the JS runtime — so navigating between tabs
 *     (which remounts consumers) never flashes back to the default.
 *   - AsyncStorage backs that up across cold starts. We hydrate from
 *     it on first mount so a relaunch for a holder never shows
 *     seeker UI for the beat it takes to refetch the profile.
 *
 * Before this fix, each remount defaulted to 'seeker' and re-awaited
 * /profile, which visibly flipped holder screens into the seeker
 * variant whenever the tab was revisited.
 */

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../lib/dilly';
import { getAppMode, type AppMode } from '../lib/appMode';

const STORAGE_KEY = 'dilly_app_mode_cache_v1';
let _memMode: AppMode | null = null;

function isValidMode(v: unknown): v is AppMode {
  return v === 'holder' || v === 'seeker' || v === 'student';
}

export function useAppMode(): AppMode {
  // Seed synchronously from the in-memory cache so re-renders after
  // the first profile fetch never flash back to the default.
  const [mode, setMode] = useState<AppMode>(_memMode ?? 'seeker');

  useEffect(() => {
    let cancelled = false;

    // Hydrate from AsyncStorage if the in-memory cache is empty
    // (first mount after cold start). This is best-effort — if it
    // fails we just wait for /profile.
    if (_memMode == null) {
      (async () => {
        try {
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (cancelled) return;
          if (isValidMode(stored)) {
            _memMode = stored;
            setMode(stored);
          }
        } catch {}
      })();
    }

    // Authoritative read from the server — always runs. Updates both
    // caches so later mounts start from the correct value.
    (async () => {
      try {
        const profile = await dilly.get('/profile');
        if (cancelled || !profile) return;
        const resolved = getAppMode(profile as any);
        _memMode = resolved;
        setMode(resolved);
        try { await AsyncStorage.setItem(STORAGE_KEY, resolved); } catch {}
      } catch {
        // Keep whatever we already have; never crash the layout over
        // a profile fetch hiccup.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return mode;
}

/**
 * Clear the cached mode. Call after sign-out so the next user doesn't
 * inherit the previous user's mode on their first mount.
 */
export async function clearAppModeCache(): Promise<void> {
  _memMode = null;
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}
