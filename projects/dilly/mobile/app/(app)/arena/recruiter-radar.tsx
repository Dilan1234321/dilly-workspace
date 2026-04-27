/**
 * Recruiter Radar - student tile. Simulates the 15-second read a
 * recruiter does of a student's public profile. We surface a
 * ranked list of the first three things they would see, plus a
 * "killer detail" test (name the single item that would make them
 * stop scrolling).
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'

interface Line {
  label: string
  value: string
  strong: boolean
  why: string
}

export default function RecruiterRadar() {
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

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )

  const lines: Line[] = useMemo(() => {
    const tagline = profile?.profile_tagline || profile?.web_headline
    const headline = tagline || profile?.name || 'Your name'
    const achievement = facts.find(f => String(f.category).toLowerCase() === 'achievement')
    const project = facts.find(f => String(f.category).toLowerCase() === 'project')
    return [
      {
        label: 'Line 1 - Identity',
        value: tagline
          ? `${profile?.name || ''} · ${tagline}`
          : `${profile?.name || 'Your name'} · ${playbook.shortName} student`,
        strong: !!tagline,
        why: tagline ? 'A tagline you wrote. Reads as intent.' : 'No custom tagline. Reads as generic.',
      },
      {
        label: 'Line 2 - Proof',
        value: achievement?.label || achievement?.value || 'No achievement surfaced yet',
        strong: !!achievement,
        why: achievement ? 'A concrete achievement, the first thing a recruiter pattern-matches on.' : 'No achievement on your surface - recruiters will move on.',
      },
      {
        label: 'Line 3 - What you built',
        value: project?.label || project?.value || 'No project surfaced yet',
        strong: !!project,
        why: project ? 'A project is the strongest proof for students - shows you ship, not just learn.' : 'No project on your surface. This is the line that buys you a reply.',
      },
    ]
  }, [profile, facts, playbook])

  const killerDetail = useMemo(() => {
    const hero = facts.find(f => ['achievement', 'project'].includes(String(f.category).toLowerCase()))
    return hero?.label || hero?.value || null
  }, [facts])

  return (
    <ArenaPage
      eyebrow="RECRUITER · RADAR"
      title="A recruiter gives you 15 seconds."
      subtitle={`Here is exactly what they see, in order. Strong lines stop them; weak lines lose them.`}
    >
      {lines.map((ln, i) => (
        <View
          key={i}
          style={[
            s.row,
            {
              backgroundColor: theme.surface.s1,
              borderColor: ln.strong ? '#34C75930' : theme.accentBorder,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: theme.accent }]}>{ln.label.toUpperCase()}</Text>
            <Text style={[s.value, { color: theme.surface.t1 }]} numberOfLines={2}>{ln.value}</Text>
            <Text style={[s.why, { color: theme.surface.t3 }]}>{ln.why}</Text>
          </View>
          <Ionicons
            name={ln.strong ? 'flash' : 'alert-circle-outline'}
            size={20}
            color={ln.strong ? '#34C759' : theme.accent}
          />
        </View>
      ))}

      <Text style={[s.section, { color: theme.surface.t3 }]}>THE KILLER DETAIL TEST</Text>
      <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
        The single item that makes a scrolling recruiter stop. Do you have one that passes?
      </Text>
      <View style={[s.killerCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
        {killerDetail ? (
          <>
            <Text style={[s.killerLabel, { color: theme.accent }]}>YOUR CURRENT KILLER</Text>
            <Text style={[s.killer, { color: theme.surface.t1 }]}>"{killerDetail}"</Text>
            <Text style={[s.killerHint, { color: theme.surface.t2 }]}>
              If this has a number attached, it is probably enough. If not, give it one with Dilly.
            </Text>
          </>
        ) : (
          <>
            <Text style={[s.killerLabel, { color: theme.accent }]}>MISSING</Text>
            <Text style={[s.killer, { color: theme.surface.t1 }]}>
              You do not have one yet. That is the single highest-leverage move.
            </Text>
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `Help me land a killer detail on my public profile. My cohort is ${playbook.shortName}. Ask me what I've built or shipped and help me phrase it in one line with a real number.` })}
            style={[s.btn, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="sparkles" size={13} color="#FFF" />
            <Text style={s.btnText}>Build one with Dilly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(app)/public-profile-settings')}
            style={[s.btnGhost, { borderColor: theme.accentBorder }]}
          >
            <Ionicons name="person-circle" size={13} color={theme.accent} />
            <Text style={[s.btnGhostText, { color: theme.surface.t1 }]}>Edit profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  value: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  why: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  section: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, paddingHorizontal: 20, marginTop: 22, marginBottom: 8 },
  sectionSub: { fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 10 },
  killerCard: { marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: 1 },
  killerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  killer: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', lineHeight: 21, marginTop: 8 },
  killerHint: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  btnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  btnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  btnGhostText: { fontSize: 12, fontWeight: '800' },
})
