/**
 * AI Field Intelligence - the redesigned AI Arena center screen.
 *
 * Replaces the old 3-mode arena when EXPO_PUBLIC_ARENA_V2=true.
 * Answers: "How is AI changing my field, and what should I do about it?"
 *
 * 8 sections:
 *   1. Header + framing line (user_path narrator)
 *   2. Cohort Pulse  - live AI fluency % from DB, weekly agg
 *   3. Threat & Opportunity - skills at risk vs skills protected
 *   4. Role Radar   - SVG bubble chart: volume vs AI demand by role
 *   5. Your AI Readiness - entry point to Honest Mirror, reframed
 *   6. AI-Ready Playbook - concrete actions based on cohort data
 *   7. A Day in 2027 - tease of old Future Pulse screen
 *   8. Chapter Hook - talk with Dilly CTA
 *
 * Zero LLM in the default path. One deferred LLM call if user taps
 * "What would it take?" inside Honest Mirror (that's a separate screen).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import DillyLoadingState from '../../../components/DillyLoadingState'
import RoleRadarChart, { type RadarDot } from '../../../components/arena/RoleRadarChart'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook } from '../../../lib/arena/cohort-playbook'
import { framingForPath } from '../../../lib/arenaFraming'

// ── Types ──────────────────────────────────────────────────────────────────

interface Pulse {
  headline: string
  ai_fluency_pct: number
  total_listings: number
  ai_listings: number
  cross_cohort_rank: number
  cross_cohort_total: number
  above_average: boolean
  week_start: string
}

interface ThreatOpp {
  disruption_pct: number
  trend: string
  headline: string
  threats: string[]
  opportunities: string[]
  what_to_do: string
  live_total_listings: number
  live_ai_pct: number
}

interface FieldIntelResponse {
  cohort: string
  week_start: string
  data_ready: boolean
  pulse: Pulse | null
  threat_opportunity: ThreatOpp
  role_radar: RadarDot[]
  cross_cohort: { cohort: string; ai_fluency_pct: number; total_listings: number }[]
}

// Raw shape returned by GET /ai-arena/field-intel - the backend nests
// everything under `sections` and uses different field names than the
// UI was originally drafted against. The screen consumes the legacy
// FieldIntelResponse shape; `adaptFieldIntel` translates raw → legacy
// so the UI doesn't need to be rewritten.
interface RawFieldIntel {
  data_ready: boolean
  cohort: string
  cached?: boolean
  sections?: {
    cohort_pulse?: {
      headline?: string
      disruption_pct?: number
      trend?: string
      ai_resistant_skills?: string[]
    }
    threat_opportunity?: {
      threat_pct?: number
      opportunity_pct?: number
      threat_label?: string
      opportunity_label?: string
    }
    role_radar?: {
      roles?: { role_cluster: string; ai_fluency: 'high' | 'medium' | 'low'; count: number }[]
      cohort?: string
      note?: string
    }
    impact_score?: { score?: number; label?: string; description?: string }
    playbook?: { skills?: { skill: string; weight: number }[]; data_ready?: boolean }
    day_in_2027?: { narrative?: string }
    chapter_prompt?: { prompt?: string }
  }
}

function aiFluencyToPct(level: 'high' | 'medium' | 'low'): number {
  if (level === 'high') return 85
  if (level === 'medium') return 55
  return 20
}

function humanizeRoleCluster(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function adaptFieldIntel(raw: RawFieldIntel | null): FieldIntelResponse | null {
  if (!raw) return null
  const sections = raw.sections || {}
  const cp = sections.cohort_pulse || {}
  const ro = sections.role_radar?.roles || []
  const imp = sections.impact_score || {}

  const totalListings = ro.reduce((sum, r) => sum + (r.count || 0), 0)
  const aiListings = ro
    .filter(r => r.ai_fluency === 'high' || r.ai_fluency === 'medium')
    .reduce((sum, r) => sum + (r.count || 0), 0)
  const livePct = totalListings > 0 ? Math.round((aiListings / totalListings) * 100) : 0

  // Pulse: only build when we have either a headline or live volume.
  // Otherwise keep null so the NotReadyCard surfaces honestly.
  const pulseReady = !!(cp.headline || totalListings > 0)
  const pulse: Pulse | null = pulseReady
    ? {
        headline: cp.headline || `AI is reshaping ${raw.cohort}.`,
        ai_fluency_pct: cp.disruption_pct ?? livePct,
        total_listings: totalListings,
        ai_listings: aiListings,
        cross_cohort_rank: 0,
        cross_cohort_total: 0,
        above_average: false,
        week_start: new Date().toISOString().slice(0, 10),
      }
    : null

  // Threat & opportunity: derive threats from the highest-fluency role
  // clusters, opportunities from the cohort's AI-resistant skill list.
  const threats = ro
    .filter(r => r.ai_fluency === 'high')
    .slice(0, 4)
    .map(r => humanizeRoleCluster(r.role_cluster))
  const opportunities = (cp.ai_resistant_skills || []).slice(0, 4)

  const threat_opportunity: ThreatOpp = {
    disruption_pct: cp.disruption_pct ?? imp.score ?? 30,
    trend: cp.trend || 'rising',
    headline: cp.headline || `AI is changing how ${raw.cohort} operates.`,
    threats,
    opportunities,
    what_to_do: imp.description || '',
    live_total_listings: totalListings,
    live_ai_pct: livePct,
  }

  // Role radar dots - convert ai_fluency level → numeric percent so the
  // existing scatter chart can plot them on a continuous Y axis.
  const role_radar: RadarDot[] = ro.map(r => ({
    role_cluster: r.role_cluster,
    label: humanizeRoleCluster(r.role_cluster),
    vol: r.count,
    ai_pct: aiFluencyToPct(r.ai_fluency),
  }))

  return {
    cohort: raw.cohort,
    week_start: pulse?.week_start || new Date().toISOString().slice(0, 10),
    data_ready: !!raw.data_ready,
    pulse,
    threat_opportunity,
    role_radar,
    cross_cohort: [],
  }
}

interface Profile {
  first_name?: string
  cohorts?: string[]
  user_path?: string
}

// ── Screen ─────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width

export default function FieldIntelScreen() {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [intel, setIntel] = useState<FieldIntelResponse | null>(null)

  const load = useCallback(async () => {
    try {
      const [prof, intelRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/ai-arena/field-intel').catch(() => null),
      ])
      setProfile((prof || {}) as Profile)
      setIntel(adaptFieldIntel(intelRes as RawFieldIntel | null))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = useCallback(() => { setRefreshing(true); load() }, [load])

  const playbook = useMemo(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )

  const framing = useMemo(
    () => framingForPath(profile?.user_path || ''),
    [profile],
  )

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        mood="writing"
        accessory="pencil"
        messages={['Reading your field…', 'Pulling live market data…', 'Mapping threats and openings…']}
        onRetry={load}
      />
    )
  }

  const cohortName = intel?.cohort || profile?.cohorts?.[0] || 'Your Field'
  const pulse = intel?.pulse ?? null
  const threatOpp = intel?.threat_opportunity
  const radarDots: RadarDot[] = intel?.role_radar || []
  const fname = profile?.first_name || null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* ── Section 1: Header ─────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(app)/ai-arena' as any) }}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>AI FIELD INTELLIGENCE</Text>
          <Text style={[s.title, { color: theme.surface.t1 }]}>{cohortName}</Text>
          <Text style={[s.sub, { color: theme.surface.t2 }]}>
            {framing.line}
          </Text>
        </View>
      </View>

      {/* ── Section 2: Cohort Pulse ────────────────────────────────────── */}
      <SectionLabel label="COHORT PULSE" theme={theme} />
      {pulse ? (
        <View style={[s.pulseCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          {/* Big number */}
          <View style={s.pulseTop}>
            <View style={s.pulseStat}>
              <Text style={[s.pulseBig, { color: theme.accent }]}>{pulse.ai_fluency_pct}%</Text>
              <Text style={[s.pulseLabel, { color: theme.surface.t2 }]}>
                of {cohortName.split(' ')[0]} listings{'\n'}require AI skills
              </Text>
            </View>
            {pulse.cross_cohort_total > 0 ? (
              <View style={[s.rankBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                <Text style={[s.rankNum, { color: theme.accent }]}>#{pulse.cross_cohort_rank}</Text>
                <Text style={[s.rankSub, { color: theme.accent }]}>
                  of {pulse.cross_cohort_total} fields
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[s.pulseHeadline, { color: theme.surface.t1 }]}>
            {pulse.headline}
          </Text>

          <View style={[s.pulseMeta, { borderTopColor: theme.surface.border }]}>
            <Text style={[s.pulseMetaText, { color: theme.surface.t3 }]}>
              {pulse.total_listings.toLocaleString()} active listings tracked
            </Text>
            <Text style={[s.pulseMetaText, { color: theme.surface.t3 }]}>
              Week of {pulse.week_start}
            </Text>
          </View>
        </View>
      ) : (
        <NotReadyCard theme={theme} message="Cohort data is being computed. Check back Monday." />
      )}

      {/* ── Section 3: Threat & Opportunity ───────────────────────────── */}
      <SectionLabel label="THREAT & OPPORTUNITY" theme={theme} />
      {threatOpp ? (
        <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          {/* Disruption stat */}
          <View style={s.disruptRow}>
            <View style={[s.disruptBadge, { backgroundColor: riskColor(threatOpp.disruption_pct, 0.12) }]}>
              <Text style={[s.disruptPct, { color: riskColor(threatOpp.disruption_pct, 1) }]}>
                {threatOpp.disruption_pct}% disruption risk
              </Text>
            </View>
            <Text style={[s.trendTag, { color: theme.surface.t3 }]}>
              {trendLabel(threatOpp.trend)}
            </Text>
          </View>

          <Text style={[s.threatHeadline, { color: theme.surface.t1 }]}>
            "{threatOpp.headline}"
          </Text>

          <View style={s.splitRow}>
            {/* Threats column */}
            <View style={s.splitCol}>
              <View style={s.splitHeader}>
                <Ionicons name="warning" size={12} color="#FF453A" />
                <Text style={[s.splitTitle, { color: '#FF453A' }]}>AT RISK</Text>
              </View>
              {(threatOpp.threats || []).map((t, i) => (
                <View key={i} style={s.splitItem}>
                  <View style={[s.splitDot, { backgroundColor: '#FF453A' }]} />
                  <Text style={[s.splitText, { color: theme.surface.t2 }]}>{t}</Text>
                </View>
              ))}
            </View>

            {/* Divider */}
            <View style={[s.splitDivider, { backgroundColor: theme.surface.border }]} />

            {/* Opportunities column */}
            <View style={s.splitCol}>
              <View style={s.splitHeader}>
                <Ionicons name="shield-checkmark" size={12} color="#34C759" />
                <Text style={[s.splitTitle, { color: '#34C759' }]}>PROTECTED</Text>
              </View>
              {(threatOpp.opportunities || []).map((o, i) => (
                <View key={i} style={s.splitItem}>
                  <View style={[s.splitDot, { backgroundColor: '#34C759' }]} />
                  <Text style={[s.splitText, { color: theme.surface.t2 }]}>{o}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* ── Section 4: Role Radar ──────────────────────────────────────── */}
      <SectionLabel label="ROLE RADAR" theme={theme} />
      <Text style={[s.sectionSub, { color: theme.surface.t3 }]}>
        Job volume vs AI demand - where is your field moving?
      </Text>
      <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 8 }]}>
        <RoleRadarChart dots={radarDots} width={SCREEN_W - 64} />
      </View>

      {/* ── Section 5: Your AI Readiness ──────────────────────────────── */}
      <SectionLabel label="YOUR AI READINESS" theme={theme} />
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => router.push('/(app)/arena/mirror')}
        style={[s.readinessCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.readinessTitle, { color: theme.accent }]}>
            How does your profile hold up?
          </Text>
          <Text style={[s.readinessSub, { color: theme.surface.t1 }]}>
            Honest Mirror maps your real profile against the AI-resilient skills this field rewards.
            See exactly where you are strong and where you are exposed.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.accent} />
      </TouchableOpacity>

      {/* ── Section 6: AI-Ready Playbook ──────────────────────────────── */}
      <SectionLabel label="AI-READY PLAYBOOK" theme={theme} />
      {threatOpp?.what_to_do ? (
        <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <Text style={[s.playbookAction, { color: theme.surface.t1 }]}>
            {threatOpp.what_to_do}
          </Text>

          {/* Resistance skills as chips */}
          {(threatOpp.opportunities || []).slice(0, 3).length > 0 ? (
            <View style={s.chipRow}>
              {(threatOpp.opportunities || []).slice(0, 3).map((skill, i) => (
                <View key={i} style={[s.chip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                  <Text style={[s.chipText, { color: theme.accent }]}>{skill}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({
              initialMessage: `Here is what Dilly says about making myself AI-ready in ${cohortName}: "${threatOpp?.what_to_do}". Help me make this specific to my own profile and build a 90-day plan around it.`,
            })}
            style={[s.playbookCta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="chatbubbles" size={13} color="#FFF" />
            <Text style={s.playbookCtaText}>Make this specific to my profile</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Section 7: A Day in 2027 ──────────────────────────────────── */}
      <SectionLabel label="A DAY IN YOUR FIELD" theme={theme} />
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => router.push('/(app)/arena/future')}
        style={[s.dayCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
      >
        <View style={s.dayCardInner}>
          <View style={{ flex: 1 }}>
            <Text style={[s.dayEyebrow, { color: theme.accent }]}>8:15 AM · YOUR TUESDAY IN 2027</Text>
            <Text style={[s.dayVignette, { color: theme.surface.t1 }]} numberOfLines={3}>
              "{playbook.vignette.morning.slice(0, 130)}…"
            </Text>
            <Text style={[s.dayMeta, { color: theme.surface.t3 }]}>
              Grounded in the live data above. Tap to read all four scenes.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.surface.t3} />
        </View>
      </TouchableOpacity>

      {/* ── Section 8: Chapter Hook ────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, marginTop: 28 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openDillyOverlay({
            initialMessage: `I just read the AI Field Intelligence for ${cohortName}. ${pulse ? `${pulse.ai_fluency_pct}% of active listings in my field require AI skills, and I rank #${pulse.cross_cohort_rank} most AI-exposed out of ${pulse.cross_cohort_total} fields. ` : ''}What should I actually do in the next 30 days to position myself on the right side of this shift?`,
          })}
          style={[s.hookCta, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="sparkles" size={15} color="#FFF" />
          <Text style={s.hookCtaText}>
            {fname ? `What should you do, ${fname}?` : 'What should you do about this?'}
          </Text>
        </TouchableOpacity>
        <Text style={[s.hookSub, { color: theme.surface.t3 }]}>
          Dilly builds a 30-day plan from this data and your actual profile.
        </Text>
      </View>
    </ScrollView>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────

function SectionLabel({ label, theme }: { label: string; theme: ReturnType<typeof useResolvedTheme> }) {
  return (
    <Text style={[s.sectionLabel, { color: theme.surface.t3 }]}>{label}</Text>
  )
}

function NotReadyCard({ theme, message }: { theme: ReturnType<typeof useResolvedTheme>; message: string }) {
  return (
    <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      <Text style={[s.notReadyText, { color: theme.surface.t3 }]}>{message}</Text>
    </View>
  )
}

function riskColor(pct: number, alpha: number): string {
  if (pct >= 50) return `rgba(255,69,58,${alpha})`   // coral
  if (pct >= 35) return `rgba(255,159,10,${alpha})`  // amber
  return `rgba(52,199,89,${alpha})`                   // green
}

function trendLabel(trend: string): string {
  if (trend === 'rising_fast') return 'RISING FAST'
  if (trend === 'rising') return 'RISING'
  if (trend === 'falling') return 'FALLING'
  return 'STABLE'
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },

  sectionLabel: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 26, marginBottom: 8,
  },
  sectionSub: {
    fontSize: 12, lineHeight: 17,
    paddingHorizontal: 20, marginBottom: 8,
  },

  card: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },

  // Pulse
  pulseCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  pulseTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pulseStat: { flex: 1 },
  pulseBig: { fontSize: 42, fontWeight: '900', letterSpacing: -1.5, lineHeight: 46 },
  pulseLabel: { fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: '600' },
  rankBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 64,
  },
  rankNum: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  rankSub: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginTop: 2 },
  pulseHeadline: { fontSize: 14, lineHeight: 21, fontWeight: '700' },
  pulseMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  pulseMetaText: { fontSize: 10, fontWeight: '700' },

  // Threat & Opportunity
  disruptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  disruptBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  disruptPct: { fontSize: 12, fontWeight: '900' },
  trendTag: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  threatHeadline: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', marginBottom: 14, lineHeight: 22 },
  splitRow: { flexDirection: 'row', gap: 0 },
  splitCol: { flex: 1 },
  splitDivider: { width: 1, marginHorizontal: 12 },
  splitHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  splitTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  splitItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 7 },
  splitDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 5 },
  splitText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },

  // AI Readiness card
  readinessCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  readinessTitle: { fontSize: 15, fontWeight: '900', marginBottom: 6 },
  readinessSub: { fontSize: 13, lineHeight: 19 },

  // Playbook
  playbookAction: { fontSize: 14, lineHeight: 21, fontWeight: '700', marginBottom: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  playbookCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
  },
  playbookCtaText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  // Day in 2027
  dayCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  dayCardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  dayVignette: { fontSize: 13, lineHeight: 19, fontStyle: 'italic', fontWeight: '600' },
  dayMeta: { fontSize: 11, marginTop: 8, fontWeight: '600' },

  // Hook CTA
  hookCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  hookCtaText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  hookSub: { textAlign: 'center', fontSize: 12, marginTop: 8, fontWeight: '600' },

  notReadyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
