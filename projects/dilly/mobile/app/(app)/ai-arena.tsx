/**
 * AI Arena -- Three-Act AI Readiness Narrative + Tools.
 *
 * A flowing story you scroll through, not a feature menu.
 * Dark navy background, off-white accents, green for good, amber for warning.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Animated, Easing, Alert, LayoutAnimation, Dimensions,
  KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { mediumHaptic } from '../../lib/haptics';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import DillyFooter from '../../components/DillyFooter';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { DillyFace } from '../../components/DillyFace';
import { useAppMode } from '../../hooks/useAppMode';

const W = Dimensions.get('window').width;

// Design tokens
const BG = '#111827';
const CARD = '#1F2937';
const BORDER = '#374151';
const ACCENT = '#F0F0F0';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const TEXT = '#F9FAFB';
const SUB = '#9CA3AF';
const DIM = '#6B7280';

type ActiveFeature = null | 'scan' | 'replace' | 'simulate' | 'firewall' | 'vault' | 'index';

// ── Shield Ring ──────────────────────────────────────────────────────────────

function ShieldRing({ score, size = 160 }: { score: number; size?: number }) {
  const sw = 8;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const fillPct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circ * (1 - fillPct);
  const CYAN = '#00E5FF';

  // Animate the ring filling in
  const fillAnim = useRef(new Animated.Value(circ)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fill animation
    Animated.timing(fillAnim, {
      toValue: dash,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Pulse glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [score]);

  return (
    <View style={{ width: size + 20, height: size + 20, alignItems: 'center', justifyContent: 'center' }}>
      {/* Glow effect behind the ring */}
      <Animated.View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        shadowColor: CYAN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20,
        backgroundColor: 'transparent', transform: [{ scale: pulseAnim }],
      }} />
      <Svg width={size} height={size}>
        {/* Background ring */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth={sw} fill="transparent" />
        {/* Filled ring */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={CYAN} strokeWidth={sw} fill="transparent"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 48, fontWeight: '900', color: TEXT }}>{Math.round(score)}</Text>
        <Text style={{ fontSize: 16, color: SUB, marginTop: -4 }}>/100</Text>
      </View>
    </View>
  );
}

// ── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({ signal, accentColor }: { signal: string; accentColor: string }) {
  return (
    <View style={[a.signalCard, { borderLeftColor: accentColor }]}>
      <Text style={a.signalText}>{signal}</Text>
    </View>
  );
}

// ── HolderImpactCard ────────────────────────────────────────────────────
// Replacement for SignalCard on the holder-mode Arena. The seeker card
// is a quiet left-rule + text line. Holders asked for a mind-blown
// version: dark panel, accent-tinted icon disc, uppercase label tag,
// larger body. Same one-line signal text; the wrapper carries the
// visual weight.
function HolderImpactCard({
  icon, accent, tint, label, text,
}: {
  icon: string;
  accent: string;     // stroke / text colour for the label + icon
  tint: string;       // dark background tint for the card body
  label: string;      // eg 'AT RISK' or 'YOUR MOAT'
  text: string;       // the one-line signal
}) {
  return (
    <View style={[h.impactCard, { borderColor: accent + '40', backgroundColor: tint }]}>
      <View style={[h.impactIconWrap, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
        <Ionicons name={icon as any} size={20} color={accent} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[h.impactLabel, { color: accent }]}>{label}</Text>
        <Text style={h.impactText}>{text}</Text>
      </View>
    </View>
  );
}

// ── Tool Row ─────────────────────────────────────────────────────────────────

function ToolRow({ icon, title, sub, color, onPress, active }: {
  icon: string; title: string; sub: string; color: string;
  onPress: () => void; active: boolean;
}) {
  return (
    <AnimatedPressable
      style={[
        a.toolRow,
        active && { borderLeftColor: color, borderLeftWidth: 4, backgroundColor: color + '06' },
      ]}
      onPress={onPress}
      scaleDown={0.98}
    >
      <View style={[a.toolIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={a.toolTextWrap}>
        <Text style={a.toolTitle}>{title}</Text>
        <Text style={a.toolSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name={active ? 'chevron-down' : 'chevron-forward'} size={16} color={active ? color : DIM} />
    </AnimatedPressable>
  );
}

// ── Act Divider ──────────────────────────────────────────────────────────────

function ActDivider({ number, title }: { number: string; title: string }) {
  return (
    <View style={a.actDivider}>
      <View style={a.actLine} />
      <View style={a.actLabelWrap}>
        <Text style={a.actNumber}>{number}</Text>
        <Text style={a.actTitle}>{title}</Text>
      </View>
      <View style={a.actLine} />
    </View>
  );
}

// ── Loading State ────────────────────────────────────────────────────────────

function ArenaLoadingState({ texts }: { texts: string[] }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [textIdx, setTextIdx] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    const interval = setInterval(() => setTextIdx(i => (i + 1) % texts.length), 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }}>
      <DillyFace size={120} />
      <Animated.Text style={{ fontSize: 16, fontWeight: '600', color: TEXT, marginTop: 24, opacity: pulseAnim }}>
        {texts[textIdx]}
      </Animated.Text>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function AIArenaScreen() {
  const insets = useSafeAreaInsets();
  // Holders get a calmer, coach-style tone. "field intelligence" and
  // "this quarter's play" instead of "threat" and "replace". Seekers/
  // students keep the existing arena/anxiety framing that powers
  // onboarding engagement.
  const appMode = useAppMode();
  const isHolder = appMode === 'holder';
  const [shield, setShield] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>(null);

  // Feature-specific state
  const [scanResults, setScanResults] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const replaceInputRef = useRef('');
  const replaceFieldRef = useRef<any>(null);
  const [replaceResult, setReplaceResult] = useState<any>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const simJobRef = useRef('');
  const simFieldRef = useRef<any>(null);
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Threat report. role-based, zero-LLM. Speaks to everyone, not just
  // students with a resume. Loads in parallel with the shield score.
  const [threatReport, setThreatReport] = useState<any>(null);
  const [threatRoleInput, setThreatRoleInput] = useState<string>('');
  const [threatSaving, setThreatSaving] = useState(false);
  // Weekly signal. hand-curated content block describing this
  // week's biggest move in the user's field. Zero-LLM.
  const [weeklySignal, setWeeklySignal] = useState<any>(null);

  const fetchShield = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 30_000);
      const res = await dilly.fetch('/ai-arena/shield', { signal: ctrl.signal });
      if (res.ok) setShield(await res.json());
    } catch {}
  }, []);

  const fetchWeeklySignal = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);
      const res = await dilly.fetch('/ai-arena/weekly-signal', { signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        if (data?.signal) setWeeklySignal(data.signal);
      }
    } catch {}
  }, []);

  const fetchThreatReport = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);
      const res = await dilly.fetch('/ai-arena/threat-report/infer', { signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        if (data?.report) setThreatReport(data.report);
      }
    } catch {}
  }, []);

  const saveRoleAndFetchReport = useCallback(async (role: string) => {
    const trimmed = role.trim();
    if (!trimmed) return;
    setThreatSaving(true);
    try {
      // Save role to profile so next visit the infer endpoint resolves it.
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ current_role: trimmed }),
      }).catch(() => {});
      // Direct lookup so the UI updates instantly even if the profile
      // write lagged.
      const res = await dilly.fetch(`/ai-arena/threat-report?role=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.report) setThreatReport(data.report);
      }
    } catch {}
    finally {
      setThreatSaving(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Fetch in parallel: threat report is free, so it shouldn't block
      // the shield score even if the shield LLM path takes a few seconds.
      await Promise.all([fetchShield(), fetchThreatReport(), fetchWeeklySignal()]);
      setLoading(false);
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    mediumHaptic();
    setRefreshing(true);
    await Promise.all([fetchShield(), fetchThreatReport(), fetchWeeklySignal()]);
    setRefreshing(false);
  }, [fetchShield, fetchThreatReport, fetchWeeklySignal]);

  function toggleFeature(f: ActiveFeature) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFeature(activeFeature === f ? null : f);
  }

  // Scan
  const runScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const res = await dilly.fetch('/ai-arena/scan', { method: 'POST', body: JSON.stringify({}) });
      if (res.ok) { const d = await res.json(); setScanResults(d); }
    } catch {} finally { setScanLoading(false); }
  }, []);

  // Replace
  const runReplace = useCallback(async () => {
    const text = replaceInputRef.current.trim();
    if (text.length < 10) return;
    setReplaceLoading(true);
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 30_000);
      const res = await dilly.fetch('/ai-arena/replace-test', { method: 'POST', body: JSON.stringify({ bullet: text }), signal: ctrl.signal });
      if (res.ok) { const d = await res.json(); setReplaceResult(d); }
    } catch {} finally { setReplaceLoading(false); }
  }, []);

  // Simulate
  const runSim = useCallback(async () => {
    const text = simJobRef.current.trim();
    if (!text) return;
    setSimLoading(true);
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 60_000);
      const res = await dilly.fetch('/ai-arena/simulate', { method: 'POST', body: JSON.stringify({ job_title: text }), signal: ctrl.signal });
      if (res.ok) { const d = await res.json(); setSimResult(d); }
    } catch {} finally { setSimLoading(false); }
  }, []);

  const shieldScore = shield?.shield_score ?? 0;
  const shieldLabel = shield?.shield_label ?? '';
  const disruptionPct = shield?.disruption_pct ?? 0;
  const cohort = shield?.cohort ?? 'your field';
  const vulnerableSignals = shield?.vulnerable_signals ?? [];
  const resistantSignals = shield?.resistant_signals ?? [];
  const recommendation = shield?.recommendation ?? '';
  const aiResistantSkills = shield?.ai_resistant_skills ?? [];

  if (loading) {
    const ARENA_LOADING = [
      'Scanning your AI readiness...',
      'Analyzing your field...',
      'Checking what AI can replace...',
      'Finding your edge...',
      'Building your playbook...',
    ];
    return <ArenaLoadingState texts={ARENA_LOADING} />;
  }

  return (
    <KeyboardAvoidingView style={[a.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={[a.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} progressBackgroundColor={BG} />}
      >

        {/* Header. command-center framing. Works for students AND people
            who already have a job: it's the same question either way. */}
        <FadeInView delay={0}>
          <View style={{ paddingTop: 8, paddingBottom: 18 }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: TEXT, lineHeight: 32, letterSpacing: -0.6 }}>
              {isHolder
                ? 'Where your field is going.'
                : 'Your career intelligence, updated live.'}
            </Text>
            <Text style={{ fontSize: 13, color: SUB, marginTop: 6, lineHeight: 19 }}>
              {isHolder
                ? "What's shifting, what to invest in this quarter, and where your moat is."
                : "What AI is doing to your role, what it isn't, and exactly what to do this month."}
            </Text>
          </View>
        </FadeInView>

        {/* ════════════════════════════════════════════════════════
            THREAT REPORT. the painkiller card for EVERYONE.
            Zero LLM cost. Works whether or not user has a resume.
            Shows role-based AI threat data with actionable next moves.
            ════════════════════════════════════════════════════════ */}

        {threatReport ? (
          <FadeInView delay={20}>
            <View style={threatCard.card}>
              {/* Top: role + threat level */}
              <View style={threatCard.topRow}>
                <View>
                  <Text style={threatCard.eyebrow}>{isHolder ? 'FIELD REPORT' : 'AI THREAT REPORT'}</Text>
                  <Text style={threatCard.role}>{threatReport.display}</Text>
                </View>
                <View style={[threatCard.levelBadge, {
                  backgroundColor: (
                    threatReport.threat_level === 'severe' ? '#DC2626' + '22' :
                    threatReport.threat_level === 'high' ? '#EA580C' + '22' :
                    threatReport.threat_level === 'moderate' ? '#D97706' + '22' :
                    '#16A34A' + '22'
                  ),
                  borderColor: (
                    threatReport.threat_level === 'severe' ? '#DC2626' :
                    threatReport.threat_level === 'high' ? '#EA580C' :
                    threatReport.threat_level === 'moderate' ? '#D97706' :
                    '#16A34A'
                  ),
                }]}>
                  <Text style={[threatCard.levelText, {
                    color: (
                      threatReport.threat_level === 'severe' ? '#FCA5A5' :
                      threatReport.threat_level === 'high' ? '#FDBA74' :
                      threatReport.threat_level === 'moderate' ? '#FCD34D' :
                      '#86EFAC'
                    ),
                  }]}>
                    {threatReport.threat_level.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Big number + headline */}
              <View style={threatCard.bigRow}>
                <Text style={threatCard.bigPct}>{threatReport.threat_pct}%</Text>
                <Text style={threatCard.headline}>{threatReport.headline}</Text>
              </View>

              {/* Recent signal. the scary news point */}
              <View style={threatCard.signalBox}>
                <Ionicons name="newspaper-outline" size={12} color={ACCENT} />
                <Text style={threatCard.signalText}>{threatReport.recent_signal}</Text>
              </View>

              {/* Vulnerable tasks */}
              <Text style={threatCard.sectionLabel}>{isHolder ? "WHAT'S SHIFTING" : 'MOST AT RISK'}</Text>
              {(threatReport.vulnerable_tasks || []).slice(0, 4).map((t: string, i: number) => (
                <View key={`v${i}`} style={threatCard.bulletRow}>
                  <View style={[threatCard.bulletDot, { backgroundColor: '#EA580C' }]} />
                  <Text style={threatCard.bulletText}>{t}</Text>
                </View>
              ))}

              {/* Safe tasks */}
              <Text style={[threatCard.sectionLabel, { marginTop: 12 }]}>{isHolder ? 'YOUR MOAT' : "WHERE YOU'RE SAFE"}</Text>
              {(threatReport.safe_tasks || []).slice(0, 4).map((t: string, i: number) => (
                <View key={`s${i}`} style={threatCard.bulletRow}>
                  <View style={[threatCard.bulletDot, { backgroundColor: '#16A34A' }]} />
                  <Text style={threatCard.bulletText}>{t}</Text>
                </View>
              ))}

              {/* What to learn */}
              <Text style={[threatCard.sectionLabel, { marginTop: 12 }]}>{isHolder ? "THIS QUARTER'S PLAYS" : 'WHAT TO LEARN NEXT'}</Text>
              {(threatReport.what_to_learn || []).slice(0, 3).map((t: string, i: number) => (
                <View key={`l${i}`} style={threatCard.bulletRow}>
                  <View style={[threatCard.bulletDot, { backgroundColor: ACCENT }]} />
                  <Text style={threatCard.bulletText}>{t}</Text>
                </View>
              ))}

              {/* 2-year forecast */}
              <View style={threatCard.forecastBox}>
                <Text style={threatCard.forecastLabel}>2-YEAR FORECAST</Text>
                <Text style={threatCard.forecastText}>{threatReport.forecast_2yr}</Text>
              </View>

              {/* Dilly's take CTA */}
              <View style={threatCard.dillyTake}>
                <Ionicons name="sparkles" size={14} color={ACCENT} />
                <Text style={threatCard.dillyTakeText}>{threatReport.dilly_take}</Text>
              </View>

              <AnimatedPressable
                style={threatCard.ctaBtn}
                onPress={() => openDillyOverlay({
                  isPaid: false,
                  initialMessage: isHolder
                    ? `I'm a ${threatReport.display}. My field's AI shift is ${threatReport.threat_level} (${threatReport.threat_pct}%). Given where I am in my career, what's the smartest move for me this quarter?`
                    : `My AI threat level is ${threatReport.threat_level} (${threatReport.threat_pct}%). I'm a ${threatReport.display}. What specific moves should I make this month to become harder to replace?`,
                })}
                scaleDown={0.97}
              >
                <Ionicons name="chatbubbles" size={14} color="#0B1426" />
                <Text style={threatCard.ctaBtnText}>
                  {isHolder ? "Talk to Dilly about this quarter" : 'Ask Dilly what to do about this'}
                </Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          /* No role resolved. show a prompt to tell us what you do */
          <FadeInView delay={20}>
            <View style={threatCard.promptCard}>
              <Text style={threatCard.promptEyebrow}>GET YOUR AI THREAT REPORT</Text>
              <Text style={threatCard.promptTitle}>What do you do right now?</Text>
              <Text style={threatCard.promptSub}>
                Tell Dilly your role (or the one you're aiming for). You'll get a personalized
                read on how AI is reshaping it. what's at risk, what's safe, what to learn.
              </Text>
              <TextInput
                style={threatCard.promptInput}
                placeholder="e.g. software engineer, accountant, teacher"
                placeholderTextColor={DIM}
                value={threatRoleInput}
                onChangeText={setThreatRoleInput}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => saveRoleAndFetchReport(threatRoleInput)}
              />
              <AnimatedPressable
                style={threatCard.promptBtn}
                onPress={() => saveRoleAndFetchReport(threatRoleInput)}
                disabled={threatSaving || !threatRoleInput.trim()}
                scaleDown={0.97}
              >
                {threatSaving
                  ? <ActivityIndicator size="small" color="#0B1426" />
                  : <Text style={threatCard.promptBtnText}>See my AI threat report</Text>
                }
              </AnimatedPressable>
            </View>
          </FadeInView>
        )}

        {/* ════════════════════════════════════════════════════════
            THIS WEEK IN YOUR FIELD. hand-curated signal. Zero LLM.
            Gives people a reason to open the Arena every week, even
            when they're stable and their threat report hasn't changed.
            ════════════════════════════════════════════════════════ */}

        {weeklySignal && (
          <FadeInView delay={30}>
            <View style={weekly.card}>
              <View style={weekly.topRow}>
                <View style={weekly.eyebrowPill}>
                  <View style={weekly.livePulse} />
                  <Text style={weekly.eyebrowText}>THIS WEEK IN YOUR FIELD</Text>
                </View>
                {weeklySignal.iso_week ? (
                  <Text style={weekly.weekLabel}>{weeklySignal.iso_week}</Text>
                ) : null}
              </View>
              <Text style={weekly.headline}>{weeklySignal.headline}</Text>
              {weeklySignal.source ? (
                <Text style={weekly.source}>{weeklySignal.source}</Text>
              ) : null}
              {weeklySignal.data_point ? (
                <View style={weekly.dataBox}>
                  <Ionicons name="pulse" size={12} color="#22D3EE" />
                  <Text style={weekly.dataText}>{weeklySignal.data_point}</Text>
                </View>
              ) : null}
              {weeklySignal.move ? (
                <View style={weekly.moveBox}>
                  <Text style={weekly.moveLabel}>YOUR MOVE</Text>
                  <Text style={weekly.moveText}>{weeklySignal.move}</Text>
                </View>
              ) : null}
            </View>
          </FadeInView>
        )}

        {/* ════════════════════════════════════════════════════════
            ACT 1: THE THREAT
            ════════════════════════════════════════════════════════ */}

        <FadeInView delay={40}>
          <ActDivider number="I" title="THE THREAT" />
        </FadeInView>

        {/* Shield Score Ring. seekers/students only. Holders
            explicitly don't want a score calculated. For them, the
            Field Report threat_pct above carries the quantitative
            load and the vulnerable/moat cards below carry the
            qualitative weight. */}
        {!isHolder && (
          <FadeInView delay={60}>
            <View style={a.ringSection}>
              <ShieldRing score={shieldScore} size={120} />
              <Text style={a.ringScore}>{Math.round(shieldScore)}</Text>
              <Text style={a.ringLabel}>{shieldLabel || 'AI SHIELD SCORE'}</Text>
            </View>
          </FadeInView>
        )}

        {/* Disruption stat. seeker framing ("entry-level roles")
            doesn't apply to holders. Skip for them. */}
        {!isHolder && (
          <FadeInView delay={100}>
            <Text style={a.disruptionStatement}>
              In {cohort}, AI is disrupting {disruptionPct}% of entry-level roles.
            </Text>
          </FadeInView>
        )}

        {/* Vulnerable signals */}
        <FadeInView delay={140}>
          <Text style={a.actSectionHeader}>
            {isHolder ? 'WHAT AI IS EATING IN YOUR FIELD' : 'YOUR VULNERABLE SPOTS'}
          </Text>
        </FadeInView>

        {vulnerableSignals.length > 0 ? (
          vulnerableSignals.map((sig: any, i: number) => {
            const text = typeof sig === 'string' ? sig : sig.signal || sig.text || '';
            return (
              <FadeInView key={`v-${i}`} delay={160 + i * 30}>
                {isHolder ? (
                  <HolderImpactCard
                    icon="flame"
                    accent="#EA580C"
                    tint="#3A1B10"
                    label="AT RISK"
                    text={text}
                  />
                ) : (
                  <SignalCard signal={text} accentColor={AMBER} />
                )}
              </FadeInView>
            );
          })
        ) : (
          <FadeInView delay={160}>
            <View style={a.emptyCard}>
              <Ionicons name="help-circle-outline" size={20} color={DIM} />
              <Text style={a.emptyText}>
                Dilly needs to learn more about you to assess your vulnerabilities.
              </Text>
            </View>
          </FadeInView>
        )}


        {/* ════════════════════════════════════════════════════════
            ACT 2: YOUR EDGE
            ════════════════════════════════════════════════════════ */}

        <FadeInView delay={200}>
          <ActDivider number="II" title="YOUR EDGE" />
        </FadeInView>

        <FadeInView delay={220}>
          <Text style={a.actSectionHeader}>
            {isHolder ? "YOUR MOAT. WHAT AI CAN'T TOUCH" : "WHAT AI CAN'T TOUCH"}
          </Text>
        </FadeInView>

        {resistantSignals.length > 0 ? (
          resistantSignals.map((sig: any, i: number) => {
            const text = typeof sig === 'string' ? sig : sig.signal || sig.text || '';
            return (
              <FadeInView key={`r-${i}`} delay={240 + i * 30}>
                {isHolder ? (
                  <HolderImpactCard
                    icon="shield-checkmark"
                    accent="#16A34A"
                    tint="#0F2B22"
                    label="YOUR MOAT"
                    text={text}
                  />
                ) : (
                  <SignalCard signal={text} accentColor={GREEN} />
                )}
              </FadeInView>
            );
          })
        ) : (
          <FadeInView delay={240}>
            <View style={a.emptyCard}>
              <Ionicons name="bulb-outline" size={20} color={DIM} />
              <Text style={a.emptyText}>
                Tell Dilly about your leadership, creative work, and human skills.
              </Text>
              <AnimatedPressable
                style={a.emptyBtn}
                onPress={() => openDillyOverlay({ isPaid: true, initialMessage: 'I want to add human-only skills to my profile. Help me identify my leadership, creative work, and interpersonal strengths.' })}
                scaleDown={0.97}
              >
                <Ionicons name="chatbubble" size={14} color={ACCENT} />
                <Text style={a.emptyBtnText}>Talk to Dilly</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        )}

        {resistantSignals.length > 0 && resistantSignals.length < 3 && (
          <FadeInView delay={300}>
            <AnimatedPressable
              style={a.addMoreBtn}
              onPress={() => openDillyOverlay({ isPaid: true, initialMessage: 'I want to strengthen my AI-proof profile. Help me identify and add more human-only skills like leadership, creative work, and interpersonal strengths.' })}
              scaleDown={0.97}
            >
              <Ionicons name="add-circle-outline" size={16} color={ACCENT} />
              <Text style={a.addMoreText}>Tell Dilly about more human skills</Text>
            </AnimatedPressable>
          </FadeInView>
        )}


        {/* ════════════════════════════════════════════════════════
            ACT 3: YOUR PLAYBOOK. seeker/student only. Holders get
            the Field Report's WHAT'S SHIFTING / YOUR MOAT /
            THIS QUARTER'S PLAYS sections up top, which cover the
            same ground without the score framing.
            ════════════════════════════════════════════════════════ */}

        {!isHolder && (
          <>
            <FadeInView delay={320}>
              <ActDivider number="III" title="YOUR PLAYBOOK" />
            </FadeInView>

            <FadeInView delay={340}>
              <Text style={a.actSectionHeader}>HERE'S YOUR PLAN</Text>
            </FadeInView>

            {/* Recommendation card */}
            {recommendation ? (
              <FadeInView delay={360}>
                <View style={a.recommendationCard}>
                  <Ionicons name="bulb" size={18} color={ACCENT} />
                  <Text style={a.recommendationText}>{recommendation}</Text>
                </View>
              </FadeInView>
            ) : null}

            {/* AI-resistant skills to develop */}
            {aiResistantSkills.length > 0 && (
              <FadeInView delay={380}>
                <View style={a.skillPillWrap}>
                  {aiResistantSkills.map((skill: string, i: number) => (
                    <View key={`sk-${i}`} style={a.skillPill}>
                      <Text style={a.skillPillText}>{skill}</Text>
                    </View>
                  ))}
                </View>
              </FadeInView>
            )}

            {/* Improve My Score CTA */}
            <FadeInView delay={400}>
              <AnimatedPressable
                style={a.improveBtn}
                onPress={() => {
                  const vulnList = vulnerableSignals.map((s: any) => typeof s === 'string' ? s : s.signal || s.text || '').join(', ');
                  openDillyOverlay({
                    isPaid: true,
                    initialMessage: `My AI readiness is ${Math.round(shieldScore)} (${shieldLabel}). Vulnerable: ${vulnList || 'unknown'}. What specific things should I add to my Dilly Profile to become more AI-proof in ${cohort}?`,
                  });
                }}
                scaleDown={0.97}
              >
                <Ionicons name="trending-up" size={18} color={BG} />
                <Text style={a.improveBtnText}>Improve My Score</Text>
              </AnimatedPressable>
            </FadeInView>
          </>
        )}


        {/* ════════════════════════════════════════════════════════
            TOOLS SECTION. seeker/student only. Every tool below
            (Threat Scanner / Replace Me / Career Sim / Firewall /
            Vault / Index) is resume- and skill-scan-flavored. For
            holders we end the page at the moat card above.
            ════════════════════════════════════════════════════════ */}

        {!isHolder && (
        <FadeInView delay={440}>
          <Text style={a.toolsSectionHeader}>AI TOOLS</Text>
        </FadeInView>
        )}

        {shield && shield.tools_unlocked === false ? (
          /* Free tier. show locked-tools message + "come back" copy */
          <FadeInView delay={460}>
            <View style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#33415588',
              backgroundColor: '#11182780',
              padding: 18,
              gap: 10,
              marginBottom: 12,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="lock-closed" size={16} color={ACCENT} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#F8FAFC', letterSpacing: 0.5 }}>
                  AI TOOLS LOCKED
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 19 }}>
                Threat Scanner, Replace Me, and Career Sim are part of Dilly. Your shield score is free. {shield.next_refresh ? `come back ${shield.next_refresh.toLowerCase()} for an updated score.` : 'check back next month for an updated score.'}
              </Text>
              <AnimatedPressable
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: ACCENT,
                  marginTop: 4,
                }}
                onPress={() => router.push('/(app)/settings')}
                scaleDown={0.97}
              >
                <Ionicons name="sparkles" size={14} color="#0B1426" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0B1426' }}>Unlock with Dilly</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : null}

        {/* Dilly tier. gentle "refreshes Monday" copy above the tools */}
        {shield && shield.tools_unlocked === true && shield.next_refresh ? (
          <FadeInView delay={460}>
            <Text style={{
              fontSize: 11, color: '#94A3B8', textAlign: 'center', marginBottom: 12, letterSpacing: 0.3,
            }}>
              {shield.next_refresh}
            </Text>
          </FadeInView>
        ) : null}

        {/* 1. Threat Scanner */}
        <FadeInView delay={460}>
          <ToolRow
            icon="scan"
            title={isHolder ? "Skill Scanner" : "Threat Scanner"}
            sub={
              shield?.tools_unlocked === false
                ? 'Locked. Upgrade to scan'
                : isHolder
                  ? 'Map which skills AI is eating vs. which it amplifies'
                  : 'See which bullets AI can replace'
            }
            color={ACCENT}
            onPress={() => { if (shield?.tools_unlocked === false) { router.push('/(app)/settings'); return; } toggleFeature('scan'); }}
            active={activeFeature === 'scan'}
          />
        </FadeInView>

        {activeFeature === 'scan' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Threat Scanner</Text>
              <Text style={a.expandedSub}>Every skill and experience in your Dilly Profile, analyzed for AI vulnerability.</Text>
              {!scanResults && !scanLoading && (
                <AnimatedPressable style={a.actionBtn} onPress={runScan} scaleDown={0.97}>
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={a.actionBtnText}>Scan My Profile</Text>
                </AnimatedPressable>
              )}
              {scanLoading && <ActivityIndicator size="small" color={ACCENT} style={{ paddingVertical: 20 }} />}
              {scanResults && (
                <>
                  <View style={a.scanSummary}>
                    <View style={[a.scanStat, { backgroundColor: GREEN + '15' }]}>
                      <Text style={[a.scanStatNum, { color: GREEN }]}>{scanResults.summary?.safe ?? 0}</Text>
                      <Text style={a.scanStatLabel}>Safe</Text>
                    </View>
                    <View style={[a.scanStat, { backgroundColor: AMBER + '15' }]}>
                      <Text style={[a.scanStatNum, { color: AMBER }]}>{scanResults.summary?.at_risk ?? 0}</Text>
                      <Text style={a.scanStatLabel}>At Risk</Text>
                    </View>
                    <View style={[a.scanStat, { backgroundColor: ACCENT + '15' }]}>
                      <Text style={[a.scanStatNum, { color: ACCENT }]}>{scanResults.summary?.neutral ?? 0}</Text>
                      <Text style={a.scanStatLabel}>Neutral</Text>
                    </View>
                  </View>
                  {(scanResults.bullets || []).slice(0, 10).map((b: any, i: number) => {
                    const c = b.status === 'safe' ? GREEN : b.status === 'at_risk' ? AMBER : ACCENT;
                    return (
                      <View key={i} style={[a.bulletRow, { borderLeftColor: c }]}>
                        <Ionicons name={b.status === 'safe' ? 'shield-checkmark' : b.status === 'at_risk' ? 'warning' : 'help-circle'} size={14} color={c} />
                        <View style={{ flex: 1 }}>
                          <Text style={a.bulletText} numberOfLines={2}>{b.text}</Text>
                          <Text style={a.bulletReason}>{b.reason}</Text>
                        </View>
                        {b.status === 'at_risk' && (
                          <AnimatedPressable
                            style={a.fixBtn}
                            onPress={() => openDillyOverlay({ isPaid: true, initialMessage: `This bullet is AI-vulnerable: "${b.text}". Rewrite it to emphasize human skills.` })}
                            scaleDown={0.95}
                          >
                            <Text style={a.fixBtnText}>Fix</Text>
                          </AnimatedPressable>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </FadeInView>
        )}

        {/* 2. Replace Me */}
        <FadeInView delay={480}>
          <ToolRow
            icon="swap-horizontal"
            title="Replace Me"
            sub={shield?.tools_unlocked === false ? "Locked. Upgrade to test" : "Can AI do what you do?"}
            color={AMBER}
            onPress={() => { if (shield?.tools_unlocked === false) { router.push('/(app)/settings'); return; } toggleFeature('replace'); }}
            active={activeFeature === 'replace'}
          />
        </FadeInView>

        {activeFeature === 'replace' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Can AI Replace You?</Text>
              <Text style={a.expandedSub}>Paste a bullet. AI will try to write it. See if it can.</Text>
              <TextInput style={a.input} defaultValue="" onChangeText={t => { replaceInputRef.current = t; }}
                placeholder="Paste a bullet from your profile..." placeholderTextColor={DIM} multiline ref={replaceFieldRef} />
              <AnimatedPressable
                style={[a.actionBtn, { backgroundColor: AMBER }]}
                onPress={runReplace} disabled={replaceLoading} scaleDown={0.97}
              >
                {replaceLoading ? <ActivityIndicator size="small" color="#000" /> : (
                  <><Ionicons name="flash" size={16} color="#000" /><Text style={[a.actionBtnText, { color: '#000' }]}>Test It</Text></>
                )}
              </AnimatedPressable>
              {replaceResult && (
                <View style={[a.resultCard, { borderColor: replaceResult.verdict === 'human-only' ? GREEN + '40' : replaceResult.verdict === 'replaceable' ? AMBER + '40' : ACCENT + '40' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name={replaceResult.verdict === 'human-only' ? 'shield-checkmark' : replaceResult.verdict === 'replaceable' ? 'warning' : 'help-circle'}
                      size={18} color={replaceResult.verdict === 'human-only' ? GREEN : replaceResult.verdict === 'replaceable' ? AMBER : ACCENT} />
                    <Text style={[a.resultVerdict, { color: replaceResult.verdict === 'human-only' ? GREEN : replaceResult.verdict === 'replaceable' ? AMBER : ACCENT }]}>
                      {replaceResult.verdict === 'human-only' ? 'AI Cannot Replace This' : replaceResult.verdict === 'replaceable' ? 'AI Can Replace This' : 'Borderline'}
                    </Text>
                    <Text style={a.resultScore}>{replaceResult.replaceability}/10</Text>
                  </View>
                  <Text style={a.resultWhy}>{replaceResult.why}</Text>
                  {replaceResult.ai_version && (
                    <View style={a.aiAttempt}>
                      <Text style={a.aiAttemptLabel}>AI'S ATTEMPT</Text>
                      <Text style={a.aiAttemptText}>{replaceResult.ai_version}</Text>
                    </View>
                  )}
                  {replaceResult.verdict !== 'human-only' && (
                    <AnimatedPressable style={a.fixInline}
                      onPress={() => openDillyOverlay({ isPaid: true, initialMessage: `AI rated my bullet ${replaceResult.replaceability}/10 replaceable: "${replaceResult.original || replaceInputRef.current}". Rewrite it so AI CAN'T replicate it.` })}
                      scaleDown={0.97}>
                      <Ionicons name="sparkles" size={12} color={ACCENT} /><Text style={{ fontSize: 12, fontWeight: '600', color: ACCENT }}>Make it AI-proof</Text>
                    </AnimatedPressable>
                  )}
                </View>
              )}
            </View>
          </FadeInView>
        )}

        {/* 3. Career Sim */}
        <FadeInView delay={500}>
          <ToolRow
            icon="rocket"
            title="Career Sim"
            sub={shield?.tools_unlocked === false ? "Locked. Upgrade to simulate" : "See how AI reshapes your career over 5 years"}
            color={AMBER}
            onPress={() => { if (shield?.tools_unlocked === false) { router.push('/(app)/settings'); return; } toggleFeature('simulate'); }}
            active={activeFeature === 'simulate'}
          />
        </FadeInView>

        {activeFeature === 'simulate' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Career Simulator</Text>
              <Text style={a.expandedSub}>See how AI transforms your dream role over 5 years.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[a.input, { flex: 1 }]} defaultValue="" onChangeText={t => { simJobRef.current = t; }}
                  placeholder="Job title (e.g. Data Scientist)" placeholderTextColor={DIM} ref={simFieldRef} />
                <AnimatedPressable
                  style={[a.actionBtn, { paddingHorizontal: 16, backgroundColor: AMBER }]}
                  onPress={runSim} disabled={simLoading} scaleDown={0.97}>
                  {simLoading ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="rocket" size={16} color="#000" />}
                </AnimatedPressable>
              </View>
              {simResult && (
                <>
                  <Text style={a.simVerdict}>{simResult.verdict}</Text>
                  {(simResult.years || []).map((y: any, i: number) => {
                    const yc = y.risk_level === 'high' ? AMBER : y.risk_level === 'medium' ? AMBER : GREEN;
                    return (
                      <View key={y.year} style={a.yearRow}>
                        <View style={[a.yearDot, { backgroundColor: yc }]} />
                        <View style={a.yearContent}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={a.yearLabel}>Year {y.year}</Text>
                            <View style={[a.yearBadge, { backgroundColor: yc + '20' }]}>
                              <Text style={[a.yearBadgeText, { color: yc }]}>{y.ai_overlap_pct}% AI</Text>
                            </View>
                          </View>
                          <Text style={a.yearTitle}>{y.title}</Text>
                          <Text style={a.yearDesc}>{y.description}</Text>
                        </View>
                      </View>
                    );
                  })}
                  {simResult.survival_strategy && (
                    <View style={a.strategyBox}>
                      <Ionicons name="bulb" size={14} color={AMBER} />
                      <Text style={a.strategyText}>{simResult.survival_strategy}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </FadeInView>
        )}

        {/* 4. Skill Vault */}
        <FadeInView delay={520}>
          <ToolRow icon="lock-closed" title="Skill Vault" sub="Your AI-proof skills vs the ones you need" color={GREEN} onPress={() => toggleFeature('vault')} active={activeFeature === 'vault'} />
        </FadeInView>

        {activeFeature === 'vault' && shield && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Skill Vault</Text>
              <Text style={a.expandedSub}>AI-proof skills for your field. Unlocked = in your profile. Locked = develop next.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {(shield.resistant_signals || []).slice(0, 5).map((s: string, i: number) => (
                  <View key={`u-${i}`} style={a.skillUnlocked}>
                    <Ionicons name="lock-open" size={11} color={GREEN} />
                    <Text style={a.skillUnlockedText} numberOfLines={1}>{s.slice(0, 40)}</Text>
                  </View>
                ))}
                {(shield.ai_resistant_skills || []).slice(0, 5).map((s: string, i: number) => (
                  <AnimatedPressable key={`l-${i}`} style={a.skillLocked}
                    onPress={() => openDillyOverlay({ isPaid: true, initialMessage: `I need to develop "${s}" as an AI-proof skill. How do I build this and add it to my Dilly Profile?` })}
                    scaleDown={0.95}>
                    <Ionicons name="lock-closed" size={11} color={DIM} />
                    <Text style={a.skillLockedText} numberOfLines={1}>{s}</Text>
                    <Ionicons name="sparkles" size={9} color={ACCENT} style={{ opacity: 0.4 }} />
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          </FadeInView>
        )}

        {/* 5. Firewall */}
        <FadeInView delay={540}>
          <ToolRow icon="shield-half" title="Firewall" sub="How would an AI recruiter judge you?" color={AMBER} onPress={() => toggleFeature('firewall')} active={activeFeature === 'firewall'} />
        </FadeInView>

        {activeFeature === 'firewall' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Profile Firewall</Text>
              <Text style={a.expandedSub}>How would an AI recruiter evaluate your profile? Find vulnerabilities before you apply.</Text>
              <AnimatedPressable style={[a.actionBtn, { backgroundColor: AMBER }]}
                onPress={() => openDillyOverlay({
                  isPaid: true,
                  initialMessage: `Analyze my Dilly Profile as if you were an AI screening tool at a top company. Based on everything you know about me, what vulnerabilities would you flag? What would get me auto-rejected? Be specific and harsh.`,
                })} scaleDown={0.97}>
                <Ionicons name="scan" size={16} color="#000" /><Text style={[a.actionBtnText, { color: '#000' }]}>Run Firewall Check</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        )}

        {/* 6. Disruption Index */}
        <FadeInView delay={560}>
          <ToolRow icon="bar-chart" title="Disruption Index" sub="How much AI is disrupting your field" color={AMBER} onPress={() => toggleFeature('index')} active={activeFeature === 'index'} />
        </FadeInView>

        {activeFeature === 'index' && shield && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Displacement Index</Text>
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={[a.bigNum, { color: disruptionPct >= 40 ? AMBER : disruptionPct >= 25 ? AMBER : GREEN }]}>{disruptionPct}%</Text>
                <Text style={{ fontSize: 12, color: SUB }}>of entry-level {(shield.cohort || '').split(' ')[0]} roles disrupted</Text>
              </View>
              {shield.disruption_headline && (
                <View style={a.quoteBox}><Text style={a.quoteText}>{shield.disruption_headline}</Text></View>
              )}
              {(shield.ai_resistant_skills?.length > 0 || shield.ai_vulnerable_skills?.length > 0) && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={[a.compCol, { backgroundColor: GREEN + '08', borderColor: GREEN + '20' }]}>
                    <Text style={[a.compLabel, { color: GREEN }]}>AI-PROOF</Text>
                    {(shield.ai_resistant_skills || []).slice(0, 4).map((s: string, i: number) => (
                      <Text key={i} style={a.compItem}>{s}</Text>
                    ))}
                  </View>
                  <View style={[a.compCol, { backgroundColor: AMBER + '08', borderColor: AMBER + '20' }]}>
                    <Text style={[a.compLabel, { color: AMBER }]}>AT RISK</Text>
                    {(shield.ai_vulnerable_skills || []).slice(0, 4).map((s: string, i: number) => (
                      <Text key={i} style={a.compItem}>{s}</Text>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </FadeInView>
        )}
        {/* /isHolder gate on everything below the moat section */}

        {/* ── Footer ──────────────────────────────────────────── */}
        <DillyFooter />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── HolderImpactCard styles. scoped to avoid collisions with `a`.
const h = StyleSheet.create({
  impactCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 16, borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  impactIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  impactLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.8,
  },
  impactText: {
    fontSize: 14, fontWeight: '600',
    color: '#F0F6FC', lineHeight: 20,
  },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const a = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, gap: 16 },

  // Act dividers
  actDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
    marginBottom: 4,
  },
  actLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER,
  },
  actLabelWrap: {
    alignItems: 'center',
    gap: 2,
  },
  actNumber: {
    fontSize: 10,
    fontWeight: '600',
    color: DIM,
    letterSpacing: 2,
  },
  actTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 2,
  },

  // Ring section (Act 1 hero)
  ringSection: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  ringScore: {
    fontSize: 48,
    fontWeight: '900',
    color: TEXT,
    marginTop: 8,
  },
  ringLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SUB,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Disruption statement
  disruptionStatement: {
    fontSize: 15,
    fontWeight: '600',
    color: SUB,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },

  // Act section headers
  actSectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: DIM,
    letterSpacing: 2,
    marginTop: 12,
    marginBottom: 2,
  },

  // Signal cards
  signalCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 4,
  },
  signalText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
    lineHeight: 20,
  },

  // Empty state
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: SUB,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: ACCENT + '12',
    borderWidth: 1,
    borderColor: ACCENT + '20',
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  addMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT,
  },

  // Recommendation card (Act 3)
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: ACCENT + '20',
    gap: 12,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
    lineHeight: 21,
  },

  // Skill pills
  skillPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: GREEN + '15',
    borderWidth: 1,
    borderColor: GREEN + '30',
  },
  skillPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: GREEN,
  },

  // Improve button
  improveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: ACCENT,
    marginTop: 4,
  },
  improveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: BG,
  },

  // Tools section header
  toolsSectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: DIM,
    letterSpacing: 2,
    marginTop: 28,
    marginBottom: 4,
  },

  // Tool rows
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    gap: 12,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTextWrap: {
    flex: 1,
    gap: 1,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  toolSub: {
    fontSize: 11,
    color: DIM,
    lineHeight: 15,
  },

  // Expanded card
  expandedCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  expandedTitle: { fontSize: 18, fontWeight: '800', color: TEXT },
  expandedSub: { fontSize: 12, color: SUB, lineHeight: 17 },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ACCENT,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Input
  input: {
    backgroundColor: BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: TEXT,
    minHeight: 44,
  },

  // Scan
  scanSummary: { flexDirection: 'row', gap: 8 },
  scanStat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  scanStatNum: { fontSize: 22, fontWeight: '800' },
  scanStatLabel: { fontSize: 9, color: SUB, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: BG,
    borderLeftWidth: 3,
    marginTop: 4,
  },
  bulletText: { fontSize: 12, color: TEXT, lineHeight: 17 },
  bulletReason: { fontSize: 10, color: DIM, marginTop: 2 },
  fixBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: ACCENT + '15' },
  fixBtnText: { fontSize: 10, fontWeight: '600', color: ACCENT },

  // Replace result
  resultCard: { backgroundColor: BG, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  resultVerdict: { fontSize: 14, fontWeight: '700', flex: 1 },
  resultScore: { fontSize: 18, fontWeight: '800', color: TEXT },
  resultWhy: { fontSize: 12, color: SUB, lineHeight: 17 },
  aiAttempt: { backgroundColor: CARD, borderRadius: 8, padding: 10, marginTop: 4 },
  aiAttemptLabel: { fontSize: 8, fontWeight: '700', color: DIM, letterSpacing: 1, marginBottom: 4 },
  aiAttemptText: { fontSize: 12, color: SUB, lineHeight: 17, fontStyle: 'italic' },
  fixInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: ACCENT + '12',
    borderWidth: 1,
    borderColor: ACCENT + '20',
  },

  // Simulation
  simVerdict: { fontSize: 13, fontWeight: '600', color: AMBER, lineHeight: 18 },
  yearRow: { flexDirection: 'row', gap: 10 },
  yearDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  yearContent: { flex: 1, backgroundColor: BG, borderRadius: 10, padding: 12, marginBottom: 6 },
  yearLabel: { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 1 },
  yearTitle: { fontSize: 13, fontWeight: '700', color: TEXT, marginTop: 4 },
  yearDesc: { fontSize: 11, color: SUB, lineHeight: 16, marginTop: 3 },
  yearBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  yearBadgeText: { fontSize: 10, fontWeight: '700' },
  strategyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: AMBER + '10',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: AMBER + '20',
  },
  strategyText: { flex: 1, fontSize: 12, color: AMBER, lineHeight: 17, fontWeight: '600' },

  // Skill vault
  skillUnlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: GREEN + '12',
    borderWidth: 1,
    borderColor: GREEN + '25',
  },
  skillUnlockedText: { fontSize: 11, fontWeight: '600', color: GREEN },
  skillLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: BORDER,
    borderWidth: 1,
    borderColor: BORDER,
  },
  skillLockedText: { fontSize: 11, fontWeight: '600', color: DIM },

  // Displacement
  bigNum: { fontSize: 56, fontWeight: '900' },
  quoteBox: { backgroundColor: BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER },
  quoteText: { fontSize: 13, color: TEXT, lineHeight: 19 },
  compCol: { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1 },
  compLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  compItem: { fontSize: 11, color: SUB, lineHeight: 16 },
});

// ── AI Threat Report styles ───────────────────────────────────────────
// Dark-background dashboard card that lives at the top of the Arena tab
// and works for everyone regardless of resume state.
const threatCard = StyleSheet.create({
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 18,
    marginBottom: 20,
    gap: 12,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#7C8FA7', letterSpacing: 1.8 },
  role: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', marginTop: 4, letterSpacing: -0.4 },
  levelBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
  },
  levelText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bigPct: { fontSize: 44, fontWeight: '900', color: '#F8FAFC', letterSpacing: -1.5, lineHeight: 48 },
  headline: { flex: 1, fontSize: 14, fontWeight: '700', color: '#CBD5E1', lineHeight: 19 },
  signalBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1E293B', borderRadius: 10, padding: 10,
    borderLeftWidth: 2, borderLeftColor: '#22D3EE',
  },
  signalText: { flex: 1, fontSize: 11, color: '#E2E8F0', lineHeight: 16, fontStyle: 'italic' },
  sectionLabel: { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 1.2, marginTop: 4, marginBottom: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 12, color: '#CBD5E1', lineHeight: 17 },
  forecastBox: {
    backgroundColor: '#1E293B', borderRadius: 10, padding: 10, marginTop: 6,
  },
  forecastLabel: { fontSize: 9, fontWeight: '900', color: '#22D3EE', letterSpacing: 1.2, marginBottom: 4 },
  forecastText: { fontSize: 12, color: '#E2E8F0', lineHeight: 17, fontWeight: '500' },
  dillyTake: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#22D3EE' + '14', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#22D3EE' + '30',
  },
  dillyTakeText: { flex: 1, fontSize: 12, color: '#E2E8F0', lineHeight: 17, fontWeight: '600' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#22D3EE', paddingVertical: 12, borderRadius: 12, marginTop: 4,
  },
  ctaBtnText: { fontSize: 13, fontWeight: '800', color: '#0B1426', letterSpacing: 0.1 },

  // Prompt card (when no role resolved yet)
  promptCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16, borderWidth: 1, borderColor: '#22D3EE' + '50',
    padding: 18, marginBottom: 20, gap: 10,
  },
  promptEyebrow: { fontSize: 10, fontWeight: '900', color: '#22D3EE', letterSpacing: 1.8 },
  promptTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.4 },
  promptSub: { fontSize: 13, color: '#94A3B8', lineHeight: 19 },
  promptInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10, borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#F8FAFC',
    marginTop: 6,
  },
  promptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#22D3EE', paddingVertical: 14, borderRadius: 12, marginTop: 4,
  },
  promptBtnText: { fontSize: 14, fontWeight: '800', color: '#0B1426' },
});

// ── This Week in Your Field styles ──────────────────────────────────
// Dark news-brief card that reads like a real-time Bloomberg ticker
// for the user's career. Lives right above the Act I shield ring.
const weekly = StyleSheet.create({
  card: {
    backgroundColor: '#0B1426',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrowPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.35)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  livePulse: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22D3EE' },
  eyebrowText: { fontSize: 9, fontWeight: '900', color: '#22D3EE', letterSpacing: 1.2 },
  weekLabel: { fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.6 },
  headline: { fontSize: 15, fontWeight: '800', color: '#F8FAFC', lineHeight: 21, letterSpacing: -0.2 },
  source: { fontSize: 11, color: '#94A3B8', fontStyle: 'italic' },
  dataBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#111827', borderRadius: 8, padding: 10,
    borderLeftWidth: 2, borderLeftColor: '#22D3EE',
  },
  dataText: { flex: 1, fontSize: 12, color: '#E2E8F0', fontWeight: '600' },
  moveBox: {
    backgroundColor: '#1F2937', borderRadius: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: '#22D3EE',
  },
  moveLabel: { fontSize: 9, fontWeight: '900', color: '#22D3EE', letterSpacing: 1.2, marginBottom: 4 },
  moveText: { fontSize: 13, color: '#F8FAFC', fontWeight: '600', lineHeight: 18 },
});
