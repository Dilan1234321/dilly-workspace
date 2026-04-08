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

// \u2500\u2500 Helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function scoreColor(score: number): string {
  if (score >= 80) return colors.green;
  if (score >= 55) return colors.amber;
  return colors.coral;
}

function calcPercentile(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 15;
  if (score >= 70) return 30;
  if (score >= 60) return 50;
  return 65;
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
        // If API returns 401, token is invalid — redirect to login
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

        // Prefer per-cohort scores from rubric_analysis (primary cohort).
        // No more "overall" scores anywhere in the app — every number shown
        // is the user's score within their primary cohort.
        const ra = auditObj?.rubric_analysis;
        const snapshot = profileRes?.first_audit_snapshot?.scores;
        const smart = ra?.primary_smart ?? auditObj?.scores?.smart ?? snapshot?.smart ?? null;
        const grit  = ra?.primary_grit  ?? auditObj?.scores?.grit  ?? snapshot?.grit  ?? null;
        const build = ra?.primary_build ?? auditObj?.scores?.build ?? snapshot?.build ?? null;

        const calculated = ra?.primary_composite
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
          const localScore = auditObj?.final_score ?? calculated ?? 0;
          const localTrack = auditObj?.detected_track || (profileRes as any)?.track || 'General';
          const BARS: Record<string, number> = { Tech: 75, Finance: 72, Health: 68, General: 65 };
          const localBar = BARS[localTrack] ?? 65;
          const localPercentile = calcPercentile(localScore);
          const previousScore: number | null = null;
          const previousPercentile: number | null = null;

          if (localScore >= localBar && previousScore !== null && previousScore < localBar) {
            celebrate('cleared-bar');
          } else if (localPercentile <= 25 && previousPercentile !== null && previousPercentile > 25) {
            celebrate('top-25');
          } else if (previousScore !== null && localScore - previousScore >= 10) {
            celebrate('score-jump');
          } else {
            celebrate('first-audit');
          }
        }
        dilly.get('/audit/history').then(data => {
          const audits = (data?.audits || []).map((a: any) => ({
            score: a.final_score || 0,
            date: a.ts ? new Date(a.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
            ts: a.ts || 0,
          })).filter((a: any) => a.score > 0).reverse();
          setAuditHistory(audits);
        }).catch(() => {});

        dilly.get('/v2/internships/feed?readiness=ready&limit=3').then(data => {
          setTopJobs((data?.listings || []).slice(0, 3));
        }).catch(() => {});
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
  const firstName = p.name?.trim().split(/\s+/)[0] || p.first_name || '';
  const cohort    = p.track || p.cohort || 'General';
  const school    = p.school_name || p.school_id || '';

  const hasAudit    = audit.has_audit === true && audit.final_score !== undefined;
  const finalScore  = audit.final_score ?? 0;
  const smartScore  = audit.scores?.smart  ?? 0;
  const gritScore   = audit.scores?.grit   ?? 0;
  const buildScore  = audit.scores?.build  ?? 0;
  const track       = audit.detected_track || cohort || 'General';
  const percentile  = calcPercentile(finalScore);
  const sColor      = scoreColor(finalScore);

  const COHORT_BARS: Record<string, { bar: number; company: string }> = {
    Tech:    { bar: 75, company: 'Google' },
    Finance: { bar: 72, company: 'Goldman' },
    Health:  { bar: 68, company: 'Mayo Clinic' },
    General: { bar: 65, company: 'your target company' },
  };
  const cohortCfg = COHORT_BARS[cohort] || COHORT_BARS.General;
  const gap = cohortCfg.bar - finalScore;
  const scores = audit.scores || {};
  const weakestEntry = Object.entries(scores).sort((a, b) => (a[1] as number) - (b[1] as number))[0];
  const weakestDim = weakestEntry ? weakestEntry[0] : 'Smart';
  const weakestLabel = weakestDim.charAt(0).toUpperCase() + weakestDim.slice(1);

  type NextAction = { type: 'upload' | 'close_gap' | 'apply'; body: string; cta: string; onPress: () => void };
  const nextAction: NextAction = !hasAudit
    ? {
        type: 'upload',
        body: 'Upload your resume. Dilly will tell you exactly where you stand.',
        cta: 'Upload my resume →',
        onPress: () => router.push('/onboarding/upload'),
      }
    : gap > 0
    ? {
        type: 'close_gap',
        body: `Your ${weakestLabel} score is holding you back from ${cohortCfg.company}'s bar. Fix it and you close ${Math.round(gap)} points tonight.`,
        cta: `Fix my ${weakestLabel} score →`,
        onPress: () => openDillyOverlay({
          name: firstName, cohort, score: finalScore,
          smart: smartScore, grit: gritScore, build: buildScore,
          gap, cohortBar: cohortCfg.bar,
          referenceCompany: cohortCfg.company,
          isPaid: false,
        }),
      }
    : {
        type: 'apply',
        body: `You clear ${cohortCfg.company}'s bar. Apply this week — don't wait.`,
        cta: 'Show me where to apply →',
        onPress: () => router.push('/(app)/jobs'),
      };

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
              <Text style={s.headerName}>{firstName || 'Welcome'}</Text>
              {cohort ? (
                <Text style={s.headerCohort}>{cohort} cohort{school ? ` · ${school}` : ''}</Text>
              ) : null}
            </View>
            <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color={colors.t3} />
            </AnimatedPressable>
          </View>
        </FadeInView>


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
                { label: "I'm above the bar — now what?", msg: `I'm above ${cohortCfg.company}'s hiring bar. What should I do this week to maximize my chances?` },
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

        {/* ── B. Compact Score Card ───────────────────────────── */}
        <FadeInView delay={160}>
          <AnimatedPressable
            onPress={() => hasAudit && router.push('/(app)/score-detail')}
            disabled={!hasAudit}
            style={s.compactScoreCard}
            scaleDown={0.985}
          >
            <View style={s.compactScoreLeft}>
              <Text style={[s.compactScoreNum, { color: hasAudit ? sColor : colors.t3 }]}>
                {hasAudit ? displayScore : '—'}
              </Text>
              {hasAudit && (
                <View style={[s.compactPctBadge, { backgroundColor: sColor + '15' }]}>
                  <Text style={[s.compactPctText, { color: sColor }]}>Top {percentile}%</Text>
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
                    {hasAudit ? Math.round(d.score) : '—'}
                  </Text>
                  <Text style={s.compactDimLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.t3} />
          </AnimatedPressable>
        </FadeInView>

        {/* ── Score History Mini Chart ─────────────────────────── */}
        {auditHistory.length >= 2 && (
          <FadeInView delay={180}>
            <AnimatedPressable style={s.historyCard} onPress={() => router.push('/(app)/score-detail')} scaleDown={0.985}>
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

        {/* ── C. Insight + Next Move (merged) ─────────────────── */}
        <FadeInView delay={240}>
          <View style={s.insightCard}>
            <View style={s.insightHeader}>
              <View style={s.insightDot}>
                <DillyFace size={24} />
              </View>
              <Text style={s.insightLabel}>
                {hasAudit ? 'DILLY SAYS' : 'GET STARTED'}
              </Text>
            </View>
            <Text style={s.insightText}>
              {audit.dilly_take || nextAction.body}
            </Text>
            <AnimatedPressable style={s.insightBtn} onPress={nextAction.onPress} scaleDown={0.97}>
              <Text style={s.insightBtnText}>{nextAction.cta}</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* ── Top Matches ──────────────────────────────────────── */}
        {topJobs.length > 0 && (
          <FadeInView delay={280}>
            <Text style={s.jobsLabel}>TOP MATCHES</Text>
            {topJobs.map((job: any) => (
              <AnimatedPressable
                key={job.id}
                style={s.jobCard}
                onPress={() => router.push('/(app)/jobs')}
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
              { icon: 'analytics' as const, color: colors.green, label: 'Scores', onPress: () => router.push('/(app)/score-detail') },
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
        {/* Unlock card hidden — paid experience */}

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
});