/**
 * The Hook - seeker tile. For each of the user's top 3 target
 * companies, renders a first-line email / message opening that
 * blends the company's cohort angle with a fact from the user's
 * profile. Zero LLM - templated with profile substitution.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'

interface Profile {
  first_name?: string
  target_companies?: string[]
  application_target?: string
  cohorts?: string[]
}

export default function TheHook() {
  const theme = useResolvedTheme()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [strongFact, setStrongFact] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [prof, surface] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/memory').catch(() => null),
      ])
      setProfile(prof as Profile)
      const items = Array.isArray((surface as any)?.items) ? (surface as any).items : []
      // Best fact: the first achievement or project with a label.
      const hero = items.find((f: any) => ['achievement', 'project'].includes(String(f.category).toLowerCase()))
      if (hero) setStrongFact(hero.label || hero.value || null)
    })()
  }, [])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )

  const targets = useMemo(() => {
    const raw = [
      ...(profile?.target_companies || []),
      profile?.application_target,
      ...playbook.anchorCompanies.tier1,
    ].filter(Boolean) as string[]
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of raw) {
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
      if (out.length >= 3) break
    }
    return out
  }, [profile, playbook])

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text)
    Alert.alert('Copied', 'The hook is on your clipboard.')
  }

  return (
    <ArenaPage
      eyebrow="THE · HOOK"
      title="First lines for your top targets."
      subtitle="A cold email opener tuned to each company's angle, using a real thing from your profile."
    >
      {targets.map((company, i) => {
        const hook = buildHook(company, profile, strongFact, playbook)
        return (
          <View key={i} style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
            <Text style={[s.company, { color: theme.accent }]}>{company.toUpperCase()}</Text>
            <Text style={[s.hook, { color: theme.surface.t1 }]}>"{hook}"</Text>
            <View style={s.actions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => copy(hook)}
                style={[s.actionBtn, { backgroundColor: theme.accent }]}
              >
                <Ionicons name="copy" size={13} color="#FFF" />
                <Text style={s.actionText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => Share.share({ message: hook })}
                style={[s.actionGhost, { borderColor: theme.accentBorder }]}
              >
                <Ionicons name="share-outline" size={13} color={theme.accent} />
                <Text style={[s.actionGhostText, { color: theme.surface.t1 }]}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })}

      {targets.length === 0 ? (
        <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <Text style={[s.hook, { color: theme.surface.t2 }]}>
            Tell Dilly which companies you are most serious about, and the hooks land here.
          </Text>
        </View>
      ) : null}
    </ArenaPage>
  )
}

function buildHook(
  company: string,
  profile: Profile | null,
  strongFact: string | null,
  playbook: CohortPlaybook,
): string {
  const fname = profile?.first_name || ''
  // Pick a template based on whether we have a real strong fact.
  if (strongFact) {
    return `Hi - I'm ${fname || 'a ' + playbook.shortName + ' candidate'}. I noticed ${company} is shipping into a space I've been building in. I recently ${lowerStart(strongFact)}, and I thought your team might be the one it translates best into. Would you be open to a 15-minute call next week?`
  }
  return `Hi - I've been following ${company} for a while, and the shape of the ${playbook.shortName} work your team is doing is exactly the problem I want to work on. I'd love a brief intro call to learn how you think about the role you're hiring for.`
}

function lowerStart(s: string): string {
  if (!s) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  company: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  hook: { fontSize: 14, lineHeight: 21, fontStyle: 'italic', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  actionGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  actionGhostText: { fontSize: 12, fontWeight: '800' },
})
