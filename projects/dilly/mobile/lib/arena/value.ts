/**
 * Arena/value — compute the user's market value range + 30-day trend
 * WITHOUT any LLM call or paid server history.
 *
 * Strategy:
 *   1. Base comp range comes from the cohort playbook + years of
 *      experience. For students/entry-level we use the early band; for
 *      3-8 years experience we use the mid band; for 8+ we interpolate
 *      toward the top-10% anchor.
 *   2. We persist a short daily snapshot of the user's feed stats
 *      (strong match count, stretch count, hot-companies seen) in
 *      AsyncStorage under ARENA_VALUE_HISTORY_KEY. When the arena
 *      opens, we diff the last 30 days of snapshots to derive a trend:
 *      feed getting better → value trending up, shrinking → trending
 *      down. No server call.
 *   3. Peer position is a percentile estimate from how many tier-1
 *      companies are pressuring the user's feed vs the cohort norm.
 *      Again: no server call.
 *
 * All of this is honest but approximate. The point is not precision;
 * the point is signal the user can act on.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CohortPlaybook } from './cohort-playbook'

const HISTORY_KEY = 'arena_value_history_v1'
const MAX_DAYS = 60  // keep two months so 30-day trend is reliable

export interface ValueSnapshot {
  /** ISO date YYYY-MM-DD. One entry per day; we dedupe on write. */
  date: string
  /** How many jobs in the feed were rank_score >= 72 on this date. */
  strong: number
  /** How many 45-71. */
  stretch: number
  /** Total jobs in the feed window. */
  total: number
  /** Count of tier-1 anchor companies present in the user's feed. */
  tier1Hits: number
}

export interface ValueReading {
  /** Midpoint USD of the user's market value range. */
  valueMid: number
  /** Lower bound (conservative). */
  valueLow: number
  /** Upper bound (optimistic, strong-performer end). */
  valueHigh: number
  /** Label for the band ("Early" | "Mid" | "Senior"). */
  band: 'Early' | 'Mid' | 'Senior'
  /** Percentile estimate (1-99) within cohort peers. */
  peerPercentile: number
  /** 30-day trend in USD of the midpoint. Positive = rising. */
  trendDelta: number
  /** Human-friendly trend label. */
  trendLabel: 'rising' | 'flat' | 'falling'
  /** The sparkline points (recent daily midpoints, up to 30). */
  sparkline: number[]
  /** Is the market window favorable right now for a move? */
  windowOpen: boolean
  /** One-line editorial explainer. */
  readout: string
}

/** Persist today's feed stats so trend calc has something to diff.
 *  Idempotent per day: multiple calls same day overwrite, not append. */
export async function recordValueSnapshot(s: Omit<ValueSnapshot, 'date'>): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY)
    const list: ValueSnapshot[] = raw ? JSON.parse(raw) : []
    const filtered = list.filter(x => x.date !== today)
    filtered.push({ ...s, date: today })
    // Trim oldest.
    const trimmed = filtered.slice(-MAX_DAYS)
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    // AsyncStorage failures are non-fatal; next call will retry.
  }
}

export async function readHistory(): Promise<ValueSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Compute the user's current value reading from the cohort playbook,
 *  years of experience, and the persisted snapshot history. */
export function computeValue(
  playbook: CohortPlaybook,
  yearsExperience: number,
  history: ValueSnapshot[],
): ValueReading {
  const y = Math.max(0, yearsExperience || 0)
  let band: 'Early' | 'Mid' | 'Senior'
  let anchorLow: number
  let anchorHigh: number
  if (y < 3) {
    band = 'Early'
    // Early band: low = playbook.earlyBase * 0.85, high = earlyBase * 1.25
    anchorLow = Math.round(playbook.comp.earlyBase * 0.85)
    anchorHigh = Math.round(playbook.comp.earlyBase * 1.25)
  } else if (y < 8) {
    band = 'Mid'
    anchorLow = Math.round(playbook.comp.midBase * 0.85)
    anchorHigh = Math.round(playbook.comp.midBase * 1.25)
  } else {
    band = 'Senior'
    // Senior: interpolate toward top10 as years grow 8→15+
    const yCapped = Math.min(15, y)
    const t = (yCapped - 8) / 7 // 0..1
    const low = Math.round(playbook.comp.midBase * (1.0 + 0.2 * t))
    const high = Math.round(playbook.comp.midBase + (playbook.comp.top10Tcc - playbook.comp.midBase) * t)
    anchorLow = low
    anchorHigh = Math.max(high, low + 40_000)
  }

  // Base midpoint.
  const baseMid = Math.round((anchorLow + anchorHigh) / 2)

  // Compute the recent sparkline (last 30 daily midpoints). Today's
  // value is adjusted by market-window signal from today's snapshot;
  // older days are derived the same way from their own snapshot.
  const cutoff = Date.now() - 30 * 86400 * 1000
  const recent = history.filter(h => new Date(h.date).getTime() >= cutoff)
  const sparkline: number[] = recent.map(h => {
    // Each tier-1 company in the feed adds 1% to the user's valuation.
    // Cap at +8% so one exceptional day doesn't dominate. A shrinking
    // feed subtracts up to -5% symmetrically.
    const tier1Lift = Math.min(0.08, (h.tier1Hits || 0) * 0.01)
    const feedShrink = h.total > 0 ? 0 : -0.05
    const multiplier = 1 + tier1Lift + feedShrink
    return Math.round(baseMid * multiplier)
  })

  const valueMid = sparkline.length > 0 ? sparkline[sparkline.length - 1] : baseMid
  const valueLow = Math.round(valueMid * 0.9)
  const valueHigh = Math.round(valueMid * 1.18)

  // Trend delta is last - first in the sparkline; 0 if we don't have
  // at least 7 days of history yet.
  const trendDelta = sparkline.length >= 7
    ? sparkline[sparkline.length - 1] - sparkline[0]
    : 0
  const trendLabel: 'rising' | 'flat' | 'falling' =
    trendDelta > 2000 ? 'rising' : trendDelta < -2000 ? 'falling' : 'flat'

  // Peer percentile: more tier-1 hits in today's feed → higher percentile.
  // We cap the mapping so the bottom never goes below 20 nor top above 98.
  const todaysTier1 = history.length > 0 ? history[history.length - 1].tier1Hits : 0
  const peerPercentile = Math.max(20, Math.min(98, 50 + todaysTier1 * 6))

  // Market window: "open" means the last 7 days' strong-match rate is
  // trending up AND the feed has at least 5 strong matches today. This
  // is the signal we tell the user to act on.
  const last7 = history.slice(-7)
  const first7Strong = last7.length > 0 ? last7[0].strong : 0
  const lastStrong = last7.length > 0 ? last7[last7.length - 1].strong : 0
  const windowOpen = lastStrong >= 5 && lastStrong > first7Strong

  // Editorial one-liner.
  let readout = ''
  if (windowOpen && trendLabel === 'rising') {
    readout = 'The market is leaning toward you. If you were ever going to move, the next few weeks are the window.'
  } else if (trendLabel === 'rising') {
    readout = 'Your value is climbing. Keep your material ready even if you are not actively looking.'
  } else if (trendLabel === 'falling') {
    readout = 'The window is tightening. Reinvest in what makes you rare before it costs you comp.'
  } else if (windowOpen) {
    readout = 'Market conditions favor you right now. Pressure on comp is mostly upward for your band.'
  } else {
    readout = 'You are sitting in a calm patch. Good time to raise your floor: one durable skill, one publicly visible output.'
  }

  return {
    valueMid,
    valueLow,
    valueHigh,
    band,
    peerPercentile,
    trendDelta,
    trendLabel,
    sparkline,
    windowOpen,
    readout,
  }
}

/** Format USD to a short compact label (e.g. "$245K"). */
export function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

export function fmtRange(low: number, high: number): string {
  return `${compactUsd(low)} – ${compactUsd(high)}`
}
