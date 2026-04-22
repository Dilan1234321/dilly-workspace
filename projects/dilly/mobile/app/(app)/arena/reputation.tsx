/**
 * Reputation Drift — holder tile. Reads the user's public-profile
 * settings + memory surface to compute a "visibility score" —
 * essentially how hard it would be for a recruiter to find what
 * makes the user rare. Actionable: each row is a fix.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'

interface Check {
  label: string
  pass: boolean
  fix: string
  route?: string
}

export default function ReputationDrift() {
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
      const items = Array.isArray((surface as any)?.items) ? (surface as any).items : []
      setFacts(items)
    })()
  }, [])

  const checks = useMemo<Check[]>(() => {
    const p = profile || {}
    const ws = p.web_profile_settings || {}
    const hasProjects = facts.some(f => String(f.category).toLowerCase() === 'project')
    const hasAchievement = facts.some(f => String(f.category).toLowerCase() === 'achievement')
    const hasSkills = facts.some(f => String(f.category).toLowerCase().includes('skill'))
    return [
      {
        label: 'Public profile is on',
        pass: p.public_profile_visible !== false,
        fix: 'Flip it on. Even if you are not actively looking, recruiters search the surface constantly.',
        route: '/(app)/public-profile-settings',
      },
      {
        label: 'You have a readable slug',
        pass: !!p.readable_slug,
        fix: 'A custom slug (dilly.com/p/your-name) looks 10× more professional than a UUID.',
        route: '/(app)/public-profile-settings',
      },
      {
        label: 'Profile has at least one project',
        pass: hasProjects,
        fix: 'A project is the single fastest way to prove you can ship. Tell Dilly about one you shipped.',
      },
      {
        label: 'Profile has at least one achievement',
        pass: hasAchievement,
        fix: 'An achievement anchored in numbers is how recruiters grade you in 15 seconds.',
      },
      {
        label: 'Profile has 3+ skills',
        pass: facts.filter(f => String(f.category).toLowerCase().includes('skill')).length >= 3,
        fix: 'Thin skill lists make you hard to place. Talk to Dilly about what you actually use.',
      },
      {
        label: 'Learning profile is on',
        pass: ws.learning_profile_visible !== false,
        fix: 'Your learning receipt proves intent. Keep it on — recruiters love to see active learning.',
        route: '/(app)/skills/profile-settings',
      },
    ]
  }, [profile, facts])

  const score = Math.round((checks.filter(c => c.pass).length / Math.max(1, checks.length)) * 100)
  const scoreColor = score >= 80 ? '#34C759' : score >= 50 ? '#FFB300' : '#FF453A'

  return (
    <ArenaPage
      eyebrow="REPUTATION · DRIFT"
      title="How visible you actually are."
      subtitle="A recruiter would see this in 15 seconds. Here is the honest tally."
    >
      {/* Score */}
      <View style={[s.scoreCard, { backgroundColor: theme.surface.s1, borderColor: scoreColor + '40' }]}>
        <Text style={[s.scoreLabel, { color: theme.surface.t3 }]}>VISIBILITY</Text>
        <Text style={[s.scoreBig, { color: scoreColor }]}>{score}<Text style={{ fontSize: 18, color: theme.surface.t3 }}> / 100</Text></Text>
        <Text style={[s.scoreBody, { color: theme.surface.t2 }]}>
          {score >= 80 ? 'Strong surface. Recruiters find the things that make you rare.'
            : score >= 50 ? 'You are partway there. The misses below are the next move.'
              : 'You are invisible right now. Fix two of these this week and the inbound changes.'}
        </Text>
      </View>

      {/* Checklist */}
      <Text style={[s.section, { color: theme.surface.t3 }]}>WHAT\'S MISSING</Text>
      {checks.map((c, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.85}
          disabled={!c.route}
          onPress={() => c.route && router.push(c.route as any)}
          style={[
            s.checkRow,
            { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
            !c.pass && { borderColor: theme.accentBorder },
          ]}
        >
          <Ionicons
            name={c.pass ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={c.pass ? '#34C759' : theme.accent}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[s.checkLabel, { color: theme.surface.t1 }]}>{c.label}</Text>
            {!c.pass ? (
              <Text style={[s.checkFix, { color: theme.surface.t3 }]}>{c.fix}</Text>
            ) : null}
          </View>
          {!c.pass && c.route ? (
            <Ionicons name="arrow-forward" size={14} color={theme.surface.t3} />
          ) : null}
        </TouchableOpacity>
      ))}
    </ArenaPage>
  )
}

const s = StyleSheet.create({
  scoreCard: { marginHorizontal: 16, padding: 18, borderRadius: 16, borderWidth: 1 },
  scoreLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  scoreBig: { fontSize: 44, fontWeight: '800', letterSpacing: -1.2, marginTop: 4 },
  scoreBody: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  section: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, paddingHorizontal: 20, marginTop: 22, marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  checkLabel: { fontSize: 13, fontWeight: '800' },
  checkFix: { fontSize: 11, fontWeight: '600', marginTop: 3, lineHeight: 16 },
})
