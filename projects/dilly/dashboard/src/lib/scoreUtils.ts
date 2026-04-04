/**
 * Score-related utilities: color bands, gap analysis, trajectory projections, milestones.
 */

import type { AuditV2, DimensionKey } from "@/types/dilly";
import { getScoreBand } from "@dilly/api";
import { DIMENSIONS } from "./constants";

/**
 * @deprecated Use `getScoreBand(score)` from `@dilly/api` instead.
 * This wrapper is kept for backward-compat with existing dashboard code
 * and delegates to the shared score system.
 */
export function scoreColor(score: number): { color: string; bg: string; label: string } {
  const { color, bg, label } = getScoreBand(score);
  return { color, bg, label };
}

/**
 * Returns dimensions below Top 25% (by peer percentile). Source of truth is percentile: if a dimension
 * is in this list, the user is below Top 25% for it.
 *
 * `pointsToTop25` blends score headroom (vs ~70) with peer-rank distance so we never show "~0 pts"
 * while still below Top 25% (high raw score but weak vs peers). UI should still treat this as an
 * estimate, not a guarantee.
 */
export function gapToNextLevel(audit: AuditV2 | null | undefined): { key: DimensionKey; label: string; topPct: number; pointsToTop25?: number }[] {
  if (!audit?.peer_percentiles) return [];
  const pct = audit.peer_percentiles;
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const result: { key: DimensionKey; label: string; topPct: number; pointsToTop25?: number }[] = [];
  for (const k of ["smart", "grit", "build"] as DimensionKey[]) {
    const percentile = pct[k] ?? 50;
    const topPct = Math.max(1, 100 - percentile);
    if (topPct > 25) {
      const label = DIMENSIONS.find((d) => d.key === k)?.label ?? k;
      const score = scores[k] ?? 0;
      const scoreGap = Math.ceil(70 - score);
      // Peer-rank gap: rough points-equivalent so copy stays consistent when score is already "high"
      const rankGap = Math.ceil((topPct - 25) / 2.5);
      const pointsToTop25 = Math.max(1, scoreGap, rankGap);
      result.push({ key: k, label, topPct, pointsToTop25 });
    }
  }
  return result.sort((a, b) => a.topPct - b.topPct);
}

/** Heuristic: projected scores if user completes top 3 recommendations. */
export function computeScoreTrajectory(audit: AuditV2 | null | undefined): { smart: number; grit: number; build: number; final: number } | null {
  if (!audit?.scores || !audit.recommendations?.length) return null;
  const s = audit.scores;
  const base = { smart: s.smart ?? 0, grit: s.grit ?? 0, build: s.build ?? 0 };
  const deltas = { smart: 0, grit: 0, build: 0 };
  const recs = audit.recommendations.slice(0, 3);
  for (const r of recs) {
    const type = (r.type || "generic") as string;
    const target = ((r.score_target || "").toLowerCase().replace(/\s+/g, "_") || "build") as "smart" | "grit" | "build";
    const key = target === "smart" || target === "grit" || target === "build" ? target : "build";
    if (type === "line_edit") deltas[key] += 3;
    else if (type === "action") deltas[key] += 2;
    else deltas[key] += 4;
  }
  const smart = Math.min(100, Math.round(base.smart + deltas.smart));
  const grit = Math.min(100, Math.round(base.grit + deltas.grit));
  const build = Math.min(100, Math.round(base.build + deltas.build));
  const final = Math.round((smart + grit + build) / 3);
  return { smart, grit, build, final };
}

/** Which score milestones (50, 70, 85) were crossed from prev to current. */
export function scoresCrossedMilestones(
  current: { scores?: { smart: number; grit: number; build: number } } | null | undefined,
  prev: { scores?: { smart: number; grit: number; build: number } } | null | undefined
): number[] {
  const curScores = current?.scores;
  const prevScores = prev?.scores;
  if (!curScores || !prevScores) return [];
  const milestones = [50, 70, 85];
  const crossed: number[] = [];
  for (const m of milestones) {
    const anyCrossed = (["smart", "grit", "build"] as const).some((k) => {
      const c = curScores[k] ?? 0;
      const p = prevScores[k] ?? 0;
      return p < m && c >= m;
    });
    if (anyCrossed) crossed.push(m);
  }
  return crossed;
}

/**
 * Progress bar fill (0–100) toward Top 25% **by peer rank** (Top X% now → goal Top 25%).
 * Do not use raw score / 70 here — that contradicts "Top X% now" when score is high but rank is not.
 */
export function progressPercentTowardTop25Rank(topPct: number): number {
  const t = Math.max(1, topPct);
  if (t <= 25) return 100;
  return Math.min(100, Math.round((25 / t) * 100));
}
