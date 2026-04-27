/**
 * Conviction Builder - the seeker centerpiece.
 *
 * For the user's top target company (or a cohort anchor fallback):
 *   - ASSETS: facts in the user's profile that serve as evidence
 *   - GAPS: rubric items the user hasn't substantiated, each with
 *     an inline Skills video suggestion to close the gap
 *   - STORY: a STAR-shaped scaffold pulled from the user's strongest
 *     achievement/project facts
 *   - QUESTIONS: three tailored questions to ask the interviewer
 *
 * Zero LLM. Purely the user's data × the cohort playbook × a thin
 * template layer. The goal is the user walks away feeling someone
 * actually looked at their profile.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { buildConviction, type Conviction, type Fact } from '../../../lib/arena/conviction'

interface Profile {
  first_name?: string
  cohorts?: string[]
  target_companies?: string[]
  application_target?: string
}

interface SkillsVideo { id: string; title?: string }

export default function ConvictionBuilder() {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [facts, setFacts] = useState<Fact[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [targets, setTargets] = useState<string[]>([])
  // Map skillQuery → videoId[] so the gap rows can render one inline
  // SkillsVideoCard per gap without extra round-trips.
  const [gapVideos, setGapVideos] = useState<Record<string, string[]>>({})

  const load = useCallback(async () => {
    try {
      const [prof, surface] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/memory').catch(() => null),
      ])
      const p = (prof || {}) as Profile
      setProfile(p)
      const items: Fact[] = Array.isArray((surface as any)?.items) ? (surface as any).items : []
      setFacts(items)

      const pb = resolvePlaybook(p.cohorts || [])
      // Build the candidate target list: user's explicit targets,
      // then cohort tier1 anchors, deduped.
      const raw = [
        ...(p.target_companies || []),
        p.application_target,
        ...pb.anchorCompanies.tier1,
      ].filter(Boolean) as string[]
      const seen = new Set<string>()
      const tlist: string[] = []
      for (const t of raw) {
        const k = t.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        tlist.push(t)
      }
      setTargets(tlist)
      if (tlist[0]) setTarget(tlist[0])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )

  const conviction = useMemo<Conviction | null>(() => {
    if (!target) return null
    return buildConviction(facts, playbook, target)
  }, [facts, playbook, target])

  // When the conviction computes, fetch one curated Skills video per
  // skillQuery so the gap rows render inline. Cached by query so a
  // target-switch does not refetch what we already have.
  useEffect(() => {
    if (!conviction) return
    const queries = conviction.gaps.map(g => g.skillQuery).filter(Boolean)
    const needed = queries.filter(q => !gapVideos[q])
    if (needed.length === 0) return
    ;(async () => {
      const next: Record<string, string[]> = { ...gapVideos }
      // We have no full-text skill-lab search endpoint; derive a
      // keyword-scored list from trending for each query.
      const trending = await dilly.get('/skill-lab/trending?limit=100').catch(() => null)
      const pool: SkillsVideo[] = Array.isArray((trending as any)?.videos) ? (trending as any).videos : []
      for (const q of needed) {
        const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
        const ranked = pool
          .map(v => ({
            v,
            score: tokens.reduce((acc, t) => acc + ((v as any).title?.toLowerCase?.().includes(t) ? 2 : 0)
              + ((v as any).description?.toLowerCase?.().includes(t) ? 1 : 0), 0),
          }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 1)
          .map(x => x.v.id)
        next[q] = ranked
      }
      setGapVideos(next)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conviction?.gaps.map(g => g.skillQuery).join('|')])

  if (loading) {
    return <DillyLoadingState insetTop={insets.top} mood="thinking" messages={['Reading your profile…', 'Building your conviction…']} />
  }
  if (!target || !conviction) {
    return (
      <View style={[s.center, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40 }]}>
        <Text style={[s.emptyTitle, { color: theme.surface.t1 }]}>Pick a target</Text>
        <Text style={[s.emptyBody, { color: theme.surface.t2 }]}>
          Tell Dilly which company you are most serious about. The builder sharpens against that target.
        </Text>
        <TouchableOpacity
          onPress={() => openDillyOverlay({ initialMessage: 'Which company am I most serious about? Let me think through who I would actually take an offer from.' })}
          style={[s.ctaBtn, { backgroundColor: theme.accent }]}
        >
          <Text style={s.ctaBtnText}>Talk to Dilly</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(app)/ai-arena" as any); }} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>CONVICTION · BUILDER</Text>
          <Text style={[s.title, { color: theme.surface.t1 }]}>Walking into {target}.</Text>
        </View>
      </View>

      {/* Target switcher */}
      {targets.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.targetsRow}>
          {targets.map(t => {
            const active = t === target
            return (
              <TouchableOpacity
                key={t}
                activeOpacity={0.85}
                onPress={() => setTarget(t)}
                style={[
                  s.targetPill,
                  active
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : { borderColor: theme.accentBorder },
                ]}
              >
                <Text style={[s.targetPillText, { color: active ? '#FFF' : theme.surface.t1 }]}>{t}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      ) : null}

      {/* Assets */}
      <Text style={[s.sectionTitle, { color: '#34C759' }]}>YOUR ASSETS</Text>
      <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
        Facts in your profile Dilly reads as real evidence for {target}.
      </Text>
      {conviction.assets.length === 0 ? (
        <View style={[s.cardNeutral, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}>
          <Text style={[s.neutralText, { color: theme.surface.t2 }]}>
            Nothing in your profile directly maps yet. Spend a conversation with Dilly on a project you built.
          </Text>
        </View>
      ) : (
        conviction.assets.map((a, i) => (
          <View key={i} style={[s.row, { backgroundColor: theme.surface.s1, borderColor: '#34C75930' }]}>
            <View style={[s.rowDot, { backgroundColor: '#34C759' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{a.label}</Text>
              <Text style={[s.rowSub, { color: theme.surface.t3 }]}>{a.why}</Text>
            </View>
          </View>
        ))
      )}

      {/* Gaps */}
      <Text style={[s.sectionTitle, { color: '#FF9F0A' }]}>WHAT WILL GET PROBED</Text>
      <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
        Rubric items for {playbook.shortName} your profile has not substantiated. Close one this week.
      </Text>
      {conviction.gaps.length === 0 ? (
        <View style={[s.cardNeutral, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}>
          <Text style={[s.neutralText, { color: theme.surface.t2 }]}>
            No obvious gaps from your profile - well-covered. The interviewer will probe depth, not breadth.
          </Text>
        </View>
      ) : (
        conviction.gaps.map((g, i) => (
          <View key={i} style={{ marginBottom: 12 }}>
            <View style={[s.row, { backgroundColor: theme.surface.s1, borderColor: '#FF9F0A30' }]}>
              <View style={[s.rowDot, { backgroundColor: '#FF9F0A' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: theme.surface.t1 }]}>{g.label}</Text>
                <Text style={[s.rowSub, { color: theme.surface.t3 }]}>{g.why}</Text>
              </View>
            </View>
            {gapVideos[g.skillQuery]?.[0] ? (
              <View style={{ paddingHorizontal: 16 }}>
                <SkillsVideoCard videoId={gapVideos[g.skillQuery][0]} />
              </View>
            ) : null}
          </View>
        ))
      )}

      {/* Story */}
      {conviction.story ? (
        <>
          <Text style={[s.sectionTitle, { color: theme.accent }]}>A STORY YOU CAN TELL</Text>
          <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
            Pulled from your strongest fact. Fill the specifics in your own voice.
          </Text>
          <View style={[s.storyCard, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
            <Text style={[s.storyPrompt, { color: theme.accent }]}>
              "{conviction.story.prompt}"
            </Text>
            <Text style={[s.storyDraft, { color: theme.surface.t1 }]}>
              {conviction.story.draft}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openDillyOverlay({
                initialMessage: `Help me rehearse this story. Context:\n\n${conviction.story!.draft}\n\nAsk me one question at a time to make me fill in the real specifics.`,
              })}
              style={[s.rehearseBtn, { backgroundColor: theme.accent }]}
            >
              <Ionicons name="chatbubbles" size={14} color="#FFF" />
              <Text style={s.rehearseBtnText}>Rehearse with Dilly</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {/* Questions */}
      <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>QUESTIONS TO ASK THEM</Text>
      <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
        Three that will signal you thought hard about the shape of this role.
      </Text>
      {conviction.questions.map((q, i) => (
        <View key={i} style={[s.questionRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <Text style={[s.qNumber, { color: theme.accent }]}>0{i + 1}</Text>
          <Text style={[s.qText, { color: theme.surface.t1 }]}>{q}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, paddingHorizontal: 10 },
  ctaBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 11, marginTop: 18 },
  ctaBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingBottom: 12 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },

  targetsRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  targetPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  targetPillText: { fontSize: 12, fontWeight: '800' },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 22, marginBottom: 6,
  },
  sectionSub: { fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 3 },

  cardNeutral: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  neutralText: { fontSize: 13, lineHeight: 19 },

  storyCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  storyPrompt: { fontSize: 13, fontWeight: '800', fontStyle: 'italic' },
  storyDraft: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  rehearseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 14,
  },
  rehearseBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  qNumber: { fontSize: 11, fontWeight: '900', letterSpacing: 1, width: 22, marginTop: 2 },
  qText: { flex: 1, fontSize: 13, lineHeight: 19 },
})
