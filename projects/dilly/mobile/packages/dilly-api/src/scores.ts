/**
 * @dilly/api — Score color system
 *
 * Single source of truth for score-based colors, labels, and thresholds.
 * Used by desktop, mobile, and dashboard.
 *
 * Breakpoints:
 *   >= 80  →  Strong    (green)
 *   60–79  →  Developing (amber)
 *   < 60   →  Gap        (red)
 */

export interface ScoreBand {
  color: string;
  bg: string;
  border: string;
  cardBg: string;
  label: "Strong" | "Developing" | "Gap";
}

const STRONG: ScoreBand = {
  color: "#34C759",
  bg: "rgba(52,199,89,0.08)",
  border: "rgba(52,199,89,0.2)",
  cardBg: "rgba(52,199,89,0.04)",
  label: "Strong",
};

const DEVELOPING: ScoreBand = {
  color: "#FF9F0A",
  bg: "rgba(255,159,10,0.08)",
  border: "rgba(255,159,10,0.2)",
  cardBg: "rgba(255,159,10,0.04)",
  label: "Developing",
};

const GAP: ScoreBand = {
  color: "#FF453A",
  bg: "rgba(255,69,58,0.08)",
  border: "rgba(255,69,58,0.2)",
  cardBg: "rgba(255,69,58,0.04)",
  label: "Gap",
};

export function getScoreBand(score: number): ScoreBand {
  if (score >= 80) return STRONG;
  if (score >= 60) return DEVELOPING;
  return GAP;
}

export function getScoreColor(score: number): string {
  return getScoreBand(score).color;
}

export function getScoreLabel(score: number): "Strong" | "Developing" | "Gap" {
  return getScoreBand(score).label;
}

export function getScoreBg(score: number): string {
  return getScoreBand(score).bg;
}

export function getScoreBorder(score: number): string {
  return getScoreBand(score).border;
}

/** Very faint background for card-level tinting (4% opacity). */
export function getScoreCardBg(score: number): string {
  return getScoreBand(score).cardBg;
}

/** Score milestone detection — returns a label if a threshold was crossed. */
export function getMilestone(prev: number, curr: number): string | null {
  const thresholds = [60, 70, 75, 80, 85, 90];
  for (const t of thresholds) {
    if (prev < t && curr >= t) return `Crossed ${t}`;
  }
  return null;
}

/** Dimensions metadata. */
export const DIMENSIONS = [
  { key: "smart" as const, label: "Smart", description: "Academic rigor and analytical depth" },
  { key: "grit" as const, label: "Grit", description: "Leadership, initiative, and persistence" },
  { key: "build" as const, label: "Build", description: "Tangible projects, portfolios, and output" },
] as const;
