/**
 * Offer Stand-In - seeker tile. A negotiation rehearsal with canned
 * scripts for the four moments people freeze: getting the offer,
 * asking for the range, countering, and the silent pause.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import { compactUsd } from '../../../lib/arena/value'

interface Script {
  label: string
  moment: string
  say: string
  do: string
}

export default function OfferStandIn() {
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
  const target = compactUsd(playbook.comp.earlyBase)
  const midTarget = compactUsd(playbook.comp.midBase)

  const scripts: Script[] = [
    {
      label: 'They give you a number first',
      moment: 'The call where they say "we\'d like to extend an offer of X."',
      say: `"Thank you. I'm excited about the role. Before I respond, I want to be sure I understand the full picture - what's the base, sign-on, equity target, and the band for this level?"`,
      do: 'Do not accept on the call. Do not counter on the call. Thank them, ask for 48 hours in writing, and hang up.',
    },
    {
      label: 'They ask your number first',
      moment: 'Mid-process. The recruiter asks "what are you targeting?"',
      say: `"Based on the market and what peers at similar firms are clearing, I'm targeting base in the ${target}–${midTarget} range, with the full package reflective of level. I'd love to hear what the band for this role is before I give you a specific number."`,
      do: 'Turn the question back into a band ask. Never commit a number before they show theirs.',
    },
    {
      label: 'The counter',
      moment: 'You have the offer in writing and want more.',
      say: `"I'm very interested. Given the scope of the role and my experience with [one specific fact from your profile], I was hoping the base could come up to X. Is that possible?"`,
      do: 'Anchor 10-15% above their number, not a full band above. Pair with one specific fact of value. Wait for the answer.',
    },
    {
      label: 'The silent pause',
      moment: 'After you counter and they go quiet.',
      say: 'Nothing. Do not talk.',
      do: 'Count to ten in your head. Eight seconds feels like a century. The silence is the negotiation. The first person to talk loses.',
    },
  ]

  return (
    <ArenaPage
      eyebrow="OFFER · STAND-IN"
      title="The four moments people freeze."
      subtitle="Scripts for the exact lines most candidates forget under pressure."
    >
      {scripts.map((sc, i) => (
        <View key={i} style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Text style={[s.momentLabel, { color: theme.accent }]}>0{i + 1} - {sc.label.toUpperCase()}</Text>
          <Text style={[s.moment, { color: theme.surface.t2 }]}>{sc.moment}</Text>
          <Text style={[s.say, { color: theme.surface.t1 }]}>{sc.say}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={[s.doPill, { backgroundColor: theme.surface.s2 }]}>
              <Text style={[s.doLabel, { color: theme.accent }]}>DO</Text>
              <Text style={[s.doText, { color: theme.surface.t1 }]}>{sc.do}</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `Rehearse with me. You are the recruiter. Simulate "${sc.moment}" - ask me what you would ask, and push me where I\'m weak.` })}
            style={[s.cta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="chatbubbles" size={13} color="#FFF" />
            <Text style={s.ctaText}>Rehearse this one</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  momentLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  moment: { fontSize: 12, lineHeight: 17, marginTop: 4, fontStyle: 'italic' },
  say: { fontSize: 14, lineHeight: 21, marginTop: 12, fontWeight: '600' },
  doPill: { flex: 1, padding: 10, borderRadius: 10 },
  doLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  doText: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 12 },
  ctaText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
})
