/**
 * 90-Day Clock — seeker tile. A concrete plan with numbers the
 * user can actually hit: apps/week target, interview conversion
 * goal, two skills to close, weekly Dilly session. Derived from
 * the user's feed + signals.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import {
  deriveSignals,
  type Listing, type Application, type Signals,
} from '../../../lib/arena/signals'

export default function NinetyDayClock() {
  const theme = useResolvedTheme()
  const [signals, setSignals] = useState<Signals | null>(null)
  const [playbook, setPlaybook] = useState<CohortPlaybook | null>(null)

  useEffect(() => {
    (async () => {
      const [prof, feedRes, appsRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/v2/internships/feed?readiness=ready&limit=60').catch(() => null),
        dilly.get('/applications').catch(() => null),
      ])
      const p = (prof || {}) as any
      const pb = resolvePlaybook(p.cohorts || [])
      setPlaybook(pb)
      const listings: Listing[] = Array.isArray((feedRes as any)?.listings) ? (feedRes as any).listings : []
      const a: Application[] = Array.isArray(appsRes) ? (appsRes as Application[]) : []
      setSignals(deriveSignals(listings, a, pb))
    })()
  }, [])

  const targets = useMemo(() => {
    if (!signals) return null
    // Set a reach target for apps/week that is ~20% above the current rate,
    // floored at 5, capped at 15. These are the numbers that typically
    // produce an offer inside 90 days for reputable firms.
    const currentRate = signals.appsLast14 / 2 // per week
    const appTarget = Math.max(5, Math.min(15, Math.round(currentRate * 1.2 + 2)))
    // Interview conversion goal: 25% is the number hiring managers quote.
    const interviewGoal = Math.round(appTarget * 0.25 * 4) // over 4 weeks
    return { appTarget, interviewGoal }
  }, [signals])

  return (
    <ArenaPage
      eyebrow="90-DAY · CLOCK"
      title="Your search as a plan."
      subtitle="Numbers you can hit. Each checkpoint is ~3 weeks. If you miss two in a row, Dilly retools the plan."
    >
      {targets && playbook ? (
        <>
          {/* Targets */}
          <View style={[s.targetCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Text style={[s.label, { color: theme.accent }]}>YOUR WEEKLY TARGETS</Text>
            <View style={s.row}>
              <Target theme={theme} big={String(targets.appTarget)} label="apps / week" />
              <Target theme={theme} big={String(targets.interviewGoal)} label="interviews / 30d" />
              <Target theme={theme} big={String(12)} label="weeks total" />
            </View>
          </View>

          {/* Checkpoints */}
          <Text style={[s.section, { color: theme.surface.t3 }]}>CHECKPOINTS</Text>
          <Checkpoint theme={theme} weekRange="Weeks 1-3" title="Sharpen" body={`Materials pass, ${playbook.anchorCompanies.tier1[0]}-grade resume, first wave of ${targets.appTarget * 3} applications out.`} />
          <Checkpoint theme={theme} weekRange="Weeks 4-6" title="Apply + prep" body={`Hit your ${targets.appTarget}/week rate. One Honest Mirror session. One mock interview for the gap that shows up.`} />
          <Checkpoint theme={theme} weekRange="Weeks 7-9" title="Interview window" body={`Target ${targets.interviewGoal}+ first-rounds. Close one skill gap surfaced by The Hook responses.`} />
          <Checkpoint theme={theme} weekRange="Weeks 10-12" title="Close" body={`Two finals, one offer to negotiate. Offer Stand-In session 24 hours before every verbal.`} />

          {/* CTA */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `I'm starting the 90-day clock. My targets: ${targets.appTarget} apps/week, ${targets.interviewGoal} interviews in the first 30 days. Help me plan week 1 specifically — what does my Monday look like?` })}
            style={[s.cta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="rocket" size={14} color="#FFF" />
            <Text style={s.ctaText}>Start week 1 with Dilly</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ArenaPage>
  )
}

function Target({ theme, big, label }: { theme: ReturnType<typeof useResolvedTheme>; big: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.targetBig, { color: theme.surface.t1 }]}>{big}</Text>
      <Text style={[s.targetLabel, { color: theme.surface.t3 }]}>{label}</Text>
    </View>
  )
}

function Checkpoint({
  theme, weekRange, title, body,
}: {
  theme: ReturnType<typeof useResolvedTheme>
  weekRange: string
  title: string
  body: string
}) {
  return (
    <View style={[s.check, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.checkWeek, { color: theme.accent }]}>{weekRange}</Text>
        <Text style={[s.checkTitle, { color: theme.surface.t1 }]}>{title}</Text>
        <Text style={[s.checkBody, { color: theme.surface.t2 }]}>{body}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  targetCard: { marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  row: { flexDirection: 'row', marginTop: 10 },
  targetBig: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  targetLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase' },
  section: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, paddingHorizontal: 20, marginTop: 22, marginBottom: 8 },
  check: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  checkWeek: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  checkTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  checkBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: 16, marginTop: 18, paddingVertical: 13, borderRadius: 13 },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
})
