/**
 * Arena/signals - derived signals across the three arena surfaces.
 *
 * Cheap stats we compute once from the user's profile + /applications
 * + /v2/internships/feed + /memory so every arena tile stops
 * re-deriving the same thing.
 *
 * No LLM, no new network calls. This is a thin "lens" layer over
 * already-loaded data.
 */

import type { CohortPlaybook } from './cohort-playbook'

export interface Listing {
  id: string
  title?: string
  company?: string
  location_city?: string
  rank_score?: number
  cohort_requirements?: { cohort: string }[] | null
  remote?: boolean
  posted_date?: string
}

export interface Application {
  id?: string
  company?: string
  role?: string
  status?: string
  applied_at?: string
}

export interface Signals {
  /** Count of tier-1 anchor companies in the current feed. */
  tier1Hits: number
  /** Count of scaleup companies in the current feed. */
  scaleupHits: number
  /** Strong-match count (rank_score >= 72). */
  strongCount: number
  /** Stretch-match count (45-71). */
  stretchCount: number
  /** Cities the user's matches are clustered in (top 3 by freq). */
  topCities: { city: string; n: number }[]
  /** Days since the user's most recent application, or null. */
  daysSinceLastApp: number | null
  /** Count of applications in the last 14 days. */
  appsLast14: number
  /** Count of unique companies applied to in the last 30 days. */
  distinctAppCompanies: number
  /** Count of rejections (case-insensitive) in the last 30 days. */
  rejectionsLast30: number
  /** How many of the user's strong matches are at anchor companies. */
  strongAtAnchors: number
  /** Count of applications that led to interviews. */
  interviewsCount: number
  /** Rejection streak length: consecutive rejections with no
   *  interview since. Used by Rejection Pattern Map to trigger a
   *  reset prompt. */
  rejectionStreak: number
}

function daysBetween(aIso: string | null | undefined, bIso: string): number | null {
  if (!aIso) return null
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.floor((b - a) / 86400000)
}

export function deriveSignals(
  feed: Listing[],
  apps: Application[],
  playbook: CohortPlaybook,
): Signals {
  const nowIso = new Date().toISOString()

  // Feed-side counts.
  const tier1 = new Set(playbook.anchorCompanies.tier1.map(c => c.toLowerCase()))
  const scaleup = new Set(playbook.anchorCompanies.scaleup.map(c => c.toLowerCase()))

  let tier1Hits = 0
  let scaleupHits = 0
  let strongCount = 0
  let stretchCount = 0
  let strongAtAnchors = 0

  const cityCount = new Map<string, number>()
  for (const j of feed) {
    const score = Number(j.rank_score ?? 50)
    const isStrong = score >= 72
    const isStretch = score >= 45 && score < 72
    if (isStrong) strongCount++
    else if (isStretch) stretchCount++

    const companyLower = (j.company || '').toLowerCase()
    const inTier1 = [...tier1].some(t => companyLower.includes(t))
    const inScaleup = [...scaleup].some(t => companyLower.includes(t))
    if (inTier1) tier1Hits++
    if (inScaleup) scaleupHits++
    if (isStrong && (inTier1 || inScaleup)) strongAtAnchors++

    const c = (j.location_city || '').trim()
    if (c) cityCount.set(c, (cityCount.get(c) || 0) + 1)
  }

  const topCities = [...cityCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([city, n]) => ({ city, n }))

  // App-side signals.
  let mostRecent: string | null = null
  let appsLast14 = 0
  let rejectionsLast30 = 0
  let interviewsCount = 0
  const distinctCompanies = new Set<string>()
  const sortedApps = [...apps].sort((a, b) => {
    const at = new Date(a.applied_at || '').getTime() || 0
    const bt = new Date(b.applied_at || '').getTime() || 0
    return bt - at
  })
  for (const a of sortedApps) {
    const appliedAt = a.applied_at
    if (!appliedAt) continue
    if (!mostRecent) mostRecent = appliedAt
    const d = daysBetween(appliedAt, nowIso)
    if (d !== null && d <= 14) appsLast14++
    if (d !== null && d <= 30) {
      const comp = (a.company || '').toLowerCase().trim()
      if (comp) distinctCompanies.add(comp)
      const status = (a.status || '').toLowerCase()
      if (status.includes('reject')) rejectionsLast30++
      if (status.includes('interview')) interviewsCount++
    }
  }

  // Rejection streak: walk the sorted apps (most recent first) and
  // count rejections until we hit an interview/offer status.
  let rejectionStreak = 0
  for (const a of sortedApps) {
    const status = (a.status || '').toLowerCase()
    if (status.includes('reject')) rejectionStreak++
    else if (status.includes('interview') || status.includes('offer')) break
  }

  const daysSinceLastApp = mostRecent ? daysBetween(mostRecent, nowIso) : null

  return {
    tier1Hits,
    scaleupHits,
    strongCount,
    stretchCount,
    topCities,
    daysSinceLastApp,
    appsLast14,
    distinctAppCompanies: distinctCompanies.size,
    rejectionsLast30,
    strongAtAnchors,
    interviewsCount,
    rejectionStreak,
  }
}

/** Small helper - what rejection pattern does this user fit? Feeds the
 *  Rejection Pattern Map tile. */
export function rejectionPattern(s: Signals): {
  label: string
  diagnosis: string
  move: string
} | null {
  if (s.rejectionsLast30 === 0) return null
  if (s.rejectionsLast30 >= 8 && s.interviewsCount === 0) {
    return {
      label: 'Resume-stage rejections',
      diagnosis: 'You are getting rejected before the phone screen. The problem is not the interview - it is the top-of-funnel read.',
      move: 'Rewrite the top third of your resume this week. Lead with outcomes and the companies you want, not a chronology.',
    }
  }
  if (s.rejectionsLast30 >= 3 && s.interviewsCount >= 2 && s.interviewsCount / s.rejectionsLast30 < 0.4) {
    return {
      label: 'Interview-stage attrition',
      diagnosis: 'You are landing the first call, losing somewhere in the loop. That means prep, not positioning.',
      move: 'Pick one interview format you are weakest at and run three mock loops on it this week. Record them.',
    }
  }
  if (s.rejectionsLast30 >= 3) {
    return {
      label: 'Pattern unclear - more data needed',
      diagnosis: 'Your recent rejections do not cluster yet. Before you change strategy, make sure you are applying enough to distinguish bad luck from bad fit.',
      move: 'Track exactly where in the funnel each one dies. Pattern will emerge inside a week of honest logging.',
    }
  }
  return null
}
