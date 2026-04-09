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
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { authHeaders } from '../../lib/auth';

// ── Option definitions ────────────────────────────────────────────────────────

type Option = { id: string; label: string; sub: string; icon: string; iconColor: string; iconBg: string };

const QUANT_OPTIONS: Option[] = [
  {
    id: 'Finance & Quant Trading',
    label: 'Finance & Quant Trading',
    sub: 'Jane Street, Citadel, Two Sigma, quant funds',
    icon: '$', iconColor: colors.gold, iconBg: 'rgba(201,168,76,0.18)',
  },
  {
    id: 'Tech & Data Science',
    label: 'Tech & Data Science',
    sub: 'Google, Meta, data science and ML roles',
    icon: '</', iconColor: colors.blue, iconBg: 'rgba(10,132,255,0.15)',
  },
  {
    id: 'Actuarial & Insurance',
    label: 'Actuarial & Insurance',
    sub: 'Milliman, Aon, Towers Watson',
    icon: '⊛', iconColor: '#2DD4BF', iconBg: 'rgba(20,184,166,0.15)',
  },
  {
    id: 'Research & Academia',
    label: 'Research & Academia',
    sub: 'PhD programs, NSF fellowships, research labs',
    icon: '◈', iconColor: colors.green, iconBg: 'rgba(34,197,94,0.15)',
  },
  {
    id: 'Not sure yet',
    label: 'Not sure yet',
    sub: 'Dilly uses balanced scoring  -  update anytime',
    icon: '?', iconColor: colors.t3, iconBg: colors.s4,
  },
];

const DATA_SCIENCE_OPTIONS: Option[] = [
  {
    id: 'Tech & Data Science',
    label: 'Tech companies',
    sub: 'Google, Meta, Amazon, Microsoft data science roles',
    icon: '</', iconColor: colors.blue, iconBg: 'rgba(10,132,255,0.15)',
  },
  {
    id: 'Finance & Quant Trading',
    label: 'Finance & Quant',
    sub: 'Quant funds, investment banks, financial data roles',
    icon: '$', iconColor: colors.gold, iconBg: 'rgba(201,168,76,0.18)',
  },
  {
    id: 'Healthcare & Biotech',
    label: 'Healthcare & Biotech',
    sub: 'Pharmaceutical, health data, clinical analytics',
    icon: '+', iconColor: colors.green, iconBg: 'rgba(34,197,94,0.15)',
  },
  {
    id: 'Not sure yet',
    label: 'Not sure yet',
    sub: 'Dilly defaults to Tech cohort  -  update anytime',
    icon: '?', iconColor: colors.t3, iconBg: colors.s4,
  },
];

// ── Progress bar ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;

function ProgressBar() {
  return (
    <View style={pb.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[pb.seg, i < 3 ? pb.done : i === 3 ? pb.active : pb.empty]}
        />
      ))}
    </View>
  );
}
const pb = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xl, marginTop: 14 },
  seg:   { flex: 1, height: 2.5, borderRadius: 999 },
  done:  { backgroundColor: colors.gold },
  active:{ backgroundColor: 'rgba(201,168,76,0.4)' },
  empty: { backgroundColor: 'rgba(255,255,255,0.08)' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function IndustryTargetScreen() {
  const insets = useSafeAreaInsets();
  const { context = 'quantitative', cohort: cohortParam = '', name = '' } = useLocalSearchParams<{
    context: string;
    cohort?: string;
    name?: string;
  }>();

  const isQuantitative = context === 'quantitative';
  const options  = isQuantitative ? QUANT_OPTIONS : DATA_SCIENCE_OPTIONS;
  const heading  = isQuantitative ? 'Where are you\nheaded?' : 'What industry are\nyou targeting?';
  const pillLabel = isQuantitative ? 'Quantitative cohort' : 'Tech cohort · Data Science';

  const [selected, setSelected] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleContinue() {
    if (loading) return;
    const finalSelection = selected || 'Not sure yet';
    setLoading(true);
    try {
      const headers = await authHeaders();
      await fetch(`${API_BASE}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ industry_target: finalSelection }),
      });
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
    // Persist to AsyncStorage so scanning.tsx can include it in the audit formData.
    // The PATCH above is non-fatal fire-and-forget; AsyncStorage is the reliable path.
    try {
      await AsyncStorage.setItem('dilly_onboarding_industry_target', finalSelection);
    } catch { /* non-fatal */ }
    const cohort = cohortParam || (isQuantitative ? 'Quantitative' : 'Tech');
    router.push({
      pathname: '/onboarding/you-are-in',
      params: { cohort, name, industryTarget: finalSelection },
    });
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Back + progress */}
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={16} color={colors.blue} />
        <Text style={s.backText}>Back</Text>
      </TouchableOpacity>
      <ProgressBar />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.cohortPill}>
            <Text style={s.cohortPillText}>{pillLabel}</Text>
          </View>
          <Text style={s.heading}>{heading}</Text>
          <Text style={s.sub}>
            Dilly scores you differently depending on your target industry. This makes your score much more accurate.
          </Text>
        </View>

        {/* Option cards */}
        <View style={s.cards}>
          {options.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[s.card, isSelected ? s.cardSelected : s.cardDefault]}
                onPress={() => setSelected(isSelected ? null : opt.id)}
                activeOpacity={0.75}
              >
                <View style={[s.iconTile, { backgroundColor: opt.iconBg }]}>
                  <Text style={[s.iconText, { color: opt.iconColor }]}>{opt.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardLabel, isSelected && s.cardLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={s.cardSub}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA  -  always gold, defaults to "Not sure yet" */}
        <TouchableOpacity
          style={s.button}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={s.buttonText}>This looks right →</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    color: colors.blue,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  cohortPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginBottom: 14,
  },
  cohortPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gold,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: colors.t1,
    lineHeight: 27,
    marginBottom: 6,
  },
  sub: {
    fontSize: 11,
    color: colors.t2,
    lineHeight: 17,
  },
  cards: {
    gap: 8,
    marginBottom: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 13,
  },
  cardDefault: {
    backgroundColor: colors.s2,
    borderColor: colors.b1,
  },
  cardSelected: {
    backgroundColor: 'rgba(201,168,76,0.07)',
    borderColor: colors.goldbdr,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 2,
  },
  cardLabelSelected: {
    color: colors.gold,
  },
  cardSub: {
    fontSize: 10,
    color: colors.t2,
    lineHeight: 14,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
});
