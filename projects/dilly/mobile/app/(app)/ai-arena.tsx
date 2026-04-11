/**
 * AI Arena — the AI readiness command center.
 *
 * Hub design: headline + shield + feature grid at the top.
 * Tapping a feature card expands it inline with full content.
 * Dark-themed throughout. Every element interactive.
 *
 * "Everything for $9.99? I'd pay $9.99 just for this."
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Animated, Easing, Alert, LayoutAnimation, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

const W = Dimensions.get('window').width;
const BG = '#0D1117';
const CARD = '#161B22';
const BORDER = '#21262D';
const COBALT = '#1652F0';
const CYAN = '#58A6FF';
const GREEN = '#3FB950';
const AMBER = '#D29922';
const RED = '#F85149';
const TEXT = '#F0F6FC';
const SUB = '#8B949E';
const DIM = '#484F58';

type ActiveFeature = null | 'scan' | 'replace' | 'simulate' | 'firewall' | 'vault' | 'index';

// ── Shield Ring ──────────────────────────────────────────────────────────────

function ShieldRing({ score, size = 100 }: { score: number; size?: number }) {
  const sw = 5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 80 ? GREEN : score >= 60 ? COBALT : score >= 40 ? AMBER : RED;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth={sw} fill="transparent" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={sw} fill="transparent"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Ionicons name="shield-checkmark" size={24} color={color} />
        <Text style={{ fontSize: 28, fontWeight: '900', color: TEXT, marginTop: 2 }}>{Math.round(score)}</Text>
      </View>
    </View>
  );
}

// ── Feature Card (hub grid item) ─────────────────────────────────────────────

function FeatureCard({ icon, title, sub, color, onPress, active }: {
  icon: string; title: string; sub: string; color: string;
  onPress: () => void; active: boolean;
}) {
  return (
    <AnimatedPressable
      style={[a.featureCard, active && { borderColor: color + '50', backgroundColor: color + '08' }]}
      onPress={onPress}
      scaleDown={0.96}
    >
      <View style={[a.featureIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={a.featureTitle}>{title}</Text>
      <Text style={a.featureSub} numberOfLines={2}>{sub}</Text>
    </AnimatedPressable>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function AIArenaScreen() {
  const insets = useSafeAreaInsets();
  const [shield, setShield] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>(null);

  // Feature-specific state
  const [scanResults, setScanResults] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [replaceInput, setReplaceInput] = useState('');
  const [replaceResult, setReplaceResult] = useState<any>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [simJob, setSimJob] = useState('');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 30_000);
        const res = await dilly.fetch('/ai-arena/shield', { signal: ctrl.signal });
        if (res.ok) setShield(await res.json());
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

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
    if (replaceInput.trim().length < 10) return;
    setReplaceLoading(true);
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 30_000);
      const res = await dilly.fetch('/ai-arena/replace-test', { method: 'POST', body: JSON.stringify({ bullet: replaceInput.trim() }), signal: ctrl.signal });
      if (res.ok) { const d = await res.json(); setReplaceResult(d); }
    } catch {} finally { setReplaceLoading(false); }
  }, [replaceInput]);

  // Simulate
  const runSim = useCallback(async () => {
    if (!simJob.trim()) return;
    setSimLoading(true);
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 60_000);
      const res = await dilly.fetch('/ai-arena/simulate', { method: 'POST', body: JSON.stringify({ job_title: simJob.trim() }), signal: ctrl.signal });
      if (res.ok) { const d = await res.json(); setSimResult(d); }
    } catch {} finally { setSimLoading(false); }
  }, [simJob]);

  const shieldScore = shield?.shield_score ?? 0;
  const shieldLabel = shield?.shield_label ?? '';
  const disruptionPct = shield?.disruption_pct ?? 0;

  if (loading) {
    return (
      <View style={[a.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={CYAN} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[a.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={[a.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Headline ──────────────────────────────────────── */}
        <FadeInView delay={0}>
          <Text style={a.headline}>AI is coming for your job.{'\n'}Are you ready?</Text>
        </FadeInView>

        {/* ── Shield Score Hero ──────────────────────────────── */}
        <FadeInView delay={60}>
          <View style={a.heroCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
              <ShieldRing score={shieldScore} />
              <View style={{ flex: 1 }}>
                <Text style={a.heroLabel}>{shieldLabel || 'AI Readiness'}</Text>
                <Text style={a.heroSub}>
                  {shieldScore >= 80 ? 'Your profile is AI-proof.'
                    : shieldScore >= 60 ? 'Strong foundation. A few fixes will fortify you.'
                    : shieldScore >= 40 ? 'Some vulnerabilities detected. Dilly can help.'
                    : shieldScore > 0 ? 'Your profile needs AI-proofing. Let Dilly show you how.'
                    : 'Upload your resume or talk to Dilly to activate your Shield Score.'}
                </Text>
                {disruptionPct > 0 && (
                  <View style={a.disruptionBadge}>
                    <Ionicons name="trending-up" size={10} color={RED} />
                    <Text style={a.disruptionText}>{disruptionPct}% of your field disrupted</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </FadeInView>

        {/* ── Feature Grid ──────────────────────────────────── */}
        <FadeInView delay={120}>
          <View style={a.grid}>
            <FeatureCard icon="scan" title="Threat Scanner" sub="See which parts of your experience AI can replace" color={CYAN} onPress={() => toggleFeature('scan')} active={activeFeature === 'scan'} />
            <FeatureCard icon="swap-horizontal" title="Replace Me" sub="Can AI do what you do? Let's find out." color={RED} onPress={() => toggleFeature('replace')} active={activeFeature === 'replace'} />
            <FeatureCard icon="rocket" title="Career Sim" sub="See how AI reshapes your career over 5 years" color={AMBER} onPress={() => toggleFeature('simulate')} active={activeFeature === 'simulate'} />
            <FeatureCard icon="shield-half" title="Firewall" sub="How would an AI recruiter judge you?" color={RED} onPress={() => toggleFeature('firewall')} active={activeFeature === 'firewall'} />
            <FeatureCard icon="lock-closed" title="Skill Vault" sub="Your AI-proof skills vs the ones you need" color={GREEN} onPress={() => toggleFeature('vault')} active={activeFeature === 'vault'} />
            <FeatureCard icon="bar-chart" title="Disruption" sub="How much AI is disrupting your field right now" color={AMBER} onPress={() => toggleFeature('index')} active={activeFeature === 'index'} />
          </View>
        </FadeInView>

        {/* ── Expanded Feature Content ──────────────────────── */}

        {/* THREAT SCANNER */}
        {activeFeature === 'scan' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Threat Scanner</Text>
              <Text style={a.expandedSub}>Every skill and experience in your Dilly Profile, analyzed for AI vulnerability.</Text>
              {!scanResults && !scanLoading && (
                <AnimatedPressable style={a.actionBtn} onPress={runScan} scaleDown={0.97}>
                  <Ionicons name="flash" size={16} color="#000" />
                  <Text style={a.actionBtnText}>Scan My Profile</Text>
                </AnimatedPressable>
              )}
              {scanLoading && <ActivityIndicator size="small" color={CYAN} style={{ paddingVertical: 20 }} />}
              {scanResults && (
                <>
                  <View style={a.scanSummary}>
                    <View style={[a.scanStat, { backgroundColor: GREEN + '15' }]}>
                      <Text style={[a.scanStatNum, { color: GREEN }]}>{scanResults.summary?.safe ?? 0}</Text>
                      <Text style={a.scanStatLabel}>Safe</Text>
                    </View>
                    <View style={[a.scanStat, { backgroundColor: RED + '15' }]}>
                      <Text style={[a.scanStatNum, { color: RED }]}>{scanResults.summary?.at_risk ?? 0}</Text>
                      <Text style={a.scanStatLabel}>At Risk</Text>
                    </View>
                    <View style={[a.scanStat, { backgroundColor: AMBER + '15' }]}>
                      <Text style={[a.scanStatNum, { color: AMBER }]}>{scanResults.summary?.neutral ?? 0}</Text>
                      <Text style={a.scanStatLabel}>Neutral</Text>
                    </View>
                  </View>
                  {(scanResults.bullets || []).slice(0, 10).map((b: any, i: number) => {
                    const c = b.status === 'safe' ? GREEN : b.status === 'at_risk' ? RED : AMBER;
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

        {/* REPLACE ME */}
        {activeFeature === 'replace' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Can AI Replace You?</Text>
              <Text style={a.expandedSub}>Paste a bullet. AI will try to write it. See if it can.</Text>
              <TextInput style={a.input} value={replaceInput} onChangeText={setReplaceInput}
                placeholder="Paste a bullet from your profile..." placeholderTextColor={DIM} multiline />
              <AnimatedPressable
                style={[a.actionBtn, { backgroundColor: RED, opacity: replaceInput.trim().length < 10 ? 0.4 : 1 }]}
                onPress={runReplace} disabled={replaceInput.trim().length < 10 || replaceLoading} scaleDown={0.97}
              >
                {replaceLoading ? <ActivityIndicator size="small" color="#000" /> : (
                  <><Ionicons name="flash" size={16} color="#000" /><Text style={a.actionBtnText}>Test It</Text></>
                )}
              </AnimatedPressable>
              {replaceResult && (
                <View style={[a.resultCard, { borderColor: replaceResult.verdict === 'human-only' ? GREEN + '40' : replaceResult.verdict === 'replaceable' ? RED + '40' : AMBER + '40' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name={replaceResult.verdict === 'human-only' ? 'shield-checkmark' : replaceResult.verdict === 'replaceable' ? 'warning' : 'help-circle'}
                      size={18} color={replaceResult.verdict === 'human-only' ? GREEN : replaceResult.verdict === 'replaceable' ? RED : AMBER} />
                    <Text style={[a.resultVerdict, { color: replaceResult.verdict === 'human-only' ? GREEN : replaceResult.verdict === 'replaceable' ? RED : AMBER }]}>
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
                      onPress={() => openDillyOverlay({ isPaid: true, initialMessage: `AI rated my bullet ${replaceResult.replaceability}/10 replaceable: "${replaceInput}". Rewrite it so AI CAN'T replicate it.` })}
                      scaleDown={0.97}>
                      <Ionicons name="sparkles" size={12} color={CYAN} /><Text style={{ fontSize: 12, fontWeight: '600', color: CYAN }}>Make it AI-proof</Text>
                    </AnimatedPressable>
                  )}
                </View>
              )}
            </View>
          </FadeInView>
        )}

        {/* CAREER SIMULATOR */}
        {activeFeature === 'simulate' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Career Simulator</Text>
              <Text style={a.expandedSub}>See how AI transforms your dream role over 5 years.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[a.input, { flex: 1 }]} value={simJob} onChangeText={setSimJob}
                  placeholder="Job title (e.g. Data Scientist)" placeholderTextColor={DIM} />
                <AnimatedPressable
                  style={[a.actionBtn, { paddingHorizontal: 16, backgroundColor: AMBER, opacity: simJob.trim() ? 1 : 0.4 }]}
                  onPress={runSim} disabled={!simJob.trim() || simLoading} scaleDown={0.97}>
                  {simLoading ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="rocket" size={16} color="#000" />}
                </AnimatedPressable>
              </View>
              {simResult && (
                <>
                  <Text style={a.simVerdict}>{simResult.verdict}</Text>
                  {(simResult.years || []).map((y: any, i: number) => {
                    const yc = y.risk_level === 'high' ? RED : y.risk_level === 'medium' ? AMBER : GREEN;
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

        {/* RESUME FIREWALL */}
        {activeFeature === 'firewall' && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Profile Firewall</Text>
              <Text style={a.expandedSub}>How would an AI recruiter evaluate your profile? Find vulnerabilities before you apply.</Text>
              <AnimatedPressable style={[a.actionBtn, { backgroundColor: RED }]}
                onPress={() => openDillyOverlay({
                  isPaid: true,
                  initialMessage: `Analyze my Dilly Profile as if you were an AI screening tool at a top company. Based on everything you know about me, what vulnerabilities would you flag? What would get me auto-rejected? Be specific and harsh.`,
                })} scaleDown={0.97}>
                <Ionicons name="scan" size={16} color="#000" /><Text style={a.actionBtnText}>Run Firewall Check</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        )}

        {/* SKILL VAULT */}
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
                    <Ionicons name="sparkles" size={9} color={CYAN} style={{ opacity: 0.4 }} />
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          </FadeInView>
        )}

        {/* DISPLACEMENT INDEX */}
        {activeFeature === 'index' && shield && (
          <FadeInView delay={0}>
            <View style={a.expandedCard}>
              <Text style={a.expandedTitle}>Displacement Index</Text>
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={[a.bigNum, { color: disruptionPct >= 40 ? RED : disruptionPct >= 25 ? AMBER : GREEN }]}>{disruptionPct}%</Text>
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
                  <View style={[a.compCol, { backgroundColor: RED + '08', borderColor: RED + '20' }]}>
                    <Text style={[a.compLabel, { color: RED }]}>AT RISK</Text>
                    {(shield.ai_vulnerable_skills || []).slice(0, 4).map((s: string, i: number) => (
                      <Text key={i} style={a.compItem}>{s}</Text>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </FadeInView>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const a = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, gap: 16 },

  headline: { fontSize: 24, fontWeight: '900', color: TEXT, lineHeight: 30, paddingTop: 12, letterSpacing: -0.5 },

  // Hero
  heroCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: BORDER },
  heroLabel: { fontSize: 16, fontWeight: '700', color: TEXT },
  heroSub: { fontSize: 12, color: SUB, lineHeight: 17, marginTop: 4 },
  disruptionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start', backgroundColor: RED + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  disruptionText: { fontSize: 10, fontWeight: '600', color: RED },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureCard: {
    width: (W - 40 - 10) / 2, backgroundColor: CARD, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: BORDER, gap: 6,
  },
  featureIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 13, fontWeight: '700', color: TEXT },
  featureSub: { fontSize: 10, color: DIM, lineHeight: 14 },

  // Expanded
  expandedCard: { backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER, gap: 10 },
  expandedTitle: { fontSize: 18, fontWeight: '800', color: TEXT },
  expandedSub: { fontSize: 12, color: SUB, lineHeight: 17 },

  // Action button
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: CYAN },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },

  // Input
  input: { backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: TEXT, minHeight: 44 },

  // Scan
  scanSummary: { flexDirection: 'row', gap: 8 },
  scanStat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  scanStatNum: { fontSize: 22, fontWeight: '800' },
  scanStatLabel: { fontSize: 9, color: SUB, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: BG, borderLeftWidth: 3, marginTop: 4 },
  bulletText: { fontSize: 12, color: TEXT, lineHeight: 17 },
  bulletReason: { fontSize: 10, color: DIM, marginTop: 2 },
  fixBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: CYAN + '15' },
  fixBtnText: { fontSize: 10, fontWeight: '600', color: CYAN },

  // Replace result
  resultCard: { backgroundColor: BG, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  resultVerdict: { fontSize: 14, fontWeight: '700', flex: 1 },
  resultScore: { fontSize: 18, fontWeight: '800', color: TEXT },
  resultWhy: { fontSize: 12, color: SUB, lineHeight: 17 },
  aiAttempt: { backgroundColor: CARD, borderRadius: 8, padding: 10, marginTop: 4 },
  aiAttemptLabel: { fontSize: 8, fontWeight: '700', color: DIM, letterSpacing: 1, marginBottom: 4 },
  aiAttemptText: { fontSize: 12, color: SUB, lineHeight: 17, fontStyle: 'italic' },
  fixInline: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: CYAN + '12', borderWidth: 1, borderColor: CYAN + '20' },

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
  strategyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: AMBER + '10', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: AMBER + '20' },
  strategyText: { flex: 1, fontSize: 12, color: AMBER, lineHeight: 17, fontWeight: '600' },

  // Skill vault
  skillUnlocked: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: GREEN + '12', borderWidth: 1, borderColor: GREEN + '25' },
  skillUnlockedText: { fontSize: 11, fontWeight: '600', color: GREEN },
  skillLocked: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: BORDER, borderWidth: 1, borderColor: BORDER },
  skillLockedText: { fontSize: 11, fontWeight: '600', color: DIM },

  // Displacement
  bigNum: { fontSize: 56, fontWeight: '900' },
  quoteBox: { backgroundColor: BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER },
  quoteText: { fontSize: 13, color: TEXT, lineHeight: 19 },
  compCol: { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1 },
  compLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  compItem: { fontSize: 11, color: SUB, lineHeight: 16 },
});
