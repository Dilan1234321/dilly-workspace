import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Image,
  AppState,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToken } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { DillyFace } from '../../components/DillyFace';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import useCelebration from '../../hooks/useCelebration';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { openAddToCalendar, openSubscribeToDillyCalendar } from '../../lib/calendar';
import { remindMeLater } from '../../lib/reminders';
import { parseCohortScores, type CohortScore } from '../../lib/cohorts';
import CohortSwitcher from '../../components/CohortSwitcher';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { Svg, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

// \u2500\u2500 Types \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface Profile {
  first_name?: string;
  cohort?: string;
  school?: string;
}

interface AuditResult {
  has_audit?: boolean;
  final_score?: number;
  scores?: { smart?: number; grit?: number; build?: number };
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  dilly_take?: string;
  detected_track?: string;
}

// Build-75: /home/brief response shape
interface HomeBrief {
  has_audit: boolean;
  streak: { current: number; longest: number; already_checked_in: boolean; daily_action: string; today: string };
  score: { current: number | null; previous: number | null; delta: number | null; as_of: number | null; history: { score: number; ts: number }[] };
  pipeline: { drafts: number; applied: number; interviewing: number; offers: number; silent_2_weeks: number; total: number };
  deadlines: { label: string; date: string; ts: number; days_until: number; type: string; company: string; role: string }[];
  brief: { id: string; kind: string; headline: string; body: string; action_label: string; action_route: string }[];
  do_now: { kind: string; title: string; subtitle: string; action_label: string; action_route: string; action_payload: any };
  cohort_bar: { cohort_id: string | null; label: string; bar: number; reference_company: string };
  weekly_recap?: { headline: string; audits_this_week: number; apps_this_week: number; score_delta: number | null; streak_days: number; summary: string };
}

// \u2500\u2500 Helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function scoreColor(score: number): string {
  if (score >= 80) return colors.green;
  if (score >= 55) return colors.amber;
  return colors.coral;
}

// Build-75: calcPercentile removed. It was a hardcoded 5-bucket lookup
// that lied about peer standing without touching any real data. We show
// the user's own score and delta instead. Peer stats will come back when
// we have density  -  not before.

function formatRelativeDate(ts: number | null | undefined): string {
  if (!ts) return '';
  const now = Date.now() / 1000;
  const diffDays = Math.round((now - ts) / 86400);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// \u2500\u2500 Profile Photo \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function ProfilePhoto({ name, photoUri, size = 32 }: { name: string; photoUri: string | null; size?: number }) {
  const initial = name ? name[0].toUpperCase() : '?';
  const r = size / 2;

  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={{
          width: size,
          height: size,
          borderRadius: r,
          borderWidth: 1.5,
          borderColor: 'rgba(201,168,76,0.3)',
        }}
      />
    );
  }

  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: r }]}>
      <Text style={[s.avatarInitial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// \u2500\u2500 Screen \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile]     = useState<Profile>({});
  const [audit,   setAudit]       = useState<AuditResult>({});
  const [loading, setLoading]     = useState(true);
  const [displayScore, setDisplayScore] = useState(0);
  // Build-75: home brief (streak, pipeline, deadlines, brief cards, do-now)
  const [brief, setBrief] = useState<HomeBrief | null>(null);
  const [briefError, setBriefError] = useState(false);
  // Build-87: per-cohort Claude scores (replaces overall scores)
  const [cohortScores, setCohortScores] = useState<CohortScore[]>([]);
  const [activeCohortIdx, setActiveCohortIdx] = useState(0);
  // Build-84: calendar sync state (one-time banner)
  const [calendarSynced, setCalendarSynced] = useState(true); // default true to hide banner until we check
  const [photoUri, setPhotoUri]   = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [auditHistory, setAuditHistory] = useState<{score: number; date: string; ts: number}[]>([]);
  const [topJobs, setTopJobs] = useState<any[]>([]);

  const scoreAnim = useRef(new Animated.Value(0)).current;
  const barAnim   = useRef(new Animated.Value(0)).current;

  const [refreshing, setRefreshing] = useState(false);
  const { celebrate, CelebrationPortal } = useCelebration();

  // Auth guard: if token is gone (sign-out), redirect away from app screens
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const token = await getToken();
        if (!token && active) {
          router.replace('/');
        }
      })();
      return () => { active = false; };
    }, [])
  );

  // \u2500\u2500 Load data \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  useEffect(() => {
    (async () => {
      // Don't even try fetching if there's no token
      const token = await getToken();
      if (!token) {
        router.replace('/');
        return;
      }
      try {
        const [profileRaw, auditRawRes] = await Promise.all([
          dilly.fetch('/profile'),
          dilly.fetch('/audit/latest'),
        ]);
        // If API returns 401, token is invalid  -  redirect to login
        if (profileRaw.status === 401 || profileRaw.status === 403) {
          await (await import('../../lib/auth')).clearAuth();
          router.replace('/');
          return;
        }
        const [profileRes, auditRaw] = await Promise.all([
          profileRaw.json(),
          auditRawRes.json(),
        ]);

        // If onboarding not complete, redirect to appropriate step
        if (!profileRes?.onboarding_complete) {
          if (!profileRes?.name) {
            router.replace('/onboarding/profile');
          } else if (!profileRes?.has_run_first_audit) {
            router.replace('/onboarding/upload');
          }
          return;
        }

        // Use profile's latest_audit as primary source, fall back to /audit/latest
        const latestAudit = profileRes?.latest_audit;
        const auditObj = latestAudit ?? auditRaw?.audit ?? auditRaw ?? {};
        const hasAuditFlag = auditObj?.final_score != null;

        // Build-87: per-cohort Claude scores are the source of truth.
        // Parse cohort_scores from the profile (scored by Claude per cohort).
        // Fall back to rubric/audit scores for legacy users without cohort_scores.
        const parsedCohorts = parseCohortScores(profileRes?.cohort_scores);
        setCohortScores(parsedCohorts);
        const primaryCohort = parsedCohorts[0] ?? null;

        const ra = auditObj?.rubric_analysis;
        const snapshot = profileRes?.first_audit_snapshot?.scores;
        const smart = primaryCohort?.smart ?? ra?.primary_smart ?? auditObj?.scores?.smart ?? snapshot?.smart ?? null;
        const grit  = primaryCohort?.grit  ?? ra?.primary_grit  ?? auditObj?.scores?.grit  ?? snapshot?.grit  ?? null;
        const build = primaryCohort?.build ?? ra?.primary_build ?? auditObj?.scores?.build ?? snapshot?.build ?? null;

        const calculated = primaryCohort?.dilly_score
          ?? ra?.primary_composite
          ?? auditObj?.final_score
          ?? (smart != null && grit != null && build != null
            ? Math.round((smart + grit + build) / 3)
            : null);

        setProfile(profileRes ?? {});

        const slug = profileRes?.profile_slug;
        if (slug) {
          try {
            const photoCheck = await fetch(`${API_BASE}/profile/public/${slug}/photo`);
            if (photoCheck.ok) {
              setPhotoUri(`${API_BASE}/profile/public/${slug}/photo?_t=${Date.now()}`);
            } else {
              setPhotoUri(null);
            }
          } catch {
            setPhotoUri(null);
          }
        }

        setAudit({
          ...auditObj,
          has_audit: hasAuditFlag,
          final_score: auditObj?.final_score ?? calculated ?? undefined,
          scores: { smart: smart ?? 0, grit: grit ?? 0, build: build ?? 0 },
        });

        if (hasAuditFlag) {
          // Build-75: the celebration fires only on the very first audit now.
          // Previous logic referenced localPercentile (a lie) and previousScore
          // (always null), so every audit celebrated 'first-audit' anyway.
          // Cleared-bar / score-jump celebrations will be surfaced through the
          // score delta banner instead.
          celebrate('first-audit');
        }
        dilly.get('/audit/history').then(data => {
          const audits = (data?.audits || []).map((a: any) => ({
            score: a.final_score || 0,
            date: a.ts ? new Date(a.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
            ts: a.ts || 0,
          })).filter((a: any) => a.score > 0).reverse();
          setAuditHistory(audits);
        }).catch(() => {});

        // Always show top 3 best-matching jobs, regardless of readiness  -  sort=rank
        // gives the highest-overlap jobs first so the section is never empty.
        dilly.get('/v2/internships/feed?sort=rank&limit=3').then(data => {
          setTopJobs((data?.listings || []).slice(0, 3));
        }).catch(() => {});

        // Build-75: fetch the composed home brief (streak, pipeline, deadlines,
        // daily cards, do-now). Single round-trip, no LLM, no peer data.
        dilly.get('/home/brief').then((data: HomeBrief) => {
          setBrief(data);
          setBriefError(false);
        }).catch(() => {
          setBriefError(true);
        });

        // Build-84: check if calendar was already synced
        try {
          const AS = (await import('@react-native-async-storage/async-storage')).default;
          const synced = await AS.getItem('dilly_calendar_synced');
          setCalendarSynced(synced === '1');
        } catch { setCalendarSynced(false); }

        // Build-75: record today's streak check-in. The endpoint is idempotent
        //  -  if already checked in today, it returns the current state without
        // bumping. Fire-and-forget; we don't block UI on this.
        dilly.fetch('/streak/checkin', { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            // Merge the fresh streak into the brief if we already have it
            setBrief(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                streak: {
                  current: data?.streak ?? prev.streak.current,
                  longest: data?.longest_streak ?? prev.streak.longest,
                  already_checked_in: !!data?.already_checked_in,
                  daily_action: data?.daily_action ?? prev.streak.daily_action,
                  today: data?.today ?? prev.streak.today,
                },
              };
            });
          })
          .catch(() => {});
      } catch {
        // If fetch failed entirely (network error, no auth), redirect to login
        const stillHasToken = await getToken();
        if (!stillHasToken) {
          router.replace('/');
          return;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [profileRefreshKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setProfileRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  // \u2500\u2500 Animate score \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  useEffect(() => {
    const finalScore = audit.final_score;
    if (!finalScore) return;

    scoreAnim.addListener(({ value }) => setDisplayScore(Math.round(value)));
    Animated.timing(scoreAnim, {
      toValue: finalScore,
      duration: 1000,
      useNativeDriver: false,
    }).start();

    Animated.timing(barAnim, {
      toValue: finalScore,
      duration: 1000,
      useNativeDriver: false,
    }).start();

    return () => scoreAnim.removeAllListeners();
  }, [audit.final_score]);

  // \u2500\u2500 Derived \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const p = profile as any;
  const firstName = (p.name || p.first_name || '').trim().split(/\s+/)[0] || '';
  // Build-87: active cohort drives all displayed scores
  const activeCohort = cohortScores[activeCohortIdx] ?? null;
  const cohort    = activeCohort?.display_name || p.track || p.cohort || 'General';
  const school    = p.school_name || p.school_id || '';

  const hasAudit    = audit.has_audit === true && audit.final_score !== undefined;
  const finalScore  = activeCohort?.dilly_score ?? audit.final_score ?? 0;
  const smartScore  = activeCohort?.smart  ?? audit.scores?.smart  ?? 0;
  const gritScore   = activeCohort?.grit   ?? audit.scores?.grit   ?? 0;
  const buildScore  = activeCohort?.build  ?? audit.scores?.build  ?? 0;
  const track       = audit.detected_track || cohort || 'General';
  const sColor      = scoreColor(finalScore);

  // Build-75: cohort bar comes from the backend brief now (all 16+ rubric
  // cohorts, not the old hardcoded 4). Fall back to General while the brief
  // is still loading so the first render doesn't crash.
  const cohortCfg = brief?.cohort_bar
    ? { bar: brief.cohort_bar.bar, company: brief.cohort_bar.reference_company }
    : { bar: 68, company: 'your target company' };
  const gap = cohortCfg.bar - finalScore;
  const scores = audit.scores || {};
  const weakestEntry = Object.entries(scores).sort((a, b) => (a[1] as number) - (b[1] as number))[0];
  const weakestDim = weakestEntry ? weakestEntry[0] : 'Smart';
  const weakestLabel = weakestDim.charAt(0).toUpperCase() + weakestDim.slice(1);

  // Build-75: nextAction removed. The "next move" copy now comes from the
  // backend's /home/brief do_now payload, which has richer logic (urgent
  // deadlines, silent applications, drafts, etc) that the old ternary
  // couldn't express.

  const barWidth = barAnim.interpolate({
    inputRange:  [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={[s.container]}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}>
          {/* Header skeleton */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Skeleton width={36} height={36} style={{ borderRadius: 18 }} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Skeleton width={100} height={16} style={{ marginBottom: 6 }} />
              <Skeleton width={160} height={12} />
            </View>
          </View>
          {/* Score card skeleton */}
          <View style={{ backgroundColor: colors.s2, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.b1 }}>
            <Skeleton width={90} height={10} style={{ marginBottom: 14 }} />
            <Skeleton width={70} height={48} style={{ marginBottom: 10 }} />
            <Skeleton width="100%" height={8} style={{ borderRadius: 4, marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Skeleton width={60} height={36} style={{ borderRadius: 8 }} />
              <Skeleton width={60} height={36} style={{ borderRadius: 8 }} />
              <Skeleton width={60} height={36} style={{ borderRadius: 8 }} />
            </View>
          </View>
          {/* Grid tiles skeleton */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <Skeleton width="48%" height={80} style={{ borderRadius: 12 }} />
            <Skeleton width="48%" height={80} style={{ borderRadius: 12 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Skeleton width="48%" height={80} style={{ borderRadius: 12 }} />
            <Skeleton width="48%" height={80} style={{ borderRadius: 12 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.container]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2B3A8E" />}
      >

        {/* \u2500\u2500 Header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <FadeInView delay={0}>
          <View style={s.header}>
            <AnimatedPressable onPress={() => router.push('/(app)/profile')} scaleDown={0.92}>
              <ProfilePhoto name={firstName} photoUri={photoUri} size={36} />
            </AnimatedPressable>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.headerName}>
                {(() => {
                  const hr = new Date().getHours();
                  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
                  return firstName ? `${greeting}, ${firstName}` : greeting;
                })()}
              </Text>
              {activeCohort ? (
                <Text style={s.headerCohort}>{activeCohort.display_name}</Text>
              ) : brief?.cohort_bar?.label ? (
                <Text style={s.headerCohort}>{brief.cohort_bar.label}</Text>
              ) : cohort ? (
                <Text style={s.headerCohort}>{cohort}</Text>
              ) : null}
            </View>
            {/* Build-75: streak flame */}
            {brief && brief.streak.current > 0 && (
              <View style={s.streakPill}>
                <Ionicons name="flame" size={14} color="#FF6B35" />
                <Text style={s.streakCount}>{brief.streak.current}</Text>
              </View>
            )}
            <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color={colors.t3} />
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* Build-75: Daily action banner  -  today's one-line coaching action */}
        {brief?.streak?.daily_action && (
          <FadeInView delay={40}>
            <View style={s.dailyActionBanner}>
              <Ionicons name="today" size={12} color={colors.gold} />
              <Text style={s.dailyActionText} numberOfLines={2}>
                <Text style={s.dailyActionLabel}>TODAY · </Text>
                {brief.streak.daily_action}
              </Text>
            </View>
          </FadeInView>
        )}


        {/* ── A. AI Coach Card (HERO) ──────────────────────────── */}
        <FadeInView delay={80}>
          <View style={s.aiCard}>
            <AnimatedPressable
              style={s.aiPrompt}
              onPress={() => openDillyOverlay({
                name: firstName, cohort, score: finalScore,
                smart: smartScore, grit: gritScore, build: buildScore,
                gap, cohortBar: cohortCfg.bar,
                referenceCompany: cohortCfg.company,
                isPaid: false,
              })}
              scaleDown={0.98}
            >
              <View style={s.aiPromptIcon}>
                <DillyFace size={36} />
              </View>
              <Text style={s.aiPromptText}>Ask Dilly anything...</Text>
              <View style={s.aiPromptArrow}>
                <Ionicons name="arrow-forward-circle" size={28} color={colors.gold} />
              </View>
            </AnimatedPressable>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {(!hasAudit ? [
                { label: 'How do I get started?', msg: 'How do I get started with Dilly? What should I do first?' },
                { label: 'What can you help me with?', msg: 'What can you help me with?' },
              ] : gap > 0 ? [
                { label: 'What should I work on?', msg: `What should I work on to improve my score? My weakest area is ${weakestLabel}.` },
                { label: `How close am I to ${cohortCfg.company}?`, msg: `How close am I to ${cohortCfg.company}'s hiring bar? What do I need to do to get there?` },
                { label: 'Help with my resume', msg: 'Help me improve my resume. What are the biggest things I should fix?' },
              ] : [
                { label: "I'm above the bar  -  now what?", msg: `I'm above ${cohortCfg.company}'s hiring bar. What should I do this week to maximize my chances?` },
                { label: 'Prep me for interviews', msg: 'Help me prepare for interviews. What should I expect and how should I practice?' },
                { label: 'Where should I apply?', msg: 'Based on my profile, where should I apply this week?' },
              ]).map(chip => (
                <AnimatedPressable
                  key={chip.label}
                  style={s.chip}
                  onPress={() => openDillyOverlay({
                    name: firstName, cohort, score: finalScore,
                    smart: smartScore, grit: gritScore, build: buildScore,
                    gap, cohortBar: cohortCfg.bar,
                    referenceCompany: cohortCfg.company,
                    isPaid: false,
                    initialMessage: chip.msg,
                  })}
                  scaleDown={0.95}
                >
                  <Text style={s.chipText}>{chip.label}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </View>
        </FadeInView>

        {/* ── Build-87: Cohort Switcher ──────────────────────── */}
        {cohortScores.length > 1 && hasAudit && (
          <FadeInView delay={140}>
            <CohortSwitcher
              cohorts={cohortScores}
              activeIndex={activeCohortIdx}
              onSwitch={setActiveCohortIdx}
              compact
            />
          </FadeInView>
        )}

        {/* ── B. Compact Score Card ───────────────────────────── */}
        <FadeInView delay={160}>
          <AnimatedPressable
            onPress={() => hasAudit && router.push('/(app)/feedback')}
            disabled={!hasAudit}
            style={s.compactScoreCard}
            scaleDown={0.985}
          >
            <View style={s.compactScoreLeft}>
              <Text style={[s.compactScoreNum, { color: hasAudit ? sColor : colors.t3 }]}>
                {hasAudit ? displayScore : '-'}
              </Text>
              {hasAudit && brief?.score?.delta != null && Math.abs(brief.score.delta) >= 1 && (
                <View style={[s.compactPctBadge, { backgroundColor: (brief.score.delta >= 0 ? colors.green : colors.coral) + '15' }]}>
                  <Text style={[s.compactPctText, { color: brief.score.delta >= 0 ? colors.green : colors.coral }]}>
                    {brief.score.delta >= 0 ? '↑' : '↓'} {Math.abs(brief.score.delta)}
                  </Text>
                </View>
              )}
              {hasAudit && (brief?.score?.delta == null || Math.abs(brief.score.delta) < 1) && brief?.cohort_bar && (
                <View style={[s.compactPctBadge, { backgroundColor: sColor + '15' }]}>
                  <Text style={[s.compactPctText, { color: sColor }]} numberOfLines={1}>
                    {brief.cohort_bar.label}
                  </Text>
                </View>
              )}
            </View>
            <View style={s.compactDims}>
              {[
                { label: 'S', score: smartScore, color: colors.blue },
                { label: 'G', score: gritScore, color: colors.gold },
                { label: 'B', score: buildScore, color: colors.green },
              ].map(d => (
                <View key={d.label} style={s.compactDim}>
                  <Text style={[s.compactDimScore, { color: hasAudit ? d.color : colors.t3 }]}>
                    {hasAudit ? Math.round(d.score) : '-'}
                  </Text>
                  <Text style={s.compactDimLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.t3} />
          </AnimatedPressable>
        </FadeInView>

        {/* ── Score History Mini Chart ─────────────────────────── */}
        {auditHistory.length < 2 && hasAudit && (
          <FadeInView delay={180}>
            <View style={s.historyEmpty}>
              <Text style={s.historyEmptyLabel}>SCORE HISTORY</Text>
              <Text style={s.historyEmptyBody}>
                Your history lights up the second you run a second audit. Every edit, every rescan shows up here.
              </Text>
            </View>
          </FadeInView>
        )}
        {auditHistory.length >= 2 && (
          <FadeInView delay={180}>
            <AnimatedPressable style={s.historyCard} onPress={() => router.push('/(app)/feedback')} scaleDown={0.985}>
              <Text style={s.historyLabel}>SCORE HISTORY</Text>
              <Svg width="100%" height={80} viewBox={`0 0 ${(auditHistory.length - 1) * 60 + 20} 80`}>
                {/* Grid lines */}
                <Line x1="0" y1="20" x2={(auditHistory.length - 1) * 60 + 20} y2="20" stroke={colors.b1} strokeWidth="1" />
                <Line x1="0" y1="50" x2={(auditHistory.length - 1) * 60 + 20} y2="50" stroke={colors.b1} strokeWidth="1" />
                {/* Line */}
                <Polyline
                  points={auditHistory.map((a, i) => `${i * 60 + 10},${70 - (a.score / 100) * 60}`).join(' ')}
                  fill="none"
                  stroke="#2B3A8E"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {/* Dots */}
                {auditHistory.map((a, i) => (
                  <Circle key={i} cx={i * 60 + 10} cy={70 - (a.score / 100) * 60} r="4" fill="#2B3A8E" />
                ))}
              </Svg>
              <View style={s.historyDates}>
                {auditHistory.map((a, i) => (
                  <Text key={i} style={s.historyDate}>{a.date}</Text>
                ))}
              </View>
            </AnimatedPressable>
          </FadeInView>
        )}

        {/* Build-75/76: every new home block is wrapped in a try-style
            guard that returns null on any bad access. Even if the backend
            returns an unexpected shape, the career center cannot crash. */}
        {(() => {
          try {
            if (!brief || typeof brief !== 'object') return null;

            const doNow = brief.do_now;
            const briefCards = Array.isArray(brief.brief) ? brief.brief : [];
            const pipeline = brief.pipeline;
            const pipelineTotal = Number(pipeline?.total) || 0;
            const deadlines = Array.isArray(brief.deadlines) ? brief.deadlines : [];

            return (
              <>
                {/* Do This Now */}
                {doNow && doNow.title && (
                  <FadeInView delay={240}>
                    <AnimatedPressable
                      style={s.doNowCard}
                      onPress={() => {
                        try { router.push((doNow.action_route || '/(app)/resume-editor') as any); } catch {}
                      }}
                      scaleDown={0.985}
                    >
                      <View style={s.doNowHeader}>
                        <View style={s.doNowDot}>
                          <DillyFace size={24} />
                        </View>
                        <Text style={s.doNowLabel}>DO THIS NOW</Text>
                      </View>
                      <Text style={s.doNowTitle}>{String(doNow.title || '')}</Text>
                      {!!doNow.subtitle && (
                        <Text style={s.doNowSubtitle}>{String(doNow.subtitle)}</Text>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                        <View style={s.doNowCta}>
                          <Text style={s.doNowCtaText}>
                            {String(doNow.action_label || 'Open')}
                          </Text>
                          <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
                        </View>
                        <AnimatedPressable
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' }}
                          onPress={async () => {
                            const ok = await remindMeLater(String(doNow.title), String(doNow.subtitle || ''), 3);
                            if (ok) Alert.alert('Reminder set', "You'll be reminded in 3 hours.");
                          }}
                          scaleDown={0.95}
                        >
                          <Ionicons name="notifications-outline" size={13} color="rgba(255,255,255,0.8)" />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>Later</Text>
                        </AnimatedPressable>
                      </View>
                    </AnimatedPressable>
                  </FadeInView>
                )}

                {/* Daily Brief */}
                {briefCards.length > 0 && (
                  <FadeInView delay={280}>
                    <Text style={s.briefLabel}>DILLY BRIEF</Text>
                    {briefCards.map((card, i) => {
                      if (!card || typeof card !== 'object') return null;
                      const key = card.id || `brief-${i}`;
                      const headline = String(card.headline || '');
                      const body = String(card.body || '');
                      if (!headline && !body) return null;
                      return (
                        <AnimatedPressable
                          key={key}
                          style={s.briefCard}
                          onPress={() => {
                            try { router.push((card.action_route || '/(app)/resume-editor') as any); } catch {}
                          }}
                          scaleDown={0.985}
                        >
                          <View style={{ flex: 1 }}>
                            {!!headline && <Text style={s.briefHeadline}>{headline}</Text>}
                            {!!body && <Text style={s.briefBody} numberOfLines={2}>{body}</Text>}
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                        </AnimatedPressable>
                      );
                    })}
                  </FadeInView>
                )}

                {/* Pipeline widget */}
                {pipeline && pipelineTotal > 0 && (
                  <FadeInView delay={320}>
                    <Text style={s.pipeLabel}>PIPELINE</Text>
                    <AnimatedPressable
                      style={s.pipeRow}
                      onPress={() => router.push('/(app)/internship-tracker')}
                      scaleDown={0.985}
                    >
                      {[
                        { label: 'Drafts',    value: Number(pipeline.drafts)       || 0, color: colors.t3 },
                        { label: 'Applied',   value: Number(pipeline.applied)      || 0, color: colors.gold },
                        { label: 'Interview', value: Number(pipeline.interviewing) || 0, color: colors.blue },
                        { label: 'Offer',     value: Number(pipeline.offers)       || 0, color: colors.green },
                      ].map((tile) => (
                        <View key={tile.label} style={s.pipeTile}>
                          <Text style={[s.pipeValue, { color: tile.value > 0 ? tile.color : colors.t3 }]}>
                            {tile.value}
                          </Text>
                          <Text style={s.pipeTileLabel}>{tile.label}</Text>
                        </View>
                      ))}
                    </AnimatedPressable>
                    {Number(pipeline.silent_2_weeks) > 0 && (
                      <View style={s.pipeSilentBanner}>
                        <Ionicons name="alert-circle" size={12} color={colors.amber} />
                        <Text style={s.pipeSilentText}>
                          {pipeline.silent_2_weeks} application{pipeline.silent_2_weeks !== 1 ? 's' : ''} went quiet. Follow up this week.
                        </Text>
                      </View>
                    )}
                  </FadeInView>
                )}

                {/* Upcoming deadlines */}
                {deadlines.length > 0 && (
                  <FadeInView delay={360}>
                    <View style={s.deadlineHeaderRow}>
                      <Text style={s.deadlineLabel}>UPCOMING</Text>
                    </View>

                    {/* One-time calendar sync banner - subscribe once, all deadlines sync forever */}
                    {!calendarSynced && (
                      <AnimatedPressable
                        style={s.calSyncBanner}
                        onPress={async () => {
                          await openSubscribeToDillyCalendar();
                          setCalendarSynced(true);
                          try {
                            const AS = (await import('@react-native-async-storage/async-storage')).default;
                            await AS.setItem('dilly_calendar_synced', '1');
                          } catch {}
                        }}
                        scaleDown={0.97}
                      >
                        <Ionicons name="calendar" size={16} color={colors.gold} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.calSyncTitle}>Sync Dilly to your calendar</Text>
                          <Text style={s.calSyncSub}>One tap. All your deadlines appear on Apple or Google Calendar automatically.</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                      </AnimatedPressable>
                    )}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.deadlineRow}
                    >
                      {deadlines.map((d, i) => {
                        if (!d || typeof d !== 'object') return null;
                        const daysUntil = Number(d.days_until);
                        const safeDays = Number.isFinite(daysUntil) ? daysUntil : 99;
                        const urgent = safeDays <= 3;
                        const date = String(d.date || '');
                        const label = String(d.label || '');
                        const company = String(d.company || '');
                        const role = String(d.role || '');
                        return (
                          <View key={`${date}-${i}`} style={[s.deadlineCard, urgent && s.deadlineCardUrgent]}>
                            <AnimatedPressable
                              style={{ flex: 1 }}
                              onPress={() => router.push({ pathname: '/(app)/calendar', params: { date } })}
                              scaleDown={0.96}
                            >
                              <Text style={[s.deadlineDays, { color: urgent ? colors.coral : colors.t2 }]}>
                                {safeDays === 0 ? 'Today' : safeDays === 1 ? 'Tomorrow' : `${safeDays}d`}
                              </Text>
                              <Text style={s.deadlineCompany} numberOfLines={1}>
                                {company || label || 'Deadline'}
                              </Text>
                              <Text style={s.deadlineRole} numberOfLines={1}>
                                {role || (company ? label : '')}
                              </Text>
                            </AnimatedPressable>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </FadeInView>
                )}
              </>
            );
          } catch (e) {
            // Any render error in the new home blocks degrades silently
            // instead of blowing up the entire career center ErrorBoundary.
            // eslint-disable-next-line no-console
            console.error('[home brief render]', e);
            return null;
          }
        })()}

        {/* ── Top Matches ──────────────────────────────────────── */}
        {topJobs.length > 0 && (
          <FadeInView delay={280}>
            <Text style={s.jobsLabel}>TOP MATCHES</Text>
            {topJobs.map((job: any) => (
              <AnimatedPressable
                key={job.id}
                style={s.jobCard}
                onPress={() => router.push(`/(app)/jobs?focus=${encodeURIComponent(job.id)}`)}
                scaleDown={0.98}
              >
                <View style={s.jobInfo}>
                  <Text style={s.jobTitle} numberOfLines={1}>{job.title}</Text>
                  <Text style={s.jobCompany} numberOfLines={1}>{job.company} · {job.location || 'Remote'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.t3} />
              </AnimatedPressable>
            ))}
          </FadeInView>
        )}

        {/* ── D. Tools Row (compact horizontal) ──────────────── */}
        <FadeInView delay={320}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRow}>
            {[
              { icon: 'arrow-up-circle' as const, color: colors.green, label: 'Audit', onPress: () => router.push('/(app)/new-audit') },
              { icon: 'clipboard' as const, color: colors.gold, label: 'Tracker', onPress: () => router.push('/(app)/internship-tracker') },
              { icon: 'calendar' as const, color: colors.blue, label: 'Calendar', onPress: () => router.push('/(app)/calendar') },
              { icon: 'analytics' as const, color: colors.green, label: 'Feedback', onPress: () => router.push('/(app)/feedback') },
              { icon: 'mic' as const, color: '#AF52DE', label: 'Interview', onPress: () => router.push('/(app)/interview-practice') },
              { icon: 'shield-checkmark' as const, color: colors.gold, label: 'ATS Scan', onPress: () => router.push('/(app)/ats') },
            ].map(tool => (
              <AnimatedPressable key={tool.label} style={s.toolItem} onPress={tool.onPress} scaleDown={0.92}>
                <View style={[s.toolIcon, { backgroundColor: tool.color + '10' }]}>
                  <Ionicons name={tool.icon} size={20} color={tool.color} />
                </View>
                <Text style={s.toolLabel}>{tool.label}</Text>
              </AnimatedPressable>
            ))}
          </ScrollView>
        </FadeInView>

        {/* \u2500\u2500 Unlock Dilly card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        {/* Unlock card hidden  -  paid experience */}

        {/* Build-78: profile completeness nudge */}
        {(() => {
          try {
            const p = profile as any;
            const fields = [
              p.name, p.email,
              (p.majors || [])[0], p.school_id,
              p.linkedin_url,
              (p.interests || []).length > 0 ? 'y' : '',
              hasAudit ? 'y' : '',
            ];
            const filled = fields.filter(Boolean).length;
            const pct = Math.round((filled / fields.length) * 100);
            if (pct >= 100) return null;
            return (
              <FadeInView delay={400}>
                <AnimatedPressable
                  style={s.completenessCard}
                  onPress={() => router.push('/(app)/profile')}
                  scaleDown={0.985}
                >
                  <View style={s.completenessBar}>
                    <View style={[s.completenessFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={s.completenessText}>
                    Your Dilly Profile is {pct}% complete.{' '}
                    <Text style={{ color: colors.gold, fontWeight: '700' }}>Finish it</Text>
                  </Text>
                </AnimatedPressable>
              </FadeInView>
            );
          } catch { return null; }
        })()}

        {/* Weekly recap (Dilly Weekly) - only shows when there's activity */}
        {brief?.weekly_recap && (
          <FadeInView delay={420}>
            <View style={s.weeklyRecapCard}>
              <View style={s.weeklyRecapHeader}>
                <Ionicons name="calendar" size={12} color={colors.gold} />
                <Text style={s.weeklyRecapLabel}>THIS WEEK</Text>
              </View>
              <Text style={s.weeklyRecapHeadline}>{brief.weekly_recap.headline}</Text>
              <View style={s.weeklyRecapStats}>
                {Number(brief.weekly_recap.audits_this_week) > 0 && (
                  <View style={s.weeklyRecapStat}>
                    <Text style={s.weeklyRecapStatNum}>{brief.weekly_recap.audits_this_week}</Text>
                    <Text style={s.weeklyRecapStatLabel}>audits</Text>
                  </View>
                )}
                {brief.weekly_recap.score_delta != null && Math.abs(brief.weekly_recap.score_delta) >= 1 && (
                  <View style={s.weeklyRecapStat}>
                    <Text style={[s.weeklyRecapStatNum, { color: brief.weekly_recap.score_delta > 0 ? colors.green : colors.coral }]}>
                      {brief.weekly_recap.score_delta > 0 ? '+' : ''}{Math.round(brief.weekly_recap.score_delta)}
                    </Text>
                    <Text style={s.weeklyRecapStatLabel}>points</Text>
                  </View>
                )}
                {Number(brief.weekly_recap.apps_this_week) > 0 && (
                  <View style={s.weeklyRecapStat}>
                    <Text style={s.weeklyRecapStatNum}>{brief.weekly_recap.apps_this_week}</Text>
                    <Text style={s.weeklyRecapStatLabel}>applied</Text>
                  </View>
                )}
                {Number(brief.weekly_recap.streak_days) >= 3 && (
                  <View style={s.weeklyRecapStat}>
                    <Text style={s.weeklyRecapStatNum}>{brief.weekly_recap.streak_days}</Text>
                    <Text style={s.weeklyRecapStatLabel}>day streak</Text>
                  </View>
                )}
              </View>
            </View>
          </FadeInView>
        )}

        {/* Build-78: "Come back tomorrow" teaser */}
        <FadeInView delay={440}>
          <View style={s.comeBackCard}>
            <Ionicons name="sparkles" size={12} color={colors.gold} />
            <Text style={s.comeBackText}>
              Tomorrow: Dilly will check new jobs matching your profile and update your prep plan.
            </Text>
          </View>
        </FadeInView>

      </ScrollView>

      <CelebrationPortal />
    </View>
  );
}

// \u2500\u2500 Styles \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll:    { paddingHorizontal: spacing.xl },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.s3,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  avatarInitial: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  headerName:   { fontSize: 14, fontWeight: '700', color: colors.t1 },
  headerCohort: { fontSize: 11, fontWeight: '600', color: colors.blue },

  // Score card
  scoreCard: {
    backgroundColor: colors.s2,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  scoreCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  scoreCardLabel:   { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', color: colors.t3 },
  scoreCardUpdated: { fontSize: 8, color: colors.t3 },
  scoreRow:         { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 2 },
  scoreBig: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 52,
    lineHeight: 58,
  },
  scoreOf:       { fontFamily: 'Cinzel_400Regular', fontSize: 14, color: colors.t3, paddingBottom: 10 },
  percentileLine:{ fontSize: 11, fontWeight: '700', marginBottom: 10 },
  noAuditHint:   { fontSize: 11, color: colors.t3, marginBottom: 10 },
  barTrack: {
    height: 3,
    backgroundColor: colors.b1,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill:  { height: '100%', borderRadius: 999 },
  dimRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dimTile:  {
    flex: 1,
    backgroundColor: colors.s3,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  dimScore: { fontFamily: 'Cinzel_400Regular', fontSize: 18, marginBottom: 2 },
  dimLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 7, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.t3 },
  viewBreakdown: { fontSize: 12, fontWeight: '600', color: '#0A84FF', textAlign: 'right', marginTop: 10 },

  // Dilly card
  dillyCard: {
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  dillyAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dillyLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.t3, marginBottom: 2 },
  dillyText:  { fontSize: 12, color: colors.t1, lineHeight: 19 },

  // Next Action
  nextCard: {
    backgroundColor: colors.s2,
    borderWidth: 1.5,
    borderColor: colors.goldbdr,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  nextLabel:  { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 0.12, textTransform: 'uppercase', color: colors.gold },
  nextBody:   { fontSize: 13, color: colors.t1, lineHeight: 21 },
  nextBtn: {
    backgroundColor: colors.gold,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  nextBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, color: '#FFFFFF' },

  // Quick actions
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  gridTile: {
    width: '48.5%',
    backgroundColor: colors.s2,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gridIcon:  {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  gridTitle: { fontSize: 13, fontWeight: '700', color: colors.t1, marginBottom: 1 },
  gridSub:   { fontSize: 10, color: colors.t2 },

  // AI Coach Card
  aiCard: { marginBottom: 16 },
  aiPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.goldbdr,
  },
  aiPromptIcon: { width: 36, height: 36 },
  aiPromptText: { flex: 1, fontSize: 15, color: colors.t3 },
  aiPromptArrow: {},
  chipRow: { gap: 8, paddingTop: 10 },
  chip: {
    backgroundColor: colors.golddim, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.goldbdr,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.gold },

  // Compact Score
  compactScoreCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.s1, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.b1, marginBottom: 12,
  },
  compactScoreLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 'auto' },
  compactScoreNum: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 32, lineHeight: 36 },
  compactPctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  compactPctText: { fontSize: 10, fontWeight: '700' },
  compactDims: { flexDirection: 'row', gap: 12, marginRight: 10 },
  compactDim: { alignItems: 'center' },
  compactDimScore: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16 },
  compactDimLabel: { fontSize: 8, fontWeight: '700', color: colors.t3, letterSpacing: 0.5 },

  // Score History
  historyCard: { backgroundColor: colors.s1, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.b1, marginBottom: 12, overflow: 'hidden' },
  historyLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: colors.t3, marginBottom: 8 },
  historyDates: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  historyDate: { fontSize: 9, color: colors.t3 },

  // Job Recommendations
  jobsLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: colors.t3, marginBottom: 8 },
  jobCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.s1, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.b1, marginBottom: 6 },
  jobInfo: { flex: 1, marginRight: 8 },
  jobTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  jobCompany: { fontSize: 11, color: colors.t2, marginTop: 2 },

  // Insight Card
  insightCard: {
    backgroundColor: colors.s1, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.b1, marginBottom: 16,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightDot: { width: 24, height: 24 },
  insightLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: colors.t3 },
  insightText: { fontSize: 13, color: colors.t2, lineHeight: 19, marginBottom: 12 },
  insightBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  insightBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 11, letterSpacing: 0.8, color: '#FFFFFF' },

  // Tools Row
  toolRow: { gap: 16, paddingVertical: 4, marginBottom: 16 },
  toolItem: { alignItems: 'center', width: 56 },
  toolIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  toolLabel: { fontSize: 10, fontWeight: '600', color: colors.t2, textAlign: 'center' },

  // Unlock
  unlockCard: {
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  unlockTitle: { fontSize: 13, fontWeight: '700', color: colors.gold },
  unlockSub:   { fontSize: 11, color: colors.t2, lineHeight: 17, marginTop: 4 },
  unlockBtn: {
    backgroundColor: colors.gold,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  unlockBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  // ── Build 75 ──────────────────────────────────────────────────────────

  // Streak flame pill
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF5E6', borderRadius: 14,
    paddingHorizontal: 9, paddingVertical: 4,
    marginRight: 10,
    borderWidth: 1, borderColor: '#FFC266',
  },
  streakFire: { fontSize: 13 },
  streakCount: { fontSize: 12, fontWeight: '800', color: '#B45309' },

  // Daily action banner
  dailyActionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s2,
    borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12,
  },
  dailyActionText: { fontSize: 11, color: colors.t1, flex: 1, lineHeight: 16 },
  dailyActionLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1,
    color: colors.gold,
  },

  // Do This Now card
  doNowCard: {
    backgroundColor: '#2B3A8E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#2B3A8E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  doNowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  doNowDot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  doNowLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3,
    color: 'rgba(255,255,255,0.75)',
  },
  doNowTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  doNowSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17, marginBottom: 14 },
  doNowCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10,
  },
  doNowCtaText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  // Daily Brief cards
  briefLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3,
    color: colors.t3, marginBottom: 8, marginTop: 4,
  },
  briefCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.s2, borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 8,
  },
  briefHeadline: { fontSize: 13, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  briefBody:     { fontSize: 11, color: colors.t3, lineHeight: 15 },

  // Pipeline widget
  pipeLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3,
    color: colors.t3, marginBottom: 8, marginTop: 6,
  },
  pipeRow: {
    flexDirection: 'row', gap: 8,
    marginBottom: 6,
  },
  pipeTile: {
    flex: 1, backgroundColor: colors.s2,
    borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingVertical: 12, alignItems: 'center',
  },
  pipeValue: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  pipeTileLabel: {
    fontSize: 9, fontWeight: '600', color: colors.t3, marginTop: 3,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
  pipeSilentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF7E6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    marginBottom: 12,
  },
  pipeSilentText: { fontSize: 11, color: '#92400E', flex: 1 },

  // Deadlines strip
  deadlineHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, marginTop: 6,
  },
  deadlineLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3,
    color: colors.t3,
  },
  deadlineSubscribeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.s2, borderRadius: 6,
    borderWidth: 1, borderColor: colors.gold + '40',
  },
  deadlineSubscribeText: { fontSize: 10, color: colors.gold, fontWeight: '700' },
  deadlineRow: { gap: 8, paddingRight: 4, paddingBottom: 4 },
  deadlineCard: {
    width: 140,
    backgroundColor: colors.s2, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    padding: 10,
    marginBottom: 12,
  },
  deadlineCardUrgent: {
    borderColor: '#FF453A', backgroundColor: '#FFF0EF',
  },
  deadlineDays: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  deadlineCompany: { fontSize: 11, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  deadlineRole:  { fontSize: 10, color: colors.t3 },
  // Calendar sync banner (one-time)
  calSyncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.s2, borderRadius: 12,
    borderWidth: 1, borderColor: colors.gold + '30',
    padding: 14, marginBottom: 10,
  },
  calSyncTitle: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  calSyncSub: { fontSize: 10, color: colors.t3, marginTop: 2, lineHeight: 14 },

  // History empty state
  historyEmpty: {
    backgroundColor: colors.s2, borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1,
    borderStyle: 'dashed',
    padding: 14, marginBottom: 12,
  },
  historyEmptyLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2,
    color: colors.t3, marginBottom: 6,
  },
  historyEmptyBody: { fontSize: 11, color: colors.t2, lineHeight: 15 },

  // Build-78: retention patterns
  completenessCard: {
    backgroundColor: colors.s2, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 10,
  },
  completenessBar: {
    height: 4, borderRadius: 2, backgroundColor: colors.b1,
    overflow: 'hidden', marginBottom: 8,
  },
  completenessFill: {
    height: '100%', borderRadius: 2, backgroundColor: colors.gold,
  },
  completenessText: { fontSize: 11, color: colors.t2, lineHeight: 15 },

  // Weekly recap
  weeklyRecapCard: {
    backgroundColor: colors.s2, borderRadius: 12,
    borderWidth: 1, borderColor: colors.gold + '30',
    padding: 14, marginBottom: 10,
  },
  weeklyRecapHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6,
  },
  weeklyRecapLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.1,
    color: colors.gold,
  },
  weeklyRecapHeadline: { fontSize: 13, fontWeight: '700', color: colors.t1, marginBottom: 10 },
  weeklyRecapStats: { flexDirection: 'row', gap: 12 },
  weeklyRecapStat: { alignItems: 'center' },
  weeklyRecapStatNum: { fontSize: 18, fontWeight: '800', color: colors.t1 },
  weeklyRecapStatLabel: { fontSize: 9, color: colors.t3, marginTop: 2 },

  comeBackCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s2, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 10,
  },
  comeBackText: { fontSize: 11, color: colors.t3, flex: 1, lineHeight: 15 },
});