/**
 * AI Arena — AI Readiness Command Center.
 *
 * Dark variant of the Dilly design system.
 * Uses indigo + green + amber only. No rainbow.
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

// Dark navy background, off-white accents
const BG = '#111827';
const CARD = '#1F2937';
const BORDER = '#374151';
const ACCENT = '#F0F0F0';        // off-white accent (replaces dark blue)
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const TEXT = '#F9FAFB';
const SUB = '#9CA3AF';
const DIM = '#6B7280';

type ActiveFeature = null | 'scan' | 'replace' | 'simulate' | 'firewall' | 'vault' | 'index';

// ── Shield Ring ──────────────────────────────────────────────────────────────

function ShieldRing({ score, size = 100 }: { score: number; size?: number }) {
  const sw = 5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 80 ? GREEN : score >= 60 ? ACCENT : score >= 40 ? AMBER : AMBER;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth={sw} fill="transparent" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={sw} fill="transparent"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Ionicons name="shield-checkmark" size={28} color={color} />
        <Text style={{ fontSize: 32, fontWeight: '900', color: TEXT, marginTop: 2 }}>{Math.round(score)}</Text>
      </View>
    </View>
  );
}

// ── Feature Card (full-width horizontal) ────────────────────────────────────

function FeatureCard({ icon, title, sub, color, onPress, active }: {
  icon: string; title: string; sub: string; color: string;
  onPress: () => void; active: boolean;
}) {
  return (
    <AnimatedPressable
      style={[
        a.featureCard,
        active && { borderLeftColor: color, borderLeftWidth: 4, backgroundColor: color + '06' },
      ]}
      onPress={onPress}
      scaleDown={0.98}
    >
      <View style={[a.featureIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={a.featureTextWrap}>
        <Text style={a.featureTitle}>{title}</Text>
        <Text style={a.featureSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={active ? color : DIM} />
    </AnimatedPressable>
  );
}

// ── Threat Level Badge ──────────────────────────────────────────────────────

function ThreatBadge({ score }: { score: number }) {
  const level = score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : score >= 40 ? 'HIGH' : 'CRITICAL';
  const color = score >= 80 ? GREEN : score >= 60 ? ACCENT : score >= 40 ? AMBER : AMBER;
  return (
    <View style={[a.threatBadge, { backgroundColor: color + '18', borderColor: color + '30' }]}>
      <View style={[a.threatDot, { backgroundColor: color }]} />
      <Text style={[a.threatText, { color }]}>{level}</Text>
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

  // Derive threat-level color for disruption bar
  const disruptionColor = disruptionPct >= 50 ? AMBER : disruptionPct >= 30 ? AMBER : GREEN;

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

        {/* ── 1. Header ──────────────────────────────────────── */}
        <FadeInView delay={0}>
          <Text style={a.header}>AI READINESS</Text>
        </FadeInView>

        {/* ── 2. Shield Score Hero ────────────────────────────── */}
        <FadeInView delay={60}>
          <View style={a.heroCard}>
            <View style={a.heroRow}>
              <ShieldRing score={shieldScore} size={120} />
              <View style={a.heroInfo}>
                <Text style={a.heroScore}>{Math.round(shieldScore)}</Text>
                <Text style={a.heroLabel}>{shieldLabel || 'AI SHIELD SCORE'}</Text>
                <ThreatBadge score={shieldScore} />
              </View>
            </View>

            {/* Disruption bar */}
            <View style={a.disruptionSection}>
              <View style={a.disruptionLabelRow}>
                <Text style={a.disruptionLabel}>FIELD DISRUPTION</Text>
                <Text style={[a.disruptionValue, { color: disruptionColor }]}>{disruptionPct}%</Text>
              </View>
              <View style={a.disruptionBarBg}>
                <View style={[a.disruptionBarFill, { width: `${Math.min(disruptionPct, 100)}%`, backgroundColor: disruptionColor }]} />
              </View>
            </View>
          </View>
        </FadeInView>

        {/* ── 3. Live Stats Row (2 stats: Shield Score + Field Disruption) ── */}
        <FadeInView delay={100}>
          <View style={a.statsRow}>
            <View style={a.statCard}>
              <Text style={[a.statNum, { color: ACCENT }]}>{Math.round(shieldScore)}</Text>
              <Text style={a.statLabel}>SHIELD SCORE</Text>
            </View>
            <View style={a.statCard}>
              <Text style={[a.statNum, { color: disruptionColor }]}>{disruptionPct}%</Text>
              <Text style={a.statLabel}>FIELD DISRUPTION</Text>
            </View>
          </View>
        </FadeInView>

        {/* ── 4. Feature Sections ─────────────────────────────── */}
        <FadeInView delay={140}>
          <Text style={a.sectionTitle}>COMMAND CENTER</Text>
        </FadeInView>

        <FadeInView delay={160}>
          <FeatureCard icon="scan" title="Threat Scanner" sub="See which bullets AI can replace" color={ACCENT} onPress={() => toggleFeature('scan')} active={activeFeature === 'scan'} />
        </FadeInView>

        {/* THREAT SCANNER expanded */}
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

        <FadeInView delay={180}>
          <FeatureCard icon="swap-horizontal" title="Replace Me" sub="Can AI do what you do? Let's find out." color={AMBER} onPress={() => toggleFeature('replace')} active={activeFeature === 'replace'} />
        </FadeInView>

        {/* REPLACE ME expanded */}
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

        <FadeInView delay={200}>
          <FeatureCard icon="rocket" title="Career Sim" sub="See how AI reshapes your career over 5 years" color={AMBER} onPress={() => toggleFeature('simulate')} active={activeFeature === 'simulate'} />
        </FadeInView>

        {/* CAREER SIMULATOR expanded */}
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

        <FadeInView delay={220}>
          <FeatureCard icon="lock-closed" title="Skill Vault" sub="Your AI-proof skills vs the ones you need" color={GREEN} onPress={() => toggleFeature('vault')} active={activeFeature === 'vault'} />
        </FadeInView>

        {/* SKILL VAULT expanded */}
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

        <FadeInView delay={240}>
          <FeatureCard icon="shield-half" title="Firewall" sub="How would an AI recruiter judge you?" color={AMBER} onPress={() => toggleFeature('firewall')} active={activeFeature === 'firewall'} />
        </FadeInView>

        {/* RESUME FIREWALL expanded */}
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

        <FadeInView delay={260}>
          <FeatureCard icon="bar-chart" title="Disruption Index" sub="How much AI is disrupting your field right now" color={AMBER} onPress={() => toggleFeature('index')} active={activeFeature === 'index'} />
        </FadeInView>

        {/* DISPLACEMENT INDEX expanded */}
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

        {/* ── 5. AI Readiness Actions ─────────────────────────── */}
        <FadeInView delay={300}>
          <Text style={a.sectionTitle}>AI READINESS ACTIONS</Text>
        </FadeInView>

        <FadeInView delay={320}>
          <AnimatedPressable
            style={a.actionCard}
            onPress={() => openDillyOverlay({ isPaid: true, initialMessage: 'Is my resume AI-proof? Analyze every bullet for AI vulnerability and tell me exactly what to fix.' })}
            scaleDown={0.98}
          >
            <View style={[a.actionCardIcon, { backgroundColor: ACCENT + '15' }]}>
              <Ionicons name="document-text" size={20} color={ACCENT} />
            </View>
            <View style={a.actionCardTextWrap}>
              <Text style={a.actionCardTitle}>Is my resume AI-proof?</Text>
              <Text style={a.actionCardSub}>Get a full vulnerability analysis from Dilly</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={ACCENT} />
          </AnimatedPressable>
        </FadeInView>

        <FadeInView delay={340}>
          <AnimatedPressable
            style={a.actionCard}
            onPress={() => openDillyOverlay({ isPaid: true, initialMessage: 'What skills should I develop to stay ahead of AI in my field? Be specific to my profile and career goals.' })}
            scaleDown={0.98}
          >
            <View style={[a.actionCardIcon, { backgroundColor: GREEN + '15' }]}>
              <Ionicons name="trending-up" size={20} color={GREEN} />
            </View>
            <View style={a.actionCardTextWrap}>
              <Text style={a.actionCardTitle}>What skills should I develop?</Text>
              <Text style={a.actionCardSub}>AI-proof skill recommendations for your career</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={GREEN} />
          </AnimatedPressable>
        </FadeInView>

        {/* ── 6. Footer ──────────────────────────────────────── */}
        <DillyFooter />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const a = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, gap: 20 },

  // 1. Header
  header: {
    fontSize: 14,
    fontWeight: '700',
    color: SUB,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'Cinzel' : undefined,
  },

  // 2. Hero
  heroCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  heroInfo: {
    flex: 1,
    gap: 4,
  },
  heroScore: {
    fontSize: 44,
    fontWeight: '900',
    color: TEXT,
    lineHeight: 48,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SUB,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  threatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  threatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  threatText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  disruptionSection: {
    gap: 6,
  },
  disruptionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disruptionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: DIM,
    letterSpacing: 1,
  },
  disruptionValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  disruptionBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: BORDER,
    overflow: 'hidden',
  },
  disruptionBarFill: {
    height: 6,
    borderRadius: 3,
  },

  // 3. Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: DIM,
    letterSpacing: 0.8,
    textAlign: 'center',
  },

  // Section title
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: DIM,
    letterSpacing: 1.5,
    marginTop: 4,
  },

  // 4. Feature cards (full-width horizontal)
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  featureSub: {
    fontSize: 11,
    color: DIM,
    lineHeight: 15,
  },

  // Expanded
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

  // 5. Action cards
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 14,
  },
  actionCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  actionCardSub: {
    fontSize: 11,
    color: DIM,
    lineHeight: 15,
  },
});
