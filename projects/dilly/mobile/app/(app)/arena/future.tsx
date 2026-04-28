/**
 * Future Trajectory - rebuilt ground up (build 421).
 *
 * The previous version was four "Tuesday in 2031" vignettes + a comp
 * card + three skills videos. Testers said it read like a fun fact /
 * childish prediction - a part of the app that was there for no
 * reason because nothing about it tied back to the rest of Dilly.
 *
 * The rewrite frames it as a TRAJECTORY, not a prediction. One
 * concrete future moment, then a ladder of present-day moves the user
 * can take RIGHT NOW in the rest of the app to actually walk toward
 * it. Every step is a tap that lands on the Dilly surface where
 * that step happens (Skills video, Jobs filter, AI Arena play, talk
 * with Dilly). The page exists to send the user somewhere useful in
 * their own app, not to entertain them with a vignette.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import DillyLoadingState from '../../../components/DillyLoadingState'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import { compactUsd } from '../../../lib/arena/value'

interface Profile {
  first_name?: string
  cohorts?: string[]
  graduation_year?: number
}

interface SkillsVideo { id: string; title?: string }

interface Step {
  rung: string
  move: string
  detail: string
  ctaLabel: string
  onPress: () => void
}

export default function FutureTrajectory() {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [topVideo, setTopVideo] = useState<SkillsVideo | null>(null)

  const load = useCallback(async () => {
    try {
      const prof = await dilly.get('/profile').catch(() => null)
      const p = (prof || {}) as Profile
      setProfile(p)
      const slug = cohortToSlug(p.cohorts?.[0])
      if (slug) {
        const vids = await dilly.get(`/skill-lab/videos?cohort=${slug}&sort=best&limit=1`).catch(() => null)
        const list: SkillsVideo[] = Array.isArray((vids as any)?.videos) ? (vids as any).videos : []
        if (list[0]) setTopVideo(list[0])
      }
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )
  const futureYear = useMemo(() => {
    const gradYr = Number(profile?.graduation_year || 0)
    if (gradYr > 2026) return gradYr + 3
    return new Date().getFullYear() + 3
  }, [profile])

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        mood="thinking"
        messages={[`Mapping the path to ${playbook?.shortName || 'your field'}…`, 'Picking the next move from your profile…']}
      />
    )
  }

  const hasName = !!profile?.first_name
  const fname = hasName ? (profile!.first_name as string) : 'you'
  const possessive = hasName ? `${profile!.first_name}'s` : 'Your'

  // Pick the destination moment - the most concrete vignette line.
  // Falls back to a generic line so the page never crashes when the
  // playbook lacks data.
  const destination = playbook.vignette.morning
    ? `${playbook.vignette.morning.split('.')[0]}.`
    : `Owning a real piece of work in ${playbook.shortName}.`

  // The four ladder rungs. Each one IS a tap to a specific Dilly
  // surface so the user leaves this page with momentum, not just
  // a feeling. Order matters: closest move first.
  const steps: Step[] = [
    {
      rung: 'THIS WEEK',
      move: 'Plan one move with Dilly.',
      detail: `Talk through the gap between today and a ${playbook.shortName} seat. Dilly will frame the next 90 days.`,
      ctaLabel: 'Open chat',
      onPress: () => openDillyOverlay({
        initialMessage: `I just saw my Future Trajectory. By ${futureYear} I want to be in a ${playbook.shortName} seat where "${destination}" is my normal Tuesday. Walk me through the next 90 days - what is the ONE thing I should do this week?`,
      }),
    },
    {
      rung: 'THIS MONTH',
      move: topVideo?.title
        ? `Watch "${topVideo.title}" in Dilly Skills.`
        : `Build one ${playbook.shortName} skill in Dilly Skills.`,
      detail: 'Curated for your cohort, delivered in-app. No tabs, no YouTube rabbit hole.',
      ctaLabel: 'Open Skills',
      onPress: () => {
        if (topVideo?.id) router.push(`/skills/video/${topVideo.id}`)
        else router.push('/skills')
      },
    },
    {
      rung: 'THIS QUARTER',
      move: `Apply to roles that put you on this trajectory.`,
      detail: `Your Jobs feed is already filtered to ${playbook.shortName}. Pick three this week.`,
      ctaLabel: 'Open Jobs',
      onPress: () => router.push('/(app)/jobs'),
    },
    {
      rung: 'STAYING AHEAD',
      move: 'Read your AI Arena.',
      detail: `Where AI is reshaping ${playbook.shortName} - and the human edge that keeps your seat in ${futureYear}.`,
      ctaLabel: 'Open AI Arena',
      onPress: () => router.push('/(app)/arena/field-intel' as any),
    },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
    >
      {/* Header. No back button - tab destination, not a drill-down. */}
      <View style={s.header}>
        <Text style={[s.eyebrow, { color: theme.accent }]}>FUTURE · TRAJECTORY</Text>
        <Text style={[s.title, { color: theme.surface.t1 }]}>
          {possessive} ladder to {playbook.shortName}.
        </Text>
        <Text style={[s.sub, { color: theme.surface.t2 }]}>
          A measured path to {futureYear}, not a prediction. Every rung tied to one move you can make in Dilly today.
        </Text>
      </View>

      {/* The destination. ONE line - not a vignette. */}
      <View style={[s.destCard, { backgroundColor: theme.surface.s1, borderColor: theme.accent + '50' }]}>
        <View style={[s.destAccent, { backgroundColor: theme.accent }]} />
        <Text style={[s.destEyebrow, { color: theme.accent }]}>WHERE THIS LANDS · {futureYear}</Text>
        <Text style={[s.destBody, { color: theme.surface.t1 }]}>{destination}</Text>
        <Text style={[s.destFootnote, { color: theme.surface.t3 }]}>
          Comp at this rung lands around {compactUsd(Math.round(playbook.comp.earlyBase * 1.15))} base.{' '}
          Strong performers clear {compactUsd(playbook.comp.midBase)}+ by year five.
        </Text>
      </View>

      {/* The ladder. Four rungs, each tappable, each goes somewhere
          useful in the app. This is the "tied to the rest of Dilly"
          part the old Tuesday vignettes lacked. */}
      <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>
        FOUR RUNGS BETWEEN TODAY AND {futureYear}
      </Text>
      {steps.map((step, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.86}
          onPress={step.onPress}
          style={[s.rungCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
        >
          <View style={s.rungHeader}>
            <View style={[s.rungBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
              <Text style={[s.rungBadgeText, { color: theme.accent }]}>{step.rung}</Text>
            </View>
            <View style={[s.rungNum, { backgroundColor: theme.accent }]}>
              <Text style={s.rungNumText}>{i + 1}</Text>
            </View>
          </View>
          <Text style={[s.rungMove, { color: theme.surface.t1 }]}>{step.move}</Text>
          <Text style={[s.rungDetail, { color: theme.surface.t2 }]}>{step.detail}</Text>
          <View style={s.rungCta}>
            <Text style={[s.rungCtaText, { color: theme.accent }]}>{step.ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={13} color={theme.accent} />
          </View>
        </TouchableOpacity>
      ))}

      {/* 90-day plan section — generated server-side from the user's
          actual scores, profile facts, and Career Type. Each week is
          one concrete move, checkable. Closes the gap with RoadMap.sh
          / CareerExplorer (cluster-3 P-lift). */}
      <Plan90Day
        targetRole={`${playbook.shortName} by ${futureYear}`}
        theme={theme}
      />

      {/* Closing - one tap to put the WHOLE plan into Dilly chat. */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openDillyOverlay({
            initialMessage: `I want to walk the trajectory my Future page laid out for ${playbook.shortName} by ${futureYear}. Help me build a single 12-month plan that hits all four rungs - this week, this month, this quarter, and the AI-staying-ahead piece.`,
          })}
          style={[s.allInCta, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="sparkles" size={15} color="#FFF" />
          <Text style={s.allInCtaText}>
            {hasName ? `Build the 12-month plan, ${fname}` : 'Build the 12-month plan'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function cohortToSlug(cohort: string | undefined): string | null {
  if (!cohort) return null
  const map: Record<string, string> = {
    'Software Engineering & CS':          'software-engineering-cs',
    'Data Science & Analytics':           'data-science-analytics',
    'Cybersecurity & IT':                 'cybersecurity-it',
    'Electrical & Computer Engineering':  'electrical-computer-engineering',
    'Mechanical & Aerospace Engineering': 'mechanical-aerospace-engineering',
    'Civil & Environmental Engineering':  'civil-environmental-engineering',
    'Chemical & Biomedical Engineering':  'chemical-biomedical-engineering',
    'Finance & Accounting':               'finance-accounting',
    'Consulting & Strategy':              'consulting-strategy',
    'Marketing & Advertising':            'marketing-advertising',
    'Management & Operations':            'management-operations',
    'Entrepreneurship & Innovation':      'entrepreneurship-innovation',
    'Economics & Public Policy':          'economics-public-policy',
    'Healthcare & Clinical':              'healthcare-clinical',
    'Biotech & Pharmaceutical':           'biotech-pharmaceutical',
    'Life Sciences & Research':           'life-sciences-research',
    'Physical Sciences & Math':           'physical-sciences-math',
    'Law & Government':                   'law-government',
    'Media & Communications':             'media-communications',
    'Design & Creative Arts':             'design-creative-arts',
    'Education & Human Development':      'education-human-development',
    'Social Sciences & Nonprofit':        'social-sciences-nonprofit',
  }
  return map[cohort] || null
}

// ── 90-day plan component ────────────────────────────────────────────────
// Generates a 12-week structured plan via /career-plan/90-day. Renders
// each week as a checkable card. Plan persists on the user's profile so
// they can come back and toggle weeks done. cluster-3 P-lift: closes
// the gap with RoadMap.sh/CareerExplorer.
interface PlanWeek { week: number; title: string; move: string; why: string; completed: boolean }
interface Plan { weeks: PlanWeek[]; summary?: string; target_role?: string; generated_at?: string | null; stale?: boolean }

function Plan90Day({ targetRole, theme }: { targetRole: string; theme: ReturnType<typeof useResolvedTheme> }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const data = await dilly.get('/career-plan/90-day')
        if (data) setPlan(data as Plan)
      } catch {} finally { setLoaded(true) }
    })()
  }, [])

  async function generate() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await dilly.fetch('/career-plan/90-day', {
        method: 'POST', body: JSON.stringify({ target_role: targetRole }),
      })
      const data = await res.json().catch(() => null)
      if (data?.weeks) setPlan(data as Plan)
    } catch {} finally { setGenerating(false) }
  }

  async function toggle(week: number, completed: boolean) {
    if (!plan) return
    // Optimistic update
    setPlan({
      ...plan,
      weeks: plan.weeks.map(w => w.week === week ? { ...w, completed } : w),
    })
    try {
      await dilly.fetch(`/career-plan/90-day/week/${week}`, {
        method: 'PATCH', body: JSON.stringify({ completed }),
      })
    } catch {}
  }

  if (!loaded) return null

  const hasPlan = plan && Array.isArray(plan.weeks) && plan.weeks.length > 0
  const completedCount = hasPlan ? plan!.weeks.filter(w => w.completed).length : 0

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
      <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: theme.surface.t3, marginBottom: 8 }}>
        YOUR 12-WEEK PLAN
      </Text>
      {!hasPlan ? (
        <View style={{
          backgroundColor: theme.surface.s1, borderColor: theme.surface.border,
          borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center', gap: 10,
        }}>
          <Text style={{ fontSize: 13, color: theme.surface.t2, textAlign: 'center', lineHeight: 18 }}>
            Generate a real 12-week plan to {targetRole}. Built from your scores, your Profile, and your Career Type.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={generate}
            disabled={generating}
            style={{
              backgroundColor: theme.accent, paddingHorizontal: 18, paddingVertical: 10,
              borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
            }}
          >
            <Ionicons name={generating ? 'hourglass-outline' : 'map'} size={14} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 }}>
              {generating ? 'Building your plan…' : 'Generate 12-week plan'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {plan!.summary ? (
            <Text style={{ fontSize: 13, color: theme.surface.t2, marginBottom: 12, lineHeight: 18, fontStyle: 'italic' }}>
              {plan!.summary}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: theme.surface.t3, marginBottom: 8 }}>
            {completedCount} of {plan!.weeks.length} weeks complete
          </Text>
          <View style={{ gap: 8 }}>
            {plan!.weeks.map(w => (
              <TouchableOpacity
                key={w.week}
                activeOpacity={0.85}
                onPress={() => toggle(w.week, !w.completed)}
                style={{
                  backgroundColor: w.completed ? theme.accentSoft : theme.surface.s1,
                  borderColor: w.completed ? theme.accent : theme.surface.border,
                  borderWidth: 1, borderRadius: 12, padding: 12,
                  flexDirection: 'row', gap: 10,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 1.5,
                  borderColor: w.completed ? theme.accent : theme.surface.border,
                  backgroundColor: w.completed ? theme.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  {w.completed ? <Ionicons name="checkmark" size={12} color="#FFF" /> : (
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.surface.t3 }}>W{w.week}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 13, fontWeight: '800',
                    color: theme.surface.t1,
                    textDecorationLine: w.completed ? 'line-through' : 'none',
                  }}>
                    Week {w.week} · {w.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.surface.t1, marginTop: 3, lineHeight: 17 }}>
                    {w.move}
                  </Text>
                  {w.why ? (
                    <Text style={{ fontSize: 11, color: theme.surface.t3, marginTop: 4, fontStyle: 'italic' }}>
                      Why: {w.why}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={generate}
            disabled={generating}
            style={{ marginTop: 10, alignSelf: 'center', paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 11, color: theme.surface.t3, textDecorationLine: 'underline' }}>
              {generating ? 'Regenerating…' : 'Regenerate plan'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 8 },

  destCard: {
    marginHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  destAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  destEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, marginBottom: 10 },
  destBody: { fontSize: 19, fontWeight: '700', lineHeight: 26, fontStyle: 'italic' },
  destFootnote: { fontSize: 12, lineHeight: 17, marginTop: 14, fontWeight: '500' },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 26, marginBottom: 10,
  },

  rungCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  rungHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  rungBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  rungBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  rungNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rungNumText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  rungMove: { fontSize: 16, fontWeight: '800', lineHeight: 21, marginBottom: 6 },
  rungDetail: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 10 },
  rungCta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rungCtaText: { fontSize: 12, fontWeight: '800' },

  allInCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  allInCtaText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
})
