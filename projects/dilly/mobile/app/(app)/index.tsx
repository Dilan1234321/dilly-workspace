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
import { colors, spacing, API_BASE } from '../../lib/tokens';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

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
  return (
    <AnimatedPressable
      style={[s.journeyCard, step.completed && s.journeyCardDone]}
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
        <Text style={[s.journeyTitle, step.completed && { color: colors.t3 }]}>{step.title}</Text>
        <Text style={s.journeySub}>{step.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={step.completed ? colors.t3 : step.color} />
    </AnimatedPressable>
  );
}

// -- Activity Card ------------------------------------------------------------

function ActivityCard({ icon, color, title, subtitle, onPress }: {
  icon: string; color: string; title: string; subtitle: string; onPress: () => void;
}) {
  return (
    <AnimatedPressable style={s.activityCard} onPress={onPress} scaleDown={0.97}>
      <View style={[s.activityIcon, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.activityTitle} numberOfLines={1}>{title}</Text>
        <Text style={s.activitySub} numberOfLines={1}>{subtitle}</Text>
      </View>
    </AnimatedPressable>
  );
}

// -- Pipeline Tile -------------------------------------------------------------

function PipelineTile({ icon, count, label, color, onPress }: {
  icon: string; count: number; label: string; color: string; onPress: () => void;
}) {
  return (
    <AnimatedPressable style={s.pipeTile} onPress={onPress} scaleDown={0.95}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[s.pipeCount, { color }]}>{count}</Text>
      <Text style={s.pipeLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

// -- Main Screen --------------------------------------------------------------

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dillyTake, setDillyTake] = useState<string | null>(null);
  const [topJobs, setTopJobs] = useState<any[]>([]);
  const [factCount, setFactCount] = useState(0);
  const [appCount, setAppCount] = useState(0);
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

        // Facts count
        if (memRes?.ok) {
          const mem = await memRes.json();
          setFactCount((mem?.items || []).length);
        }

        // Applications count
        dilly.get('/applications').then(data => {
          const apps = Array.isArray(data) ? data : (data?.applications || []);
          setAppCount(apps.length);
        }).catch(() => {});

        // Top jobs
        dilly.get('/v2/internships/feed?readiness=ready&limit=3').then(data => {
          setTopJobs((data?.listings || []).slice(0, 3));
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
  const firstName = p.name?.trim().split(/\s+/)[0] || p.first_name || '';

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
      icon: 'bookmark', color: colors.amber, completed: appCount > 0,
      onPress: () => router.push('/(app)/jobs'),
    },
  ];
  const completedCount = journeySteps.filter(s => s.completed).length;
  const allDone = completedCount === journeySteps.length;
  const showJourney = !allDone;

  // Activity feed items
  const activities: { icon: string; color: string; title: string; subtitle: string; onPress: () => void }[] = [];
  if (factCount > 0) activities.push({ icon: 'person', color: colors.indigo, title: `${factCount} facts in your profile`, subtitle: 'Dilly is learning about you', onPress: () => router.push('/(app)/my-dilly-profile') });
  if (appCount > 0) activities.push({ icon: 'briefcase', color: colors.blue, title: `${appCount} job${appCount === 1 ? '' : 's'} in your pipeline`, subtitle: 'Track your applications', onPress: () => router.push('/(app)/internship-tracker') });
  if (topJobs.length > 0) activities.push({ icon: 'sparkles', color: colors.green, title: `${topJobs.length}+ jobs match your profile`, subtitle: 'New opportunities waiting for you', onPress: () => router.push('/(app)/jobs') });

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
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={INDIGO} />}
      >

        {/* Header */}
        <FadeInView delay={0}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerName}>Welcome, {firstName || 'there'}.</Text>
              <Text style={s.headerSub}>Your career center.</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <AnimatedPressable
                onPress={() => router.push({ pathname: '/(app)/my-dilly-profile', params: { openQr: '1' } })}
                scaleDown={0.9}
                hitSlop={10}
              >
                <Ionicons name="qr-code" size={20} color={colors.indigo} />
              </AnimatedPressable>
              <AnimatedPressable onPress={() => router.push('/(app)/settings')} scaleDown={0.9} hitSlop={10}>
                <Ionicons name="settings-outline" size={20} color={colors.t3} />
              </AnimatedPressable>
            </View>
          </View>
        </FadeInView>

        {/* DillyFace + message */}
        <FadeInView delay={60}>
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <DillyFace size={showJourney ? 100 : 80} />
          </View>
          <AnimatedPressable
            onPress={() => openDillyOverlay({ name: firstName, isPaid: false, initialMessage: dillyTake || undefined })}
            scaleDown={0.99}
          >
            <Text style={s.dillyMessage}>
              {showJourney
                ? `Hey ${firstName || 'there'}, let me get to know you so I can help you land your next opportunity.`
                : dillyTake
                  ? `Hey ${firstName || 'there'}, ${dillyTake.charAt(0).toLowerCase()}${dillyTake.slice(1)}`
                  : `Hey ${firstName || 'there'}, tell me what you're working on.`}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={s.talkBtn}
            onPress={() => openDillyOverlay({ name: firstName, isPaid: false })}
            scaleDown={0.97}
          >
            <Ionicons name="chatbubble" size={16} color="#fff" />
            <Text style={s.talkBtnText}>Talk to Dilly</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* Getting Started Journey */}
        {showJourney && (
          <FadeInView delay={120}>
            <View style={s.journeyHeader}>
              <Text style={s.sectionLabel}>GETTING STARTED</Text>
              <Text style={s.journeyProgress}>{completedCount} of {journeySteps.length}</Text>
            </View>
            {/* Progress bar */}
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${(completedCount / journeySteps.length) * 100}%` }]} />
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
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>QUICK TOOLS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRow}>
            {[
              { icon: 'sparkles' as const, color: colors.indigo, label: 'Generate', onPress: () => router.push('/(app)/resume-generate') },
              { icon: 'clipboard' as const, color: colors.gold, label: 'Tracker', onPress: () => router.push('/(app)/internship-tracker') },
              { icon: 'chatbubbles' as const, color: colors.green, label: 'What We Think', onPress: () => router.push('/(app)/feedback') },
              { icon: 'mic' as const, color: '#AF52DE', label: 'Interview', onPress: () => router.push('/(app)/interview-practice') },
              { icon: 'calendar' as const, color: colors.blue, label: 'Calendar', onPress: () => router.push('/(app)/calendar') },
              { icon: 'shield-checkmark' as const, color: '#00C853', label: 'AI Arena', onPress: () => router.push('/(app)/ai-arena') },
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

        {/* Pipeline tiles */}
        {appCount > 0 && (
          <FadeInView delay={showJourney ? 400 : 180}>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>YOUR PIPELINE</Text>
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
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>WHAT'S HAPPENING</Text>
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
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>RECENT JOBS</Text>
            {topJobs.map((job: any) => (
              <AnimatedPressable key={job.id} style={s.jobCard} onPress={() => router.push('/(app)/jobs')} scaleDown={0.98}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={s.jobTitle} numberOfLines={1}>{job.title}</Text>
                  <Text style={s.jobCompany} numberOfLines={1}>{job.company}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.t3} />
              </AnimatedPressable>
            ))}
          </FadeInView>
        )}

      </ScrollView>
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  headerName: { fontSize: 18, fontWeight: '800', color: colors.t1 },
  headerSub: { fontSize: 12, color: colors.t3, marginTop: 2 },

  dillyMessage: { fontSize: 16, color: colors.t1, lineHeight: 24, textAlign: 'center' },
  talkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.indigo, paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  talkBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

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
