/**
 * Ghost Move - holder tile. Computes a "stealth check" - what your
 * market would look like if you wanted to move, without tipping your
 * current employer. Three parts: anchor companies hiring for your
 * level, a low-signal comp update, and a stealth prep checklist.
 */

import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import { router } from 'expo-router'
import ArenaPage from '../../../components/arena/ArenaPage'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import { deriveSignals, type Listing, type Application, type Signals } from '../../../lib/arena/signals'
import { compactUsd } from '../../../lib/arena/value'

const CHECKLIST = [
  { text: 'Scrub your LinkedIn headline - specific titles only draw cold inbound from your current company\'s recruiters.', done: false },
  { text: 'Use personal email for applications. Work email is searchable.', done: false },
  { text: 'Set your LinkedIn to "not open to work" while warm-DMing - it tips faster than an indicator.', done: false },
  { text: 'Take reference calls from personal phone, off the clock.', done: false },
  { text: 'Do not update your resume file on Google Drive - your manager may have access through a shared folder.', done: false },
]

export default function GhostMove() {
  const theme = useResolvedTheme()
  const [playbook, setPlaybook] = useState<CohortPlaybook | null>(null)
  const [signals, setSignals] = useState<Signals | null>(null)
  const [topAnchors, setTopAnchors] = useState<Listing[]>([])

  const load = useCallback(async () => {
    const [prof, feedRes, appsRes] = await Promise.all([
      dilly.get('/profile').catch(() => null),
      dilly.get('/v2/internships/feed?readiness=ready&limit=60').catch(() => null),
      dilly.get('/applications').catch(() => null),
    ])
    const p = (prof || {}) as any
    const pb = resolvePlaybook(p.cohorts || [])
    setPlaybook(pb)
    const listings: Listing[] = Array.isArray((feedRes as any)?.listings) ? (feedRes as any).listings : []
    const apps: Application[] = Array.isArray(appsRes) ? (appsRes as Application[]) : []
    const s = deriveSignals(listings, apps, pb)
    setSignals(s)

    const tier1Lower = pb.anchorCompanies.tier1.map(c => c.toLowerCase())
    const scaleupLower = pb.anchorCompanies.scaleup.map(c => c.toLowerCase())
    const hits = listings
      .filter(j => (j.rank_score ?? 0) >= 60)
      .filter(j => {
        const cl = (j.company || '').toLowerCase()
        return tier1Lower.some(t => cl.includes(t)) || scaleupLower.some(t => cl.includes(t))
      })
      .slice(0, 4)
    setTopAnchors(hits)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <ArenaPage
      eyebrow="GHOST · MOVE"
      title="A stealth look at your exit."
      subtitle="What the market would offer if you wanted to leave - computed locally, no signal sent."
    >
      {/* Top anchors hiring */}
      <Text style={[s.section, { color: theme.surface.t3 }]}>ANCHORS HIRING YOU</Text>
      {topAnchors.length === 0 ? (
        <Text style={[s.empty, { color: theme.surface.t2 }]}>
          No strong anchor hits in your feed this week. Your market is quiet. Keep the resume warm.
        </Text>
      ) : topAnchors.map(j => (
        <TouchableOpacity
          key={j.id}
          activeOpacity={0.85}
          onPress={() => router.push('/(app)/jobs')}
          style={[s.row, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.company, { color: theme.surface.t3 }]}>{j.company}</Text>
            <Text style={[s.roleTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{j.title}</Text>
          </View>
          <Ionicons name="arrow-forward" size={15} color={theme.surface.t3} />
        </TouchableOpacity>
      ))}

      {/* Comp ping */}
      {playbook ? (
        <>
          <Text style={[s.section, { color: theme.surface.t3 }]}>A QUIET COMP PING</Text>
          <View style={[s.compCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Text style={[s.compLabel, { color: theme.accent }]}>WHAT THEY ARE PAYING TODAY</Text>
            <Text style={[s.compBig, { color: theme.surface.t1 }]}>
              {compactUsd(playbook.comp.midBase)} <Text style={{ fontSize: 15, color: theme.surface.t3 }}>base · mid</Text>
            </Text>
            <Text style={[s.compBody, { color: theme.surface.t2 }]}>
              Reputable-firm mid-career band. Top-10% performers clear{' '}
              <Text style={{ color: theme.accent, fontWeight: '800' }}>{compactUsd(playbook.comp.top10Tcc)} TCC</Text>.
              If your current package is below the band, the stealth move is serious.
            </Text>
          </View>
        </>
      ) : null}

      {/* Stealth checklist */}
      <Text style={[s.section, { color: theme.surface.t3 }]}>STEALTH PREP</Text>
      <Text style={[s.empty, { color: theme.surface.t2 }]}>Five things Dilly has seen people get burned on.</Text>
      {CHECKLIST.map((c, i) => (
        <View key={i} style={[s.checkRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <Ionicons name="shield-checkmark" size={14} color={theme.accent} />
          <Text style={[s.checkText, { color: theme.surface.t1 }]}>{c.text}</Text>
        </View>
      ))}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  section: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, paddingHorizontal: 20, marginTop: 22, marginBottom: 8 },
  empty: { fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  company: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  roleTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  compCard: { marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: 1 },
  compLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  compBig: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  compBody: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, padding: 12, borderRadius: 11, borderWidth: 1, marginBottom: 6 },
  checkText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
})
