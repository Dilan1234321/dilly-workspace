/**
 * Market Value Live - the holder centerpiece.
 *
 * Loads the user's value reading, sparkline, peer percentile, today's
 * anchor-company pressure, and renders it all in one read. Zero LLM.
 *
 * Composition:
 *   1. Big display: value range (low – high) in a huge accent number
 *   2. Trend row: sparkline + 30-day delta + band + peer percentile
 *   3. Pressure list: 3 anchor-company roles in the user's feed that
 *      are currently pressuring comp up, tappable (opens Jobs feed
 *      filtered to that company)
 *   4. "Window" state: "open" means Dilly thinks this is the moment
 *      to move. Clear readout either way.
 *   5. Inline Skills videos to reinforce the rarity of the user's
 *      cohort - "These are the things the top 10% in your band know."
 */

import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import DillyLoadingState from '../../../components/DillyLoadingState'
import ValueSparkline from '../../../components/arena/ValueSparkline'
import SkillsVideoCard from '../../../components/SkillsVideoCard'
import {
  resolvePlaybook,
  type CohortPlaybook,
} from '../../../lib/arena/cohort-playbook'
import {
  computeValue,
  readHistory,
  recordValueSnapshot,
  compactUsd,
  fmtRange,
  type ValueReading,
} from '../../../lib/arena/value'
import {
  deriveSignals,
  type Listing,
  type Application,
  type Signals,
} from '../../../lib/arena/signals'

interface Profile {
  first_name?: string
  cohorts?: string[]
  years_experience?: number
  current_role?: string
}

interface SkillsVideo {
  id: string
}

export default function MarketValueLive() {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [reading, setReading] = useState<ValueReading | null>(null)
  const [playbook, setPlaybook] = useState<CohortPlaybook | null>(null)
  const [signals, setSignals] = useState<Signals | null>(null)
  const [pressuringRoles, setPressuringRoles] = useState<Listing[]>([])
  const [videoIds, setVideoIds] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const [prof, feedRes, appsRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/v2/internships/feed?readiness=ready&limit=60').catch(() => null),
        dilly.get('/applications').catch(() => null),
      ])
      const p = (prof || {}) as Profile
      setProfile(p)
      const pb = resolvePlaybook(p.cohorts || [])
      setPlaybook(pb)

      const listings: Listing[] = Array.isArray((feedRes as any)?.listings)
        ? (feedRes as any).listings
        : []
      const apps: Application[] = Array.isArray(appsRes)
        ? (appsRes as Application[])
        : Array.isArray((appsRes as any)?.applications)
          ? (appsRes as any).applications
          : []

      // Pressuring roles: strong matches at anchor companies.
      const tier1Lower = pb.anchorCompanies.tier1.map(c => c.toLowerCase())
      const scaleupLower = pb.anchorCompanies.scaleup.map(c => c.toLowerCase())
      const pressuring = listings
        .filter(j => (j.rank_score ?? 0) >= 72)
        .filter(j => {
          const cl = (j.company || '').toLowerCase()
          return tier1Lower.some(t => cl.includes(t)) || scaleupLower.some(t => cl.includes(t))
        })
        .slice(0, 3)
      setPressuringRoles(pressuring)

      const s = deriveSignals(listings, apps, pb)
      setSignals(s)

      // Snapshot today for tomorrow's sparkline.
      await recordValueSnapshot({
        strong: s.strongCount,
        stretch: s.stretchCount,
        total: listings.length,
        tier1Hits: s.tier1Hits,
      })
      const history = await readHistory()
      const r = computeValue(pb, Number(p.years_experience || 0), history)
      setReading(r)

      // Pull 3 curated Skills videos from the user's cohort's top
      // skill queries for the "top 10% know these things" strip.
      const cohortSlug = cohortToSlug(p.cohorts?.[0])
      if (cohortSlug) {
        const vids = await dilly
          .get(`/skill-lab/videos?cohort=${cohortSlug}&sort=best&limit=3`)
          .catch(() => null)
        const list: SkillsVideo[] = Array.isArray((vids as any)?.videos) ? (vids as any).videos : []
        setVideoIds(list.map(v => v.id).slice(0, 3))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = useCallback(() => { setRefreshing(true); load() }, [load])

  if (loading) {
    return <DillyLoadingState insetTop={insets.top} mood="thinking" messages={['Reading your market…', 'Pulling anchor-company pressure…']} />
  }
  if (!reading || !playbook) {
    return <DillyLoadingState insetTop={insets.top} messages={['One moment…']} />
  }

  const trendColor =
    reading.trendLabel === 'rising' ? '#34C759'
      : reading.trendLabel === 'falling' ? '#FF453A'
        : theme.surface.t2

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(app)/ai-arena" as any); }} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>MARKET VALUE · LIVE</Text>
          <Text style={[s.title, { color: theme.surface.t1 }]}>What you are worth, today.</Text>
        </View>
      </View>

      {/* Big display */}
      <View style={[s.bigCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
        <Text style={[s.bigLabel, { color: theme.accent }]}>YOUR RANGE</Text>
        <Text style={[s.bigValue, { color: theme.surface.t1 }]}>
          {fmtRange(reading.valueLow, reading.valueHigh)}
        </Text>
        <Text style={[s.bigSub, { color: theme.surface.t2 }]}>
          {reading.band} · ~P{reading.peerPercentile} in {playbook.shortName}
        </Text>

        <View style={s.trendRow}>
          <ValueSparkline values={reading.sparkline} width={150} height={60} stroke={theme.accent} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[s.smallLabel, { color: theme.surface.t3 }]}>30-DAY TREND</Text>
            <Text style={[s.trendValue, { color: trendColor }]}>
              {reading.trendLabel === 'rising' ? '↑' : reading.trendLabel === 'falling' ? '↓' : '→'}{' '}
              {compactUsd(Math.abs(reading.trendDelta))}
            </Text>
            <Text style={[s.smallLabel, { color: theme.surface.t3, marginTop: 4 }]}>
              {reading.trendLabel === 'rising' ? 'Rising' : reading.trendLabel === 'falling' ? 'Cooling' : 'Flat'}
            </Text>
          </View>
        </View>

        <Text style={[s.readout, { color: theme.surface.t1 }]}>{reading.readout}</Text>
      </View>

      {/* Window state */}
      <View style={[s.windowRow, { borderColor: theme.accentBorder, backgroundColor: theme.surface.s1 }]}>
        <Ionicons
          name={reading.windowOpen ? 'sunny' : 'cloudy'}
          size={18}
          color={reading.windowOpen ? '#FFB300' : theme.surface.t3}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.windowTitle, { color: theme.surface.t1 }]}>
            {reading.windowOpen ? 'Market window is OPEN' : 'Market window is CLOSED'}
          </Text>
          <Text style={[s.windowBody, { color: theme.surface.t2 }]}>
            {reading.windowOpen
              ? 'The last 7 days show rising strong-match volume. This is the short window where a reach-out gets returned.'
              : 'Fewer strong anchors pinging you this week. Spend the quiet time raising your floor.'}
          </Text>
        </View>
      </View>

      {/* Pressuring roles */}
      {pressuringRoles.length > 0 ? (
        <>
          <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>PRESSURING YOUR COMP</Text>
          <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
            Strong-match anchor roles in your feed right now. Each one is an implicit ceiling-up.
          </Text>
          {pressuringRoles.map(j => (
            <TouchableOpacity
              key={j.id}
              activeOpacity={0.85}
              onPress={() => router.push('/(app)/jobs')}
              style={[s.roleRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.roleCompany, { color: theme.surface.t3 }]} numberOfLines={1}>{j.company}</Text>
                <Text style={[s.roleTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{j.title}</Text>
                {j.location_city ? (
                  <Text style={[s.roleMeta, { color: theme.surface.t3 }]} numberOfLines={1}>{j.location_city}</Text>
                ) : null}
              </View>
              <Ionicons name="arrow-forward" size={16} color={theme.surface.t3} />
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {/* Band anchors */}
      <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>
        WHAT THE TOP OF YOUR BAND CLEARS
      </Text>
      <View style={[s.anchorCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <AnchorRow
          theme={theme}
          label="Early career (0-3 yrs)"
          value={compactUsd(playbook.comp.earlyBase)}
          highlight={reading.band === 'Early'}
        />
        <AnchorRow
          theme={theme}
          label="Mid career (3-8 yrs)"
          value={compactUsd(playbook.comp.midBase)}
          highlight={reading.band === 'Mid'}
        />
        <AnchorRow
          theme={theme}
          label="Senior, top 10% TCC"
          value={compactUsd(playbook.comp.top10Tcc)}
          highlight={reading.band === 'Senior'}
        />
      </View>

      {/* Skills inline - the rarity moat */}
      {videoIds.length > 0 ? (
        <>
          <Text style={[s.sectionTitle, { color: theme.surface.t3 }]}>
            WHAT THE TOP 10% KNOW
          </Text>
          <Text style={[s.sectionSub, { color: theme.surface.t2 }]}>
            These are the things that buy you the upper end of the range. Dilly pulled three from your cohort.
          </Text>
          <View style={{ paddingHorizontal: 16 }}>
            {videoIds.map(id => (
              <SkillsVideoCard key={id} videoId={id} />
            ))}
          </View>
        </>
      ) : null}

      <Text style={[s.footer, { color: theme.surface.t3 }]}>
        Computed from your cohort, your experience, and 30 days of your own feed. No numbers are
        uploaded or shared. This reads locally.
      </Text>
    </ScrollView>
  )
}

function AnchorRow({
  theme,
  label,
  value,
  highlight,
}: {
  theme: ReturnType<typeof useResolvedTheme>
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <View style={[s.anchorRow, highlight ? { backgroundColor: theme.accentSoft } : null]}>
      <Text style={[s.anchorLabel, { color: theme.surface.t1 }]}>{label}</Text>
      <Text style={[s.anchorValue, { color: highlight ? theme.accent : theme.surface.t1 }]}>{value}</Text>
    </View>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Cohort display name → skill-lab slug. */
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

  bigCard: {
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  bigLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  bigValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  bigSub: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  smallLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  trendValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  readout: { fontSize: 13, lineHeight: 19, marginTop: 16 },

  windowRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
  },
  windowTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  windowBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 6,
  },
  sectionSub: { fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 10 },

  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleCompany: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  roleTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  roleMeta: { fontSize: 11, fontWeight: '600', marginTop: 3 },

  anchorCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  anchorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  anchorLabel: { fontSize: 13, fontWeight: '700' },
  anchorValue: { fontSize: 15, fontWeight: '800' },

  footer: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 30,
    marginTop: 24,
    lineHeight: 14,
  },
})
