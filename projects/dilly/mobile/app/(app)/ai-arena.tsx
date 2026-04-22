/**
 * AI Arena — 3 different experiences, one tab.
 *
 * Ground-up rewrite. Old arena is parked at
 * _parked/ai-arena.old.tsx.txt for reference.
 *
 * Design:
 *   - useAppMode() → holder | seeker | student
 *   - Each mode gets a dedicated "command deck": a hero centerpiece +
 *     four tiles below.
 *   - Every tool draws from the user's real profile + feed + apps
 *     + cohort playbook. No LLM calls anywhere on this path.
 *   - Profile with <10 facts sees a gate that seeds Dilly chat with
 *     three mode-specific prompts. Feeding profile IS the onboarding.
 *
 * Centerpieces:
 *   Holder   → Market Value Live
 *   Seeker   → Conviction Builder
 *   Student  → Future Pulse
 *
 * All three are real screens; their full pages live under /arena/*.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { dilly } from '../../lib/dilly'
import { useAppMode } from '../../hooks/useAppMode'
import { useResolvedTheme } from '../../hooks/useTheme'
import DillyLoadingState from '../../components/DillyLoadingState'
import ArenaGate from '../../components/arena/ArenaGate'
import ArenaHero from '../../components/arena/ArenaHero'
import ArenaTile from '../../components/arena/ArenaTile'
import ValueSparkline from '../../components/arena/ValueSparkline'
import {
  resolvePlaybook,
  type CohortPlaybook,
} from '../../lib/arena/cohort-playbook'
import {
  recordValueSnapshot,
  readHistory,
  computeValue,
  compactUsd,
  fmtRange,
  type ValueReading,
} from '../../lib/arena/value'
import {
  deriveSignals,
  rejectionPattern,
  type Signals,
  type Listing,
  type Application,
} from '../../lib/arena/signals'

const MIN_FACTS = 10

type Profile = {
  first_name?: string
  cohorts?: string[]
  years_experience?: number
  target_companies?: string[]
  job_locations?: string[]
  application_target?: string
  user_path?: string
  current_role?: string
  [k: string]: unknown
}

export default function AIArenaScreen() {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()
  const mode = useAppMode()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [facts, setFacts] = useState<any[]>([])
  const [feed, setFeed] = useState<Listing[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [reading, setReading] = useState<ValueReading | null>(null)

  const load = useCallback(async () => {
    try {
      const [prof, surface, feedRes, appsRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/memory/surface').catch(() => null),
        dilly.get('/v2/internships/feed?readiness=ready&limit=60').catch(() => null),
        dilly.get('/applications').catch(() => null),
      ])
      const p = (prof || {}) as Profile
      setProfile(p)
      const items = Array.isArray((surface as any)?.items) ? (surface as any).items : []
      setFacts(items)
      const listings: Listing[] = Array.isArray((feedRes as any)?.listings) ? (feedRes as any).listings : []
      setFeed(listings)
      const apps: Application[] = Array.isArray(appsRes)
        ? (appsRes as Application[])
        : Array.isArray((appsRes as any)?.applications)
          ? (appsRes as any).applications
          : []
      setApps(apps)

      // Compute today's playbook + signals + value reading and
      // snapshot it into AsyncStorage so the sparkline has data
      // tomorrow. This is how the arena stays "alive" without server
      // history.
      const playbook = resolvePlaybook(p.cohorts || [])
      let tier1Hits = 0
      let strong = 0
      let stretch = 0
      for (const j of listings) {
        const lc = (j.company || '').toLowerCase()
        if (playbook.anchorCompanies.tier1.some(a => lc.includes(a.toLowerCase()))) tier1Hits++
        const sc = Number(j.rank_score ?? 50)
        if (sc >= 72) strong++
        else if (sc >= 45) stretch++
      }
      await recordValueSnapshot({ strong, stretch, total: listings.length, tier1Hits })
      const history = await readHistory()
      const r = computeValue(playbook, Number(p.years_experience || 0), history)
      setReading(r)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const onRefresh = useCallback(() => { setRefreshing(true); load() }, [load])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )
  const signals = useMemo<Signals>(
    () => deriveSignals(feed, apps, playbook),
    [feed, apps, playbook],
  )

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        mood="thinking"
        messages={[
          'Opening the command deck…',
          'Reading your market…',
          'Pulling threats + signals…',
        ]}
      />
    )
  }

  // Gate: not enough facts. Show a single-screen prompt surface.
  const factCount = facts.length
  if (factCount < MIN_FACTS) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.surface.bg }}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 60 }}
      >
        <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
          <Text style={[styles.modeEyebrow, { color: theme.accent }]}>{modeLabel(mode).toUpperCase()}</Text>
          <Text style={[styles.wordmark, { color: theme.surface.t1 }]}>AI Arena</Text>
        </View>
        <ArenaGate
          factCount={factCount}
          threshold={MIN_FACTS}
          prompts={gatePrompts(mode, playbook, profile)}
        />
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* Header — mode label + wordmark. No chrome. */}
      <View style={styles.header}>
        <Text style={[styles.modeEyebrow, { color: theme.accent }]}>{modeLabel(mode).toUpperCase()}</Text>
        <Text style={[styles.wordmark, { color: theme.surface.t1 }]}>AI Arena</Text>
        <Text style={[styles.tagline, { color: theme.surface.t2 }]}>{modeTagline(mode)}</Text>
      </View>

      {/* Centerpiece by mode. */}
      {mode === 'holder' ? (
        <HolderHero reading={reading} signals={signals} playbook={playbook} />
      ) : mode === 'seeker' ? (
        <SeekerHero signals={signals} playbook={playbook} profile={profile} />
      ) : (
        <StudentHero playbook={playbook} profile={profile} />
      )}

      {/* Mode-specific tiles. */}
      <Text style={[styles.sectionTitle, { color: theme.surface.t3 }]}>TOOLS</Text>
      <View style={styles.grid}>
        {modeTiles(mode, signals).map(t => (
          <ArenaTile
            key={t.title}
            icon={t.icon}
            title={t.title}
            subtitle={t.subtitle}
            signal={t.signal}
            onPress={() => router.push(t.route as any)}
          />
        ))}
      </View>

      {/* Mode-agnostic closer: every arena surface reminds the user
          that feeding Dilly directly improves every tool above. */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/(app)/my-dilly-profile')}
        style={[styles.feederRow, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}
      >
        <Ionicons name="sparkles" size={14} color={theme.accent} />
        <Text style={[styles.feederText, { color: theme.surface.t1 }]}>
          {factCount} facts feeding the arena. More facts → sharper reads.
        </Text>
        <Ionicons name="arrow-forward" size={14} color={theme.surface.t3} />
      </TouchableOpacity>
    </ScrollView>
  )
}

// ── Holder hero — Market Value Live mini ────────────────────────────────────

function HolderHero({
  reading,
  signals,
  playbook,
}: {
  reading: ValueReading | null
  signals: Signals
  playbook: CohortPlaybook
}) {
  const theme = useResolvedTheme()
  if (!reading) return null
  return (
    <ArenaHero
      eyebrow="MARKET VALUE · LIVE"
      title={fmtRange(reading.valueLow, reading.valueHigh)}
      subtitle={reading.readout}
      ctaLabel="Open the full read"
      onPress={() => router.push('/(app)/arena/value')}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ValueSparkline
          values={reading.sparkline}
          width={130}
          height={54}
          stroke={theme.accent}
        />
        <View style={{ flex: 1 }}>
          <Text style={[heroMini.label, { color: theme.surface.t3 }]}>30-day trend</Text>
          <Text style={[heroMini.big, { color: theme.surface.t1 }]}>
            {reading.trendLabel === 'rising' ? '↑ ' : reading.trendLabel === 'falling' ? '↓ ' : '→ '}
            {compactUsd(Math.abs(reading.trendDelta))}
          </Text>
          <Text style={[heroMini.smol, { color: theme.surface.t3 }]}>
            {reading.band} · ~P{reading.peerPercentile} in {playbook.shortName}
          </Text>
        </View>
      </View>
      {signals.strongAtAnchors > 0 ? (
        <Text style={[heroMini.pressure, { color: theme.accent }]}>
          {signals.strongAtAnchors} anchor {signals.strongAtAnchors === 1 ? 'role' : 'roles'} in your feed pressuring comp up.
        </Text>
      ) : null}
    </ArenaHero>
  )
}

// ── Seeker hero — Conviction Builder mini ───────────────────────────────────

function SeekerHero({
  signals,
  playbook,
  profile,
}: {
  signals: Signals
  playbook: CohortPlaybook
  profile: Profile | null
}) {
  const theme = useResolvedTheme()
  const target = (profile?.target_companies || [])[0]
    || profile?.application_target
    || playbook.anchorCompanies.tier1[0]
  return (
    <ArenaHero
      eyebrow="CONVICTION · BUILDER"
      title={`Prep for ${target}`}
      subtitle="Your strongest assets, the gaps that will get probed, and a scripted story for the hardest question."
      ctaLabel="Build your conviction"
      onPress={() => router.push('/(app)/arena/conviction')}
    >
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Stat theme={theme} big={String(signals.appsLast14)} label="applied · 14d" />
        <Stat theme={theme} big={String(signals.interviewsCount)} label="interviews · 30d" />
        <Stat theme={theme} big={String(signals.strongCount)} label="strong matches" />
      </View>
    </ArenaHero>
  )
}

// ── Student hero — Future Pulse mini ────────────────────────────────────────

function StudentHero({
  playbook,
  profile,
}: {
  playbook: CohortPlaybook
  profile: Profile | null
}) {
  const theme = useResolvedTheme()
  const fname = profile?.first_name || 'you'
  return (
    <ArenaHero
      eyebrow="FUTURE · PULSE"
      title={`${fname}'s Tuesday in 2029.`}
      subtitle={`A lived-in look at your career in ${playbook.shortName}, told in four scenes.`}
      ctaLabel="See your future day"
      onPress={() => router.push('/(app)/arena/future')}
    >
      <Text style={[heroMini.vignette, { color: theme.surface.t1 }]}>
        "{playbook.vignette.morning.slice(0, 120)}…"
      </Text>
      <Text style={[heroMini.vignetteMeta, { color: theme.surface.t3 }]}>
        — 8:15 AM. Tap to read the rest.
      </Text>
    </ArenaHero>
  )
}

// ── Tile definitions by mode ────────────────────────────────────────────────

function modeTiles(mode: string, signals: Signals): Array<{
  icon: string
  title: string
  subtitle: string
  signal?: string | null
  route: string
}> {
  if (mode === 'holder') {
    return [
      { icon: 'warning', title: 'Threat Radar', subtitle: 'What is pressuring your role right now.', signal: '3 live', route: '/(app)/arena/threat' },
      { icon: 'swap-horizontal', title: 'Ghost Move', subtitle: 'A stealth-side check on what you are worth, without tipping your employer.', signal: null, route: '/(app)/arena/ghost' },
      { icon: 'analytics', title: 'Reputation Drift', subtitle: 'How Dilly sees your public surface vs peers.', signal: null, route: '/(app)/arena/reputation' },
      { icon: 'layers', title: 'Next Role Lab', subtitle: 'Three plausible next roles, stress-tested for fit.', signal: null, route: '/(app)/arena/next-role' },
    ]
  }
  if (mode === 'seeker') {
    const rp = rejectionPattern(signals)
    return [
      { icon: 'megaphone', title: 'The Hook', subtitle: 'A first-line for each target — tuned to their stack and your story.', signal: null, route: '/(app)/arena/hook' },
      { icon: 'cash', title: 'Offer Stand-In', subtitle: 'A negotiation coach that rehearses the scripts most people freeze on.', signal: null, route: '/(app)/arena/offer' },
      { icon: 'trail-sign', title: 'Rejection Pattern Map', subtitle: 'What your recent rejections are actually telling you.', signal: rp ? rp.label : null, route: '/(app)/arena/rejections' },
      { icon: 'time', title: '90-Day Clock', subtitle: 'The search becomes a plan with specific numbers to hit.', signal: null, route: '/(app)/arena/clock' },
    ]
  }
  // Student
  return [
    { icon: 'eye', title: 'Honest Mirror', subtitle: 'How the rubric you will actually be graded against reads against your profile.', signal: null, route: '/(app)/arena/mirror' },
    { icon: 'flame', title: 'Rejection Post-Mortem', subtitle: 'A safe post-mortem on the last time you got told no. Walk out better.', signal: null, route: '/(app)/arena/postmortem' },
    { icon: 'mail', title: 'Cold Email Studio', subtitle: 'Drafting a real cold email with the person\'s name, your story, and the ask.', signal: null, route: '/(app)/arena/coldemail' },
    { icon: 'eye-outline', title: 'Recruiter Radar', subtitle: 'What a recruiter would see in your profile in 15 seconds.', signal: null, route: '/(app)/arena/recruiter-radar' },
  ]
}

// ── Gate prompts by mode ────────────────────────────────────────────────────

function gatePrompts(mode: string, playbook: CohortPlaybook, profile: Profile | null): string[] {
  if (mode === 'holder') {
    return [
      'What is my current role, and one thing about it that is genuinely hard?',
      'What would my ideal next role look like in two years?',
      `What is the most frustrating part of working in ${playbook.shortName} right now?`,
    ]
  }
  if (mode === 'seeker') {
    return [
      `Which three companies am I most serious about, and why each?`,
      'Walk me through my last interview and what I would do differently.',
      'What is the work I want to be doing a year from now — specifically.',
    ]
  }
  return [
    `Which specific roles in ${playbook.shortName} am I trying to land after graduation?`,
    'Tell me about a project or achievement I am most proud of.',
    'What is the hardest class, job, or challenge I have worked through? How?',
  ]
}

function modeLabel(m: string): string {
  if (m === 'holder') return 'Holder Arena'
  if (m === 'seeker') return 'Seeker Arena'
  return 'Student Arena'
}

function modeTagline(m: string): string {
  if (m === 'holder') return 'Know where you stand. See what is coming.'
  if (m === 'seeker') return 'Finish the search with conviction.'
  return 'Your career, made visible.'
}

// ── Small stat component used by seeker hero ────────────────────────────────

function Stat({ theme, big, label }: { theme: ReturnType<typeof useResolvedTheme>; big: string; label: string }) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={[heroMini.statBig, { color: theme.surface.t1 }]}>{big}</Text>
      <Text style={[heroMini.statLabel, { color: theme.surface.t3 }]}>{label}</Text>
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 6 },
  modeEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  wordmark: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  tagline: { fontSize: 13, fontWeight: '600', marginTop: 4 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 22, marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    gap: 8,
  },

  feederRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  feederText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
})

const heroMini = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  big: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  smol: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  pressure: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 14,
  },
  vignette: {
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '600',
    lineHeight: 20,
  },
  vignetteMeta: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  statBig: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase' },
})
