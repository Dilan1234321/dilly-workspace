/**
 * Dilly Global Score Color System
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all score-based color coding across the app.
 * Apply these functions to every score display: job cards, leaderboard,
 * career genome, resume editor, profile, and the fit panel.
 *
 * Breakpoints:
 *   ≥ 80  →  Strong    (#34C759 green)
 *   60–79 →  Developing (#FF9F0A amber)
 *   < 60  →  Gap        (#FF453A red)
 */

/** Returns the foreground color hex for a given score. */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#34C759';
  if (score >= 60) return '#FF9F0A';
  return '#FF453A';
}

/** Returns a one-word label for accessibility (never use color as sole indicator). */
export function getScoreLabel(score: number): 'Strong' | 'Developing' | 'Gap' {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Developing';
  return 'Gap';
}

/** Returns a subtle background tint matching the score range. */
export function getScoreBg(score: number): string {
  if (score >= 80) return 'rgba(52,199,89,0.08)';
  if (score >= 60) return 'rgba(255,159,10,0.08)';
  return 'rgba(255,69,58,0.08)';
}

/** Returns a border color matching the score range. */
export function getScoreBorder(score: number): string {
  if (score >= 80) return 'rgba(52,199,89,0.2)';
  if (score >= 60) return 'rgba(255,159,10,0.2)';
  return 'rgba(255,69,58,0.2)';
}

/** Returns a very faint background suitable for card-level tinting. */
export function getScoreCardBg(score: number): string {
  if (score >= 80) return 'rgba(52,199,89,0.04)';
  if (score >= 60) return 'rgba(255,159,10,0.04)';
  return 'rgba(255,69,58,0.04)';
}
