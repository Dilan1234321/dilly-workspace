/**
 * useRecentUpgrade - returns true for the first 24 hours after a
 * successful upgrade to a paid tier.
 *
 * Home screens use this to render a subtle "Welcome to Dilly" line
 * under the greeting that disappears automatically on day two. The
 * user never sees a dismiss button (that would make it feel like an
 * ad); it simply fades out of their life.
 *
 * Design intent:
 *   - Reinforces that the upgrade DID something visible, without
 *     taking up permanent real estate.
 *   - Makes the first day of being a paid user feel distinct from
 *     day seven. Both are the same app; day one feels warmer.
 *   - Zero backend cost. Pure client-side timestamp check.
 *
 * Storage key is set by useSubscription when it detects a
 * starter → dilly/pro transition. See hooks/useSubscription.tsx.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UPGRADED_AT_KEY = 'dilly_upgraded_at_v1';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useRecentUpgrade(): { isRecent: boolean; hoursLeft: number } {
  const [state, setState] = useState<{ isRecent: boolean; hoursLeft: number }>({
    isRecent: false,
    hoursLeft: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(UPGRADED_AT_KEY);
        if (!raw) return;
        const ts = parseInt(raw, 10);
        if (!Number.isFinite(ts)) return;
        const elapsed = Date.now() - ts;
        if (elapsed < 0 || elapsed >= WINDOW_MS) return;
        if (!cancelled) {
          setState({
            isRecent: true,
            hoursLeft: Math.ceil((WINDOW_MS - elapsed) / (60 * 60 * 1000)),
          });
        }
      } catch {
        // No-op. AsyncStorage failures shouldn't break home rendering.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

export default useRecentUpgrade;
