/**
 * Next Role Lab - holder tile. Surfaces three plausible next roles
 * for the user by mixing their cohort playbook's anchor tiers with
 * their current role keyword. Each card carries a fit read and a
 * "what you'd have to prove" line.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'

interface NextRole {
  title: string
  company: string
  kind: 'lateral' | 'step-up' | 'adjacent'
  fit: string
  prove: string
}

export default function NextRoleLab() {
  const theme = useResolvedTheme()
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    (async () => {
      setProfile(await dilly.get('/profile').catch(() => null))
    })()
  }, [])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )
  const currentRole = profile?.current_role || profile?.most_recent_role || 'your current role'

  const roles: NextRole[] = useMemo(() => ([
    {
      title: playbook.shortName === 'SWE' ? 'Staff Software Engineer' : `Senior ${playbook.shortName}`,
      company: playbook.anchorCompanies.tier1[0],
      kind: 'step-up',
      fit: `Reads like a promotion on paper. If you have shipped one thing that would qualify as a flagship at ${playbook.anchorCompanies.tier1[0]}, the conversation is there.`,
      prove: 'A flagship outcome you led. Real scope, real tradeoffs, measurable result.',
    },
    {
      title: `${playbook.shortName} IC`,
      company: playbook.anchorCompanies.scaleup[0],
      kind: 'lateral',
      fit: `Scaleups in ${playbook.shortName} move faster than your current employer. A lateral here usually carries a 15-25% comp lift plus equity upside.`,
      prove: `Evidence you can operate without process. A side project, an open-source contribution, something that shows you don\'t need a manager in the room.`,
    },
    {
      title: `${playbook.shortName === 'SWE' || playbook.shortName === 'Data' ? 'Applied' : 'Principal'} ${playbook.shortName}`,
      company: playbook.anchorCompanies.tier2[0],
      kind: 'adjacent',
      fit: `Sideways-up into an adjacent practice. The skills port; the title doesn't. Two years deep and you pass the senior bar at ${playbook.anchorCompanies.tier1[0]}.`,
      prove: 'That you can translate your craft one layer over. One public piece of work in the adjacent domain is enough.',
    },
  ]), [playbook])

  return (
    <ArenaPage
      eyebrow="NEXT ROLE · LAB"
      title={`Three plausible next moves from ${currentRole}.`}
      subtitle="Stress-tested against your cohort. Each has a fit read and a specific thing you would have to prove."
    >
      {roles.map((r, i) => (
        <View key={i} style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <View style={s.head}>
            <View style={[s.kindPill, { backgroundColor: kindColor(r.kind, theme) }]}>
              <Text style={s.kindText}>{r.kind.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={[s.title, { color: theme.surface.t1 }]}>{r.title}</Text>
          <Text style={[s.company, { color: theme.surface.t3 }]}>{r.company}</Text>
          <Text style={[s.fit, { color: theme.surface.t1 }]}>{r.fit}</Text>
          <Text style={[s.proveLabel, { color: theme.accent }]}>WHAT YOU WOULD HAVE TO PROVE</Text>
          <Text style={[s.prove, { color: theme.surface.t2 }]}>{r.prove}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `I'm thinking about moving to a ${r.title} at ${r.company}. Help me stress-test if I'm ready. Where would I be exposed?` })}
            style={[s.cta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="chatbubbles" size={13} color="#FFF" />
            <Text style={s.ctaText}>Stress-test with Dilly</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ArenaPage>
  )
}

function kindColor(k: 'lateral' | 'step-up' | 'adjacent', theme: ReturnType<typeof useResolvedTheme>): string {
  if (k === 'step-up') return '#34C759'
  if (k === 'adjacent') return '#FFB300'
  return theme.accent
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  head: { flexDirection: 'row' },
  kindPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 10 },
  kindText: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  company: { fontSize: 12, fontWeight: '700', marginTop: 3, letterSpacing: 0.5 },
  fit: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  proveLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginTop: 14 },
  prove: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 14 },
  ctaText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
})
