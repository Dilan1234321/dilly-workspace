import { useState, useCallback, useEffect } from 'react';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CelebrationOverlay, MilestoneType } from '../components/CelebrationOverlay';

// ── Storage key ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dilly_celebrated_milestones';

// ── Module-level trigger ───────────────────────────────────────────────────────
// Any code anywhere (promo code success handler, profile transition
// detector, Stripe-success handler) can call triggerCelebration() and
// any mounted CelebrationPortal will show the overlay. Subscribers add
// themselves to the listener set on mount and remove on unmount. If no
// one is mounted the call is a no-op — that's fine, milestones are
// persisted to AsyncStorage and will fire on the next Settings mount.
type Listener = (m: MilestoneType) => void;
const _listeners = new Set<Listener>();

/** Fire a celebration overlay anywhere in the app. Idempotent per
 * milestone (persisted to AsyncStorage) so you can call it on every
 * boot without re-showing the same celebration. */
export function triggerCelebration(milestone: MilestoneType) {
  _listeners.forEach(cb => {
    try { cb(milestone); } catch {}
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export default function useCelebration() {
  const [activeMilestone, setActiveMilestone] = useState<MilestoneType | null>(null);

  /**
   * Show a celebration overlay for the given milestone.
   *
   * Re-fire policy:
   *  - Subscription unlocks (unlocked-dilly, unlocked-pro) ALWAYS fire,
   *    every time the user converts. A user who cancels and later
   *    resubscribes (or redeems a paid promo) should feel the moment
   *    again. Muting these after first-ever view was the bug.
   *  - True one-time achievement milestones (first-audit, cleared-bar,
   *    top-25, top-10, score-jump, applied-job) remain one-shot. Those
   *    reward progression that can only happen once.
   */
  const celebrate = useCallback(async (milestone: MilestoneType) => {
    // Subscription unlocks always fire — conversion is the moment the
    // user pays for Dilly, and we want to celebrate it every single
    // time they convert (first signup, resubscribe, promo-code upgrade).
    const alwaysFire = milestone === 'unlocked-dilly' || milestone === 'unlocked-pro';
    if (alwaysFire) {
      setActiveMilestone(milestone);
      return;
    }
    try {
      const raw  = await AsyncStorage.getItem(STORAGE_KEY);
      const seen: MilestoneType[] = raw ? JSON.parse(raw) : [];
      if (seen.includes(milestone)) return;
      setActiveMilestone(milestone);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...seen, milestone]));
    } catch {
      // Storage failure — show anyway so the student doesn't miss their moment
      setActiveMilestone(milestone);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setActiveMilestone(null);
  }, []);

  // Subscribe to module-level triggers so triggerCelebration() from
  // anywhere in the app shows the overlay here.
  useEffect(() => {
    const cb: Listener = (m) => celebrate(m);
    _listeners.add(cb);
    return () => { _listeners.delete(cb); };
  }, [celebrate]);

  /**
   * CelebrationPortal — render this component in the screen's root View JSX.
   * It mounts the CelebrationOverlay when a milestone is active.
   * Wrapped in useCallback so its identity only changes when activeMilestone
   * changes, preventing unnecessary remounts of child components.
   */
  const CelebrationPortal = useCallback(
    () =>
      React.createElement(CelebrationOverlay, {
        milestone: activeMilestone,
        onDismiss: handleDismiss,
      }),
    [activeMilestone, handleDismiss],
  );

  return { celebrate, CelebrationPortal };
}

export type { MilestoneType };
