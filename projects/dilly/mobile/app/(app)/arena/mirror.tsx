/**
 * Honest Mirror — student tile. Reads the rubric hiring managers in
 * the user's field actually use, and shows which items the user's
 * profile already substantiates (green) vs which still need evidence
 * (empty). Tap a missing row to open Dilly asking about that one
 * specific item; tap a green row to see which fact Dilly read as
 * evidence.
 *
 * Rewrite focus (build 367): every confusing phrase replaced with
 * plain English, evidence is cited per row instead of a generic "your
 * profile has something", rows are tappable so gap-closing is one tap
 * instead of a separate CTA.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { computeMirrorState, type MirrorState } from '../../../lib/arena/mirror-state'

export default function HonestMirror() {
  const theme = useResolvedTheme()
  const [profile, setProfile] = useState<any>(null)
  const [facts, setFacts] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      const [prof, surface] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/memory').catch(() => null),
      ])
      setProfile(prof || {})
      setFacts(Array.isArray((surface as any)?.items) ? (surface as any).items : [])
    })()
  }, [])

  const state: MirrorState = useMemo(
    () => computeMirrorState(profile, facts),
    [profile, facts],
  )

  return (
    <ArenaPage
      eyebrow="HONEST MIRROR"
      title={`${state.total} things ${state.shortName} recruiters want to see.`}
      subtitle={`Green means your profile already shows it. Empty means Dilly hasn't seen proof yet — tap any empty row to tell her about it.`}
    >
      {/* Status card — one sentence, plain English. Drops the
          big-number read ("YOUR PROFILE COVERS 3 of 5") because
          testers said it read like a grade. */}
      <View style={[s.statusCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
        <Text style={[s.statusLine, { color: theme.surface.t1 }]}>
          {state.missing === 0
            ? `You're showing proof on all ${state.total}.`
            : state.have === 0
              ? `Dilly doesn't see proof on any of these yet. Let's fix that.`
              : `You're showing proof on ${state.have} of ${state.total}. ${state.missing} to go.`}
        </Text>
      </View>

      {/* Rows. Tapping a GREEN row shows Dilly the evidence + asks
          her to help sharpen that story. Tapping an EMPTY row opens
          Dilly focused on that one item so the user can fill the gap
          in under a minute. Single-purpose taps, no separate CTA. */}
      {state.rows.map((r, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.85}
          onPress={() => {
            if (r.have) {
              openDillyOverlay({
                initialMessage: `For my Honest Mirror rubric "${r.text}", Dilly read "${r.evidence || ''}" as evidence. Help me sharpen how I tell that story.`,
              })
            } else {
              openDillyOverlay({
                initialMessage: `My Honest Mirror says I don't yet show proof for "${r.text}" in ${state.shortName}. Walk me through it — one concrete example I could add to my profile.`,
              })
            }
          }}
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
            {r.have && r.evidence ? (
              <Text style={[s.rWhy, { color: theme.surface.t3 }]} numberOfLines={2}>
                Proof: {r.evidence}
              </Text>
            ) : (
              <Text style={[s.rWhy, { color: theme.accent }]}>
                Tap to tell Dilly about this
              </Text>
            )}
          </View>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={theme.surface.t3}
            style={{ marginLeft: 4, alignSelf: 'center' }}
          />
        </TouchableOpacity>
      ))}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  statusCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusLine: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  rText: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  rWhy: { fontSize: 12, lineHeight: 17, marginTop: 4 },
})
