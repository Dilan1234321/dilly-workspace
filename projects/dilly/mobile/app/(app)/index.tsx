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
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import DillyFooter from '../../components/DillyFooter';

// -- Types --------------------------------------------------------------------

interface Profile {
  first_name?: string;
  cohort?: string;
  school?: string;
}

// -- Helpers ------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// -- Profile Photo ------------------------------------------------------------

function ProfilePhoto({ name, photoUri, size = 40 }: { name: string; photoUri: string | null; size?: number }) {
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
          borderColor: 'rgba(43,58,142,0.15)',
        }}
      />
    );
  }

  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: r }]}>
      <Text style={[s.avatarInitial, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

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

// -- Screen -------------------------------------------------------------------

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile]     = useState<Profile>({});
  const [loading, setLoading]     = useState(true);
  const [photoUri, setPhotoUri]   = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [topJobs, setTopJobs]     = useState<any[]>([]);
  const [dillyTake, setDillyTake] = useState<string | null>(null);
  const [appCount, setAppCount]   = useState(0);
  const [factCount, setFactCount] = useState(0);

  const [refreshing, setRefreshing] = useState(false);

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

  // -- Load data --------------------------------------------------------------

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { router.replace('/'); return; }

      try {
        const [profileRaw, auditRawRes] = await Promise.all([
          dilly.fetch('/profile'),
          dilly.fetch('/audit/latest'),
        ]);

        if (profileRaw.status === 401 || profileRaw.status === 403) {
          await (await import('../../lib/auth')).clearAuth();
          router.replace('/');
          return;
        }

        const [profileRes, auditRaw] = await Promise.all([
          profileRaw.json(),
          auditRawRes.json(),
        ]);

        // Onboarding redirect
        if (!profileRes?.onboarding_complete) {
          if (!profileRes?.name) {
            router.replace('/onboarding/profile');
          } else if (!profileRes?.has_run_first_audit) {
            router.replace('/onboarding/upload');
          }
          return;
        }

        setProfile(profileRes ?? {});

        // Dilly take
        const latestAudit = profileRes?.latest_audit;
        const auditObj = latestAudit ?? auditRaw?.audit ?? auditRaw ?? {};
        if (auditObj?.dilly_take) setDillyTake(auditObj.dilly_take);

        // Profile facts count
        const facts = profileRes?.facts ?? profileRes?.profile_facts;
        if (Array.isArray(facts)) setFactCount(facts.length);

        // Photo
        const slug = profileRes?.profile_slug;
        if (slug) {
          try {
            const photoCheck = await fetch(`${API_BASE}/profile/public/${slug}/photo`);
            if (photoCheck.ok) {
              setPhotoUri(`${API_BASE}/profile/public/${slug}/photo?_t=${Date.now()}`);
            } else {
              setPhotoUri(null);
            }
          } catch { setPhotoUri(null); }
        }

        // Top jobs (recent activity)
        dilly.get('/v2/internships/feed?readiness=ready&limit=3').then(data => {
          setTopJobs((data?.listings || []).slice(0, 3));
        }).catch(() => {});

        // Application count
        dilly.get('/applications').then(data => {
          const list = data?.applications ?? data ?? [];
          if (Array.isArray(list)) setAppCount(list.length);
        }).catch(() => {});

      } catch {
        const stillHasToken = await getToken();
        if (!stillHasToken) { router.replace('/'); return; }
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

  // -- Loading state ----------------------------------------------------------

  if (loading) {
    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <Skeleton width={40} height={40} style={{ borderRadius: 20 }} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Skeleton width={180} height={18} style={{ marginBottom: 6 }} />
            </View>
            <Skeleton width={24} height={24} style={{ borderRadius: 12 }} />
          </View>
          <Skeleton width="100%" height={100} style={{ borderRadius: radius.lg, marginBottom: 20 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <Skeleton width="31%" height={68} style={{ borderRadius: radius.md }} />
            <Skeleton width="31%" height={68} style={{ borderRadius: radius.md }} />
            <Skeleton width="31%" height={68} style={{ borderRadius: radius.md }} />
          </View>
          <Skeleton width="100%" height={60} style={{ borderRadius: radius.md, marginBottom: 8 }} />
          <Skeleton width="100%" height={60} style={{ borderRadius: radius.md }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.indigo} />}
      >

        {/* -- 1. Header --------------------------------------------------- */}
        <FadeInView delay={0}>
          <View style={s.header}>
            <AnimatedPressable onPress={() => router.push('/(app)/my-dilly-profile')} scaleDown={0.92}>
              <ProfilePhoto name={firstName} photoUri={photoUri} size={40} />
            </AnimatedPressable>
            <View style={s.headerCenter}>
              <Text style={s.greeting}>
                {getGreeting()}, {firstName || 'there'}.
              </Text>
            </View>
            <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
              <Ionicons name="settings-outline" size={22} color={colors.t3} />
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* -- 2. Your Next Move (hero) ------------------------------------ */}
        <FadeInView delay={80}>
          <AnimatedPressable
            style={s.nextMoveCard}
            onPress={() => openDillyOverlay({
              name: firstName,
              cohort: (p.track || p.cohort || 'General'),
              isPaid: false,
              initialMessage: dillyTake || undefined,
            })}
            scaleDown={0.98}
          >
            <View style={s.nextMoveHeader}>
              <DillyFace size={28} />
              <Text style={s.nextMoveLabel}>YOUR NEXT MOVE</Text>
            </View>
            <Text style={s.nextMoveText}>
              {dillyTake || 'Tell Dilly about yourself. The more I know, the better I can help.'}
            </Text>
            <View style={s.nextMoveFooter}>
              <Text style={s.nextMoveCta}>Talk to Dilly</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.indigo} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        {/* -- 3. Quick Stats Row ------------------------------------------ */}
        <FadeInView delay={160}>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statNumber}>{topJobs.length}</Text>
              <Text style={s.statLabel}>Jobs viewed</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNumber}>{appCount}</Text>
              <Text style={s.statLabel}>Applications</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNumber}>{factCount}</Text>
              <Text style={s.statLabel}>Profile facts</Text>
            </View>
          </View>
        </FadeInView>

        {/* -- 4. Recent Activity ------------------------------------------ */}
        {topJobs.length > 0 && (
          <FadeInView delay={240}>
            <Text style={s.sectionTitle}>RECENT ACTIVITY</Text>
            {topJobs.map((job: any) => (
              <AnimatedPressable
                key={job.id}
                style={s.activityCard}
                onPress={() => router.push('/(app)/jobs')}
                scaleDown={0.98}
              >
                <View style={s.activityDot} />
                <View style={s.activityInfo}>
                  <Text style={s.activityTitle} numberOfLines={1}>{job.title}</Text>
                  <Text style={s.activityCompany} numberOfLines={1}>{job.company}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.t3} />
              </AnimatedPressable>
            ))}
          </FadeInView>
        )}

        {/* -- 6. Tools Row ------------------------------------------------ */}
        <FadeInView delay={320}>
          <Text style={s.sectionTitle}>TOOLS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRow}>
            {[
              { icon: 'clipboard' as const, color: colors.indigo, label: 'Tracker', onPress: () => router.push('/(app)/internship-tracker') },
              { icon: 'chatbubbles' as const, color: colors.green, label: 'Feedback', onPress: () => router.push('/(app)/feedback') },
              { icon: 'mic' as const, color: '#AF52DE', label: 'Interview', onPress: () => router.push('/(app)/interview-practice') },
              { icon: 'calendar' as const, color: colors.blue, label: 'Calendar', onPress: () => router.push('/(app)/calendar') },
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

        {/* -- 7. Footer --------------------------------------------------- */}
        <FadeInView delay={400}>
          <DillyFooter />
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
    marginBottom: 24,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.t1,
    letterSpacing: -0.3,
  },
  avatar: {
    backgroundColor: colors.s3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(43,58,142,0.15)',
  },
  avatarInitial: {
    fontWeight: '700',
    color: colors.t1,
  },

  // Next Move card
  nextMoveCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1.5,
    borderColor: colors.ibdr,
    marginBottom: 20,
  },
  nextMoveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  nextMoveLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.indigo,
  },
  nextMoveText: {
    fontSize: 14,
    color: colors.t1,
    lineHeight: 21,
    marginBottom: 14,
  },
  nextMoveFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nextMoveCta: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.indigo,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.s1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.b1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.t3,
    textAlign: 'center',
  },

  // Section titles
  sectionTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.t3,
    marginBottom: 10,
  },

  // Activity cards
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s1,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.b1,
    marginBottom: 6,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.indigo,
    opacity: 0.4,
    marginRight: 10,
  },
  activityInfo: {
    flex: 1,
    marginRight: 8,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t1,
  },
  activityCompany: {
    fontSize: 11,
    color: colors.t2,
    marginTop: 1,
  },

  // Tools row
  toolRow: {
    gap: 16,
    paddingVertical: 4,
    marginBottom: 8,
  },
  toolItem: {
    alignItems: 'center',
    width: 60,
  },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  toolLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.t2,
    textAlign: 'center',
  },
});
