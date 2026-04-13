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

function SignalCard({ signal, reason, accentColor }: { signal: string; reason: string; accentColor: string }) {
  return (
    <View style={[a.signalCard, { borderLeftColor: accentColor }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={a.signalText}>{signal}</Text>
        <Text style={a.signalReason}>{reason}</Text>
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

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function AIArenaScreen() {
  const insets = useSafeAreaInsets();
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

  const fetchShield = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 30_000);
      const res = await dilly.fetch('/ai-arena/shield', { signal: ctrl.signal });
      if (res.ok) setShield(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await fetchShield();
      setLoading(false);
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    mediumHaptic();
    setRefreshing(true);
    await fetchShield();
    setRefreshing(false);
  }, [fetchShield]);

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
    return (
      <View style={[a.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[a.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={[a.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} progressBackgroundColor={BG} />}
      >

        {/* Header */}
        <FadeInView delay={0}>
          <View style={{ paddingTop: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: TEXT, lineHeight: 28 }}>Let's see how AI will impact your career.</Text>
            <Text style={{ fontSize: 14, color: SUB, marginTop: 6 }}>Don't worry. We know exactly how to help you.</Text>
          </View>
        </FadeInView>

        {/* ════════════════════════════════════════════════════════
            ACT 1: THE THREAT
            ════════════════════════════════════════════════════════ */}

        <FadeInView delay={40}>
          <ActDivider number="I" title="THE THREAT" />
        </FadeInView>

        {/* Shield Score Ring -- centered, big */}
        <FadeInView delay={60}>
          <View style={a.ringSection}>
            <ShieldRing score={shieldScore} size={120} />
            <Text style={a.ringScore}>{Math.round(shieldScore)}</Text>
            <Text style={a.ringLabel}>{shieldLabel || 'AI SHIELD SCORE'}</Text>
          </View>
        </FadeInView>

        {/* Disruption stat */}
        <FadeInView delay={100}>
          <Text style={a.disruptionStatement}>
            In {cohort}, AI is disrupting {disruptionPct}% of entry-level roles.
          </Text>
        </FadeInView>

        {/* Vulnerable signals */}
        <FadeInView delay={140}>
          <Text style={a.actSectionHeader}>YOUR VULNERABLE SPOTS</Text>
        </FadeInView>

        {vulnerableSignals.length > 0 ? (
          vulnerableSignals.map((sig: any, i: number) => (
            <FadeInView key={`v-${i}`} delay={160 + i * 30}>
              <SignalCard
                signal={typeof sig === 'string' ? sig : sig.signal || sig.text || ''}
                reason={typeof sig === 'string' ? 'AI tools can automate or replicate this skill today.' : sig.reason || sig.why || 'AI tools can automate or replicate this skill today.'}
                accentColor={AMBER}
              />
            </FadeInView>
          ))
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
          <Text style={a.actSectionHeader}>WHAT AI CAN'T TOUCH</Text>
        </FadeInView>

        {resistantSignals.length > 0 ? (
          resistantSignals.map((sig: any, i: number) => (
            <FadeInView key={`r-${i}`} delay={240 + i * 30}>
              <SignalCard
                signal={typeof sig === 'string' ? sig : sig.signal || sig.text || ''}
                reason={typeof sig === 'string' ? 'This requires human judgment, creativity, or relationships that AI cannot replicate.' : sig.reason || sig.why || 'This requires human judgment, creativity, or relationships that AI cannot replicate.'}
                accentColor={GREEN}
              />
            </FadeInView>
          ))
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
            ACT 3: YOUR PLAYBOOK
            ════════════════════════════════════════════════════════ */}

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


        {/* ════════════════════════════════════════════════════════
            TOOLS SECTION
            ════════════════════════════════════════════════════════ */}

        <FadeInView delay={440}>
          <Text style={a.toolsSectionHeader}>AI TOOLS</Text>
        </FadeInView>

        {/* 1. Threat Scanner */}
        <FadeInView delay={460}>
          <ToolRow icon="scan" title="Threat Scanner" sub="See which bullets AI can replace" color={ACCENT} onPress={() => toggleFeature('scan')} active={activeFeature === 'scan'} />
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
          <ToolRow icon="swap-horizontal" title="Replace Me" sub="Can AI do what you do?" color={AMBER} onPress={() => toggleFeature('replace')} active={activeFeature === 'replace'} />
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
          <ToolRow icon="rocket" title="Career Sim" sub="See how AI reshapes your career over 5 years" color={AMBER} onPress={() => toggleFeature('simulate')} active={activeFeature === 'simulate'} />
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

        {/* ── Footer ──────────────────────────────────────────── */}
        <DillyFooter />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 4,
    gap: 10,
  },
  signalText: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    lineHeight: 18,
  },
  signalReason: {
    fontSize: 11,
    color: DIM,
    lineHeight: 16,
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
