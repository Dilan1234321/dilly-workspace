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
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Recommendation {
  title:       string;
  description: string;
}

// Rubric scorer signal evaluation (from dilly_core.rubric_scorer.SignalEvaluation)
interface RubricSignal {
  signal:    string;
  dimension: 'smart' | 'grit' | 'build';
  tier:      'high' | 'medium' | 'low';
  weight:    number;
  rationale: string;
}

// Fastest-path move from the rubric — can be a string or {move, expected_lift, source}
type RubricPathMove = string | { move?: string; expected_lift?: string; source?: string; title?: string; action?: string };

// Per-cohort summary for "other cohorts" display
interface OtherCohort {
  cohort_id:     string;
  display_name:  string;
  composite:     number;
  smart:         number;
  grit:          number;
  build:         number;
  recruiter_bar: number;
  above_bar:     boolean;
}

// Rich rubric analysis payload from the backend (Tier 2 cutover)
interface RubricAnalysis {
  primary_cohort_id:           string;
  primary_cohort_display_name: string;
  primary_composite:           number;
  primary_smart:               number;
  primary_grit:                number;
  primary_build:               number;
  recruiter_bar:               number;
  above_bar:                   boolean;
  matched_signals:             RubricSignal[];
  unmatched_signals:           RubricSignal[];
  fastest_path_moves:          RubricPathMove[];
  common_rejection_reasons?:   (string | { reason?: string; source?: string })[];
  other_cohorts?:              OtherCohort[];
}

interface AuditResult {
  final_score?:      number;
  scores?:           { smart?: number; grit?: number; build?: number };
  detected_track?:   string;
  dilly_take?:       string;
  recommendations?:  Recommendation[];
  rubric_analysis?:  RubricAnalysis;  // Tier 2 cutover: rich matched/unmatched/path forward
  error?:            boolean;
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
  // Two-tier encouraging palette: green if strong, brand blue otherwise.
  // Never red, never orange — low scores should feel like a starting line,
  // not a failure. Red is reserved for genuine error states only.
  if (score >= 80) return colors.green;
  return colors.gold; // Dilly brand blue (#2B3A8E) — "building, here's your path"
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

      // ── DIAGNOSTIC LOG 4: stored audit result ──────────────────────────
      console.log('[results] dilly_onboarding_name:', name);
      console.log('[results] dilly_onboarding_cohort:', cohort);
      console.log('[results] dilly_audit_result raw:', raw);

      setFirstName(name.trim().split(/\s+/)[0] ?? '');
      setTrack(cohort || 'General');

      let parsed: AuditResult | null = null;
      let err = false;
      if (!raw) { err = true; console.log('[results] ERROR: no raw audit result in AsyncStorage'); }
      else {
        try {
          parsed = JSON.parse(raw) as AuditResult;
          console.log('[results] parsed final_score:', parsed.final_score, 'error flag:', parsed.error);
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

  const dims     = [{ name: 'Smart', score: smartScore }, { name: 'Grit', score: gritScore }, { name: 'Build', score: buildScore }];
  const weakest  = dims.reduce((a, b) => a.score <= b.score ? a : b);
  const strongest = dims.reduce((a, b) => a.score >= b.score ? a : b);
  const gapDim   = cfg.gapDim || weakest.name;
  const away    = Math.max(0, cfg.bar - finalScore);
  const above   = finalScore >= cfg.bar;

  // ── Cohort-aware copy for pre-health and pre-law ─────────────────────
  // These students are targeting grad school admissions, not jobs, so the
  // "recruiter bar" / "career center" language reads as wrong. Swap all
  // external-facing copy to admissions framing when the primary cohort
  // is pre_health or pre_law. Triggered by the rubric's primary_cohort_id
  // when available, or the legacy detected_track string as fallback.
  const primaryCohortId =
    result?.rubric_analysis?.primary_cohort_id ||
    (result?.detected_track || '').toLowerCase().replace(/[^a-z_]/g, '_');
  const isPreHealth = primaryCohortId === 'pre_health' ||
    primaryCohortId.includes('pre_health') ||
    resolvedTrack.toLowerCase().includes('pre-health') ||
    resolvedTrack.toLowerCase().includes('pre_health');
  const isPreLaw = primaryCohortId === 'pre_law' ||
    primaryCohortId.includes('pre_law') ||
    resolvedTrack.toLowerCase().includes('pre-law') ||
    resolvedTrack.toLowerCase().includes('pre_law');
  const isAdmissionsCohort = isPreHealth || isPreLaw;

  // Copy variations: for admissions cohorts, swap every student-facing
  // phrase from employer/recruiter language to adcom/admissions language.
  const readinessLabel = isPreHealth
    ? 'Medical school readiness'
    : isPreLaw
    ? 'Law school readiness'
    : 'Career readiness';
  const barLabel = isAdmissionsCohort ? 'admissions bar' : 'recruiter bar';
  const percentileUnit = isPreHealth
    ? 'of med school matriculants'
    : isPreLaw
    ? 'of T14 admits'
    : `${resolvedTrack} · UTampa`;
  const elitePhrase = isPreHealth
    ? 'puts you in the matriculant range.'
    : isPreLaw
    ? 'puts you in T14 competitive territory.'
    : 'puts you in elite territory.';
  const topFilterLabel = isAdmissionsCohort
    ? 'Top 25% of admits.'
    : 'Top 25% is the recruiter filter.';

  const dillyTake = result?.dilly_take
    || (isError
      ? "Upload a PDF resume and I'll show you exactly what moves your score fastest."
      : isAdmissionsCohort
      ? `I know exactly what's moving your ${weakest.name} from ${weakest.score} — and adcoms will be looking for this.`
      : `I know exactly what moves your ${weakest.name} from ${weakest.score} — and it's a 10-minute fix on two bullets.`);

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
    try { await dilly.patch('/profile', { onboarding_complete: true, has_run_first_audit: true }); } catch {}
    await AsyncStorage.setItem('dilly_has_onboarded', 'true');
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

        {/* Title — framed as a starting line, not a verdict */}
        <Text style={s.title}>
          {firstName ? `${firstName}, here's your starting line.` : "Here's your starting line."}
        </Text>

        {/* ── Score card ─────────────────────────────────────────────────── */}
        <View style={s.scoreCard}>
          <Text style={s.cardLabel}>
            {readinessLabel}{' · '}
            <Text style={{ color: colors.t2 }}>{resolvedTrack}</Text>
            {isAdmissionsCohort ? '' : ' track'}
          </Text>

          <View style={s.scoreRow}>
            <Text style={[s.scoreBig, { color: isError ? colors.t3 : scoreColor(finalScore) }]}>
              {isError ? '—' : scoreVal}
            </Text>
            <Text style={s.scoreOf}>/100</Text>
          </View>

          <Text style={[s.percentile, { color: isError ? colors.t3 : finalScore >= 70 ? colors.green : colors.gold }]}>
            {isError ? 'Score unavailable' : `Top ${percentile}% ${percentileUnit}`}
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

        {/* ── Strongest-signal callout (lead with a win for students below bar) ── */}
        {!isError && !above && strongest.score > 0 && (
          <Animated.View style={[{ marginBottom: 8 }, { opacity: calloutAnim }]}>
            <View style={[s.calloutBox, s.calloutRow, { backgroundColor: colors.gdim, borderColor: colors.gbdr }]}>
              <View style={[s.calloutIcon, { backgroundColor: colors.gbdr }]}>
                <Ionicons name="star-outline" size={10} color={colors.green} />
              </View>
              <Text style={[s.calloutText, { color: colors.green }]}>
                {'Your strongest signal: '}
                <Text style={{ fontWeight: '700' }}>{strongest.name} ({strongest.score})</Text>
                {'. That\'s what we\'ll build on.'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── Path-forward callout — framed as a lever, not a verdict ────── */}
        <Animated.View style={[{ marginBottom: 8 }, { opacity: calloutAnim }]}>
          {isError ? (
            <View style={[s.calloutBox, { backgroundColor: colors.s2, borderColor: colors.b1 }]}>
              <Text style={{ fontSize: 11, color: colors.t2, lineHeight: 17 }}>
                Your resume looks like a scanned image, so Dilly can't read the text. Try uploading the original Word doc (.docx) instead, or re-export it from Google Docs as a PDF.
              </Text>
            </View>
          ) : above ? (
            <View style={[s.calloutBox, s.calloutRow, { backgroundColor: colors.gdim, borderColor: colors.gbdr }]}>
              <View style={[s.calloutIcon, { backgroundColor: colors.gbdr }]}>
                <Ionicons name="checkmark" size={10} color={colors.green} />
              </View>
              <Text style={[s.calloutText, { color: colors.green }]}>
                {`You're above the ${barLabel}. `}
                <Text style={{ fontWeight: '700' }}>Top {percentile}%</Text>
                {' '}{elitePhrase}
              </Text>
            </View>
          ) : (
            <View style={[s.calloutBox, s.calloutRow, { backgroundColor: colors.golddim, borderColor: colors.goldbdr }]}>
              <View style={[s.calloutIcon, { backgroundColor: colors.goldbdr }]}>
                <Ionicons name="trending-up" size={10} color={colors.gold} />
              </View>
              <Text style={[s.calloutText, { color: colors.gold }]}>
                {fmtPts(away)}
                {isAdmissionsCohort
                  ? ' to the admissions bar. Biggest lever: '
                  : ' to the Top 25%. Biggest lever: '}
                <Text style={{ fontWeight: '700' }}>{gapDim}</Text>
                {'.'}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* ──────────────────────────────────────────────────────────────────
             RUBRIC ANALYSIS — Tier 2 cutover (2026-04-08)

             The rich "checklist" UX. When the backend returns rubric_analysis
             we render three sections:
               1. What's working (matched signals, leading with a win)
               2. Your fastest path forward (unmatched high-impact signals,
                  each with a cited rationale — the actual to-do list)
               3. Specific next moves (fastest_path_moves from the rubric)

             When rubric_analysis is NOT present, we fall back to the legacy
             recommendations list below this block.
         ─────────────────────────────────────────────────────────────────── */}
        {!isError && result?.rubric_analysis && (
          <Animated.View style={{ opacity: calloutAnim, marginBottom: 8 }}>
            {/* What's working — matched signals, lead with a win */}
            {result.rubric_analysis.matched_signals && result.rubric_analysis.matched_signals.length > 0 && (
              <View style={s.rubricSection}>
                <Text style={s.recoHeading}>What's working</Text>
                {result.rubric_analysis.matched_signals.slice(0, 5).map((sig, i) => (
                  <View key={`m-${i}`} style={s.matchedRow}>
                    <View style={s.matchedDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.matchedText}>{sig.signal}</Text>
                      <Text style={s.matchedDim}>{sig.dimension.toUpperCase()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Your fastest path forward — unmatched high-impact signals
                 (the biggest levers, each with a cited rationale) */}
            {result.rubric_analysis.unmatched_signals && result.rubric_analysis.unmatched_signals.filter(s => s.tier === 'high').length > 0 && (
              <View style={s.rubricSection}>
                <Text style={s.recoHeading}>Biggest levers (what moves your score fastest)</Text>
                {result.rubric_analysis.unmatched_signals
                  .filter(sig => sig.tier === 'high')
                  .slice(0, 5)
                  .map((sig, i) => (
                    <View key={`u-${i}`} style={s.leverCard}>
                      <View style={s.leverNum}>
                        <Text style={s.leverNumText}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.leverTitle}>{sig.signal}</Text>
                        {sig.rationale ? (
                          <Text style={s.leverBody} numberOfLines={3}>{sig.rationale}</Text>
                        ) : null}
                        <Text style={s.leverDim}>{sig.dimension.toUpperCase()}</Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* Specific next moves from the rubric's fastest_path_moves */}
            {result.rubric_analysis.fastest_path_moves && result.rubric_analysis.fastest_path_moves.length > 0 && (
              <View style={s.rubricSection}>
                <Text style={s.recoHeading}>Your fastest path forward</Text>
                {result.rubric_analysis.fastest_path_moves.slice(0, 6).map((move, i) => {
                  const text = typeof move === 'string' ? move : (move.move || move.action || move.title || '');
                  if (!text) return null;
                  return (
                    <View key={`p-${i}`} style={s.moveCard}>
                      <Ionicons name="arrow-forward" size={11} color={colors.gold} style={{ marginTop: 2, marginRight: 7 }} />
                      <Text style={s.moveText}>{text}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Other active cohorts (secondary fits from minors) */}
            {result.rubric_analysis.other_cohorts && result.rubric_analysis.other_cohorts.length > 0 && (
              <View style={s.rubricSection}>
                <Text style={s.recoHeading}>Other tracks you fit</Text>
                {result.rubric_analysis.other_cohorts.slice(0, 3).map((c, i) => (
                  <View key={`o-${i}`} style={s.otherCohortRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.otherCohortName}>{c.display_name}</Text>
                      <Text style={s.otherCohortMeta}>
                        S:{Math.round(c.smart)} · G:{Math.round(c.grit)} · B:{Math.round(c.build)}
                      </Text>
                    </View>
                    <Text style={[s.otherCohortScore, { color: c.above_bar ? colors.green : colors.gold }]}>
                      {Math.round(c.composite)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Legacy recommendations fallback (when rubric_analysis not present) ── */}
        {!isError && !result?.rubric_analysis && result?.recommendations && result.recommendations.length > 0 && (
          <Animated.View style={{ opacity: calloutAnim, marginBottom: 8 }}>
            <Text style={s.recoHeading}>Your fastest path forward</Text>
            {result.recommendations.map((rec, i) => (
              <View key={i} style={s.recoCard}>
                <View style={s.recoNum}>
                  <Text style={s.recoNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recoTitle}>{rec.title}</Text>
                  <Text style={s.recoBody}>{rec.description}</Text>
                </View>
              </View>
            ))}
          </Animated.View>
        )}

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

        {/* ── CTA row: See detailed feedback + Start my plan ─────────── */}
        <Animated.View style={{ opacity: btnAnim, gap: 8 }}>
          {!isError && result?.rubric_analysis ? (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: colors.gold, marginBottom: 8 }]}
              onPress={async () => {
                // Save latest audit to AsyncStorage so feedback page can read it
                try {
                  await AsyncStorage.setItem('dilly_latest_audit', JSON.stringify(result));
                } catch {}
                // Also mark onboarding complete before we navigate away
                try {
                  await dilly.patch('/profile', { onboarding_complete: true, has_run_first_audit: true });
                } catch {}
                await AsyncStorage.setItem('dilly_has_onboarded', 'true');
                await AsyncStorage.removeItem('dilly_audit_result');
                router.replace('/(app)/feedback');
              }}
              activeOpacity={0.85}
            >
              <Text style={[s.btnText, { color: '#FFFFFF' }]}>See my detailed feedback →</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[s.btn, completing && { opacity: 0.7 }]}
            onPress={handleEnter}
            activeOpacity={0.85}
            disabled={completing}
          >
            <Text style={s.btnText}>{completing ? 'Saving…' : 'Start my plan →'}</Text>
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
  recoHeading: {
    fontSize: 8, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1.2, color: colors.t3, marginBottom: 6,
  },
  recoCard: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
    borderRadius: 11, padding: 10, marginBottom: 5,
  },
  recoNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.golddim, borderWidth: 1, borderColor: colors.goldbdr,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  recoNumText: { fontSize: 9, fontWeight: '700', color: colors.gold },
  recoTitle: { fontSize: 11, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  recoBody:  { fontSize: 10, color: colors.t2, lineHeight: 15 },

  // ── Rubric analysis sections (Tier 2 cutover) ─────────────────────────
  rubricSection: { marginBottom: 12 },

  // "What's working" — matched signals
  matchedRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: colors.gdim, borderWidth: 1, borderColor: colors.gbdr,
    borderRadius: 9, marginBottom: 4,
  },
  matchedDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.green, marginTop: 5, flexShrink: 0,
  },
  matchedText: { fontSize: 10.5, fontWeight: '600', color: colors.t1, lineHeight: 14 },
  matchedDim: {
    fontSize: 7, fontWeight: '700', color: colors.green,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2,
  },

  // "Biggest levers" — unmatched high-impact signals with rationales
  leverCard: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: colors.golddim, borderWidth: 1, borderColor: colors.goldbdr,
    borderRadius: 11, padding: 10, marginBottom: 5,
  },
  leverNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.gold,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  leverNumText: { fontSize: 9, fontWeight: '700', color: colors.gold },
  leverTitle: { fontSize: 11, fontWeight: '700', color: colors.t1, marginBottom: 3, lineHeight: 14 },
  leverBody:  { fontSize: 9.5, color: colors.t2, lineHeight: 14 },
  leverDim: {
    fontSize: 7, fontWeight: '700', color: colors.gold,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4,
  },

  // "Fastest path forward" — specific next moves
  moveCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
    borderRadius: 9, marginBottom: 4,
  },
  moveText: { fontSize: 10.5, color: colors.t1, lineHeight: 15, flex: 1 },

  // "Other tracks you fit" — secondary cohorts
  otherCohortRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 11,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
    borderRadius: 10, marginBottom: 5,
  },
  otherCohortName: { fontSize: 11, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  otherCohortMeta: { fontSize: 9, color: colors.t3 },
  otherCohortScore: {
    fontSize: 18, fontWeight: '700', marginLeft: 8,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
});
