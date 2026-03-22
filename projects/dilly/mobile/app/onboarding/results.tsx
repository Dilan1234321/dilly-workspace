import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../../lib/auth';
import { colors, spacing } from '../../lib/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditResult {
  final_score?:    number;
  scores?:         { smart?: number; grit?: number; build?: number };
  detected_track?: string;
  dilly_take?:     string;
  error?:          boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TRACK_CFG: Record<string, { bar: number; gapDim: string }> = {
  Tech:         { bar: 75, gapDim: 'Build' },
  Finance:      { bar: 80, gapDim: 'Grit'  },
  Business:     { bar: 80, gapDim: 'Grit'  },
  'Pre-Health': { bar: 85, gapDim: 'Smart' },
  'Pre-Law':    { bar: 82, gapDim: 'Smart' },
  Quantitative: { bar: 78, gapDim: 'Smart' },
  General:      { bar: 75, gapDim: ''      },
};

function calcPercentile(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 15;
  if (score >= 70) return 30;
  if (score >= 60) return 50;
  return 65;
}

function scoreColor(score: number): string {
  if (score >= 80) return colors.green;
  if (score >= 55) return colors.gold;
  return colors.coral;
}

function fmtPts(n: number): string {
  return n === 1 ? '1 point' : `${n} points`;
}

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, duration: number, delay: number, go: boolean): number {
  const [val, setVal] = useState(0);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame>>();
  useEffect(() => {
    if (!go || target === 0) return;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t     = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(eased * target));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, delay, go]);
  return val;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [firstName,  setFirstName]  = useState('');
  const [track,      setTrack]      = useState('General');
  const [result,     setResult]     = useState<AuditResult | null>(null);
  const [isError,    setIsError]    = useState(false);
  const [completing, setCompleting] = useState(false);

  const barAnim     = useRef(new Animated.Value(0)).current;
  const calloutAnim = useRef(new Animated.Value(0)).current;
  const teaseAnim   = useRef(new Animated.Value(0)).current;
  const btnAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const name   = await AsyncStorage.getItem('dilly_onboarding_name')   ?? '';
      const cohort = await AsyncStorage.getItem('dilly_onboarding_cohort') ?? '';
      const raw    = await AsyncStorage.getItem('dilly_audit_result');

      setFirstName(name.trim().split(/\s+/)[0] ?? '');
      setTrack(cohort || 'General');

      let parsed: AuditResult | null = null;
      let err = false;
      if (!raw) { err = true; }
      else {
        try {
          parsed = JSON.parse(raw) as AuditResult;
          if (parsed.error || parsed.final_score === undefined) err = true;
        } catch { err = true; }
      }
      setResult(parsed);
      setIsError(err);

      const score = Math.round(parsed?.final_score ?? 0);
      setTimeout(() => Animated.timing(barAnim, { toValue: score, duration: 800, useNativeDriver: false }).start(), 400);
      setTimeout(() => Animated.timing(calloutAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start(), 1800);
      setTimeout(() => Animated.timing(teaseAnim,   { toValue: 1, duration: 300, useNativeDriver: true }).start(), 2100);
      setTimeout(() => Animated.timing(btnAnim,     { toValue: 1, duration: 300, useNativeDriver: true }).start(), 2400);
    })();
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const finalScore = Math.round(result?.final_score ?? 0);
  const smartScore = Math.round(result?.scores?.smart ?? 0);
  const gritScore  = Math.round(result?.scores?.grit  ?? 0);
  const buildScore = Math.round(result?.scores?.build ?? 0);

  const percentile    = calcPercentile(finalScore);
  const resolvedTrack = result?.detected_track || track || 'General';
  const cfg           = TRACK_CFG[resolvedTrack] ?? TRACK_CFG.General;

  const dims    = [{ name: 'Smart', score: smartScore }, { name: 'Grit', score: gritScore }, { name: 'Build', score: buildScore }];
  const weakest = dims.reduce((a, b) => a.score <= b.score ? a : b);
  const gapDim  = cfg.gapDim || weakest.name;
  const away    = Math.max(0, cfg.bar - finalScore);
  const above   = finalScore >= cfg.bar;

  const dillyTake = result?.dilly_take
    || (isError
      ? "Upload a PDF resume and I'll tell you exactly what's holding you back."
      : `I know exactly what's keeping your ${weakest.name} at ${weakest.score} — and it's a 10-minute fix on two bullets.`);

  const go       = !isError && result !== null;
  const scoreVal = useCountUp(finalScore, 1200, 400, go);
  const smartVal = useCountUp(smartScore, 700,  400, go);
  const gritVal  = useCountUp(gritScore,  700,  600, go);
  const buildVal = useCountUp(buildScore, 700,  800, go);

  const dimColors = [colors.blue, colors.gold, colors.green];
  const dimVals   = [smartVal, gritVal, buildVal];

  const barWidth = barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  async function handleEnter() {
    if (completing) return;
    setCompleting(true);
    try { await apiFetch('/profile', { method: 'PATCH', body: JSON.stringify({ onboarding_complete: true }) }); } catch {}
    await AsyncStorage.removeItem('dilly_audit_result');
    router.replace('/(app)');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={s.glow} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow */}
        <Text style={s.eyebrow}>
          {firstName ? `${firstName}'s Dilly score` : 'Your Dilly score'}
        </Text>

        {/* Title */}
        <Text style={s.title}>
          {firstName ? `${firstName}, here's where you stand.` : "Here's where you stand."}
        </Text>

        {/* ── Score card ─────────────────────────────────────────────────── */}
        <View style={s.scoreCard}>
          <Text style={s.cardLabel}>
            {'Career readiness · '}
            <Text style={{ color: colors.t2 }}>{resolvedTrack}</Text>
            {' track'}
          </Text>

          <View style={s.scoreRow}>
            <Text style={[s.scoreBig, { color: isError ? colors.t3 : scoreColor(finalScore) }]}>
              {isError ? '—' : scoreVal}
            </Text>
            <Text style={s.scoreOf}>/100</Text>
          </View>

          <Text style={[s.percentile, { color: isError ? colors.t3 : finalScore >= 70 ? colors.green : colors.gold }]}>
            {isError ? 'Score unavailable' : `Top ${percentile}% ${resolvedTrack} · UTampa`}
          </Text>

          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, { width: barWidth }]} />
          </View>

          <View style={s.dimRow}>
            {['Smart', 'Grit', 'Build'].map((name, i) => (
              <View key={name} style={s.dimTile}>
                <Text style={[s.dimScore, { color: isError ? colors.t3 : dimColors[i] }]}>
                  {isError ? '—' : dimVals[i]}
                </Text>
                <Text style={s.dimLabel}>{name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Gap callout ─────────────────────────────────────────────────── */}
        <Animated.View style={[{ marginBottom: 8 }, { opacity: calloutAnim }]}>
          {isError ? (
            <View style={[s.calloutBox, { backgroundColor: colors.s2, borderColor: colors.b1 }]}>
              <Text style={{ fontSize: 11, color: colors.t2, lineHeight: 17 }}>
                Dilly couldn't score your resume fully. Upload a cleaner PDF and run another audit.
              </Text>
            </View>
          ) : above ? (
            <View style={[s.calloutBox, s.calloutRow, { backgroundColor: colors.gdim, borderColor: colors.gbdr }]}>
              <View style={[s.calloutIcon, { backgroundColor: colors.gbdr }]}>
                <Ionicons name="checkmark" size={10} color={colors.green} />
              </View>
              <Text style={[s.calloutText, { color: colors.green }]}>
                {'You\'re above the recruiter bar. '}
                <Text style={{ fontWeight: '700' }}>Top {percentile}%</Text>
                {' puts you in elite territory.'}
              </Text>
            </View>
          ) : (
            <View style={[s.calloutBox, s.calloutRow, { backgroundColor: colors.golddim, borderColor: colors.goldbdr }]}>
              <View style={[s.calloutIcon, { backgroundColor: colors.goldbdr }]}>
                <Ionicons name="warning-outline" size={10} color={colors.gold} />
              </View>
              <Text style={[s.calloutText, { color: colors.gold }]}>
                {'Top 25% is the recruiter filter. You\'re '}
                <Text style={{ fontWeight: '700' }}>{fmtPts(away)} away</Text>
                {'. '}
                <Text style={{ fontWeight: '700' }}>{gapDim}</Text>
                {' is the gap.'}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* ── Dilly tease card ────────────────────────────────────────────── */}
        <Animated.View style={[s.teaseCard, { opacity: teaseAnim }]}>
          <View style={s.teaseAvatar}>
            <Ionicons name="happy-outline" size={11} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.teaseLabel}>DILLY</Text>
            <Text style={s.teaseText} numberOfLines={3}>{dillyTake}</Text>
            <TouchableOpacity style={s.lockRow} onPress={() => router.replace('/(app)')}>
              <Ionicons name="lock-closed-outline" size={11} color={colors.blue} />
              <Text style={s.lockText}>Unlock Dilly to hear this</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <View style={{ minHeight: 24 }} />

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: btnAnim }}>
          <TouchableOpacity
            style={[s.btn, completing && { opacity: 0.7 }]}
            onPress={handleEnter}
            activeOpacity={0.85}
            disabled={completing}
          >
            <Text style={s.btnText}>{completing ? 'Saving…' : 'Enter my career center →'}</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  glow: {
    position: 'absolute', top: '25%', left: '50%',
    marginLeft: -130, width: 260, height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(201,168,76,0.05)',
    shadowColor: colors.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 80,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  eyebrow: {
    fontSize: 9, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1.4, color: colors.gold, marginBottom: 4,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20,
    color: colors.t1, lineHeight: 26, marginBottom: 14,
  },
  scoreCard: {
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
    borderRadius: 15, padding: 13, marginBottom: 8,
  },
  cardLabel: {
    fontSize: 8, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, color: colors.t3, marginBottom: 7,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 4 },
  scoreBig: {
    fontFamily: 'PlayfairDisplay_700Bold', fontSize: 46,
    fontWeight: '300', letterSpacing: -2, lineHeight: 50,
  },
  scoreOf: { fontSize: 14, fontWeight: '300', color: colors.t3, paddingBottom: 5 },
  percentile: { fontSize: 11, fontWeight: '700', marginBottom: 7 },
  barTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999, overflow: 'hidden', marginBottom: 9,
  },
  barFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 999 },
  dimRow: { flexDirection: 'row', gap: 5 },
  dimTile: {
    flex: 1, backgroundColor: colors.s3, borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center',
  },
  dimScore: { fontSize: 15, fontWeight: '300', lineHeight: 18, marginBottom: 3 },
  dimLabel: {
    fontSize: 7, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.6, color: colors.t3,
  },
  calloutBox: {
    borderWidth: 1, borderRadius: 11, padding: 9, paddingHorizontal: 11,
  },
  calloutRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  calloutIcon: {
    width: 18, height: 18, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  calloutText: { fontSize: 10, lineHeight: 15, fontWeight: '500', flex: 1 },
  teaseCard: {
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.bbdr,
    borderRadius: 11, padding: 9, paddingHorizontal: 11,
    flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'flex-start',
  },
  teaseAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.bdim, borderWidth: 1, borderColor: colors.bbdr,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  teaseLabel: {
    fontSize: 8, fontWeight: '700', color: colors.blue,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2,
  },
  teaseText: { fontSize: 10, color: colors.t2, lineHeight: 15, opacity: 0.3 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  lockText: { fontSize: 9, fontWeight: '600', color: colors.blue },
  btn: { backgroundColor: colors.green, borderRadius: 13, padding: 13, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#051A0B' },
});
