/**
 * ArenaGate — the "feed Dilly more" empty state shown when the user
 * has too few facts for the arena tools to produce honest output.
 *
 * Design call: tools in the new AI Arena use real per-user data
 * (profile facts, feed, applications). If the profile has < 10
 * facts, the tools would have nothing to bite into. Instead of
 * showing them with placeholder text, we show a single-screen gate
 * with three concrete prompts. Each prompt opens Dilly chat seeded
 * with a specific question. Users get to the arena by feeding the
 * profile; the act of feeding IS the onboarding.
 *
 * This reads as respect, not a paywall — "Dilly needs to know you
 * before she can be useful."
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { DillyFace } from '../DillyFace'
import { useResolvedTheme } from '../../hooks/useTheme'
import { openDillyOverlay } from '../../hooks/useDillyOverlay'

interface Props {
  factCount: number
  /** Minimum facts required before the arena un-gates. */
  threshold?: number
  /** Mode-specific seed prompts (3). */
  prompts: string[]
  /** Optional headline; defaults to "Dilly needs more from you." */
  headline?: string
}

export default function ArenaGate({
  factCount,
  threshold = 10,
  prompts,
  headline = 'Dilly needs more from you.',
}: Props) {
  const theme = useResolvedTheme()
  const shortfall = Math.max(0, threshold - factCount)

  return (
    <View style={[s.wrap, { backgroundColor: theme.surface.bg }]}>
      <View style={s.faceWrap}>
        <DillyFace size={110} />
      </View>
      <Text style={[s.headline, { color: theme.surface.t1 }]}>{headline}</Text>
      <Text style={[s.sub, { color: theme.surface.t2 }]}>
        The arena needs real facts about you to produce honest reads. You have{' '}
        <Text style={{ color: theme.accent, fontWeight: '800' }}>{factCount}</Text>. Give her{' '}
        <Text style={{ color: theme.accent, fontWeight: '800' }}>{shortfall}</Text> more and the
        tools turn on.
      </Text>

      <View style={s.promptWrap}>
        {prompts.map((p, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: p })}
            style={[s.prompt, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}
          >
            <Ionicons name="sparkles" size={14} color={theme.accent} />
            <Text style={[s.promptText, { color: theme.surface.t1 }]} numberOfLines={3}>{p}</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.surface.t3} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.hint, { color: theme.surface.t3 }]}>
        Dilly listens as you talk. When she has 5 real user messages in a conversation, she
        extracts and saves the durable facts to your profile automatically.
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  faceWrap: { marginTop: 10, marginBottom: 14 },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 6,
  },
  promptWrap: {
    width: '100%',
    marginTop: 28,
    gap: 10,
  },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
  },
  promptText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  hint: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 28,
    paddingHorizontal: 20,
    fontStyle: 'italic',
  },
})
