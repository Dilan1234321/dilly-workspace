import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Easing,
  Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../lib/auth';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import EditProfileModal from '../../components/EditProfileModal';

const GOLD  = '#C9A84C';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';

// \u2500\u2500 Helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function scoreColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 55) return AMBER;
  return CORAL;
}

function calcPercentile(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 15;
  if (score >= 70) return 30;
  if (score >= 60) return 50;
  return 65;
}

// \u2500\u2500 Achievement badge data \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface Achievement {
  id: string;
  label: string;
  icon: string;
  color: string;
  earned: boolean;
}

function buildAchievements(
  score: number,
  percentile: number,
  hasAudit: boolean,
  celebratedRaw: string[],
): Achievement[] {
  return [
    {
      id: 'first-audit',
      label: 'First Score',
      icon: 'ribbon',
      color: GOLD,
      earned: hasAudit || celebratedRaw.includes('first-audit'),
    },
    {
      id: 'cleared-bar',
      label: 'Recruiter Ready',
      icon: 'shield-checkmark',
      color: GREEN,
      earned: celebratedRaw.includes('cleared-bar'),
    },
    {
      id: 'top-25',
      label: 'Top 25%',
      icon: 'trending-up',
      color: GOLD,
      earned: percentile <= 25 || celebratedRaw.includes('top-25'),
    },
    {
      id: 'top-10',
      label: 'Top 10',
      icon: 'diamond',
      color: '#A78BFA',
      earned: percentile <= 10 || celebratedRaw.includes('top-10'),
    },
    {
      id: 'score-jump',
      label: 'Level Up',
      icon: 'flash',
      color: AMBER,
      earned: celebratedRaw.includes('score-jump'),
    },
    {
      id: 'applied-job',
      label: 'Applied',
      icon: 'briefcase',
      color: colors.blue,
      earned: celebratedRaw.includes('applied-job'),
    },
  ];
}

// \u2500\u2500 Score ring \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const anim = useState(() => new Animated.Value(0))[0];
  const color = scoreColor(score);
  const r = size / 2;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * (r - strokeWidth);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: score / 100,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score]);

  const dashOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background ring */}
      <View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: r,
        borderWidth: strokeWidth,
        borderColor: colors.s3,
      }} />
      {/* Foreground ring \u2014 simplified with border since Animated SVG isn't available */}
      <View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: r,
        borderWidth: strokeWidth,
        borderColor: color,
        opacity: 0.9,
      }} />
      {/* Score text */}
      <Text style={[ps.ringScore, { color }]}>{score}</Text>
      <Text style={ps.ringLabel}>DILLY</Text>
    </View>
  );
}

// \u2500\u2500 Screen \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const [profile,  setProfile]  = useState<Record<string, any>>({});
  const [audit,    setAudit]    = useState<Record<string, any>>({});
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [celebrated, setCelebrated] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, auditRaw] = await Promise.all([
          apiFetch('/profile').then(r => r.json()),
          apiFetch('/audit/latest').then(r => r.json()),
        ]);

        setProfile(profileRes ?? {});

        const auditObj = auditRaw?.audit ?? auditRaw ?? {};
        const snapshot = profileRes?.first_audit_snapshot?.scores;
        const smart = auditObj?.scores?.smart ?? snapshot?.smart ?? null;
        const grit  = auditObj?.scores?.grit  ?? snapshot?.grit  ?? null;
        const build = auditObj?.scores?.build ?? snapshot?.build ?? null;
        const techWeights = { smart: 0.20, grit: 0.30, build: 0.50 };
        const calculated = (smart != null && grit != null && build != null)
          ? Math.round(smart * techWeights.smart + grit * techWeights.grit + build * techWeights.build)
          : null;

        setAudit({
          ...auditObj,
          has_audit: auditRaw?.has_audit !== false && auditObj?.final_score != null,
          final_score: auditObj?.final_score ?? calculated ?? undefined,
          scores: { smart: smart ?? 0, grit: grit ?? 0, build: build ?? 0 },
        });

        // Photo
        const slug = profileRes?.profile_slug;
        if (slug) {
          try {
            const photoRes = await fetch(`${API_BASE}/profile/public/${slug}/photo`);
            if (photoRes.ok) {
              setPhotoUri(`${API_BASE}/profile/public/${slug}/photo?_t=${Date.now()}`);
            }
          } catch {}
        }

        // Celebrated milestones (for achievements)
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const raw = await AsyncStorage.getItem('dilly_celebrated_milestones');
          if (raw) setCelebrated(JSON.parse(raw));
        } catch {}

      } catch {} finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  // \u2500\u2500 Derived \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const p = profile;
  const fullName  = p.name || 'Student';
  const firstName = fullName.trim().split(/\s+/)[0];
  const cohort    = p.track || p.cohort || 'General';
  const school    = p.school_id === 'utampa' ? 'University of Tampa' : (p.school_id || 'University');
  const major     = (p.majors?.[0] || p.major || '');
  const tagline   = p.profile_tagline || p.custom_tagline || '';
  const target    = p.industry_target || p.application_target_label || p.career_goal || '';
  const targetCompanies = p.target_companies || [];
  const initial   = fullName[0]?.toUpperCase() || '?';

  const hasAudit   = audit.has_audit === true;
  const finalScore = audit.final_score ?? 0;
  const smartScore = audit.scores?.smart ?? 0;
  const gritScore  = audit.scores?.grit  ?? 0;
  const buildScore = audit.scores?.build ?? 0;
  const percentile = calcPercentile(finalScore);

  const achievements = buildAchievements(finalScore, percentile, hasAudit, celebrated);
  const earnedCount  = achievements.filter(a => a.earned).length;

  // \u2500\u2500 Activity stats (placeholder counts \u2014 wire to real API later) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const auditCount = hasAudit ? 1 : 0; // TODO: pull from audit history
  const jobsApplied = 0; // TODO: pull from applications

  async function handleShare() {
    try {
      await Share.share({
        message: `I'm ${firstName}, ${major} at ${school}. My Dilly career score is ${finalScore}/100 (Top ${percentile}%). Check out Dilly to see where you stand.`,
      });
    } catch {}
  }

  return (
    <View style={[ps.container, { paddingTop: insets.top }]}>

      {/* Nav bar */}
      <View style={ps.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </TouchableOpacity>
        <Text style={ps.navTitle}>Profile</Text>
        <TouchableOpacity onPress={() => setShowEdit(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <View style={ps.editBtn}>
            <Ionicons name="pencil" size={14} color={GOLD} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[ps.scroll, { paddingBottom: insets.bottom + 40 }]}
      >

        {/* \u2500\u2500 Hero \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <View style={ps.hero}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={ps.heroPhoto} />
          ) : (
            <View style={ps.heroPhotoPlaceholder}>
              <Text style={ps.heroInitial}>{initial}</Text>
            </View>
          )}
          <Text style={ps.heroName}>{fullName}</Text>
          {tagline ? (
            <Text style={ps.heroTagline}>{tagline}</Text>
          ) : null}
          <View style={ps.cohortPill}>
            <Text style={ps.cohortPillText}>{cohort} Cohort</Text>
          </View>
        </View>

        {/* \u2500\u2500 Score snapshot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        {hasAudit && (
          <TouchableOpacity
            style={ps.scoreCard}
            onPress={() => router.push('/(app)/score-detail')}
            activeOpacity={0.8}
          >
            <View style={ps.scoreCardLeft}>
              <ScoreRing score={finalScore} size={72} />
            </View>
            <View style={ps.scoreCardRight}>
              <Text style={ps.scoreCardLabel}>DILLY SCORE</Text>
              <Text style={[ps.scoreCardValue, { color: scoreColor(finalScore) }]}>
                Top {percentile}%
              </Text>
              <View style={ps.dimRow}>
                {[
                  { label: 'Smart', value: smartScore, color: colors.blue },
                  { label: 'Grit',  value: gritScore,  color: GOLD },
                  { label: 'Build', value: buildScore,  color: GREEN },
                ].map(d => (
                  <View key={d.label} style={ps.dimChip}>
                    <View style={[ps.dimDot, { backgroundColor: d.color }]} />
                    <Text style={ps.dimChipLabel}>{d.label}</Text>
                    <Text style={[ps.dimChipValue, { color: d.color }]}>{Math.round(d.value)}</Text>
                  </View>
                ))}
              </View>
              <Text style={ps.scoreCardHint}>Tap for full breakdown</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* \u2500\u2500 About \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <View style={ps.section}>
          <Text style={ps.sectionEyebrow}>ABOUT</Text>
          <View style={ps.aboutGrid}>
            <View style={ps.aboutItem}>
              <Ionicons name="school-outline" size={13} color={colors.t3} />
              <View>
                <Text style={ps.aboutLabel}>School</Text>
                <Text style={ps.aboutValue}>{school}</Text>
              </View>
            </View>
            <View style={ps.aboutItem}>
              <Ionicons name="book-outline" size={13} color={colors.t3} />
              <View>
                <Text style={ps.aboutLabel}>Major</Text>
                <Text style={ps.aboutValue}>{major || 'Not set'}</Text>
              </View>
            </View>
            {p.minors && p.minors.length > 0 && p.minors[0] !== '' && (
              <View style={ps.aboutItem}>
                <Ionicons name="library-outline" size={13} color={colors.t3} />
                <View>
                  <Text style={ps.aboutLabel}>Minor</Text>
                  <Text style={ps.aboutValue}>{p.minors.join(', ')}</Text>
                </View>
              </View>
            )}
            {p.pre_professional_track && (
              <View style={ps.aboutItem}>
                <Ionicons name="medkit-outline" size={13} color={colors.t3} />
                <View>
                  <Text style={ps.aboutLabel}>Track</Text>
                  <Text style={ps.aboutValue}>{p.pre_professional_track}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* \u2500\u2500 Career Target \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        {(target || targetCompanies.length > 0) && (
          <View style={ps.section}>
            <Text style={ps.sectionEyebrow}>CAREER TARGET</Text>
            <View style={ps.targetCard}>
              <Ionicons name="rocket-outline" size={16} color={GOLD} />
              <View style={{ flex: 1 }}>
                {target ? (
                  <Text style={ps.targetText}>{target}</Text>
                ) : null}
                {targetCompanies.length > 0 && (
                  <View style={ps.targetChips}>
                    {targetCompanies.slice(0, 5).map((c: string, i: number) => (
                      <View key={i} style={ps.targetChip}>
                        <Text style={ps.targetChipText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {!target && targetCompanies.length === 0 && (
                  <Text style={ps.targetEmpty}>No target set yet</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* \u2500\u2500 Achievements \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <View style={ps.section}>
          <View style={ps.sectionHeader}>
            <Text style={ps.sectionEyebrow}>ACHIEVEMENTS</Text>
            <Text style={[ps.sectionCount, { color: earnedCount > 0 ? GOLD : colors.t3 }]}>
              {earnedCount}/{achievements.length}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={ps.achieveRow}
          >
            {achievements.map(a => (
              <View key={a.id} style={[ps.achieveBadge, !a.earned && ps.achieveBadgeLocked]}>
                <View style={[
                  ps.achieveIcon,
                  { backgroundColor: a.earned ? a.color + '20' : colors.s3, borderColor: a.earned ? a.color + '40' : colors.b1 },
                ]}>
                  <Ionicons
                    name={a.icon as any}
                    size={18}
                    color={a.earned ? a.color : colors.t3}
                  />
                </View>
                <Text style={[ps.achieveLabel, { color: a.earned ? colors.t1 : colors.t3 }]}>
                  {a.label}
                </Text>
                {!a.earned && (
                  <Ionicons name="lock-closed" size={8} color={colors.t3} style={{ marginTop: 2 }} />
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* \u2500\u2500 Activity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <View style={ps.section}>
          <Text style={ps.sectionEyebrow}>ACTIVITY</Text>
          <View style={ps.activityRow}>
            {[
              { label: 'Audits Run', value: auditCount, icon: 'document-text', color: colors.blue },
              { label: 'AI Sessions', value: '\u2014', icon: 'chatbubble', color: colors.indigo },
              { label: 'Jobs Applied', value: jobsApplied, icon: 'briefcase', color: GREEN },
            ].map(item => (
              <View key={item.label} style={ps.activityCard}>
                <View style={[ps.activityIcon, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={16} color={item.color} />
                </View>
                <Text style={ps.activityValue}>{item.value}</Text>
                <Text style={ps.activityLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* \u2500\u2500 Share card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <TouchableOpacity style={ps.shareBtn} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={16} color={GOLD} />
          <Text style={ps.shareBtnText}>Share your Dilly card</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Edit modal */}
      <EditProfileModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        profile={profile}
        photoUri={photoUri}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
    </View>
  );
}

// \u2500\u2500 Styles \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const ps = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  navTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
    letterSpacing: 1,
    color: colors.t1,
  },
  editBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.xl },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 24,
  },
  heroPhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    borderColor: 'rgba(201,168,76,0.35)',
    marginBottom: 14,
  },
  heroPhotoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.s3,
    borderWidth: 2.5,
    borderColor: 'rgba(201,168,76,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroInitial: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 30,
    color: colors.t2,
  },
  heroName: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 24,
    color: colors.t1,
    textAlign: 'center',
    marginBottom: 4,
  },
  heroTagline: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  cohortPill: {
    backgroundColor: 'rgba(201,168,76,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  cohortPillText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    color: GOLD,
  },

  // Score card
  scoreCard: {
    backgroundColor: colors.s2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  scoreCardLeft: {},
  scoreCardRight: { flex: 1 },
  scoreCardLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.t3,
    marginBottom: 4,
  },
  scoreCardValue: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 16,
    marginBottom: 8,
  },
  dimRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  dimChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.s3,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dimDot: { width: 5, height: 5, borderRadius: 2.5 },
  dimChipLabel: { fontSize: 9, color: colors.t3 },
  dimChipValue: { fontSize: 10, fontWeight: '700' },
  scoreCardHint: { fontSize: 10, color: colors.t3 },
  ringScore: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 22,
  },
  ringLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 6,
    letterSpacing: 1.5,
    color: colors.t3,
    marginTop: -2,
  },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionEyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.t3,
    marginBottom: 10,
  },
  sectionCount: { fontFamily: 'Cinzel_700Bold', fontSize: 12 },

  // About
  aboutGrid: { gap: 10 },
  aboutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.s2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.b1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aboutLabel: { fontSize: 10, color: colors.t3, marginBottom: 1 },
  aboutValue: { fontSize: 14, color: colors.t1, fontWeight: '600' },

  // Target
  targetCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.s2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
    padding: 14,
    alignItems: 'flex-start',
  },
  targetText: { fontSize: 14, color: colors.t1, fontWeight: '600', marginBottom: 8, lineHeight: 20 },
  targetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  targetChip: {
    backgroundColor: colors.s3,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  targetChipText: { fontSize: 11, color: colors.t2 },
  targetEmpty: { fontSize: 12, color: colors.t3, fontStyle: 'italic' },

  // Achievements
  achieveRow: { gap: 10, paddingRight: 8 },
  achieveBadge: {
    alignItems: 'center',
    width: 72,
    gap: 6,
  },
  achieveBadgeLocked: { opacity: 0.4 },
  achieveIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achieveLabel: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },

  // Activity
  activityRow: { flexDirection: 'row', gap: 8 },
  activityCard: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  activityIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  activityValue: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 18,
    color: colors.t1,
  },
  activityLabel: {
    fontSize: 9,
    color: colors.t3,
    textAlign: 'center',
  },

  // Share
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  shareBtnText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 12,
    letterSpacing: 0.8,
    color: GOLD,
  },
});