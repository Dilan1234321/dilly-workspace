/**
 * Honest Mirror state - shared computation.
 *
 * Previously the rubric scoring was inlined inside arena/mirror.tsx.
 * We now also send the result along with every Dilly AI chat request
 * so the model can answer "what does my honest mirror say" without
 * making the user recite the page content.
 *
 * computeMirrorState: given a profile + the user's memory facts,
 * produce a per-rubric-item list of { text, have, evidence } plus
 * an aggregate score. Evidence is the single fact label we matched
 * on, so the mirror can cite "because you mentioned React" instead
 * of the old generic "your profile has something" line.
 */

import { resolvePlaybook, type CohortPlaybook } from './cohort-playbook'

export interface MirrorRow {
  /** The rubric line from the cohort playbook ("Ship a working prototype"). */
  text: string
  /** True when at least one profile fact matches the rubric line. */
  have: boolean
  /** The fact label that matched, or null when `have` is false. */
  evidence: string | null
}

export interface MirrorState {
  cohort: string
  shortName: string
  total: number
  have: number
  missing: number
  rows: MirrorRow[]
}

interface MemoryFactLike {
  label?: string
  value?: string
}

interface ProfileLike {
  cohorts?: string[]
}

/** Extract tokens ≥3 chars from a rubric line after dropping stopwords
 *  so "Ship a working prototype" matches a fact mentioning 'prototype'
 *  or 'shipping', not 'a' or 'working'. */
const _STOP = new Set([
  'a', 'an', 'the', 'with', 'and', 'or', 'of', 'in', 'on', 'for', 'to',
  'your', 'you', 'be', 'at', 'is', 'are', 'this', 'that', 'it',
])

function _keyTokens(rubric: string): string[] {
  const out: string[] = []
  for (const tok of (rubric || '').toLowerCase().match(/[a-z0-9+#.-]+/g) || []) {
    if (tok.length < 3) continue
    if (_STOP.has(tok)) continue
    out.push(tok)
  }
  return out
}

export function computeMirrorState(
  profile: ProfileLike | null | undefined,
  facts: MemoryFactLike[] | null | undefined,
): MirrorState {
  const playbook: CohortPlaybook = resolvePlaybook(profile?.cohorts || [])
  const factList = Array.isArray(facts) ? facts : []

  const rows: MirrorRow[] = playbook.rubric.map((line) => {
    const tokens = _keyTokens(line)
    let evidence: string | null = null
    for (const f of factList) {
      const bag = ((f?.label || '') + ' ' + (f?.value || '')).toLowerCase()
      if (!bag.trim()) continue
      if (tokens.some((t) => bag.includes(t))) {
        evidence = (f?.label || f?.value || '').trim() || null
        break
      }
    }
    return { text: line, have: !!evidence, evidence }
  })

  const have = rows.filter((r) => r.have).length
  return {
    cohort: (profile?.cohorts || [])[0] || 'General',
    shortName: playbook.shortName,
    total: rows.length,
    have,
    missing: rows.length - have,
    rows,
  }
}
