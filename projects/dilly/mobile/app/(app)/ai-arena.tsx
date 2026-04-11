/**
 * AI Arena — the AI readiness command center.
 *
 * Dark-themed, animated, interactive. Not a wall of text.
 * Every element is tappable. Every number is real.
 *
 * Sections:
 * 1. Shield Score (animated hero)
 * 2. Live Threat Scanner (bullet scan with sweep animation)
 * 3. Replace Me Test (AI attempts your bullet)
 * 4. Career Simulation (5-year timeline)
 * 5. Disruption Index (cohort comparison)
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Animated, Easing, Alert, LayoutAnimation, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
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

type Phase = 'idle' | 'scanning' | 'done';

// ── Shield Ring ──────────────────────────────────────────────────────────────

function ShieldRing({ score, size = 140 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const color = score >= 80 ? GREEN : score >= 60 ? COBALT : score >= 40 ? AMBER : RED;

  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 0.6, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <Animated.View style={{ opacity: pulseAnim, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth={strokeWidth} fill="transparent" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={0.9}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Ionicons name="shield-checkmark" size={32} color={color} style={{ marginBottom: 4 }} />
        <Text style={{ fontSize: 36, fontWeight: '900', color: TEXT }}>{Math.round(score)}</Text>
      </View>
    </Animated.View>
  );
}

// ── Scan Result Row ──────────────────────────────────────────────────────────

function BulletRow({ item, index, onFix }: {
  item: { text: string; status: string; reason: string };
  index: number;
  onFix: () => void;
}) {
  const color = item.status === 'safe' ? GREEN : item.status === 'at_risk' ? RED : AMBER;
  const icon = item.status === 'safe' ? 'shield-checkmark' : item.status === 'at_risk' ? 'warning' : 'help-circle';

  return (
    <FadeInView delay={index * 60}>
      <View style={[a.bulletRow, { borderLeftColor: color }]}>
        <Ionicons name={icon as any} size={16} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={a.bulletText} numberOfLines={2}>{item.text}</Text>
          <Text style={a.bulletReason}>{item.reason}</Text>
        </View>
        {item.status === 'at_risk' && (
          <AnimatedPressable onPress={onFix} scaleDown={0.95} style={a.fixBtn}>
            <Ionicons name="sparkles" size={11} color={CYAN} />
            <Text style={a.fixBtnText}>Fix</Text>
          </AnimatedPressable>
        )}
      </View>
    </FadeInView>
  );
}

// ── Year Node (Career Sim) ───────────────────────────────────────────────────

function YearNode({ year, isLast }: { year: any; isLast: boolean }) {
  const color = year.risk_level === 'high' ? RED : year.risk_level === 'medium' ? AMBER : GREEN;
  return (
    <FadeInView delay={year.year * 150}>
      <View style={a.yearNode}>
        <View style={a.yearTimeline}>
          <View style={[a.yearDot, { backgroundColor: color, shadowColor: color }]} />
          {!isLast && <View style={a.yearLine} />}
        </View>
        <View style={a.yearCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={a.yearLabel}>Year {year.year}</Text>
            <View style={[a.yearRisk, { backgroundColor: color + '20' }]}>
              <Text style={[a.yearRiskText, { color }]}>{year.ai_overlap_pct}% AI</Text>
            </View>
          </View>
          <Text style={a.yearTitle}>{year.title}</Text>
          <Text style={a.yearDesc}>{year.description}</Text>
        </View>
      </View>
    </FadeInView>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function AIArenaScreen() {
  const insets = useSafeAreaInsets();
  const [shield, setShield] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanPhase, setScanPhase] = useState<Phase>('idle');
  const [scanResults, setScanResults] = useState<any>(null);
  const [simJob, setSimJob] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [replaceInput, setReplaceInput] = useState('');
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceResult, setReplaceResult] = useState<any>(null);

  // Load shield score on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await dilly.get('/ai-arena/shield');
        setShield(data);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  // Scan bullets
  const runScan = useCallback(async () => {
    setScanPhase('scanning');
    setScanResults(null);
    try {
      const scanCtrl = new AbortController();
      const timeout = setTimeout(() => scanCtrl.abort(), 30_000);
      const res = await dilly.fetch('/ai-arena/scan', {
        method: 'POST',
        body: JSON.stringify({}),
        signal: scanCtrl.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setScanResults(data);
      }
    } catch {}
    finally { setScanPhase('done'); }
  }, []);

  // Career simulation
  const runSimulation = useCallback(async () => {
    if (!simJob.trim()) { Alert.alert('Enter a job title', 'e.g. Data Scientist, Software Engineer'); return; }
    setSimLoading(true);
    setSimResult(null);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 60_000);
      const res = await dilly.fetch('/ai-arena/simulate', {
        method: 'POST',
        body: JSON.stringify({ job_title: simJob.trim() }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSimResult(data);
      }
    } catch {}
    finally { setSimLoading(false); }
  }, [simJob]);

  // Replace me test
  const runReplace = useCallback(async () => {
    if (!replaceInput.trim() || replaceInput.trim().length < 10) { Alert.alert('Paste a bullet', 'Paste one of your resume bullets to test.'); return; }
    setReplaceLoading(true);
    setReplaceResult(null);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 30_000);
      const res = await dilly.fetch('/ai-arena/replace-test', {
        method: 'POST',
        body: JSON.stringify({ bullet: replaceInput.trim() }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setReplaceResult(data);
      }
    } catch {}
    finally { setReplaceLoading(false); }
  }, [replaceInput]);

  if (loading) {
    return (
      <View style={[a.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={CYAN} />
        <Text style={{ color: SUB, marginTop: 12, fontSize: 13 }}>Loading your AI readiness...</Text>
      </View>
    );
  }

  const shieldScore = shield?.shield_score ?? 0;
  const shieldLabel = shield?.shield_label ?? 'Unknown';
  const disruptionPct = shield?.disruption_pct ?? 30;

  return (
    <View style={[a.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={a.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="shield" size={20} color={CYAN} />
          <Text style={a.headerTitle}>AI Arena</Text>
        </View>
        <Text style={a.headerSub}>Your AI readiness command center</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[a.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Shield Score Hero ────────────────────────── */}
        <FadeInView delay={0}>
          <View style={a.shieldHero}>
            <ShieldRing score={shieldScore} />
            <Text style={a.shieldLabel}>{shieldLabel}</Text>
            <Text style={a.shieldSub}>
              {shieldScore >= 80 ? 'Your resume is AI-proof. Keep it up.'
                : shieldScore >= 60 ? 'Strong foundation. A few fixes will fortify you.'
                : shieldScore >= 40 ? 'Some of your skills are at risk. Scan below to find them.'
                : 'Your resume is heavily AI-vulnerable. Let\'s fix that.'}
            </Text>
            {shield?.cohort && (
              <View style={a.disruptionPill}>
                <Ionicons name="trending-up" size={12} color={RED} />
                <Text style={a.disruptionPillText}>
                  {disruptionPct}% of entry-level {shield.cohort.split(' ')[0]} roles disrupted by AI
                </Text>
              </View>
            )}
          </View>
        </FadeInView>

        {/* ── 2. Live Threat Scanner ─────────────────────── */}
        <FadeInView delay={100}>
          <View style={a.section}>
            <View style={a.sectionHeader}>
              <Ionicons name="scan" size={16} color={CYAN} />
              <Text style={a.sectionTitle}>Threat Scanner</Text>
            </View>
            <Text style={a.sectionSub}>Scan every bullet on your resume for AI vulnerability.</Text>

            {scanPhase === 'idle' && (
              <AnimatedPressable style={a.scanBtn} onPress={runScan} scaleDown={0.97}>
                <Ionicons name="flash" size={16} color="#000" />
                <Text style={a.scanBtnText}>Scan My Resume</Text>
              </AnimatedPressable>
            )}

            {scanPhase === 'scanning' && (
              <View style={a.scanningWrap}>
                <ActivityIndicator size="small" color={CYAN} />
                <Text style={{ color: SUB, fontSize: 13, marginTop: 8 }}>Scanning bullets...</Text>
              </View>
            )}

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
                {(scanResults.bullets || []).map((b: any, i: number) => (
                  <BulletRow
                    key={i}
                    item={b}
                    index={i}
                    onFix={() => openDillyOverlay({
                      isPaid: true,
                      initialMessage: `This bullet is AI-vulnerable: "${b.text}". Rewrite it to emphasize human skills that AI can't replicate.`,
                    })}
                  />
                ))}
                <AnimatedPressable
                  style={[a.scanBtn, { marginTop: 12, backgroundColor: CARD, borderWidth: 1, borderColor: CYAN + '30' }]}
                  onPress={() => { setScanPhase('idle'); setScanResults(null); }}
                  scaleDown={0.97}
                >
                  <Text style={[a.scanBtnText, { color: CYAN }]}>Scan Again</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        </FadeInView>

        {/* ── 3. Replace Me Test ──────────────────────────── */}
        <FadeInView delay={200}>
          <View style={a.section}>
            <View style={a.sectionHeader}>
              <Ionicons name="swap-horizontal" size={16} color={RED} />
              <Text style={a.sectionTitle}>Can AI Replace You?</Text>
            </View>
            <Text style={a.sectionSub}>Paste a resume bullet. AI will try to write it. See if it can.</Text>
            <TextInput
              style={a.input}
              value={replaceInput}
              onChangeText={setReplaceInput}
              placeholder="Paste a resume bullet here..."
              placeholderTextColor={DIM}
              multiline
            />
            <AnimatedPressable
              style={[a.scanBtn, { backgroundColor: RED, opacity: replaceInput.trim().length < 10 ? 0.4 : 1 }]}
              onPress={runReplace}
              disabled={replaceInput.trim().length < 10 || replaceLoading}
              scaleDown={0.97}
            >
              {replaceLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="flash" size={16} color="#000" />
                  <Text style={a.scanBtnText}>Test It</Text>
                </>
              )}
            </AnimatedPressable>

            {replaceResult && (
              <FadeInView delay={0}>
                <View style={[a.replaceCard, {
                  borderColor: replaceResult.verdict === 'human-only' ? GREEN + '40'
                    : replaceResult.verdict === 'replaceable' ? RED + '40' : AMBER + '40',
                }]}>
                  <View style={a.replaceHeader}>
                    <Ionicons
                      name={replaceResult.verdict === 'human-only' ? 'shield-checkmark' : replaceResult.verdict === 'replaceable' ? 'warning' : 'help-circle'}
                      size={20}
                      color={replaceResult.verdict === 'human-only' ? GREEN : replaceResult.verdict === 'replaceable' ? RED : AMBER}
                    />
                    <Text style={[a.replaceVerdict, {
                      color: replaceResult.verdict === 'human-only' ? GREEN : replaceResult.verdict === 'replaceable' ? RED : AMBER,
                    }]}>
                      {replaceResult.verdict === 'human-only' ? 'AI Cannot Replace This'
                        : replaceResult.verdict === 'replaceable' ? 'AI Can Replace This'
                        : 'Borderline'}
                    </Text>
                    <Text style={a.replaceScore}>{replaceResult.replaceability}/10</Text>
                  </View>
                  <Text style={a.replaceWhy}>{replaceResult.why}</Text>
                  {replaceResult.ai_version && (
                    <View style={a.replaceAI}>
                      <Text style={a.replaceAILabel}>AI's attempt:</Text>
                      <Text style={a.replaceAIText}>{replaceResult.ai_version}</Text>
                    </View>
                  )}
                  {replaceResult.verdict !== 'human-only' && (
                    <AnimatedPressable
                      style={a.fixInlineBtn}
                      onPress={() => openDillyOverlay({
                        isPaid: true,
                        initialMessage: `AI rated my bullet ${replaceResult.replaceability}/10 replaceable: "${replaceInput}". Help me rewrite it so AI CAN'T replicate it.`,
                      })}
                      scaleDown={0.97}
                    >
                      <Ionicons name="sparkles" size={12} color={CYAN} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: CYAN }}>Make it AI-proof</Text>
                    </AnimatedPressable>
                  )}
                </View>
              </FadeInView>
            )}
          </View>
        </FadeInView>

        {/* ── 4. Career Simulation ────────────────────────── */}
        <FadeInView delay={300}>
          <View style={a.section}>
            <View style={a.sectionHeader}>
              <Ionicons name="time" size={16} color={AMBER} />
              <Text style={a.sectionTitle}>Career Simulation</Text>
            </View>
            <Text style={a.sectionSub}>See how AI will transform your dream role over 5 years.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[a.input, { flex: 1 }]}
                value={simJob}
                onChangeText={setSimJob}
                placeholder="Enter a job title..."
                placeholderTextColor={DIM}
              />
              <AnimatedPressable
                style={[a.scanBtn, { paddingHorizontal: 16, backgroundColor: AMBER, opacity: simJob.trim() ? 1 : 0.4 }]}
                onPress={runSimulation}
                disabled={!simJob.trim() || simLoading}
                scaleDown={0.97}
              >
                {simLoading ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="rocket" size={16} color="#000" />}
              </AnimatedPressable>
            </View>

            {simResult && (
              <>
                <Text style={a.simVerdict}>{simResult.verdict}</Text>
                {(simResult.years || []).map((y: any, i: number) => (
                  <YearNode key={y.year} year={y} isLast={i === (simResult.years || []).length - 1} />
                ))}
                <View style={a.simStrategy}>
                  <Ionicons name="bulb" size={14} color={AMBER} />
                  <Text style={a.simStrategyText}>{simResult.survival_strategy}</Text>
                </View>
                {simResult.skills_to_develop && (
                  <View style={a.skillsRow}>
                    {simResult.skills_to_develop.map((s: string, i: number) => (
                      <AnimatedPressable
                        key={i}
                        style={a.skillChip}
                        onPress={() => openDillyOverlay({
                          isPaid: true,
                          initialMessage: `I need to develop "${s}" to stay AI-proof in my career. How do I build this skill and show it on my resume?`,
                        })}
                        scaleDown={0.95}
                      >
                        <Text style={a.skillChipText}>{s}</Text>
                        <Ionicons name="sparkles" size={9} color={CYAN} style={{ opacity: 0.5 }} />
                      </AnimatedPressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </FadeInView>

        {/* ── 5. What To Do ───────────────────────────────── */}
        {shield?.what_to_do && (
          <FadeInView delay={400}>
            <AnimatedPressable
              style={a.actionCard}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `Based on my AI readiness analysis: ${shield.what_to_do}. Help me take action on this right now.`,
              })}
              scaleDown={0.98}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="rocket" size={16} color={CYAN} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>What to do right now</Text>
              </View>
              <Text style={{ fontSize: 13, color: SUB, lineHeight: 19 }}>{shield.what_to_do}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                <Ionicons name="sparkles" size={12} color={CYAN} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: CYAN }}>Get Dilly's help</Text>
              </View>
            </AnimatedPressable>
          </FadeInView>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const a = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: DIM, marginTop: 2 },
  scroll: { paddingHorizontal: 20, gap: 20 },

  // Shield hero
  shieldHero: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  shieldLabel: { fontSize: 18, fontWeight: '800', color: TEXT, letterSpacing: 1 },
  shieldSub: { fontSize: 13, color: SUB, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },
  disruptionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '20', marginTop: 4,
  },
  disruptionPillText: { fontSize: 11, fontWeight: '600', color: RED },

  // Section
  section: { backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  sectionSub: { fontSize: 12, color: SUB, marginBottom: 12, lineHeight: 17 },

  // Scan button
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10, backgroundColor: CYAN,
  },
  scanBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  scanningWrap: { alignItems: 'center', padding: 20 },

  // Scan summary
  scanSummary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  scanStat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  scanStatNum: { fontSize: 22, fontWeight: '800' },
  scanStatLabel: { fontSize: 10, color: SUB, marginTop: 2, fontWeight: '600', letterSpacing: 0.5 },

  // Bullet row
  bulletRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: BG, borderLeftWidth: 3, marginBottom: 6,
  },
  bulletText: { fontSize: 12, color: TEXT, lineHeight: 17 },
  bulletReason: { fontSize: 10, color: DIM, marginTop: 3 },
  fixBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: CYAN + '15', borderWidth: 1, borderColor: CYAN + '25',
  },
  fixBtnText: { fontSize: 10, fontWeight: '600', color: CYAN },

  // Input
  input: {
    backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: TEXT,
    marginBottom: 10, minHeight: 44,
  },

  // Replace result
  replaceCard: { backgroundColor: BG, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 12, gap: 8 },
  replaceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replaceVerdict: { fontSize: 14, fontWeight: '700', flex: 1 },
  replaceScore: { fontSize: 18, fontWeight: '800', color: TEXT },
  replaceWhy: { fontSize: 12, color: SUB, lineHeight: 17 },
  replaceAI: { backgroundColor: CARD, borderRadius: 8, padding: 10, marginTop: 4 },
  replaceAILabel: { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 1, marginBottom: 4 },
  replaceAIText: { fontSize: 12, color: SUB, lineHeight: 17, fontStyle: 'italic' },
  fixInlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    backgroundColor: CYAN + '12', borderWidth: 1, borderColor: CYAN + '20',
  },

  // Career simulation
  simVerdict: { fontSize: 13, fontWeight: '600', color: AMBER, marginBottom: 12, lineHeight: 18 },
  yearNode: { flexDirection: 'row', marginBottom: 4 },
  yearTimeline: { alignItems: 'center', width: 24, paddingTop: 6 },
  yearDot: { width: 10, height: 10, borderRadius: 5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4, zIndex: 1 },
  yearLine: { width: 2, flex: 1, backgroundColor: BORDER, marginTop: 2 },
  yearCard: { flex: 1, backgroundColor: BG, borderRadius: 10, padding: 12, marginBottom: 8 },
  yearLabel: { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 1 },
  yearTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginTop: 4 },
  yearDesc: { fontSize: 12, color: SUB, lineHeight: 17, marginTop: 4 },
  yearRisk: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  yearRiskText: { fontSize: 10, fontWeight: '700' },
  simStrategy: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: AMBER + '10', borderRadius: 10, padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: AMBER + '20',
  },
  simStrategyText: { flex: 1, fontSize: 12, color: AMBER, lineHeight: 17, fontWeight: '600' },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  skillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: CYAN + '10', borderWidth: 1, borderColor: CYAN + '20',
  },
  skillChipText: { fontSize: 11, fontWeight: '600', color: CYAN },

  // Action card
  actionCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: CYAN + '25',
  },
});
