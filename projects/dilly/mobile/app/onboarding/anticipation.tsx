import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, spacing, radius } from '../../lib/tokens';

// ── Cohort maps ───────────────────────────────────────────────────────────────

const COHORT_DIMENSION: Record<string, string> = {
  Tech: 'Build score', Business: 'Grit score', Science: 'Smart score',
  Quantitative: 'Smart score', Health: 'Grit score', 'Social Science': 'Grit score',
  Humanities: 'Build score', Sport: 'Grit score',
  'Pre-Health': 'Smart score', 'Pre-Law': 'Smart score', General: 'cohort score',
};

const COHORT_PEERS: Record<string, string> = {
  Tech: 'CS and Data Science', Business: 'Finance and Business',
  Science: 'Science and research', Quantitative: 'Math and Statistics',
  Health: 'Health Sciences', 'Social Science': 'Social Science and Policy',
  Humanities: 'Humanities and Communications', Sport: 'Sport Management',
  'Pre-Health': 'Pre-Med and Health Sciences', 'Pre-Law': 'Pre-Law and Political Science',
  General: 'your major',
};

function getCompany(cohort: string, industry: string): string {
  const map: Record<string, string> = {
    Tech: 'Google', Business: 'Goldman Sachs', Science: 'a top research lab',
    Quantitative: industry === 'Finance & Quant Trading' ? 'Jane Street' : 'a top quantitative employer',
    Health: 'Tampa General Hospital', 'Social Science': 'a top employer',
    Humanities: 'NBCUniversal', Sport: 'ESPN',
    'Pre-Health': 'Mayo Clinic', 'Pre-Law': 'Skadden', General: 'a Fortune 500 recruiter',
  };
  return map[cohort] ?? 'a top recruiter';
}

const FUNNEL_STEPS = [
  { num: '1', label: 'ATS system scans it',         pct: '60% filtered', bad: true  },
  { num: '2', label: 'Recruiter reads for 7 seconds', pct: '30% filtered', bad: true  },
  { num: '3', label: 'Hiring manager review',        pct: '8% filtered',  bad: true  },
  { num: '4', label: 'Interview',                    pct: 'You want here', bad: false },
];

const COHORT_COMPARISON: Record<string, { company: string; salary: string }> = {
  Tech:            { company: 'Google SWE',          salary: '$130,000' },
  Business:        { company: 'Goldman analyst',     salary: '$110,000' },
  Science:         { company: 'NIH research role',   salary: '$65,000'  },
  Quantitative:    { company: 'Jane Street quant',   salary: '$200,000' },
  Health:          { company: 'Hospital RN role',    salary: '$72,000'  },
  'Social Science':{ company: 'Deloitte consultant', salary: '$75,000'  },
  Humanities:      { company: 'NBCUniversal role',   salary: '$60,000'  },
  Sport:           { company: 'ESPN coordinator',    salary: '$58,000'  },
  'Pre-Health':    { company: 'Physician salary',    salary: '$230,000' },
  'Pre-Law':       { company: 'BigLaw associate',    salary: '$215,000' },
  General:         { company: 'Fortune 500 role',    salary: '$65,000'  },
};

// ── Progress bar (step 3 active) ──────────────────────────────────────────────

function ProgressBar() {
  return (
    <View style={pb.row}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[pb.seg, i < 2 ? pb.done : i === 2 ? pb.active : pb.empty]} />
      ))}
    </View>
  );
}
const pb = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xl, marginTop: 10 },
  seg:   { flex: 1, height: 2.5, borderRadius: 999 },
  done:  { backgroundColor: colors.gold },
  active:{ backgroundColor: 'rgba(201,168,76,0.4)' },
  empty: { backgroundColor: 'rgba(255,255,255,0.08)' },
});

// ── Animated item ─────────────────────────────────────────────────────────────

function AnimatedItem({ num, children, delay }: { num: string; children: React.ReactNode; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, delay + 120);
  }, []);

  return (
    <Animated.View style={[ai.row, { opacity, transform: [{ translateY }] }]}>
      <Text style={ai.num}>{num}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}
const ai = StyleSheet.create({
  row: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  num: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.6, marginTop: 2, flexShrink: 0, fontVariant: ['tabular-nums'] },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AnticipationScreen() {
  const insets = useSafeAreaInsets();
  const { cohort = 'General', industryTarget = '' } = useLocalSearchParams<{
    cohort: string;
    industryTarget?: string;
  }>();

  const company    = getCompany(cohort, industryTarget);
  const dimension  = COHORT_DIMENSION[cohort] ?? 'cohort score';
  const peers      = COHORT_PEERS[cohort]     ?? 'your major';
  const comparison = COHORT_COMPARISON[cohort] ?? COHORT_COMPARISON.General;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Back + progress */}
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={16} color={colors.blue} />
        <Text style={s.backText}>Back</Text>
      </TouchableOpacity>
      <ProgressBar />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow */}
        <Text style={s.eyebrow}>In the next 15 seconds, Dilly will:</Text>

        {/* Hero headline */}
        <Text style={s.heading}>
          {'Read your resume the way a '}
          <Text style={s.headingGold}>{company}</Text>
          {' recruiter does.'}
        </Text>

        {/* Numbered items — stagger in */}
        <View style={s.items}>
          <AnimatedItem num="01" delay={0}>
            <Text style={s.itemText}>
              {'Score every bullet against '}
              <Text style={s.gold}>{company} recruiter</Text>
              {' benchmarks'}
            </Text>
          </AnimatedItem>

          <AnimatedItem num="02" delay={80}>
            <Text style={s.itemText}>
              {'Calculate your '}
              <Text style={s.gold}>{dimension}</Text>
              {` vs ${peers} peers at UTampa`}
            </Text>
          </AnimatedItem>

          <AnimatedItem num="03" delay={160}>
            <Text style={s.itemText}>
              {'Show you '}
              <Text style={s.gold}>exactly</Text>
              {' what to fix to move up the leaderboard'}
            </Text>
          </AnimatedItem>
        </View>

        {/* Identity statement — gold left border */}
        <View style={s.quoteBlock}>
          <Text style={s.quoteText}>
            Dilly doesn't guess. He reads the same signals recruiters use — and scores you on the things that actually move the needle.
          </Text>
        </View>

        {/* Card D — recruiter funnel */}
        <View style={s.funnelCard}>
          <View style={s.cardHeaderRow}>
            <View style={s.cardDot} />
            <Text style={s.cardLabel}>WHAT HAPPENS TO YOUR RESUME</Text>
          </View>
          <View style={s.funnelSteps}>
            {FUNNEL_STEPS.map((step) => (
              <View key={step.num} style={s.funnelRow}>
                {step.bad ? (
                  <View style={s.stepCircle}>
                    <Text style={s.stepNum}>{step.num}</Text>
                  </View>
                ) : (
                  <Ionicons name="star" size={14} color={colors.gold} style={{ width: 22, textAlign: 'center' }} />
                )}
                <Text style={s.stepLabel}>{step.label}</Text>
                <View style={[s.pctPill, step.bad ? s.pctBad : s.pctGood]}>
                  <Text style={[s.pctText, step.bad ? s.pctTextBad : s.pctTextGood]}>
                    {step.pct}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Card E — cost comparison */}
        <View style={s.costCard}>
          <Text style={s.costTopText}>
            {'The difference between a '}
            <Text style={{ color: colors.t1, fontWeight: '600' }}>{comparison.company} offer</Text>
          </Text>
          <Text style={s.costTopText}>and no offer is often one resume fix.</Text>

          <View style={s.divider} />

          <View style={s.costRow}>
            <View style={s.costCol}>
              <Text style={s.costColLabel}>{comparison.company.toUpperCase()}</Text>
              <Text style={s.costSalary}>{comparison.salary}</Text>
              <Text style={s.costColSub}>starting salary</Text>
            </View>
            <View style={s.costDivider} />
            <View style={s.costCol}>
              <Text style={s.costColLabel}>DILLY</Text>
              <Text style={s.costPrice}>$9.99</Text>
              <Text style={s.costColSub}>full coaching</Text>
            </View>
          </View>

          <Text style={s.costNote}>
            If one fix gets you one more interview, this paid for itself 500×.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={s.button}
          onPress={() => router.push('/onboarding/upload')}
          activeOpacity={0.85}
        >
          <Text style={s.buttonText}>Upload my resume →</Text>
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
  eyebrow: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: colors.t3,
    marginTop: spacing.xxl,
    marginBottom: 12,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_900Black',
    fontSize: 26,
    color: colors.t1,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  headingGold: {
    fontFamily: 'PlayfairDisplay_900Black',
    color: colors.gold,
  },
  items: {
    gap: 16,
    marginBottom: 28,
  },
  itemText: {
    fontSize: 13,
    color: colors.t1,
    lineHeight: 20,
    fontWeight: '500',
  },
  gold: {
    color: colors.gold,
    fontWeight: '600',
  },
  quoteBlock: {
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    paddingLeft: 13,
    marginBottom: 22,
  },
  quoteText: {
    fontSize: 12,
    color: colors.t2,
    lineHeight: 19,
  },
  // Card D — funnel
  funnelCard: {
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  cardDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.gold,
  },
  cardLabel: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.t3,
  },
  funnelSteps: {
    gap: 8,
  },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.s3,
    borderWidth: 1,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.t3,
  },
  stepLabel: {
    fontSize: 11,
    color: colors.t2,
    flex: 1,
  },
  pctPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pctBad: { backgroundColor: colors.cdim },
  pctGood: { backgroundColor: colors.gdim },
  pctText: { fontSize: 9, fontWeight: '700' },
  pctTextBad:  { color: colors.coral },
  pctTextGood: { color: colors.green },

  // Card E — cost comparison
  costCard: {
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  costTopText: {
    fontSize: 12,
    color: colors.t2,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.b2,
    marginVertical: 12,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  costCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  costColLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.t3,
  },
  costSalary: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    fontWeight: '700',
    color: colors.green,
  },
  costPrice: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    fontWeight: '700',
    color: colors.gold,
  },
  costColSub: {
    fontSize: 9,
    color: colors.t3,
  },
  costDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.goldbdr,
    marginHorizontal: 12,
  },
  costNote: {
    fontSize: 10,
    color: colors.t2,
    lineHeight: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
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
    color: '#1A1200',
    letterSpacing: -0.1,
  },
});
