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
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, getToken } from '../../lib/auth';
import { DillyFace } from '../../components/DillyFace';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import useCelebration from '../../hooks/useCelebration';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile]     = useState<Profile>({});
  const [audit,   setAudit]       = useState<AuditResult>({});
  const [loading, setLoading]     = useState(true);
  const [displayScore, setDisplayScore] = useState(0);
  const [photoUri, setPhotoUri]   = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  const scoreAnim = useRef(new Animated.Value(0)).current;
  const barAnim   = useRef(new Animated.Value(0)).current;

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
          apiFetch('/profile'),
          apiFetch('/audit/latest'),
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

        const auditObj = auditRaw?.audit ?? auditRaw ?? {};
        const hasAuditFlag = auditRaw?.has_audit !== false && auditObj?.final_score != null;

        const snapshot = profileRes?.first_audit_snapshot?.scores;
        const smart = auditObj?.scores?.smart ?? snapshot?.smart ?? null;
        const grit  = auditObj?.scores?.grit  ?? snapshot?.grit  ?? null;
        const build = auditObj?.scores?.build ?? snapshot?.build ?? null;

        const techWeights = { smart: 0.20, grit: 0.30, build: 0.50 };
        const calculated = (smart != null && grit != null && build != null)
          ? Math.round(smart * techWeights.smart + grit * techWeights.grit + build * techWeights.build)
          : null;

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
  const school    = p.school_id === 'utampa' ? 'UTampa' : 'UTampa';

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

  return (
    <View style={[s.container]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
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
                <Text style={s.headerCohort}>{cohort} cohort · {school}</Text>
              ) : null}
            </View>
            <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color={colors.t3} />
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* \u2500\u2500 Score card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <FadeInView delay={80}>
          <AnimatedPressable
            onPress={() => hasAudit && router.push('/(app)/score-detail')}
            disabled={!hasAudit}
            style={s.scoreCard}
            scaleDown={0.985}
          >
            <View style={s.scoreCardTop}>
              <Text style={s.scoreCardLabel}>DILLY SCORE</Text>
              {hasAudit && <Text style={s.scoreCardUpdated}>Updated today</Text>}
            </View>

            <View style={s.scoreRow}>
              <Text style={[s.scoreBig, { color: hasAudit ? sColor : colors.t3 }]}>
                {hasAudit ? displayScore : '—'}
              </Text>
              {hasAudit && <Text style={s.scoreOf}>/100</Text>}
            </View>

            {hasAudit ? (
              <Text style={[s.percentileLine, { color: sColor }]}>
                Top {percentile}% {track} · UTampa
              </Text>
            ) : (
              <Text style={s.noAuditHint}>Run an audit to see your score</Text>
            )}

            <View style={s.barTrack}>
              <Animated.View style={[s.barFill, { width: barWidth, backgroundColor: hasAudit ? sColor : colors.b2 }]} />
            </View>

            <View style={s.dimRow}>
              {[
                { label: 'SMART', score: smartScore, color: colors.blue  },
                { label: 'GRIT',  score: gritScore,  color: colors.gold  },
                { label: 'BUILD', score: buildScore,  color: colors.green },
              ].map(({ label, score, color }) => (
                <View key={label} style={s.dimTile}>
                  <Text style={[s.dimScore, { color: hasAudit ? color : colors.t3 }]}>
                    {hasAudit ? Math.round(score) : '—'}
                  </Text>
                  <Text style={s.dimLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <Text style={[s.viewBreakdown, !hasAudit && { opacity: 0.35 }]}>View full breakdown →</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* \u2500\u2500 Dilly noticed card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <FadeInView delay={160}>
          <View style={s.dillyCard}>
            <View style={s.dillyAvatar}>
              <DillyFace size={48} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.dillyLabel}>DILLY NOTICED</Text>
              <Text style={s.dillyText}>
                {audit.dilly_take
                  ? audit.dilly_take
                  : 'Upload your resume and I\'ll tell you exactly where you stand.'}
              </Text>
            </View>
          </View>
        </FadeInView>

        {/* \u2500\u2500 Next Action card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <FadeInView delay={240}>
          <View style={s.nextCard}>
            <View style={s.nextHeader}>
              <Ionicons name="flash" size={11} color={colors.gold} />
              <Text style={s.nextLabel}>YOUR NEXT MOVE</Text>
            </View>
            <Text style={s.nextBody}>{nextAction.body}</Text>
            <AnimatedPressable style={s.nextBtn} onPress={nextAction.onPress} scaleDown={0.97}>
              <Text style={s.nextBtnText}>{nextAction.cta}</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* \u2500\u2500 Quick action grid \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <FadeInView delay={320}>
          <View style={s.grid}>
            {[
              {
                icon: 'arrow-up-circle' as const,
                iconColor: colors.green,
                tileBg: colors.gdim,
                tileBdr: colors.gbdr,
                title: 'New Audit',
                sub: 'Upload a new resume',
                onPress: () => router.push('/(app)/new-audit'),
              },
              {
                icon: 'clipboard' as const,
                iconColor: colors.gold,
                tileBg: colors.golddim,
                tileBdr: colors.goldbdr,
                title: 'Tracker',
                sub: 'Track your applications',
                onPress: () => router.push('/(app)/internship-tracker'),
              },
              {
                icon: 'create' as const,
                iconColor: colors.indigo,
                tileBg: colors.idim,
                tileBdr: colors.ibdr,
                title: 'Resume Editor',
                sub: 'Edit & improve your resume',
                onPress: () => router.push('/(app)/resume-editor'),
              },
              {
                icon: 'calendar' as const,
                iconColor: colors.blue,
                tileBg: colors.bdim,
                tileBdr: colors.bbdr,
                title: 'Calendar',
                sub: 'Deadlines & events',
                onPress: () => router.push('/(app)/calendar'),
              },
            ].map(({ icon, iconColor, tileBg, tileBdr, title, sub, onPress }) => (
              <AnimatedPressable key={title} style={s.gridTile} onPress={onPress} scaleDown={0.96}>
                <View style={[s.gridIcon, { backgroundColor: tileBg, borderColor: tileBdr }]}>
                  <Ionicons name={icon} size={18} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.gridTitle}>{title}</Text>
                  <Text style={s.gridSub}>{sub}</Text>
                </View>
              </AnimatedPressable>
            ))}
          </View>
        </FadeInView>

        {/* \u2500\u2500 Unlock Dilly card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <FadeInView delay={400}>
          <View style={s.unlockCard}>
            <Text style={s.unlockTitle}>Unlock Dilly · $9.99/mo</Text>
            <Text style={s.unlockSub}>
              Unlimited audits, AI coaching, leaderboard rank, and job matching.
            </Text>
            <AnimatedPressable style={s.unlockBtn} onPress={() => Alert.alert('Coming soon', 'Payments are not yet available.')} scaleDown={0.97}>
              <Text style={s.unlockBtnText}>Unlock Dilly →</Text>
            </AnimatedPressable>
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
    backgroundColor: '#1a1200',
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
  nextBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, color: '#1a1400' },

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
  unlockBtnText: { fontSize: 13, fontWeight: '700', color: '#1a1400' },
});