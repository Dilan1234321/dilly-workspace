/**
 * Honest Mirror - rebuilt ground up (build 420).
 *
 * The previous version was a checklist of rubric items with green checks.
 * Testers said it felt like a game - run through it, get all green, feel
 * "done with the app." The mirror's whole point is honesty, and a list of
 * checkmarks is the opposite. This rewrite drops the list completely in
 * favor of a narrative read:
 *
 *   1. A direct one-liner verdict at the top - what their profile
 *      actually looks like to a hiring manager in their cohort.
 *   2. The single strongest piece of evidence on their profile, with
 *      why it matters.
 *   3. The single biggest exposure - what is missing that the people
 *      who get hired in this cohort always have.
 *   4. The one move that would shift the most weight this month, with
 *      a tap to talk it through with Dilly.
 *
 * No green checks. No "X of Y complete." Anyone reading this should
 * walk away knowing exactly where they stand and what to do next - not
 * feeling like they finished a level.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { computeMirrorState, type MirrorState, type MirrorRow } from '../../../lib/arena/mirror-state'

interface Read {
  verdict: string
  strength: MirrorRow | null
  exposure: MirrorRow | null
  move: string
  moveSeed: string
}

function buildRead(state: MirrorState): Read {
  const have = state.have
  const total = state.total
  const ratio = total > 0 ? have / total : 0
  const cohort = state.shortName
  const present = state.rows.filter(r => r.have)
  const missing = state.rows.filter(r => !r.have)

  // Verdict: an honest one-liner. Not encouragement, not punishment -
  // a calibrated read of what the profile says today.
  let verdict = ''
  if (total === 0) {
    verdict = `Dilly does not have enough on your profile yet to call your read. Add a few things and come back.`
  } else if (have === 0) {
    verdict = `To a ${cohort} hiring manager, your profile reads as unproven. None of the things they look for are showing up yet.`
  } else if (ratio < 0.34) {
    verdict = `To a ${cohort} hiring manager, your profile is thin. You are showing ${have} of the ${total} signals they weight - the rest is invisible.`
  } else if (ratio < 0.67) {
    verdict = `To a ${cohort} hiring manager, your profile is plausible but not striking. You are showing ${have} of ${total} signals - enough to get a look, not enough to win.`
  } else if (ratio < 1) {
    verdict = `To a ${cohort} hiring manager, your profile is strong. ${have} of ${total} signals are on the page - the missing ${total - have} is what stands between you and the offer.`
  } else {
    verdict = `To a ${cohort} hiring manager, your profile reads as a serious candidate. Every signal they weight is on the page. The work now is sharpening the story, not adding to it.`
  }

  // Strongest evidence: the first row Dilly actually matched. The
  // matcher orders rows by playbook priority, so first is most
  // load-bearing in the cohort's rubric.
  const strength = present[0] || null

  // Biggest exposure: same thing, but for missing. The first missing
  // rubric line is the one most worth closing.
  const exposure = missing[0] || null

  // The one move. Specific, this-month. No multi-step plan.
  let move = ''
  let moveSeed = ''
  if (exposure) {
    move = `Build one piece of proof for "${exposure.text}" this month.`
    moveSeed = `My Honest Mirror says my biggest exposure for ${cohort} is "${exposure.text}". Walk me through ONE concrete project, story, or artifact I could build this month that would close it. Be specific about what to make and how to talk about it.`
  } else if (strength) {
    move = `Sharpen how you tell the "${strength.text}" story.`
    moveSeed = `My Honest Mirror says "${strength.text}" is my strongest signal for ${cohort}. Help me sharpen how I tell that story so it lands harder in interviews and on my resume.`
  } else {
    move = `Tell Dilly two things about your work and check back.`
    moveSeed = `My Honest Mirror is empty - Dilly has not seen enough about me yet. Ask me 3 questions to get the basics on the page.`
  }

  return { verdict, strength, exposure, move, moveSeed }
}

export default function HonestMirror() {
  const theme = useResolvedTheme()
  const [profile, setProfile] = useState<any>(null)
  const [facts, setFacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [prof, surface] = await Promise.all([
          dilly.get('/profile').catch(() => null),
          dilly.get('/memory').catch(() => null),
        ])
        setProfile(prof || {})
        setFacts(Array.isArray((surface as any)?.items) ? (surface as any).items : [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const state: MirrorState = useMemo(
    () => computeMirrorState(profile, facts),
    [profile, facts],
  )
  const read = useMemo(() => buildRead(state), [state])

  return (
    <ArenaPage
      eyebrow="HONEST MIRROR"
      title={`How your profile reads in ${state.shortName}.`}
      subtitle={`Not a checklist. A direct read of where you stand and what to do about it.`}
    >
      {/* The verdict. Lives in a quoted block so it reads like
          someone telling the user the truth, not a metric. */}
      <View style={[s.verdictCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <Ionicons name="eye" size={18} color={theme.accent} style={{ marginBottom: 10 }} />
        <Text style={[s.verdictText, { color: theme.surface.t1 }]}>
          {loading ? 'Reading your profile…' : read.verdict}
        </Text>
      </View>

      {/* Strongest evidence. Single row, not a list. The point is
          for the user to know exactly which one thing is doing the
          heavy lifting on their profile. */}
      {!loading && read.strength ? (
        <View style={[s.signalCard, { backgroundColor: theme.surface.s1, borderColor: '#34C75933' }]}>
          <View style={s.signalHeader}>
            <Ionicons name="trending-up" size={14} color="#34C759" />
            <Text style={[s.signalEyebrow, { color: '#34C759' }]}>WHAT IS WORKING</Text>
          </View>
          <Text style={[s.signalLine, { color: theme.surface.t1 }]}>{read.strength.text}</Text>
          {read.strength.evidence ? (
            <Text style={[s.signalProof, { color: theme.surface.t2 }]} numberOfLines={3}>
              The proof Dilly read: "{read.strength.evidence}"
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Biggest exposure. Same single-row treatment. Direct about
          what is missing, not softened. */}
      {!loading && read.exposure ? (
        <View style={[s.signalCard, { backgroundColor: theme.surface.s1, borderColor: '#FF453A33' }]}>
          <View style={s.signalHeader}>
            <Ionicons name="warning" size={14} color="#FF453A" />
            <Text style={[s.signalEyebrow, { color: '#FF453A' }]}>WHERE YOU ARE EXPOSED</Text>
          </View>
          <Text style={[s.signalLine, { color: theme.surface.t1 }]}>{read.exposure.text}</Text>
          <Text style={[s.signalProof, { color: theme.surface.t2 }]}>
            Hiring managers in {state.shortName} look for this and Dilly does not see it on your profile. That gap is what is keeping the next call from coming.
          </Text>
        </View>
      ) : null}

      {/* The one move. Single CTA. The whole point of the page is
          that the user knows what to do when they leave it. */}
      {!loading ? (
        <View style={[s.moveCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Text style={[s.moveEyebrow, { color: theme.accent }]}>ONE MOVE THIS MONTH</Text>
          <Text style={[s.moveText, { color: theme.surface.t1 }]}>{read.move}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: read.moveSeed })}
            style={[s.moveCta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={s.moveCtaText}>Plan it with Dilly</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Footnote. The full rubric is still here for the curious -
          but as a SECONDARY tap-to-reveal, not the primary surface. */}
      {!loading && state.total > 2 ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => openDillyOverlay({
            initialMessage: `Walk me through every rubric item my Honest Mirror is checking for ${state.shortName}, not just the top two. Tell me which ones I am showing proof for and which I am not.`,
          })}
          style={s.footnoteRow}
        >
          <Ionicons name="list-outline" size={13} color={theme.surface.t3} />
          <Text style={[s.footnote, { color: theme.surface.t3 }]}>
            See all {state.total} signals Dilly checks for in {state.shortName}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={theme.surface.t3} />
        </TouchableOpacity>
      ) : null}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  verdictCard: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  verdictText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  signalCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  signalEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  signalLine: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 6,
  },
  signalProof: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  moveCard: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  moveEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  moveText: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 14,
  },
  moveCta: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
  },
  moveCtaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  footnote: { flex: 1, fontSize: 12, fontWeight: '600' },
})
