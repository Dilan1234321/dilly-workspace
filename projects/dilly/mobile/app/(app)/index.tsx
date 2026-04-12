import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Image,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToken } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { DillyFace } from '../../components/DillyFace';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

// -- Types --------------------------------------------------------------------

interface Profile {
  first_name?: string;
  cohort?: string;
  school?: string;
}

// -- Profile Photo ------------------------------------------------------------

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

// -- Screen -------------------------------------------------------------------

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
  const [loading, setLoading]     = useState(true);
  const [photoUri, setPhotoUri]   = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [topJobs, setTopJobs] = useState<any[]>([]);
  const [dillyTake, setDillyTake] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

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

  // -- Load data --------------------------------------------------------------

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
        // If API returns 401, token is invalid -- redirect to login
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

        setProfile(profileRes ?? {});

        // Grab dilly_take from audit if available
        const latestAudit = profileRes?.latest_audit;
        const auditObj = latestAudit ?? auditRaw?.audit ?? auditRaw ?? {};
        if (auditObj?.dilly_take) {
          setDillyTake(auditObj.dilly_take);
        }

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

  // -- Derived ----------------------------------------------------------------

  const p = profile as any;
  const firstName = p.name?.trim().split(/\s+/)[0] || p.first_name || '';
  const cohort    = p.track || p.cohort || 'General';
  const school    = p.school_name || p.school_id || '';

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
          {/* AI card skeleton */}
          <View style={{ backgroundColor: colors.s2, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.b1 }}>
            <Skeleton width={90} height={10} style={{ marginBottom: 14 }} />
            <Skeleton width="100%" height={40} style={{ borderRadius: 10 }} />
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

        {/* -- Header ---------------------------------------------------- */}
        <FadeInView delay={0}>
          <View style={s.header}>
            <AnimatedPressable onPress={() => router.push('/(app)/profile')} scaleDown={0.92}>
              <ProfilePhoto name={firstName} photoUri={photoUri} size={36} />
            </AnimatedPressable>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.headerName}>{firstName || 'Welcome'}</Text>
              {cohort ? (
                <Text style={s.headerCohort}>{cohort} cohort{school ? ` / ${school}` : ''}</Text>
              ) : null}
            </View>
            <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color={colors.t3} />
            </AnimatedPressable>
          </View>
        </FadeInView>


        {/* -- A. AI Coach Card (HERO) ----------------------------------- */}
        <FadeInView delay={80}>
          <View style={s.aiCard}>
            <AnimatedPressable
              style={s.aiPrompt}
              onPress={() => openDillyOverlay({
                name: firstName, cohort,
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
              {[
                { label: 'What should I work on?', msg: 'What should I work on to stand out in my job search?' },
                { label: 'Help with my resume', msg: 'Help me improve my resume. What are the biggest things I should fix?' },
                { label: 'Where should I apply?', msg: 'Based on my profile, where should I apply this week?' },
              ].map(chip => (
                <AnimatedPressable
                  key={chip.label}
                  style={s.chip}
                  onPress={() => openDillyOverlay({
                    name: firstName, cohort,
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

        {/* -- B. Insight Card ------------------------------------------- */}
        <FadeInView delay={160}>
          <View style={s.insightCard}>
            <View style={s.insightHeader}>
              <View style={s.insightDot}>
                <DillyFace size={24} />
              </View>
              <Text style={s.insightLabel}>
                {dillyTake ? 'DILLY SAYS' : 'GET STARTED'}
              </Text>
            </View>
            <Text style={s.insightText}>
              {dillyTake || 'Talk to Dilly about your goals, experience, and what you are looking for. The more Dilly knows, the better your recommendations.'}
            </Text>
            <AnimatedPressable
              style={s.insightBtn}
              onPress={() => openDillyOverlay({
                name: firstName, cohort,
                isPaid: false,
              })}
              scaleDown={0.97}
            >
              <Text style={s.insightBtnText}>{dillyTake ? 'Talk to Dilly' : 'Get started with Dilly'}</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* -- Top Matches ---------------------------------------------- */}
        {topJobs.length > 0 && (
          <FadeInView delay={240}>
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
                  <Text style={s.jobCompany} numberOfLines={1}>{job.company} / {job.location || 'Remote'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.t3} />
              </AnimatedPressable>
            ))}
          </FadeInView>
        )}

        {/* -- D. Tools Row (compact horizontal) ------------------------- */}
        <FadeInView delay={320}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRow}>
            {[
              { icon: 'person' as const, color: colors.gold, label: 'Profile', onPress: () => router.push('/(app)/my-dilly-profile') },
              { icon: 'clipboard' as const, color: colors.gold, label: 'Tracker', onPress: () => router.push('/(app)/internship-tracker') },
              { icon: 'briefcase' as const, color: colors.green, label: 'Jobs', onPress: () => router.push('/(app)/jobs') },
              { icon: 'calendar' as const, color: colors.blue, label: 'Calendar', onPress: () => router.push('/(app)/calendar') },
              { icon: 'document-text' as const, color: colors.indigo, label: 'Resume', onPress: () => router.push('/(app)/resume-editor') },
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

      </ScrollView>
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

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
});
