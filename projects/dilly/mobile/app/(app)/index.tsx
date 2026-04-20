import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Image,
  RefreshControl, Dimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { DillyFace } from '../../components/DillyFace';
import { TierBadge } from '../../components/TierBadge';
import { useTierFeel } from '../../hooks/useTierFeel';
import { useRecentUpgrade } from '../../hooks/useRecentUpgrade';
import { YourPlanCard } from '../../components/YourPlanCard';
import { useYourPlan } from '../../hooks/useYourPlan';
import ChapterCard, { type ChapterCardState } from '../../components/ChapterCard';
import { scheduleChapterNotifications } from '../../hooks/useChapterNotifications';
import { useExtractionState } from '../../hooks/useExtractionPending';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { useAppMode } from '../../hooks/useAppMode';
import { useSituationCopy } from '../../hooks/useSituationCopy';
import { useAccent, useResolvedTheme } from '../../hooks/useTheme';
import { ExploringHome, DropoutHome, LaidOffHome, VisaHome } from '../../components/SituationHomes';
import { useCachedFetch, getCached } from '../../lib/sessionCache';

const W = Dimensions.get('window').width;
const INDIGO = '#1B3FA0';

// -- Skeleton -----------------------------------------------------------------

function Skeleton({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[{ width: width as any, height, borderRadius: 6, backgroundColor: '#E4E6F0', opacity }, style]} />;
}

// -- Journey Step Card --------------------------------------------------------

interface JourneyStep {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  completed: boolean;
  onPress: () => void;
}

function JourneyStepCard({ step }: { step: JourneyStep }) {
  const theme = useResolvedTheme();
  return (
    <AnimatedPressable
      style={[
        s.journeyCard,
        { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
        step.completed && s.journeyCardDone,
      ]}
      onPress={step.onPress}
      scaleDown={0.98}
    >
      <View style={[s.journeyIcon, { backgroundColor: step.completed ? colors.green + '15' : step.color + '12' }]}>
        {step.completed ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
        ) : (
          <Ionicons name={step.icon as any} size={18} color={step.color} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.journeyTitle, { color: theme.surface.t1 }, step.completed && { color: theme.surface.t3 }]}>{step.title}</Text>
        <Text style={[s.journeySub, { color: theme.surface.t2 }]}>{step.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={step.completed ? theme.surface.t3 : step.color} />
    </AnimatedPressable>
  );
}

// -- Activity Card ------------------------------------------------------------

function ActivityCard({ icon, color, title, subtitle, onPress }: {
  icon: string; color: string; title: string; subtitle: string; onPress: () => void;
}) {
  const theme = useResolvedTheme();
  return (
    <AnimatedPressable
      style={[s.activityCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
      onPress={onPress}
      scaleDown={0.97}
    >
      <View style={[s.activityIcon, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.activityTitle, { color: theme.surface.t1 }]} numberOfLines={1}>{title}</Text>
        <Text style={[s.activitySub, { color: theme.surface.t2 }]} numberOfLines={1}>{subtitle}</Text>
      </View>
    </AnimatedPressable>
  );
}

// -- Pipeline Tile -------------------------------------------------------------

function PipelineTile({ icon, count, label, color, onPress }: {
  icon: string; count: number; label: string; color: string; onPress: () => void;
}) {
  const theme = useResolvedTheme();
  return (
    <AnimatedPressable
      style={[s.pipeTile, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
      onPress={onPress}
      scaleDown={0.95}
    >
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[s.pipeCount, { color }]}>{count}</Text>
      <Text style={[s.pipeLabel, { color: theme.surface.t2 }]}>{label}</Text>
    </AnimatedPressable>
  );
}

// -- Main Screen --------------------------------------------------------------

// ── Holder Career Center ─────────────────────────────────────────────
// Completely different home for people who already have a job. They
// don't want journey steps, pipeline tiles, or "3 jobs to apply to."
// They want: is my career on track, what's changing in my field, what
// should I do this week.
//
// Data flow:
//   /profile               -> current_role, name, trajectory facts
//   /ai-arena/threat-report/infer -> role-level threat % and moves
//   /ai-arena/weekly-signal -> this week's hand-curated news
//   /memory                -> fact count + top 4 facts (trajectory card)
//   /v2/internships/feed   -> market demand count only (no listings fetch)
//
// Every block is zero-LLM. Static content + profile aggregation.

// Session-cache parser for the 5 parallel HolderHome fetches. Runs
// once per fetch; cached value is a flat shape so re-renders don't
// re-parse. See lib/sessionCache.ts.
type HolderHomeData = {
  name: string;
  currentRole: string;
  yearsExperience: string;
  threat: any | null;
  weekly: any | null;
  weeklyRoleDisplay: string | null;
  marketCount: number | null;
  trajectoryFacts: Array<{ category: string; label: string; value: string }>;
  factCount: number;
};

async function _fetchHolderHomeData(): Promise<HolderHomeData | null> {
  const [profileRes, threatRes, weeklyRes, feedRes, memRes] = await Promise.all([
    dilly.get('/profile').catch(() => null),
    dilly.fetch('/ai-arena/threat-report/infer').then(r => r?.ok ? r.json() : null).catch(() => null),
    dilly.fetch('/ai-arena/weekly-signal').then(r => r?.ok ? r.json() : null).catch(() => null),
    dilly.get('/v2/internships/feed?limit=1&sort=rank').catch(() => null),
    dilly.fetch('/memory').then(r => r?.ok ? r.json() : null).catch(() => null),
  ]);
  const str = (v: any) => (v == null ? '' : String(v)).trim();
  const facts: any[] = memRes?.items && Array.isArray(memRes.items) ? memRes.items : [];
  return {
    name: str(profileRes?.name),
    currentRole:
      str(profileRes?.current_role) ||
      str(profileRes?.current_job_title) ||
      str(profileRes?.title),
    yearsExperience: str(profileRes?.years_experience),
    threat: threatRes?.report ?? null,
    weekly: weeklyRes?.signal ?? null,
    weeklyRoleDisplay: weeklyRes?.role_display ?? null,
    marketCount:
      feedRes && typeof (feedRes as any).total === 'number'
        ? (feedRes as any).total
        : null,
    factCount: facts.length,
    trajectoryFacts: facts
      .filter(f => (f.confidence || 'medium') !== 'low')
      .slice(0, 4)
      .map(f => ({
        category: String(f.category || ''),
        label:    String(f.label || ''),
        value:    String(f.value || ''),
      })),
  };
}

function HolderHome() {
  const insets = useSafeAreaInsets();
  // Ambient premium feel: borders, typography, press feedback vary by
  // tier. Starter gets baseline; Dilly is slightly heavier; Pro has
  // thicker borders + 900-weight headings + letter-spacing bump.
  // Same features, different hold-feel.
  const feel = useTierFeel();
  // Recent upgrade: true for 24h after a starter→paid transition.
  // Drives a subtle "welcome to Dilly" line under the greeting that
  // fades out of existence on day two. No dismiss button — it just
  // expires. Makes day one feel distinct without becoming an ad.
  const recentUpgrade = useRecentUpgrade();
  // Session-cached: renders instantly from the previous fetch on
  // remount (tab switches, mode flips, coming back from the chat
  // overlay). 60s TTL before a background revalidation fires. Cuts
  // the constant refetch loop that made this tab feel slow during
  // screen-share, and makes Holder ↔ Seeker mode flips feel instant.
  const { data, loading, refreshing, refresh } = useCachedFetch<HolderHomeData>(
    'holder:home',
    _fetchHolderHomeData,
    { ttlMs: 60_000 },
  );
  const name             = data?.name ?? '';
  const currentRole      = data?.currentRole ?? '';
  const yearsExperience  = data?.yearsExperience ?? '';
  // Format the YOE string for display. If the stored value is just
  // digits ("5"), append "yrs experience" so it doesn't read as a
  // dangling number next to the role. If it already contains letters
  // (e.g. "5+ yrs", "5 years") trust the user's text.
  const yoeDisplay = yearsExperience
    ? (/^\d+(\.\d+)?\+?$/.test(yearsExperience.trim())
        ? `${yearsExperience.trim()} yrs`
        : yearsExperience)
    : '';
  const threat           = data?.threat ?? null;
  const weekly           = data?.weekly ?? null;
  const weeklyRoleDisplay = data?.weeklyRoleDisplay ?? null;
  const marketCount      = data?.marketCount ?? null;
  const trajectoryFacts  = data?.trajectoryFacts ?? [];
  const factCount        = data?.factCount ?? 0;
  const onRefresh = refresh;

  // Reject `name` values that look like an email local-part or
  // any non-name garbage. Same defense as the seeker greeting below.
  const _nameLooksReal = !!name && !name.includes('@') && !/^\d/.test(name);
  const firstName = (_nameLooksReal ? name.split(/\s+/)[0] : '').replace(/@.*$/, '') || 'there';

  // ── Your Plan for this week ─────────────────────────────────
  // Anchor card that sits above every other home card. Mode +
  // path drive what it says; deadlines / interviews override
  // defaults. Zero LLM cost. Regenerates daily via AsyncStorage.
  const plan = useYourPlan({
    mode: 'holder',
    userPath: 'holder',
    firstName,
    factCount,
    currentRole,
    // Holder mode doesn't track applications; pass 0 so the plan
    // never nudges about applying.
    appCount: 0,
    interviewingCount: 0,
    recentDeadline: null,
  });

  // Threat-level color for the hero pulse ring. Defaults to violet when
  // we haven't resolved a role yet so the card still looks alive.
  const threatColor = threat?.threat_level === 'severe' ? '#DC2626'
    : threat?.threat_level === 'high' ? '#EA580C'
    : threat?.threat_level === 'moderate' ? '#D97706'
    : threat?.threat_level === 'low' ? '#16A34A'
    : '#6C5CE7';

  if (loading) {
    return (
      <View style={[h.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.xl }}>
          <Skeleton width="40%" height={12} style={{ marginBottom: 12 }} />
          <Skeleton width="90%" height={28} />
          <Skeleton width="70%" height={28} style={{ marginTop: 6 }} />
          <View style={{ height: 20 }} />
          <Skeleton width="100%" height={140} />
          <View style={{ height: 16 }} />
          <Skeleton width="100%" height={96} />
        </View>
      </View>
    );
  }

  return (
    <View style={[h.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[h.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />}
      >
        {/* Greeting + settings. Paid users see a TierBadge next to the
            eyebrow — the ambient signal that tells them the app they
            paid for is different from the free one, without being an
            ad in their face every session. */}
        <View style={h.greetRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={h.eyebrow}>CAREER WATCH</Text>
              <TierBadge />
            </View>
            <Text style={[h.greeting, { fontWeight: feel.headingWeight, letterSpacing: -0.5 + feel.headingTracking }]}>
              Welcome back, {firstName}.
            </Text>
            {/* First 24h after upgrade: subtle welcome line that
                expires without needing a dismiss button. Day-one
                feels distinct from day-seven without permanent UI. */}
            {recentUpgrade.isRecent && (
              <Text style={{
                fontSize: 11,
                fontStyle: 'italic',
                color: colors.t3,
                marginTop: 4,
              }}>
                Good to have you in here.
              </Text>
            )}
            {currentRole ? (
              <Text style={h.roleLine}>{currentRole}{yoeDisplay ? ` · ${yoeDisplay}` : ''}</Text>
            ) : null}
          </View>
          <AnimatedPressable onPress={() => router.push('/(app)/settings' as any)} scaleDown={0.9} hitSlop={10}>
            <Ionicons name="settings-outline" size={20} color={colors.t3} />
          </AnimatedPressable>
        </View>

        {/* ── 1. YOUR PLAN anchor ─────────────────────────────────
            The product promise in one card: "Dilly turns your
            career confusion into a plan." Sits above every other
            card on home because that's the mental model — Dilly
            makes the plan, everything else (jobs, arena, profile)
            is where the plan gets executed or sharpened. */}
        <FadeInView delay={20}>
          <YourPlanCard plan={plan} firstName={firstName} />
        </FadeInView>

        {/* ── 2. Weekly pulse hero ───────────────────────────────── */}
        <FadeInView delay={40}>
          <AnimatedPressable
            scaleDown={feel.pressScaleDown}
            haptic={feel.pressHaptic}
            onPress={() => router.push('/(app)/ai-arena' as any)}
            style={[
              h.heroCard,
              {
                borderColor: threatColor + '30',
                borderWidth: feel.cardBorder,
                shadowColor: threatColor,
              },
            ]}
          >
            {/* Pro users get a subtle accent bar across the top of
                the hero — the same trick the Plan card uses in
                settings. Reads as "this card was made for you". */}
            {feel.proAccentBar && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  backgroundColor: threatColor,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                }}
              />
            )}
            <View style={h.heroPulse}>
              <View style={[h.pulseDot, { backgroundColor: threatColor }]} />
              <Text style={[h.pulseLabel, { color: threatColor, letterSpacing: 1.4 + feel.headingTracking }]}>
                {weeklyRoleDisplay
                  ? `THIS WEEK · ${weeklyRoleDisplay.toUpperCase()}`
                  : 'THIS WEEK · LIVE'}
              </Text>
            </View>
            <Text
              style={[
                h.heroHeadline,
                { fontWeight: feel.headingWeight, letterSpacing: -0.2 + feel.headingTracking },
              ]}
              numberOfLines={2}
            >
              {weekly?.headline || 'Your field is shifting. Dilly is tracking it for you.'}
            </Text>
            {weekly?.source ? (
              <Text style={h.heroSource} numberOfLines={1}>{weekly.source}</Text>
            ) : null}
            <View style={h.heroCtaRow}>
              <Text style={h.heroCtaText}>Open this week's briefing</Text>
              <Ionicons name="arrow-forward" size={15} color={INDIGO} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        {/* ── 2. Two stat tiles ──────────────────────────────────── */}
        <FadeInView delay={80}>
          <View style={h.statRow}>
            <AnimatedPressable
              style={[h.statCard, { borderColor: threatColor + '30' }]}
              onPress={() => router.push('/(app)/ai-arena' as any)}
              scaleDown={0.97}
            >
              <Text style={h.statEyebrow}>AI THREAT</Text>
              <Text style={[h.statBig, { color: threatColor }]}>
                {threat?.threat_pct != null ? `${threat.threat_pct}%` : '-'}
              </Text>
              <Text style={h.statLabel}>
                {threat?.threat_level ? threat.threat_level.toUpperCase() : 'Open Arena'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={h.statCard}
              onPress={() => router.push('/(app)/jobs' as any)}
              scaleDown={0.97}
            >
              <Text style={h.statEyebrow}>MARKET · YOUR ROLE</Text>
              <Text style={[h.statBig, { color: colors.t1 }]}>
                {marketCount != null ? marketCount.toLocaleString() : '-'}
              </Text>
              <Text style={h.statLabel}>hiring now</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* ── 3. This week's moves ───────────────────────────────── */}
        {threat?.what_to_learn && threat.what_to_learn.length > 0 && (
          <FadeInView delay={120}>
            <Text style={h.sectionLabel}>THIS MONTH'S MOVES</Text>
            <View style={{ gap: 8 }}>
              {threat.what_to_learn.slice(0, 3).map((move: string, i: number) => (
                <AnimatedPressable
                  key={i}
                  style={h.moveCard}
                  onPress={() => openDillyOverlay({
                    isPaid: false,
                    initialMessage: `Help me make this move: "${move}". I'm a ${threat.display || currentRole}. What should I actually do this week to start?`,
                  })}
                  scaleDown={0.98}
                >
                  <View style={h.moveNum}>
                    <Text style={h.moveNumText}>{i + 1}</Text>
                  </View>
                  <Text style={h.moveText}>{move}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                </AnimatedPressable>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ── 4. Your trajectory ─────────────────────────────────── */}
        <FadeInView delay={160}>
          <Text style={h.sectionLabel}>YOUR TRAJECTORY</Text>
          <AnimatedPressable
            style={h.trajCard}
            onPress={() => router.push('/(app)/my-dilly-profile' as any)}
            scaleDown={0.98}
          >
            <View style={h.trajHeader}>
              <View style={{ flex: 1 }}>
                {currentRole ? (
                  <Text style={h.trajRole}>{currentRole}</Text>
                ) : (
                  <Text style={h.trajRole}>Your career, tracked</Text>
                )}
                <Text style={h.trajMeta}>
                  {yoeDisplay ? `${yoeDisplay} · ` : ''}
                  Dilly knows {factCount} {factCount === 1 ? 'thing' : 'things'} about you
                </Text>
              </View>
              <Ionicons name="analytics-outline" size={24} color={INDIGO} />
            </View>
            {trajectoryFacts.length > 0 && (
              <View style={h.tagRow}>
                {trajectoryFacts.map((f, i) => (
                  <View key={i} style={h.tag}>
                    <Text style={h.tagText} numberOfLines={1}>
                      {(f.label || f.value || '').slice(0, 32)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View style={h.trajCtaRow}>
              <Text style={h.trajCtaText}>Open My Career</Text>
              <Ionicons name="arrow-forward" size={13} color={INDIGO} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        {/* ── 5. Quick tools (holder-relevant only) ──────────────── */}
        <FadeInView delay={200}>
          <Text style={h.sectionLabel}>QUICK TOOLS</Text>
          <View style={h.toolsRow}>
            {[
              { icon: 'chatbubbles' as const, color: INDIGO, label: 'Ask Dilly',
                onPress: () => openDillyOverlay({ isPaid: true }) },
              { icon: 'shield-checkmark' as const, color: '#00C853', label: 'Threat',
                onPress: () => router.push('/(app)/ai-arena' as any) },
              { icon: 'trending-up' as const, color: colors.blue, label: 'Market',
                onPress: () => router.push('/(app)/jobs' as any) },
              { icon: 'calendar' as const, color: colors.gold, label: 'Calendar',
                onPress: () => router.push('/(app)/calendar' as any) },
            ].map(t => (
              <AnimatedPressable key={t.label} style={h.toolItem} onPress={t.onPress} scaleDown={0.92}>
                <View style={[h.toolIcon, { backgroundColor: t.color + '10' }]}>
                  <Ionicons name={t.icon} size={20} color={t.color} />
                </View>
                <Text style={h.toolLabel}>{t.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

// ── HolderHome styles. scoped so they can't collide with the
// seeker Career Center's stylesheet below. ────────────────────────────
const h = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingTop: 8, gap: 22 },

  greetRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: INDIGO, letterSpacing: 1.6 },
  greeting: { fontSize: 24, fontWeight: '900', color: colors.t1, letterSpacing: -0.5, marginTop: 2 },
  roleLine: { fontSize: 13, color: colors.t3, marginTop: 4, fontWeight: '600' },

  // Hero
  heroCard: {
    backgroundColor: colors.s1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroPulse: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  pulseLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroHeadline: { fontSize: 18, fontWeight: '800', color: colors.t1, lineHeight: 24, letterSpacing: -0.2 },
  heroSource: { fontSize: 11, color: colors.t3, fontStyle: 'italic' },
  heroCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  heroCtaText: { fontSize: 13, fontWeight: '700', color: INDIGO },

  // Stat tiles
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.s1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
  },
  statEyebrow: { fontSize: 9, fontWeight: '900', color: colors.t3, letterSpacing: 1.1 },
  statBig: { fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.t2, marginTop: 2 },

  sectionLabel: {
    fontSize: 10, fontWeight: '900', color: colors.t3, letterSpacing: 1.4, marginBottom: 10,
  },

  // Moves
  moveCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1,
    padding: 14,
  },
  moveNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: INDIGO + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  moveNumText: { fontSize: 11, fontWeight: '900', color: INDIGO },
  moveText: { flex: 1, fontSize: 13, color: colors.t1, fontWeight: '600', lineHeight: 18 },

  // Trajectory
  trajCard: {
    backgroundColor: colors.s1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
    gap: 10,
  },
  trajHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trajRole: { fontSize: 15, fontWeight: '800', color: colors.t1, letterSpacing: -0.2 },
  trajMeta: { fontSize: 11, color: colors.t3, marginTop: 3, fontWeight: '500' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
  },
  tagText: { fontSize: 10, color: colors.t2, fontWeight: '600' },
  trajCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  trajCtaText: { fontSize: 12, fontWeight: '700', color: INDIGO },

  // Tools
  toolsRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  toolItem: { alignItems: 'center', gap: 6, flex: 1 },
  toolIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  toolLabel: { fontSize: 11, fontWeight: '700', color: colors.t2 },
});


// ── SeniorResetHome ──────────────────────────────────────────────────
// Bespoke Career Center for user_path === 'senior_reset'. Rung-3
// per-situation surface. The user was just laid off after years in
// their field. Tone is calm, warm, grounded — never cheerleading,
// never urgent, never treating them like a new-grad looking for
// their first job. Every block is designed to:
//   - acknowledge where they are in the arc (weeks since layoff)
//   - leverage what they built (years, depth, judgment)
//   - reduce overwhelm (ONE thing today, not ten)
//   - mobilize their network (that's how senior roles actually fill)
//
// Zero LLM cost. Backed by /senior-reset/dashboard which returns
// deterministic aggregation of profile + memory facts + life_events.

type SeniorResetData = {
  identity: {
    name: string;
    first_name: string;
    most_recent_role: string;
    years_experience: number;
    domain: string | null;
  };
  regroup: {
    headline: string;
    body: string;
    weeks_since_layoff: number | null;
  };
  moat: {
    headline: string;
    leverage_sentence: string;
    yoe: number;
    ai_resistant_skills: string[];
    all_skills: string[];
  };
  today_move: {
    title: string;
    body: string;
    chat_seed: string;
  };
  network: { headline: string; prompts: string[] };
  market: { total_senior: number | null; example_role: string | null };
};

function SeniorResetHome() {
  const insets = useSafeAreaInsets();
  const { data, loading, refreshing, refresh } = useCachedFetch<SeniorResetData>(
    'senior-reset:dashboard',
    async () => {
      const res = await dilly.fetch('/senior-reset/dashboard');
      return res?.ok ? await res.json() : null;
    },
    { ttlMs: 60_000 },
  );

  if (loading) {
    return (
      <View style={[sr.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.xl, gap: 16 }}>
          <View style={[sr.skelBlock, { height: 48, width: '50%' }]} />
          <View style={[sr.skelBlock, { height: 160 }]} />
          <View style={[sr.skelBlock, { height: 120 }]} />
        </View>
      </View>
    );
  }

  const d = data;
  const firstName = d?.identity?.first_name || 'there';

  // Plan anchor for senior-reset path. Mode=seeker; useYourPlan has
  // a dedicated senior_reset branch that produces the "warm up one
  // past colleague" anchor copy.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const plan = useYourPlan({
    mode: 'seeker',
    userPath: 'senior_reset',
    firstName,
    factCount: 0,
    appCount: 0,
    interviewingCount: 0,
    recentDeadline: null,
  });

  return (
    <View style={[sr.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[sr.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={INDIGO} />}
      >
        {/* Grounded greeting. No "Welcome back!", no exclamation. */}
        <View style={sr.greetRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={sr.eyebrow}>YOUR RESET</Text>
              <TierBadge />
            </View>
            <Text style={sr.greeting}>
              {firstName}, here's where you are today.
            </Text>
          </View>
          <AnimatedPressable onPress={() => router.push('/(app)/settings' as any)} scaleDown={0.9} hitSlop={10}>
            <Ionicons name="settings-outline" size={20} color={colors.t3} />
          </AnimatedPressable>
        </View>

        {/* Your Plan anchor — senior-reset users are searching; the
            "warm up one past colleague" copy is exactly right here. */}
        <FadeInView delay={10}>
          <YourPlanCard plan={plan} firstName={firstName} />
        </FadeInView>

        {/* Regroup card. calm and warm. Varies by weeks since layoff. */}
        {d?.regroup ? (
          <FadeInView delay={40}>
            <View style={sr.regroupCard}>
              <Text style={sr.regroupHead}>{d.regroup.headline}</Text>
              <Text style={sr.regroupBody}>{d.regroup.body}</Text>
              {d.regroup.weeks_since_layoff != null ? (
                <View style={sr.weekPill}>
                  <View style={sr.weekDot} />
                  <Text style={sr.weekPillText}>
                    Week {d.regroup.weeks_since_layoff + 1} of the reset
                  </Text>
                </View>
              ) : null}
            </View>
          </FadeInView>
        ) : null}

        {/* Your moat. the quantified leverage card. */}
        {d?.moat ? (
          <FadeInView delay={80}>
            <Text style={sr.sectionLabel}>YOUR MOAT</Text>
            <View style={sr.moatCard}>
              <Text style={sr.moatHead}>{d.moat.headline}</Text>
              <Text style={sr.moatLev}>{d.moat.leverage_sentence}</Text>
              {d.moat.ai_resistant_skills.length > 0 ? (
                <View style={sr.moatSkillsWrap}>
                  {d.moat.ai_resistant_skills.slice(0, 4).map(s => (
                    <View key={s} style={sr.moatSkillChip}>
                      <Text style={sr.moatSkillText} numberOfLines={1}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </FadeInView>
        ) : null}

        {/* Today's ONE move. Replaces the dashboard noise. */}
        {d?.today_move ? (
          <FadeInView delay={120}>
            <Text style={sr.sectionLabel}>TODAY</Text>
            <AnimatedPressable
              style={sr.todayCard}
              scaleDown={0.98}
              onPress={() => openDillyOverlay({
                isPaid: false,
                initialMessage: d.today_move.chat_seed,
              })}
            >
              <View style={sr.todayIcon}>
                <Ionicons name="arrow-forward-circle-outline" size={22} color={INDIGO} />
              </View>
              <Text style={sr.todayTitle}>{d.today_move.title}</Text>
              <Text style={sr.todayBody}>{d.today_move.body}</Text>
              <View style={sr.todayCtaRow}>
                <Text style={sr.todayCta}>Talk it through with Dilly</Text>
                <Ionicons name="arrow-forward" size={14} color={INDIGO} />
              </View>
            </AnimatedPressable>
          </FadeInView>
        ) : null}

        {/* Your network is the market. */}
        {d?.network ? (
          <FadeInView delay={160}>
            <Text style={sr.sectionLabel}>NETWORK</Text>
            <View style={sr.networkCard}>
              <Text style={sr.networkHead}>{d.network.headline}</Text>
              <Text style={sr.networkSub}>
                Most senior roles fill through people, not job boards.
                Dilly can help you pattern-match. Tap a prompt.
              </Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {d.network.prompts.map((p, i) => (
                  <AnimatedPressable
                    key={i}
                    style={sr.networkPromptRow}
                    scaleDown={0.98}
                    onPress={() => openDillyOverlay({
                      isPaid: false,
                      initialMessage: `I'm thinking about my network. Question: ${p} Help me think through who comes to mind and what to say.`,
                    })}
                  >
                    <Text style={sr.networkPromptText}>{p}</Text>
                    <Ionicons name="chatbubble-outline" size={14} color={colors.t3} />
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          </FadeInView>
        ) : null}

        {/* Senior market read. */}
        {d?.market?.total_senior != null ? (
          <FadeInView delay={200}>
            <Text style={sr.sectionLabel}>SENIOR MARKET</Text>
            <AnimatedPressable
              style={sr.marketCard}
              scaleDown={0.98}
              onPress={() => router.push('/(app)/jobs' as any)}
            >
              <Text style={sr.marketNumber}>
                {d.market.total_senior.toLocaleString()}
              </Text>
              <Text style={sr.marketLabel}>
                senior roles live right now
              </Text>
              {d.market.example_role ? (
                <Text style={sr.marketExample} numberOfLines={1}>
                  {d.market.example_role}
                </Text>
              ) : null}
              <View style={sr.marketCtaRow}>
                <Text style={sr.marketCta}>Open the market</Text>
                <Ionicons name="arrow-forward" size={14} color={INDIGO} />
              </View>
            </AnimatedPressable>
          </FadeInView>
        ) : null}

        {/* Footer composure. */}
        <FadeInView delay={240}>
          <Text style={sr.footer}>
            Slow is fine. Dilly doesn't push.
          </Text>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

// SeniorResetHome styles. scoped to `sr`.
const sr = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingTop: 8, gap: 22 },
  skelBlock: { borderRadius: 12, backgroundColor: '#EEF0F6' },

  greetRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.8,
    color: '#0F766E', marginBottom: 2,
  },
  greeting: {
    fontSize: 22, fontWeight: '800',
    color: colors.t1, letterSpacing: -0.5, lineHeight: 28,
  },

  // Regroup — warm, quiet
  regroupCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1, borderColor: '#99F6E4',
    borderRadius: 16, padding: 18, gap: 8,
  },
  regroupHead: { fontSize: 18, fontWeight: '700', color: '#134E4A', letterSpacing: -0.3, lineHeight: 24 },
  regroupBody: { fontSize: 14, color: '#134E4A', lineHeight: 21 },
  weekPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    marginTop: 4,
  },
  weekDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0F766E' },
  weekPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#0F766E' },

  sectionLabel: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    color: colors.t3, marginBottom: 8,
  },

  // Moat
  moatCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 16, padding: 18, gap: 10,
  },
  moatHead: { fontSize: 20, fontWeight: '800', color: '#78350F', letterSpacing: -0.4 },
  moatLev:  { fontSize: 13, color: '#78350F', lineHeight: 20 },
  moatSkillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  moatSkillChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FCD34D',
  },
  moatSkillText: { fontSize: 11, fontWeight: '700', color: '#78350F' },

  // Today's one move
  todayCard: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 16, padding: 18, gap: 8,
  },
  todayIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: INDIGO + '14',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  todayTitle: { fontSize: 17, fontWeight: '800', color: colors.t1, letterSpacing: -0.3 },
  todayBody:  { fontSize: 13, color: colors.t2, lineHeight: 20 },
  todayCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  todayCta:   { fontSize: 12, fontWeight: '700', color: INDIGO },

  // Network
  networkCard: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 16, padding: 16, gap: 4,
  },
  networkHead: { fontSize: 15, fontWeight: '800', color: colors.t1, letterSpacing: -0.2 },
  networkSub:  { fontSize: 12, color: colors.t2, lineHeight: 18 },
  networkPromptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10,
    backgroundColor: colors.s1,
    borderWidth: 1, borderColor: colors.b1,
  },
  networkPromptText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.t1 },

  // Market
  marketCard: {
    backgroundColor: '#0D1117',
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#21262D',
  },
  marketNumber: { fontSize: 32, fontWeight: '900', color: '#58A6FF', letterSpacing: -1 },
  marketLabel:  { fontSize: 13, color: '#C9D1D9', marginTop: 2 },
  marketExample:{ fontSize: 11, color: '#8B949E', marginTop: 8, fontStyle: 'italic' },
  marketCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  marketCta: { fontSize: 12, fontWeight: '800', color: '#58A6FF' },

  footer: {
    fontSize: 12, color: colors.t3, textAlign: 'center',
    marginTop: 6, fontStyle: 'italic',
  },
});


function SeekerHome() {
  const insets = useSafeAreaInsets();
  // Full theme: accent + surface + shape + type. Every hero and
  // card on this screen reads from here so Customize actually
  // paints the highest-traffic screen end-to-end (not just the
  // accent swatch on the name, which is what it was before).
  const theme = useResolvedTheme();
  const accent = theme.accent;
  // Tier feel: starter stays clean, paid tiers lean heavier via
  // headingWeight + letter-spacing and thicker card borders.
  const feel = useTierFeel();
  // Per-situation copy — greeting, eyebrow, CTA verb, empty states
  // all key off the user's user_path via sessionCache.
  const situationCopy = useSituationCopy();
  const [profile, setProfile] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dillyTake, setDillyTake] = useState<string | null>(null);
  const [topJobs, setTopJobs] = useState<any[]>([]);
  const [factCount, setFactCount] = useState(0);
  const [topFacts, setTopFacts] = useState<Array<{ category: string; label: string; value: string }>>([]);
  const [appCount, setAppCount] = useState(0);
  // Number of jobs the user has saved across all collections.
  // Counts toward the "Save your first job" onboarding step so the
  // checkmark flips after saving, not after applying.
  const [savedJobCount, setSavedJobCount] = useState(0);
  // Chapter (weekly scheduled session) state. Fed to ChapterCard.
  // Null until the first fetch lands; the card renders a quiet
  // skeleton in that window.
  const [chapterState, setChapterState] = useState<ChapterCardState | null>(null);
  // Weekly brief. personalized Monday-morning card with a headline +
  // 3 bullets + deep links. Fetched on mount, cached server-side per
  // ISO week. Cheap to fetch (no LLM call).
  const [weeklyBrief, setWeeklyBrief] = useState<{
    headline: string;
    bullets: Array<{ icon: string; text: string; deep_link: string }>;
    new_jobs_count: number;
    fact_count: number;
    deep_link: string;
  } | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  // Journey tracking
  const [visitedJobs, setVisitedJobs] = useState(false);
  const [visitedArena, setVisitedArena] = useState(false);
  const [doneInterview, setDoneInterview] = useState(false);

  // Auth guard
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const token = await getToken();
        if (!token && active) router.replace('/');
      })();
      return () => { active = false; };
    }, [])
  );

  // Refresh Chapter state when the user returns to Home. Covers the
  // "opened a Chapter, came back, card still says Ready" case.
  useFocusEffect(
    useCallback(() => {
      dilly.get('/chapters/current').then((data: ChapterCardState | null) => {
        if (data) setChapterState(data);
      }).catch(() => {});
      return () => {};
    }, [])
  );

  // Also refresh when Dilly AI extraction completes. Users who
  // talk to Dilly to push past the 20-fact Chapter gate need the
  // card to unlock the moment extraction lands, not on cold
  // reload.
  const chapterExtraction = useExtractionState();
  useEffect(() => {
    if (chapterExtraction.seq === 0) return;
    dilly.get('/chapters/current').then((data: ChapterCardState | null) => {
      if (data) setChapterState(data);
    }).catch(() => {});
  }, [chapterExtraction.seq]);

  // Load data
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { router.replace('/'); return; }
      try {
        const [profileRaw, auditRawRes, memRes] = await Promise.all([
          dilly.fetch('/profile'),
          dilly.fetch('/audit/latest'),
          dilly.fetch('/memory').catch(() => null),
        ]);
        if (profileRaw.status === 401 || profileRaw.status === 403) {
          await (await import('../../lib/auth')).clearAuth();
          router.replace('/'); return;
        }
        const [profileRes, auditRaw] = await Promise.all([
          profileRaw.json(), auditRawRes.json(),
        ]);
        if (!profileRes?.onboarding_complete) {
          if (!profileRes?.name) router.replace('/onboarding/profile');
          else if (!profileRes?.has_run_first_audit) router.replace('/onboarding/upload');
          return;
        }
        setProfile(profileRes ?? {});
        const auditObj = profileRes?.latest_audit ?? auditRaw?.audit ?? auditRaw ?? {};
        if (auditObj?.dilly_take) setDillyTake(auditObj.dilly_take);

        // Facts count + sample (for the "Dilly sees" card when profile
        // is still thin. gives the app a useful empty state).
        if (memRes?.ok) {
          const mem = await memRes.json();
          const items = (mem?.items || []) as Array<{ category: string; label: string; value: string }>;
          setFactCount(items.length);
          // Pick the most interesting 4 facts to show on the card.
          // Priority: projects/achievements first (most recognizable),
          // then skills, then goals. Skip vague/private categories.
          const PRIVATE = new Set(['weakness', 'fear', 'challenge', 'concern',
            'life_context', 'areas_for_improvement', 'personal', 'contact',
            'phone', 'email_address']);
          const PRIORITY: Record<string, number> = {
            project_detail: 1, project: 1, achievement: 2, experience: 3,
            skill_unlisted: 4, technical_skill: 4, skill: 4,
            goal: 5, target_company: 6, strength: 7, soft_skill: 8,
          };
          const ranked = items
            .filter(it => !PRIVATE.has((it.category || '').toLowerCase()) && (it.label || it.value))
            .sort((a, b) => {
              const pa = PRIORITY[(a.category || '').toLowerCase()] ?? 99;
              const pb = PRIORITY[(b.category || '').toLowerCase()] ?? 99;
              return pa - pb;
            })
            .slice(0, 4);
          setTopFacts(ranked);
        }

        // Applications count
        dilly.get('/applications').then(data => {
          const apps = Array.isArray(data) ? data : (data?.applications || []);
          setAppCount(apps.length);
        }).catch(() => {});

        // Saved-jobs count across all collections. Powers the
        // "Save your first job" onboarding checkmark — previously
        // that step only flipped when the user APPLIED to something,
        // which is wrong (its subtitle is "start building your
        // pipeline", not "apply").
        dilly.get('/collections').then(data => {
          const cols = Array.isArray(data) ? data : (data?.collections || []);
          const total = cols.reduce((n: number, c: any) => n + (Array.isArray(c?.jobs) ? c.jobs.length : 0), 0);
          setSavedJobCount(total);
        }).catch(() => {});

        // Chapter (weekly scheduled session) state. Single cheap GET,
        // no LLM. Drives the ChapterCard on Home. After we learn the
        // user's schedule, re-arm local notifications so "Chapter ready"
        // fires even if they haven't opened the schedule page in weeks.
        dilly.get('/chapters/current').then((data: ChapterCardState | null) => {
          if (data) {
            setChapterState(data);
            if (data.has_access && data.schedule) {
              scheduleChapterNotifications(data.schedule).catch(() => {});
            }
          }
        }).catch(() => {});

        // Top jobs
        dilly.get('/v2/internships/feed?readiness=ready&limit=3').then(data => {
          setTopJobs((data?.listings || []).slice(0, 3));
        }).catch(() => {});

        // Weekly brief. server-cached per ISO week so this is ~free.
        // Gives Career Center a reason-to-open-every-Monday.
        dilly.get('/brief/weekly').then((data: any) => {
          if (data?.headline) setWeeklyBrief(data);
        }).catch(() => {});

        // Journey tracking from AsyncStorage
        const [vj, va, di] = await Promise.all([
          AsyncStorage.getItem('dilly_visited_jobs'),
          AsyncStorage.getItem('dilly_visited_arena'),
          AsyncStorage.getItem('dilly_done_interview'),
        ]);
        setVisitedJobs(vj === 'true');
        setVisitedArena(va === 'true');
        setDoneInterview(di === 'true');
      } catch {
        const still = await getToken();
        if (!still) { router.replace('/'); return; }
      } finally { setLoading(false); }
    })();
  }, [profileRefreshKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setProfileRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  // Derived
  const p = profile as any;
  // Name derivation: prefer the structured `first_name` when
  // present. `name` can be a full display string set from other
  // sources (profile slug, email local-part, tagline) which made
  // the greeting read "Welcome, <email-local>." in the wild. Only
  // fall back to splitting `name` when it clearly looks like a
  // real name (no @, no digits at the start). Strip @ local-parts
  // explicitly as a last line of defense.
  const looksLikeName = (s: string) => !!s && !s.includes('@') && !/^\d/.test(s);
  const firstNameRaw =
    (p.first_name && String(p.first_name).trim()) ||
    (looksLikeName(String(p.name || '').trim()) ? String(p.name).trim().split(/\s+/)[0] : '') ||
    '';
  const firstName = firstNameRaw.replace(/@.*$/, '');

  // Your Plan for this week. Anchor card at the top of every home.
  // Mode here is inferred from is_student — anyone who hits SeekerHome
  // is either an actual seeker (laid-off, career-switch, parent-
  // returning, etc.) or a student. The user_path value drives the
  // path-specific copy inside the plan generator.
  const _seekerUserPath = String(p.user_path || '').toLowerCase() || 'exploring';
  const _seekerMode = p.is_student ? 'student' : 'seeker';
  const plan = useYourPlan({
    mode: _seekerMode,
    userPath: _seekerUserPath,
    firstName,
    appCount,
    factCount,
    interviewingCount: 0,
    recentDeadline: null,
  });

  // Journey steps
  const journeySteps: JourneyStep[] = [
    {
      id: 'tell', title: 'Tell Dilly about yourself', subtitle: 'The more Dilly knows, the better it helps.',
      icon: 'chatbubble', color: colors.indigo, completed: factCount > 3,
      onPress: () => openDillyOverlay({ name: firstName, isPaid: false, initialMessage: 'Help me build my profile. Ask me about my experiences, skills, and goals.' }),
    },
    {
      id: 'jobs', title: 'Explore your job matches', subtitle: 'See what opportunities fit your profile.',
      icon: 'briefcase', color: colors.blue, completed: visitedJobs,
      onPress: async () => { await AsyncStorage.setItem('dilly_visited_jobs', 'true'); setVisitedJobs(true); router.push('/(app)/jobs'); },
    },
    {
      id: 'arena', title: 'Check your AI readiness', subtitle: 'Find out how AI impacts your career.',
      icon: 'shield-checkmark', color: '#00C853', completed: visitedArena,
      onPress: async () => { await AsyncStorage.setItem('dilly_visited_arena', 'true'); setVisitedArena(true); router.push('/(app)/ai-arena'); },
    },
    {
      id: 'interview', title: 'Try a mock interview', subtitle: 'Practice makes confident.',
      icon: 'mic', color: '#AF52DE', completed: doneInterview,
      onPress: async () => { await AsyncStorage.setItem('dilly_done_interview', 'true'); setDoneInterview(true); router.push('/(app)/interview-practice'); },
    },
    {
      id: 'save', title: 'Save your first job', subtitle: 'Start building your pipeline.',
      icon: 'bookmark', color: colors.amber, completed: savedJobCount > 0 || appCount > 0,
      onPress: () => router.push('/(app)/jobs'),
    },
  ];
  const completedCount = journeySteps.filter(s => s.completed).length;
  const allDone = completedCount === journeySteps.length;
  const showJourney = !allDone;

  // Activity feed items
  const activities: { icon: string; color: string; title: string; subtitle: string; onPress: () => void }[] = [];
  // All WHAT'S HAPPENING icons now follow the user's accent from
  // Customize Dilly. Previously each row had its own baked-in color
  // (indigo / blue / green) which looked inconsistent the moment a
  // user picked a non-indigo accent.
  if (factCount > 0) activities.push({ icon: 'person', color: theme.accent, title: `${factCount} facts in your profile`, subtitle: 'Dilly is learning about you', onPress: () => router.push('/(app)/my-dilly-profile') });
  if (appCount > 0) activities.push({ icon: 'briefcase', color: theme.accent, title: `${appCount} job${appCount === 1 ? '' : 's'} in your pipeline`, subtitle: 'Track your applications', onPress: () => router.push('/(app)/internship-tracker') });
  if (topJobs.length > 0) activities.push({ icon: 'sparkles', color: theme.accent, title: `${topJobs.length}+ jobs match your profile`, subtitle: 'New opportunities waiting for you', onPress: () => router.push('/(app)/jobs') });

  if (loading) {
    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}>
          <Skeleton width={160} height={20} style={{ marginBottom: 8 }} />
          <Skeleton width={220} height={14} style={{ marginBottom: 24 }} />
          <View style={{ alignItems: 'center', marginVertical: 20 }}>
            <Skeleton width={80} height={80} style={{ borderRadius: 40 }} />
          </View>
          <Skeleton width="100%" height={48} style={{ borderRadius: 12, marginBottom: 12 }} />
          <Skeleton width="100%" height={48} style={{ borderRadius: 12, marginBottom: 12 }} />
          <Skeleton width="100%" height={48} style={{ borderRadius: 12 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent} />}
      >

        {/* Header */}
        <FadeInView delay={0}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerName, {
                color: theme.surface.t1,
                fontFamily: theme.type.display,
                // Pro tier adds 100 weight and +0.2 letter-spacing on top
                // of whatever the Customize type preset already chose.
                // Reads as "heavier, more considered" without needing
                // users to notice why.
                fontWeight: feel.headingWeight,
                letterSpacing: theme.type.heroTracking + feel.headingTracking,
              }]}>
                Welcome, <Text style={{ color: accent }}>{firstName || 'there'}</Text>.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                <Text style={[s.headerSub, { color: theme.surface.t3, fontFamily: theme.type.body }]}>
                  Welcome to your career center.
                </Text>
                <TierBadge />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <AnimatedPressable
                onPress={() => router.push({ pathname: '/(app)/my-dilly-profile', params: { openQr: '1' } })}
                scaleDown={0.9}
                hitSlop={10}
              >
                <Ionicons name="qr-code" size={20} color={accent} />
              </AnimatedPressable>
              <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
                <Ionicons name="settings-outline" size={20} color={colors.t3} />
              </AnimatedPressable>
            </View>
          </View>
        </FadeInView>

        {/* ── YOUR PLAN anchor (seeker + student paths) ─────────
            The product promise in one card: "Dilly turns your career
            confusion into a plan." Sits above every other block so
            the mental model is inescapable: Dilly makes the plan,
            the rest of the app is where it gets executed. */}
        <FadeInView delay={10}>
          <YourPlanCard plan={plan} firstName={firstName} />
        </FadeInView>

        {/* Chapter card. The weekly scheduled session with Dilly.
            Renders one of seven evolving states depending on plan
            tier, profile depth, schedule, and whether a new Chapter
            is due right now. Sits under the Your Plan anchor with a
            generous gap so the two cards read as distinct rituals
            instead of one mashed stack. */}
        <View style={{ height: 20 }} />
        <FadeInView delay={15}>
          <ChapterCard state={chapterState} theme={theme} />
        </FadeInView>

        {/* ── Situation hero card ─────────────────────────────
            Per-path, cohort-specific action block rendered above
            every other home block. One concrete thing the user can
            do in 10 seconds that's shaped for their situation. Null
            for holder + senior_reset (they have their own bespoke
            homes) and rendered for the other 16 paths. */}
        {situationCopy.hero ? (
          <FadeInView delay={20}>
            <AnimatedPressable
              style={[
                s.heroCard,
                {
                  borderColor: (situationCopy.accent || colors.indigo) + '40',
                  shadowColor: situationCopy.accent || colors.indigo,
                },
              ]}
              scaleDown={0.98}
              onPress={() => openDillyOverlay({
                name: firstName,
                isPaid: false,
                initialMessage: situationCopy.hero!.chat_seed,
              })}
            >
              <Text style={[s.heroEyebrow, { color: situationCopy.accent || colors.indigo }]}>
                {situationCopy.hero.eyebrow}
              </Text>
              <Text style={s.heroHeadline}>
                {situationCopy.hero.headline}
              </Text>
              <Text style={s.heroBody}>
                {situationCopy.hero.body}
              </Text>
              <View style={s.heroCtaRow}>
                <Text style={[s.heroCtaText, { color: situationCopy.accent || colors.indigo }]}>
                  {situationCopy.hero.cta_label}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={situationCopy.accent || colors.indigo}
                />
              </View>
            </AnimatedPressable>
          </FadeInView>
        ) : null}

        {/* ── Weekly Brief ──────────────────────────────────────
            Personalized card for the Monday-morning moment. Server
            generates this once per ISO week per user; pure derivation
            from profile + jobs feed, no LLM cost. This is the card
            that makes opening Dilly feel like checking your career
            inbox.

            Each bullet has a deep_link. tapping jumps to the
            relevant tab with context (e.g. Jobs tab with ?weekly=1
            shows the jobs that match). */}
        {weeklyBrief && (weeklyBrief.new_jobs_count > 0 || (weeklyBrief.bullets?.length ?? 0) > 0) && (
          <FadeInView delay={40}>
            <View style={[s.briefCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <View style={s.briefTopRow}>
                <View style={[s.briefBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                  <Ionicons name="sparkles" size={11} color={theme.accent} />
                  <Text style={[s.briefBadgeText, { color: theme.accent }]}>YOUR WEEK</Text>
                </View>
              </View>
              <Text style={[s.briefHeadline, { color: theme.surface.t1 }]}>{weeklyBrief.headline}</Text>
              {(weeklyBrief.bullets || []).map((b, i) => (
                <AnimatedPressable
                  key={i}
                  style={[s.briefRow, { borderTopColor: theme.surface.border }]}
                  scaleDown={0.98}
                  onPress={() => {
                    const link = b.deep_link || '';
                    if (link.startsWith('dilly://jobs')) {
                      router.push('/(app)/jobs');
                    } else if (link.startsWith('dilly://ai-chat')) {
                      openDillyOverlay({ name: firstName, isPaid: false });
                    } else if (link.startsWith('dilly://my-dilly')) {
                      router.push('/(app)/my-dilly-profile');
                    } else {
                      openDillyOverlay({ name: firstName, isPaid: false });
                    }
                  }}
                >
                  <View style={[s.briefRowIcon, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name={b.icon as any} size={13} color={theme.accent} />
                  </View>
                  <Text style={[s.briefRowText, { color: theme.surface.t1 }]}>{b.text}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
                </AnimatedPressable>
              ))}
            </View>
          </FadeInView>
        )}

        {/* DillyFace + message.
            Message is rendered as a pull-quote, not body copy. Big
            serif display type, italic, ornamental opening accent
            quote mark. Reads as something Dilly said, not status
            text. Kept tap-to-open-chat so the whole block is still
            an interactive surface. */}
        <FadeInView delay={60}>
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <DillyFace size={showJourney ? 100 : 80} />
          </View>
          <AnimatedPressable
            onPress={() => openDillyOverlay({
              name: firstName,
              isPaid: false,
              initialMessage: dillyTake || situationCopy.empty_chat_seed,
            })}
            scaleDown={0.99}
          >
            <View style={{ paddingHorizontal: 28, alignItems: 'center', marginTop: 4 }}>
              {/* Ornamental opening quote. Big, accent-colored, sits
                  above the line so the quote reads as ambient art. */}
              <Text
                style={{
                  fontSize: 46,
                  lineHeight: 36,
                  color: theme.accent,
                  fontFamily: theme.type.display,
                  fontWeight: '900',
                  opacity: 0.85,
                  marginBottom: -4,
                }}
              >
                {'\u201C'}
              </Text>
              <Text
                style={{
                  fontSize: 19,
                  lineHeight: 28,
                  color: theme.surface.t1,
                  fontFamily: theme.type.display,
                  fontWeight: '600',
                  fontStyle: 'italic',
                  letterSpacing: -0.2,
                  textAlign: 'center',
                }}
              >
                {(() => {
                  // Copy logic lives inline because the combinations
                  // are narrow: (have a firstName? have a dillyTake?).
                  // Product rule: NEVER fall back to "Hey there," — it
                  // reads cold. If we don't know the name, we just
                  // skip the greeting and lead with the thought.
                  //
                  // "Take a look" was the old generic filler that the
                  // LLM sometimes returned for dilly_take. We filter
                  // those weak takes and replace them with a warmer
                  // first-Chapter-style opener so the quote under
                  // DillyFace never reads like "there, take a look".
                  const rawTake = (dillyTake || '').trim()
                  const weakTake = !rawTake
                    || rawTake.length < 18
                    || /^take a look/i.test(rawTake)
                    || /^check (it|this) out/i.test(rawTake)

                  if (showJourney) {
                    return firstName ? (
                      <>Hey <Text style={{ color: theme.accent, fontStyle: 'normal', fontWeight: '800' }}>{firstName}</Text>. Let me get to know you so I can help you land your next opportunity.</>
                    ) : (
                      <>Let me get to know you so I can help you land your next opportunity.</>
                    )
                  }

                  if (weakTake) {
                    // No real audit take yet. Lead with a warm,
                    // specific statement that doesn't pretend we know
                    // more than we do. Reads as a mentor noticing you
                    // rather than a placeholder.
                    return firstName ? (
                      <>Hey <Text style={{ color: theme.accent, fontStyle: 'normal', fontWeight: '800' }}>{firstName}</Text>. I've been reading through your profile. Let's pick up where you left off.</>
                    ) : (
                      <>I've been reading through your profile. Let's pick up where you left off.</>
                    )
                  }

                  const takeBody = `${rawTake.charAt(0).toLowerCase()}${rawTake.slice(1)}`
                  return firstName ? (
                    <>Hey <Text style={{ color: theme.accent, fontStyle: 'normal', fontWeight: '800' }}>{firstName}</Text>, {takeBody}</>
                  ) : (
                    <>{rawTake}</>
                  )
                })()}
              </Text>
              {/* Tiny byline underneath. Names who said it — it's a
                  quote from Dilly, so the attribution earns the
                  ornament. */}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 2,
                  color: theme.surface.t3,
                  marginTop: 10,
                }}
              >
                {'\u2014 '}DILLY
              </Text>
            </View>
          </AnimatedPressable>
          <AnimatedPressable
            style={[s.talkBtn, { backgroundColor: theme.accent }]}
            onPress={() => openDillyOverlay({
              name: firstName,
              isPaid: false,
              initialMessage: situationCopy.empty_chat_seed,
            })}
            scaleDown={0.97}
          >
            <Ionicons name="chatbubble" size={16} color="#fff" />
            <Text style={s.talkBtnText}>{situationCopy.talk_cta}</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* "Dilly sees" card. shown when the profile is still thin (≤12
            facts). Makes the empty state feel like progress. Lists the
            concrete things Dilly learned from resume/onboarding + an
            explicit ask to add one more. Tapping opens Dilly AI. */}
        {factCount > 0 && factCount <= 12 && (
          <FadeInView delay={90}>
            <AnimatedPressable
              style={[s.dillySeesCard, { backgroundColor: theme.surface.s1, borderColor: theme.accent + '26' }]}
              onPress={() => openDillyOverlay({ name: firstName, isPaid: false })}
              scaleDown={0.99}
            >
              <View style={s.dillySeesHeader}>
                <View style={[s.dillySeesEye, { backgroundColor: theme.accent + '15' }]}>
                  <Ionicons name="eye" size={13} color={theme.accent} />
                </View>
                <Text style={[s.dillySeesTitle, { color: theme.accent }]}>DILLY SEES</Text>
                <Text style={[s.dillySeesCount, { color: theme.surface.t3 }]}>{factCount} {factCount === 1 ? 'thing' : 'things'} so far</Text>
              </View>
              {topFacts.length > 0 ? (
                <View style={s.dillySeesList}>
                  {topFacts.slice(0, 4).map((f, i) => (
                    <View key={i} style={s.dillySeesRow}>
                      <View style={[s.dillySeesDot, { backgroundColor: theme.accent }]} />
                      <Text style={[s.dillySeesRowText, { color: theme.surface.t1 }]} numberOfLines={2}>
                        {f.label || f.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={[s.dillySeesFooter, { borderTopColor: theme.surface.border }]}>
                <Text style={[s.dillySeesFooterText, { color: theme.surface.t3 }]}>
                  The more Dilly learns, the sharper your fit narratives and resumes get.
                </Text>
                <View style={s.dillySeesCta}>
                  <Ionicons name="chatbubble" size={11} color={theme.accent} />
                  <Text style={[s.dillySeesCtaText, { color: theme.accent }]}>Tell Dilly one more thing</Text>
                </View>
              </View>
            </AnimatedPressable>
          </FadeInView>
        )}

        {/* ── Life Event Card ──────────────────────────────────────
            Ties Dilly to real moments in the user's life instead of
            arbitrary engagement metrics. Derived from profile signals:
              - graduation_year → grad countdown (students)
              - performance review season (March-May, Sept-Oct) → prep
              - user_path=senior_reset / ex_founder / parent_returning
                → days since they started looking, gentle urgency
            Only one card at a time, and only when a signal fires. */}
        {(() => {
          const now = new Date();
          const month = now.getMonth(); // 0-11
          const gradYearRaw = profile?.graduation_year;
          const gradYear = gradYearRaw ? parseInt(String(gradYearRaw), 10) : null;
          const path = (profile?.user_path || '').toString().toLowerCase();

          // Graduation countdown (students with a future grad year)
          if (gradYear && gradYear >= now.getFullYear()) {
            // Approximate grad date = May of grad year
            const gradDate = new Date(gradYear, 4, 15); // May 15
            const diffMs = gradDate.getTime() - now.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays > 0 && diffDays <= 730) {
              const months = Math.floor(diffDays / 30);
              const title = months > 0
                ? `You graduate in ${months} ${months === 1 ? 'month' : 'months'}`
                : `You graduate in ${diffDays} days`;
              const message = months >= 9
                ? "Plenty of runway. Let's use it to build something recruiters notice."
                : months >= 3
                  ? "The job search starts now. Applications for summer roles should already be out."
                  : "Final stretch. Let's lock in interview prep and follow-up discipline.";
              return (
                <FadeInView delay={100}>
                  <AnimatedPressable
                    style={[s.lifeCard, { backgroundColor: theme.surface.s1, borderColor: theme.accent + '26' }]}
                    onPress={() => openDillyOverlay({
                      name: firstName, isPaid: false,
                      initialMessage: `I graduate in ${months > 0 ? `${months} months` : `${diffDays} days`}. Build me a plan for the time I have left.`,
                    })}
                    scaleDown={0.99}
                  >
                    <View style={[s.lifeIcon, { backgroundColor: theme.accent + '15' }]}>
                      <Ionicons name="calendar" size={16} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.lifeTitle, { color: theme.surface.t1 }]}>{title}</Text>
                      <Text style={[s.lifeMessage, { color: theme.surface.t2 }]}>{message}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.surface.t3} />
                  </AnimatedPressable>
                </FadeInView>
              );
            }
          }

          // Performance review season (employed users)
          const isReviewSeason = (month >= 8 && month <= 9) || (month >= 2 && month <= 3);
          const isEmployed = path === 'senior_reset' || path === 'career_switch' || path === 'exploring';
          if (isReviewSeason && isEmployed && !gradYear) {
            const period = month >= 8 ? 'Fall' : 'Spring';
            return (
              <FadeInView delay={100}>
                <AnimatedPressable
                  style={[s.lifeCard, { backgroundColor: theme.surface.s1, borderColor: theme.accent + '26' }]}
                  onPress={() => openDillyOverlay({
                    name: firstName, isPaid: false,
                    initialMessage: `It's ${period} performance review season. Help me prep and gather evidence of what I've delivered this cycle.`,
                  })}
                  scaleDown={0.99}
                >
                  <View style={[s.lifeIcon, { backgroundColor: theme.accent + '15' }]}>
                    <Ionicons name="stats-chart" size={16} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.lifeTitle, { color: theme.surface.t1 }]}>{period} review season is here</Text>
                    <Text style={[s.lifeMessage, { color: theme.surface.t2 }]}>Want Dilly to help you prep and gather your wins?</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.surface.t3} />
                </AnimatedPressable>
              </FadeInView>
            );
          }

          // Parent returning or senior_reset: gentle "next step" card
          if (path === 'parent_returning' || path === 'senior_reset' || path === 'ex_founder') {
            const cta = {
              parent_returning: "Let's line up 3 flex-friendly roles worth applying to this week.",
              senior_reset: "You're not starting over. Let's get 3 leadership roles in front of you this week.",
              ex_founder: "Operator experience is the resume. Let's find 3 early-stage cos that want you.",
            }[path] || '';
            return (
              <FadeInView delay={100}>
                <AnimatedPressable
                  style={[s.lifeCard, { backgroundColor: theme.surface.s1, borderColor: theme.accent + '26' }]}
                  onPress={() => { router.push('/(app)/jobs'); }}
                  scaleDown={0.99}
                >
                  <View style={[s.lifeIcon, { backgroundColor: theme.accent + '15' }]}>
                    <Ionicons name="compass" size={16} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.lifeTitle, { color: theme.surface.t1 }]}>This week</Text>
                    <Text style={[s.lifeMessage, { color: theme.surface.t2 }]}>{cta}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.surface.t3} />
                </AnimatedPressable>
              </FadeInView>
            );
          }

          return null;
        })()}

        {/* Getting Started Journey */}
        {showJourney && (
          <FadeInView delay={120}>
            <View style={s.journeyHeader}>
              <Text style={[s.sectionLabel, { color: theme.surface.t3 }]}>GETTING STARTED</Text>
              <Text style={[s.journeyProgress, { color: theme.surface.t2 }]}>
                {completedCount} of {journeySteps.length}
              </Text>
            </View>
            {/* Progress bar */}
            <View style={[s.progressBar, { backgroundColor: theme.surface.s2 }]}>
              <View style={[s.progressFill, { width: `${(completedCount / journeySteps.length) * 100}%`, backgroundColor: accent }]} />
            </View>
            <View style={{ gap: 6, marginTop: 10 }}>
              {journeySteps.map((step, i) => (
                <FadeInView key={step.id} delay={140 + i * 40}>
                  <JourneyStepCard step={step} />
                </FadeInView>
              ))}
            </View>
          </FadeInView>
        )}

        {/* Quick Tools (moved above pipeline) */}
        <FadeInView delay={showJourney ? 360 : 140}>
          <Text style={[s.sectionLabel, { marginTop: 24, color: theme.surface.t3 }]}>QUICK TOOLS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRow}>
            {[
              // "What We Think" removed. It was an on-demand LLM button that
              // could be hammered. Replaced with the weekly Chapters ritual
              // surfaced via ChapterCard higher up on Home.
              { icon: 'sparkles' as const, color: colors.indigo, label: 'Generate', onPress: () => router.push('/(app)/resume-generate') },
              { icon: 'clipboard' as const, color: colors.gold, label: 'Tracker', onPress: () => router.push('/(app)/internship-tracker') },
              { icon: 'mic' as const, color: '#AF52DE', label: 'Interview', onPress: () => router.push('/(app)/interview-practice') },
              { icon: 'calendar' as const, color: colors.blue, label: 'Calendar', onPress: () => router.push('/(app)/calendar' as any) },
              { icon: 'shield-checkmark' as const, color: '#00C853', label: 'AI Arena', onPress: () => router.push('/(app)/ai-arena') },
            ].map(tool => (
              <AnimatedPressable key={tool.label} style={s.toolItem} onPress={tool.onPress} scaleDown={0.92}>
                <View style={[s.toolIcon, { backgroundColor: tool.color + '10' }]}>
                  <Ionicons name={tool.icon} size={20} color={tool.color} />
                </View>
                <Text style={[s.toolLabel, { color: theme.surface.t2, fontFamily: theme.type.body }]}>{tool.label}</Text>
              </AnimatedPressable>
            ))}
          </ScrollView>
        </FadeInView>

        {/* Pipeline tiles */}
        {appCount > 0 && (
          <FadeInView delay={showJourney ? 400 : 180}>
            <Text style={[s.sectionLabel, { marginTop: 24, color: theme.surface.t3 }]}>YOUR PIPELINE</Text>
            <View style={s.pipeGrid}>
              <PipelineTile icon="bookmark" count={appCount} label="Saved" color={colors.blue} onPress={() => router.push('/(app)/internship-tracker')} />
              <PipelineTile icon="send" count={0} label="Applied" color={colors.indigo} onPress={() => router.push('/(app)/internship-tracker')} />
              <PipelineTile icon="people" count={0} label="Interview" color="#AF52DE" onPress={() => router.push('/(app)/internship-tracker')} />
              <PipelineTile icon="trophy" count={0} label="Offers" color={colors.green} onPress={() => router.push('/(app)/internship-tracker')} />
            </View>
          </FadeInView>
        )}

        {/* Activity feed */}
        {activities.length > 0 && (
          <FadeInView delay={showJourney ? 440 : 220}>
            <Text style={[s.sectionLabel, { marginTop: 24, color: theme.surface.t3 }]}>WHAT'S HAPPENING</Text>
            <View style={{ gap: 6 }}>
              {activities.map((a, i) => (
                <ActivityCard key={i} {...a} />
              ))}
            </View>
          </FadeInView>
        )}

        {/* Recent jobs */}
        {topJobs.length > 0 && (
          <FadeInView delay={showJourney ? 480 : 260}>
            <Text style={[s.sectionLabel, { marginTop: 24, color: theme.surface.t3 }]}>RECENT JOBS</Text>
            {topJobs.map((job: any) => (
              <AnimatedPressable
                key={job.id}
                style={[s.jobCard, {
                  backgroundColor: theme.surface.s1,
                  borderColor: theme.surface.border,
                  borderRadius: theme.shape.md,
                }]}
                onPress={() => router.push('/(app)/jobs')}
                scaleDown={0.98}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[s.jobTitle, { color: theme.surface.t1, fontFamily: theme.type.body }]} numberOfLines={1}>
                    {job.title}
                  </Text>
                  <Text style={[s.jobCompany, { color: theme.surface.t2, fontFamily: theme.type.body }]} numberOfLines={1}>
                    {job.company}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
              </AnimatedPressable>
            ))}
          </FadeInView>
        )}

      </ScrollView>
    </View>
  );
}

// Dispatcher: picks the right Home based on app mode + user_path.
// Kept minimal so hook order stays stable for each variant. Each
// variant's hooks never live next to another variant's hooks at
// the call site.
//
// Rung-3 paths get bespoke home screens:
//   - senior_reset     -> SeniorResetHome (laid-off senior professional)
//   - exploring        -> ExploringHome   (finding my next)
//   - dropout          -> DropoutHome     (proof over paper)
//   - laid_off         -> LaidOffHome     (runway + momentum)
//   - visa             -> VisaHome        (timing + sponsors)
//
// Other paths fall through to SeekerHome / HolderHome.
export default function HomeScreen() {
  const appMode = useAppMode();
  const profileCached = getCached<any>('profile:full');
  const userPath = String(profileCached?.user_path || '').toLowerCase();

  if (appMode === 'holder') return <HolderHome />;
  if (userPath === 'senior_reset')   return <SeniorResetHome />;
  if (userPath === 'exploring')      return <ExploringHome />;
  if (userPath === 'dropout')        return <DropoutHome />;
  if (userPath === 'laid_off')       return <LaidOffHome />;
  if (userPath === 'visa')           return <VisaHome />;
  return <SeekerHome />;
}

// -- Styles -------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerName: { fontSize: 18, fontWeight: '800', color: colors.t1 },
  headerSub: { fontSize: 12, color: colors.t3, marginTop: 2 },

  dillyMessage: { fontSize: 16, color: colors.t1, lineHeight: 24, textAlign: 'center' },
  talkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.indigo, paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  talkBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // "Dilly sees" card. shown when profile is still thin
  dillySeesCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.indigo + '33',
  },
  dillySeesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dillySeesEye: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.indigo + '1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dillySeesTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.indigo,
    letterSpacing: 1.5,
  },
  dillySeesCount: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.t3,
    marginLeft: 'auto',
  },
  dillySeesList: { gap: 8, marginBottom: 12 },
  dillySeesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dillySeesDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.indigo,
    marginTop: 7,
  },
  dillySeesRowText: {
    flex: 1,
    fontSize: 13,
    color: colors.t1,
    fontWeight: '600',
    lineHeight: 18,
  },
  dillySeesFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.b1,
    paddingTop: 10,
    gap: 8,
  },
  dillySeesFooterText: {
    fontSize: 11,
    color: colors.t3,
    lineHeight: 15,
  },
  dillySeesCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dillySeesCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.indigo,
  },

  // Life event card. real moments in the user's timeline
  lifeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.indigo + '26',
  },
  lifeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.indigo + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.t1,
    marginBottom: 2,
  },
  lifeMessage: {
    fontSize: 12,
    color: colors.t2,
    lineHeight: 16,
  },

  // Situation hero card. per-path, cohort-specific action block
  // rendered at the very top of the seeker home. Soft accent-tinted
  // border with low-opacity shadow; the cohort's accent color fills
  // the eyebrow + CTA. One card across 16 paths. Pure copy swap.
  heroCard: {
    marginTop: 8,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 10,
  },
  heroEyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.8,
  },
  heroHeadline: {
    fontSize: 20, fontWeight: '800',
    color: colors.t1, letterSpacing: -0.4, lineHeight: 26,
  },
  heroBody: {
    fontSize: 13, color: colors.t2, lineHeight: 20,
  },
  heroCtaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4,
  },
  heroCtaText: {
    fontSize: 13, fontWeight: '800',
  },

  // Weekly brief. the "reason to open Dilly every Monday" card
  briefCard: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.indigo + '26',
    shadowColor: colors.indigo,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  briefTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  briefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.indigo + '12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  briefBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.indigo,
  },
  briefHeadline: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.t1,
    lineHeight: 21,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  briefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  briefRowIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.indigo + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefRowText: {
    flex: 1,
    fontSize: 13,
    color: colors.t1,
    fontWeight: '600',
    lineHeight: 17,
  },

  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.t3, marginBottom: 8 },

  // Journey
  journeyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 },
  journeyProgress: { fontSize: 11, fontWeight: '600', color: colors.indigo },
  progressBar: { height: 3, backgroundColor: colors.s3, borderRadius: 2, marginTop: 6, marginBottom: 4 },
  progressFill: { height: 3, backgroundColor: colors.indigo, borderRadius: 2 },
  journeyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.b1,
  },
  journeyCardDone: { opacity: 0.6 },
  journeyIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  journeyTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  journeySub: { fontSize: 11, color: colors.t3, marginTop: 1 },

  // Activity
  activityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.b1,
  },
  activityIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  activityTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  activitySub: { fontSize: 11, color: colors.t3, marginTop: 1 },

  // Pipeline
  pipeGrid: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pipeTile: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.s1, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.b1,
  },
  pipeCount: { fontSize: 20, fontWeight: '800' },
  pipeLabel: { fontSize: 10, fontWeight: '600', color: colors.t3 },

  // Jobs
  jobCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.s1, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.b1, marginBottom: 6 },
  jobTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  jobCompany: { fontSize: 11, color: colors.t2, marginTop: 2 },

  // Tools
  toolRow: { gap: 16, paddingVertical: 4, marginBottom: 16 },
  toolItem: { alignItems: 'center', width: 56 },
  toolIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  toolLabel: { fontSize: 10, fontWeight: '600', color: colors.t2, textAlign: 'center' },
});
