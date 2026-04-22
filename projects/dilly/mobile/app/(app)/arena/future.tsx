/**
 * Future Pulse — the student centerpiece.
 *
 * A simulated day-in-the-life in the user's cohort three years out.
 * Four scenes (morning, midday, late afternoon, ceiling). Each scene
 * is a paragraph the user can sit with — specific, lived-in, not
 * generic. Below: the comp range at that future point, plus three
 * Dilly Skills videos to make it real this week.
 *
 * Zero LLM. Scenes come from the cohort playbook's `vignette`.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import DillyLoadingState from '../../../components/DillyLoadingState'
import SkillsVideoCard from '../../../components/SkillsVideoCard'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import { compactUsd } from '../../../lib/arena/value'

interface Profile {
  first_name?: string
  cohorts?: string[]
  graduation_year?: number
}

interface SkillsVideo { id: string }

export default function FuturePulse() {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [videoIds, setVideoIds] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const prof = await dilly.get('/profile').catch(() => null)
      const p = (prof || {}) as Profile
      setProfile(p)
      const slug = cohortToSlug(p.cohorts?.[0])
      if (slug) {
        const vids = await dilly.get(`/skill-lab/videos?cohort=${slug}&sort=best&limit=3`).catch(() => null)
        const list: SkillsVideo[] = Array.isArray((vids as any)?.videos) ? (vids as any).videos : []
        setVideoIds(list.map(v => v.id).slice(0, 3))
      }
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )
  const futureYear = useMemo(() => {
    const gradYr = Number(profile?.graduation_year || 0)
    if (gradYr > 2026) return gradYr + 3
    const yr = new Date().getFullYear()
    return yr + 3
  }, [profile])

  if (loading) {
    return <DillyLoadingState insetTop={insets.top} mood="thinking" messages={['Imagining your Tuesday…', `Putting you in your ${playbook?.shortName || 'field'} seat…`]} />
  }

  const fname = profile?.first_name || 'you'

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>FUTURE · PULSE</Text>
          <Text style={[s.title, { color: theme.surface.t1 }]}>{fname}'s Tuesday in {futureYear}.</Text>
          <Text style={[s.sub, { color: theme.surface.t2 }]}>
            If you land in {playbook.shortName}, here is the shape of your day.
          </Text>
        </View>
      </View>

      {/* Four scenes */}
      <Scene
        theme={theme}
        time="8:15 AM"
        label="MORNING"
        body={`Hey ${fname}. ${playbook.vignette.morning}`}
      />
      <Scene
        theme={theme}
        time="12:40 PM"
        label="MIDDAY"
        body={playbook.vignette.midday}
      />
      <Scene
        theme={theme}
        time="5:20 PM"
        label="LATE AFTERNOON"
        body={playbook.vignette.lateafternoon}
      />

      {/* Comp card */}
      <View style={[s.compCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
        <Text style={[s.compLabel, { color: theme.accent }]}>COMP AT {futureYear}</Text>
        <Text style={[s.compBig, { color: theme.surface.t1 }]}>
          {compactUsd(Math.round(playbook.comp.earlyBase * 1.15))}{' '}
          <Text style={{ color: theme.surface.t3, fontSize: 18 }}>base</Text>
        </Text>
        <Text style={[s.compSub, { color: theme.surface.t2 }]}>
          For a three-year-out {playbook.shortName} IC at a reputable firm. Strong performers clear{' '}
          <Text style={{ color: theme.accent, fontWeight: '800' }}>{compactUsd(playbook.comp.midBase)}+</Text> by year five.
        </Text>
      </View>

      {/* Ceiling scene */}
      <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>THE CEILING</Text>
      <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
        What the top of this track looks like. A decade out, if you aim at it.
      </Text>
      <View style={[s.ceilingCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <Text style={[s.ceilingBody, { color: theme.surface.t1 }]}>{playbook.vignette.ceiling}</Text>
      </View>

      {/* Make it real */}
      <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>MAKE IT REAL THIS WEEK</Text>
      <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
        Three curated videos Dilly pulled for {playbook.shortName}. Each one is a step toward the{' '}
        {futureYear} Tuesday above.
      </Text>

      {videoIds.length > 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          {videoIds.map(id => (
            <SkillsVideoCard key={id} videoId={id} />
          ))}
        </View>
      ) : (
        <View style={[s.ceilingCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <Text style={[s.ceilingBody, { color: theme.surface.t2 }]}>
            Dilly is still indexing videos for your cohort. Check the Skills tab in a minute.
          </Text>
        </View>
      )}

      {/* CTA */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openDillyOverlay({
            initialMessage: `I just read my Tuesday in ${futureYear}. Let's talk about what I would actually have to do in the next 12 months to land in ${playbook.shortName}.`,
          })}
          style={[s.chatCta, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="chatbubbles" size={15} color="#FFF" />
          <Text style={s.chatCtaText}>Talk through the path with Dilly</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function Scene({
  theme, time, label, body,
}: {
  theme: ReturnType<typeof useResolvedTheme>
  time: string
  label: string
  body: string
}) {
  return (
    <View style={[s.sceneCard, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}>
      <View style={s.sceneHeader}>
        <Text style={[s.sceneTime, { color: theme.accent }]}>{time}</Text>
        <View style={[s.sceneDot, { backgroundColor: theme.accent }]} />
        <Text style={[s.sceneLabel, { color: theme.surface.t3 }]}>{label}</Text>
      </View>
      <Text style={[s.sceneBody, { color: theme.surface.t1 }]}>{body}</Text>
    </View>
  )
}

function cohortToSlug(cohort: string | undefined): string | null {
  if (!cohort) return null
  const map: Record<string, string> = {
    'Software Engineering & CS':          'software-engineering-cs',
    'Data Science & Analytics':           'data-science-analytics',
    'Cybersecurity & IT':                 'cybersecurity-it',
    'Electrical & Computer Engineering':  'electrical-computer-engineering',
    'Mechanical & Aerospace Engineering': 'mechanical-aerospace-engineering',
    'Civil & Environmental Engineering':  'civil-environmental-engineering',
    'Chemical & Biomedical Engineering':  'chemical-biomedical-engineering',
    'Finance & Accounting':               'finance-accounting',
    'Consulting & Strategy':              'consulting-strategy',
    'Marketing & Advertising':            'marketing-advertising',
    'Management & Operations':            'management-operations',
    'Entrepreneurship & Innovation':      'entrepreneurship-innovation',
    'Economics & Public Policy':          'economics-public-policy',
    'Healthcare & Clinical':              'healthcare-clinical',
    'Biotech & Pharmaceutical':           'biotech-pharmaceutical',
    'Life Sciences & Research':           'life-sciences-research',
    'Physical Sciences & Math':           'physical-sciences-math',
    'Law & Government':                   'law-government',
    'Media & Communications':             'media-communications',
    'Design & Creative Arts':             'design-creative-arts',
    'Education & Human Development':      'education-human-development',
    'Social Sciences & Nonprofit':        'social-sciences-nonprofit',
  }
  return map[cohort] || null
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingBottom: 16 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },

  sceneCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  sceneHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sceneTime: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  sceneDot: { width: 4, height: 4, borderRadius: 2 },
  sceneLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  sceneBody: { fontSize: 14, lineHeight: 21, fontStyle: 'italic' },

  compCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  compLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  compBig: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  compSub: { fontSize: 13, lineHeight: 19, marginTop: 10 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 6,
  },
  sectionSub: { fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 10 },

  ceilingCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  ceilingBody: { fontSize: 14, lineHeight: 21 },

  chatCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 13,
  },
  chatCtaText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
})
