/**
 * useAppMode — React hook exposing the user's current AppMode.
 *
 * Reads the profile once on mount + refetches on focus. Result feeds
 * the tab bar (_layout.tsx) and any home screen that switches layout
 * per mode. Pure derivation — no writes happen here.
 *
 * Returns 'seeker' as a safe default while the profile is loading so
 * the tab bar always has something to render.
 */

import { useEffect, useState } from 'react';
import { dilly } from '../lib/dilly';
import { getAppMode, type AppMode } from '../lib/appMode';

export function useAppMode(): AppMode {
  const [mode, setMode] = useState<AppMode>('seeker');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await dilly.get('/profile');
        if (!cancelled && profile) {
          setMode(getAppMode(profile as any));
        }
      } catch {
        // Keep 'seeker' as the fallback; never crash the layout over
        // a profile fetch hiccup.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return mode;
}
