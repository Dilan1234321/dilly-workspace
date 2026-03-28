import { useState, useCallback } from 'react';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CelebrationOverlay, MilestoneType } from '../components/CelebrationOverlay';

// ── Storage key ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dilly_celebrated_milestones';

// ── Hook ───────────────────────────────────────────────────────────────────────

export default function useCelebration() {
  const [activeMilestone, setActiveMilestone] = useState<MilestoneType | null>(null);

  /**
   * Show a celebration overlay for the given milestone.
   * Checks AsyncStorage first — if this milestone was already shown ever,
   * does nothing. Otherwise shows the overlay and persists the milestone.
   */
  const celebrate = useCallback(async (milestone: MilestoneType) => {
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
