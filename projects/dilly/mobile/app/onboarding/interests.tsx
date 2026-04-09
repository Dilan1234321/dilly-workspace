import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { authHeaders } from '../../lib/auth';

// ── Constants ──────────────────────────────────────────────────────────────────

const INTERESTS_LIST = [
  'Software Engineering & CS',
  'Data Science & Analytics',
  'Cybersecurity & IT',
  'Electrical & Computer Engineering',
  'Mechanical & Aerospace Engineering',
  'Civil & Environmental Engineering',
  'Chemical & Biomedical Engineering',
  'Finance & Accounting',
  'Consulting & Strategy',
  'Marketing & Advertising',
  'Management & Operations',
  'Entrepreneurship & Innovation',
  'Economics & Public Policy',
  'Healthcare & Clinical',
  'Biotech & Pharmaceutical',
  'Life Sciences & Research',
  'Physical Sciences & Math',
  'Law & Government',
  'Media & Communications',
  'Design & Creative Arts',
  'Education & Human Development',
  'Social Sciences & Nonprofit',
];

const TOTAL_STEPS = 6;

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={pb.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            pb.seg,
            i < step - 1 ? pb.done : i === step - 1 ? pb.active : pb.empty,
          ]}
        />
      ))}
    </View>
  );
}

const pb = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xl, marginTop: 14 },
  seg:    { flex: 1, height: 2.5, borderRadius: 999 },
  done:   { backgroundColor: colors.gold },
  active: { backgroundColor: 'rgba(43,58,142,0.35)' },
  empty:  { backgroundColor: colors.b1 },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function InterestsScreen() {
  const insets = useSafeAreaInsets();
  const { cohort = '', majors: majorsParam = '[]', name = '' } = useLocalSearchParams<{
    cohort: string;
    majors: string;
    name: string;
  }>();

  const parsedMajors: string[] = (() => {
    try { return JSON.parse(majorsParam); } catch { return []; }
  })();

  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);

  function toggle(interest: string) {
    setSelected((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  }

  async function handleContinue() {
    if (loading) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      // Save interests  -  fire-and-forget, non-fatal
      fetch(`${API_BASE}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ interests: selected }),
      }).catch(() => null);

      await AsyncStorage.setItem('dilly_onboarding_interests', JSON.stringify(selected));

      const needsIndustry =
        cohort === 'Quantitative' || parsedMajors.includes('Data Science');

      if (needsIndustry) {
        const context = cohort === 'Quantitative' ? 'quantitative' : 'data-science';
        router.push({
          pathname: '/onboarding/industry-target',
          params: { context, cohort, name },
        });
      } else {
        router.push({
          pathname: '/onboarding/you-are-in',
          params: { cohort, name },
        });
      }
    } catch {
      // Non-fatal  -  navigate regardless
      const needsIndustry =
        cohort === 'Quantitative' || parsedMajors.includes('Data Science');
      if (needsIndustry) {
        const context = cohort === 'Quantitative' ? 'quantitative' : 'data-science';
        router.push({ pathname: '/onboarding/industry-target', params: { context, cohort, name } });
      } else {
        router.push({ pathname: '/onboarding/you-are-in', params: { cohort, name } });
      }
    } finally {
      setLoading(false);
    }
  }

  const count = selected.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top }}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={16} color={colors.gold} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <ProgressBar step={3} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>Step 3 · Your interests</Text>
          <Text style={s.heading}>What excites you?</Text>
          <Text style={s.sub}>
            Each field you select unlocks a new cohort you'll be benchmarked against.
          </Text>
        </View>

        {/* Counter */}
        <View style={s.counterRow}>
          <View style={[s.counterBadge, count > 0 && s.counterBadgeActive]}>
            <Text style={[s.counterText, count > 0 && s.counterTextActive]}>
              {count === 0 ? 'None selected' : `${count} selected`}
            </Text>
          </View>
        </View>

        {/* Grid */}
        <View style={s.grid}>
          {INTERESTS_LIST.map((interest) => {
            const isSelected = selected.includes(interest);
            return (
              <TouchableOpacity
                key={interest}
                style={[s.chip, isSelected ? s.chipActive : s.chipDefault]}
                onPress={() => toggle(interest)}
                activeOpacity={0.7}
              >
                {isSelected && (
                  <View style={s.chipCheck}>
                    <Ionicons name="checkmark" size={9} color={colors.gold} />
                  </View>
                )}
                <Text style={[s.chipText, isSelected ? s.chipTextActive : s.chipTextDefault]}>
                  {interest}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Skip hint */}
        <Text style={s.skipHint}>You can always update this later.</Text>

        {/* Continue */}
        <TouchableOpacity
          style={[s.button, s.buttonActive, loading && { opacity: 0.7 }]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.buttonText}>Continue →</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gold,
  },
  header: {
    paddingTop: spacing.xl,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: colors.gold,
    marginBottom: 7,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: colors.t1,
    lineHeight: 28,
    marginBottom: 5,
  },
  sub: {
    fontSize: 11,
    color: colors.t2,
    lineHeight: 17,
  },
  counterRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  counterBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b2,
  },
  counterBadgeActive: {
    backgroundColor: 'rgba(43,58,142,0.07)',
    borderColor: colors.goldbdr,
  },
  counterText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.t3,
  },
  counterTextActive: {
    color: colors.gold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  chipDefault: {
    backgroundColor: colors.s2,
    borderColor: colors.b2,
  },
  chipActive: {
    backgroundColor: 'rgba(43,58,142,0.07)',
    borderColor: colors.goldbdr,
  },
  chipCheck: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(43,58,142,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  chipTextDefault: {
    color: colors.t2,
  },
  chipTextActive: {
    color: colors.gold,
    fontWeight: '600',
  },
  skipHint: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: colors.gold,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.1,
  },
});
