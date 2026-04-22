/**
 * Arena/conviction — compute the Conviction Builder output.
 *
 * For a user + target company, we compute:
 *   - assets: facts in the user's profile that are genuine evidence
 *             for this role
 *   - gaps:   the rubric items for this cohort the user hasn't
 *             substantiated in their memory surface
 *   - story:  a scripted STAR-style draft pulled from the user's
 *             strongest achievement + project facts
 *   - questions: three tailored questions to ask the interviewer
 *             that signal the user thought hard about this company
 *
 * Zero LLM cost. Template-driven. The templates are in this file; the
 * user's data flows through them at render time.
 */

import type { CohortPlaybook } from './cohort-playbook'

export interface Fact {
  id?: string
  category?: string
  label?: string
  value?: string
}

export interface Conviction {
  assets: Array<{ label: string; why: string }>
  gaps: Array<{ label: string; why: string; skillQuery: string }>
  story: { prompt: string; draft: string } | null
  questions: string[]
}

const ASSET_CATEGORIES = new Set([
  'achievement', 'project', 'experience', 'skill_unlisted',
  'technical_skill', 'soft_skill', 'skill', 'strength',
])

export function buildConviction(
  facts: Fact[],
  playbook: CohortPlaybook,
  company: string,
): Conviction {
  const lowered = facts
    .filter(f => f.id && ASSET_CATEGORIES.has((f.category || '').toLowerCase()))
    .map(f => ({ ...f, lower: (f.label || f.value || '').toLowerCase() }))

  // ASSETS: facts that match a core skill or rubric keyword.
  const assets: Conviction['assets'] = []
  const seenAssetLabels = new Set<string>()
  for (const sk of playbook.coreSkills) {
    const skLower = sk.toLowerCase()
    const firstWord = skLower.split(/\s+/)[0]
    const hit = lowered.find(f => f.lower.includes(firstWord) || f.lower.includes(skLower.split(/\s+/)[0]))
    if (hit && !seenAssetLabels.has(hit.label || '')) {
      assets.push({
        label: hit.label || hit.value || sk,
        why: `This maps to "${sk}" — one of the first things they ask about.`,
      })
      seenAssetLabels.add(hit.label || '')
    }
  }
  // Also lift achievements/projects even if they do not keyword-match,
  // because they show initiative and the interviewer will ask about them.
  for (const f of lowered) {
    const cat = (f.category || '').toLowerCase()
    if ((cat === 'achievement' || cat === 'project') && !seenAssetLabels.has(f.label || '')) {
      assets.push({
        label: f.label || f.value || 'An achievement on your profile',
        why: 'A concrete thing you did — the interviewer will want the story.',
      })
      seenAssetLabels.add(f.label || '')
      if (assets.length >= 6) break
    }
  }

  // GAPS: rubric items whose keywords the user has NOT substantiated.
  const gaps: Conviction['gaps'] = []
  const topSkillLower = playbook.coreSkills.map(s => s.toLowerCase())
  const haveKeys = new Set<string>()
  for (const f of lowered) {
    topSkillLower.forEach((s, i) => {
      const firstWord = s.split(/\s+/)[0]
      if (f.lower.includes(firstWord)) haveKeys.add(String(i))
    })
  }
  playbook.coreSkills.forEach((sk, i) => {
    if (!haveKeys.has(String(i))) {
      gaps.push({
        label: sk,
        why: `Your profile has no direct evidence of this, and for ${playbook.shortName} it is the first thing they probe.`,
        skillQuery: playbook.skillQueries[i % playbook.skillQueries.length],
      })
    }
  })
  // Cap at top 3 gaps so the page is scannable.
  const topGaps = gaps.slice(0, 3)

  // STORY: choose the strongest achievement/project fact, if any, and
  // wrap it in a STAR scaffold. We never invent numbers — the user
  // fills the specifics. We only write the shape.
  const hero = lowered.find(f => (f.category || '').toLowerCase() === 'achievement')
    || lowered.find(f => (f.category || '').toLowerCase() === 'project')
  const story: Conviction['story'] = hero
    ? {
        prompt: 'Tell me about a time you had to do hard work.',
        draft: [
          `SITUATION — ${hero.label || hero.value}. Walk them through the scope in one sentence. Scale matters: who, how many people affected, what was the deadline.`,
          `TASK — What specifically was yours to own. Not the team's, yours. This is the line recruiters listen for.`,
          `ACTION — The two or three concrete moves you made. Name the tools and the trade-offs. This is where you prove you were the one doing the work.`,
          `RESULT — The outcome in numbers if you have them. If you do not, the human-level impact. Close with what you would do differently now.`,
        ].join('\n\n'),
      }
    : null

  // QUESTIONS: three tailored questions built from cohort + company.
  // Generic enough that they always make sense, specific enough that
  // they do not sound canned.
  const questions: string[] = [
    `What does a strong first 90 days look like for someone in this role at ${company}?`,
    `When an IC here has to push back on a senior decision, how does that usually play out?`,
    `What would I have to be really good at to get the next promotion here — not what is written down, what actually happens?`,
  ]

  return { assets: assets.slice(0, 5), gaps: topGaps, story, questions }
}
