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

// Pub/sub for mode changes. Every useAppMode hook subscribes on mount
// and re-renders whenever primeAppMode fires. Without this, Settings
// could update _memMode but already-mounted screens (tab bar, Home,
// Jobs) would keep rendering with the stale mode — which caused mid-
// session crashes when a screen tried to render a tab or view that
// only exists in the new mode.
const _modeListeners = new Set<(m: AppMode) => void>();

function _notifyModeChange(m: AppMode) {
  _modeListeners.forEach(cb => {
    try { cb(m); } catch {}
  });
}

function isValidMode(v: unknown): v is AppMode {
  return v === 'holder' || v === 'seeker' || v === 'student';
}

export function useAppMode(): AppMode {
  // Seed synchronously from the in-memory cache so re-renders after
  // the first profile fetch never flash back to the default.
  const [mode, setMode] = useState<AppMode>(_memMode ?? 'seeker');

  // Subscribe to primeAppMode pushes so ALL consumers re-render when
  // the mode flips — not just the one that initiated the switch.
  useEffect(() => {
    const cb = (m: AppMode) => setMode(m);
    _modeListeners.add(cb);
    return () => { _modeListeners.delete(cb); };
  }, []);

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
 * Push a freshly-resolved mode into the in-memory + AsyncStorage
 * cache. Settings calls this the moment the user flips the Career
 * Mode toggle so every other screen using useAppMode sees the new
 * mode on its next render — without waiting for its own /profile
 * fetch to come back. Without this, flipping in Settings only
 * changed the Settings screen's local state; the tab-bar and other
 * consumers kept the old mode until their next profile refetch.
 */
export async function primeAppMode(mode: AppMode): Promise<void> {
  _memMode = mode;
  try { await AsyncStorage.setItem(STORAGE_KEY, mode); } catch {}
  // Fan out to every mounted useAppMode — this is what makes the tab
  // bar and other screens actually flip to the new mode in real time
  // instead of waiting for their own /profile refetch on next focus.
  _notifyModeChange(mode);
}

/**
 * Clear the cached mode. Call after sign-out so the next user doesn't
 * inherit the previous user's mode on their first mount.
 */
export async function clearAppModeCache(): Promise<void> {
  _memMode = null;
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}
