/**
 * Threat Radar - holder tile. Surfaces the cohort's top three live
 * threats in a prioritized list, each with a concrete "move" the
 * user can take this week. Zero LLM; purely the cohort playbook.
 */

import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'

export default function ThreatRadar() {
  const theme = useResolvedTheme()
  const [playbook, setPlaybook] = useState<CohortPlaybook | null>(null)

  useEffect(() => {
    (async () => {
      const prof: any = await dilly.get('/profile').catch(() => null)
      setPlaybook(resolvePlaybook(prof?.cohorts || []))
    })()
  }, [])

  return (
    <ArenaPage
      eyebrow="THREAT · RADAR"
      title={`Pressuring ${playbook?.shortName || 'your role'}.`}
      subtitle="Three specific risks Dilly tracks for your cohort right now. Each has a concrete move."
    >
      {(playbook?.threats || []).map((t, i) => (
        <View key={i} style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <View style={s.head}>
            <View style={[s.num, { backgroundColor: theme.accent }]}>
              <Text style={s.numText}>{i + 1}</Text>
            </View>
            <Text style={[s.title, { color: theme.surface.t1 }]} numberOfLines={2}>{t.title}</Text>
          </View>
          <Text style={[s.body, { color: theme.surface.t1 }]}>{t.body}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `Help me think through this threat: "${t.title}". Dilly said: "${t.body}" - what should I actually do about it in the next two weeks?` })}
            style={[s.cta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="chatbubbles" size={13} color="#FFF" />
            <Text style={s.ctaText}>Map a move with Dilly</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  num: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  title: { flex: 1, fontSize: 15, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 12 },
  ctaText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
})
