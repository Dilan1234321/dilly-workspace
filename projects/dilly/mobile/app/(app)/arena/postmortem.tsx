/**
 * Rejection Post-Mortem — student tile. A structured walkthrough
 * after a no. Guides the student through five questions and seeds
 * each with a Dilly chat so the post-mortem actually happens.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'

interface Q {
  label: string
  question: string
  why: string
}

const QUESTIONS: Q[] = [
  {
    label: '1 — THE MOMENT',
    question: 'Walk me through the moment you got the no. Where were you? What did they say?',
    why: 'Naming the moment stops you from rewriting it in your head.',
  },
  {
    label: '2 — THE STORY YOU ARE TELLING',
    question: 'What is the story you are already telling yourself about why?',
    why: 'That story is usually wrong, and it is usually cruel. Surface it on purpose.',
  },
  {
    label: '3 — THE FACTS',
    question: 'What do you actually know about the decision? What is speculation?',
    why: 'Rejection gets worse when you fill gaps in the truth with fear.',
  },
  {
    label: '4 — THE LESSON',
    question: 'What is one specific thing you would do differently next time, not in general, but next time?',
    why: 'The rep, not the brag-sheet.',
  },
  {
    label: '5 — THE NEXT MOVE',
    question: 'What is the one thing you will send, apply to, or build in the next 48 hours?',
    why: 'Time between noes is not recovery. Time between noes is the stage.',
  },
]

export default function RejectionPostMortem() {
  const theme = useResolvedTheme()
  return (
    <ArenaPage
      eyebrow="REJECTION · POST-MORTEM"
      title="After a no, a real one."
      subtitle="Five questions. Five conversations. Walk out sharper than you walked in."
    >
      {QUESTIONS.map((q, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.85}
          onPress={() => openDillyOverlay({ initialMessage: `I want to do a rejection post-mortem. Question ${i + 1}: "${q.question}"\n\nAsk me the question, then push me when I answer shallow.` })}
          style={[s.row, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: theme.accent }]}>{q.label}</Text>
            <Text style={[s.question, { color: theme.surface.t1 }]}>{q.question}</Text>
            <Text style={[s.why, { color: theme.surface.t3 }]}>{q.why}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.surface.t3} />
        </TouchableOpacity>
      ))}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: 14, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  question: { fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 },
  why: { fontSize: 12, fontStyle: 'italic', marginTop: 6, lineHeight: 17 },
})
