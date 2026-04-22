/**
 * Honest Mirror — student tile. Reads the rubric the student will
 * actually be graded against (from the cohort playbook) and tallies
 * which items the student's profile has and hasn't substantiated.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'

interface RubricItem {
  text: string
  have: boolean
  why: string
}

export default function HonestMirror() {
  const theme = useResolvedTheme()
  const [profile, setProfile] = useState<any>(null)
  const [facts, setFacts] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      const [prof, surface] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/memory/surface').catch(() => null),
      ])
      setProfile(prof || {})
      setFacts(Array.isArray((surface as any)?.items) ? (surface as any).items : [])
    })()
  }, [])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )

  const items: RubricItem[] = useMemo(() => {
    const lowered = facts
      .map(f => (f.label || f.value || '').toLowerCase())
      .join(' | ')
    return playbook.rubric.map(r => {
      const firstWord = r.toLowerCase().split(/\s+/)[0]
      const have = lowered.includes(firstWord) || lowered.includes(r.toLowerCase().split(/\s+/)[1] || firstWord)
      return {
        text: r,
        have,
        why: have
          ? 'Your profile has something Dilly reads as evidence.'
          : 'No direct evidence yet. Talk to Dilly about this.',
      }
    })
  }, [facts, playbook])

  const score = items.filter(i => i.have).length

  return (
    <ArenaPage
      eyebrow="HONEST · MIRROR"
      title={`The ${playbook.shortName} rubric, scored.`}
      subtitle="Five things hiring managers actually grade against. This is what your surface reads as today."
    >
      <View style={[s.scoreCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
        <Text style={[s.scoreLabel, { color: theme.accent }]}>YOU ARE PROVING</Text>
        <Text style={[s.scoreBig, { color: theme.surface.t1 }]}>
          {score} <Text style={{ fontSize: 20, color: theme.surface.t3 }}>of {items.length}</Text>
        </Text>
      </View>

      {items.map((r, i) => (
        <View
          key={i}
          style={[
            s.row,
            {
              backgroundColor: theme.surface.s1,
              borderColor: r.have ? '#34C75930' : theme.accentBorder,
            },
          ]}
        >
          <Ionicons
            name={r.have ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={r.have ? '#34C759' : theme.accent}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[s.rText, { color: theme.surface.t1 }]}>{r.text}</Text>
            <Text style={[s.rWhy, { color: theme.surface.t3 }]}>{r.why}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => openDillyOverlay({ initialMessage: `Honest Mirror says I'm proving ${score} of ${items.length} rubric items for ${playbook.shortName}. Help me close the gap on the missing ones, one at a time.` })}
        style={[s.cta, { backgroundColor: theme.accent }]}
      >
        <Ionicons name="chatbubbles" size={14} color="#FFF" />
        <Text style={s.ctaText}>Close a gap with Dilly</Text>
      </TouchableOpacity>
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  scoreCard: { marginHorizontal: 16, padding: 18, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  scoreLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  scoreBig: { fontSize: 44, fontWeight: '800', letterSpacing: -1.2, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  rText: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  rWhy: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: 16, marginTop: 20, paddingVertical: 13, borderRadius: 13 },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
})
