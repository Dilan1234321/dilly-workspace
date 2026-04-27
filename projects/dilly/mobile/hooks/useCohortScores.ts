/**
 * useCohortScores - fetch + manage per-cohort Claude scores.
 *
 * Reads `cohort_scores` from the profile, parses into a sorted array,
 * and exposes the active cohort's scores. The switcher index persists
 * across re-renders but resets when cohorts change.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { dilly } from '../lib/dilly';
import { parseCohortScores, type CohortScore } from '../lib/cohorts';

interface UseCohortScoresReturn {
  /** All cohorts sorted by level (primary/major first) */
  cohorts: CohortScore[];
  /** Currently selected index */
  activeIndex: number;
  /** Switch to a different cohort */
  setActiveIndex: (i: number) => void;
  /** Scores for the currently active cohort (null if no cohorts) */
  active: CohortScore | null;
  /** Loading state */
  loading: boolean;
  /** Re-fetch from server */
  refresh: () => Promise<void>;
}

export function useCohortScores(): UseCohortScoresReturn {
  const [raw, setRaw] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const fetchScores = useCallback(async () => {
    try {
      const profile = await dilly.get<any>('/profile');
      const cs = profile?.cohort_scores ?? null;
      setRaw(cs);
    } catch {
      // Keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const cohorts = useMemo(() => parseCohortScores(raw), [raw]);

  // Clamp activeIndex if cohorts shrink
  const clampedIndex = cohorts.length > 0 ? Math.min(activeIndex, cohorts.length - 1) : 0;

  const active = cohorts.length > 0 ? cohorts[clampedIndex] : null;

  return {
    cohorts,
    activeIndex: clampedIndex,
    setActiveIndex,
    active,
    loading,
    refresh: fetchScores,
  };
}
