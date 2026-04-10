/**
 * FEEDBACK PAGE — the powerhouse. Merges score-detail + feedback into one page.
 *
 * Build 98: Unified page showing:
 * 1. Cohort switcher (horizontal pills)
 * 2. Hero score ring + S/G/B dimension bars
 * 3. At-a-glance multi-cohort comparison
 * 4. Weakest dimension callout with action buttons
 * 5. What's working (matched signals)
 * 6. Biggest levers (unmatched high-impact signals)
 * 7. Fastest path forward (tappable → AI coach)
 * 8. Common rejection reasons (tappable → AI coach)
 * 9. Other cohorts
 * 10. CTAs (re-audit + editor)
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { parseCohortScores, type CohortScore } from '../../lib/cohorts';
import CohortSwitcher from '../../components/CohortSwitcher';
import AnimatedPressable from '../../components/AnimatedPressable';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE  = '#0A84FF';

// ── Types ────────────────────────────────────────────────────────────────────

interface RubricSignal { signal: string; dimension: string; tier: string; weight: number; rationale: string; }
interface RubricPathMove { move?: string; action?: string; title?: string; expected_lift?: string; source?: string; }
interface OtherCohort { cohort_id: string; display_name: string; composite: number; smart: number; grit: number; build: number; recruiter_bar: number; above_bar: boolean; }
interface RubricAnalysis {
  primary_cohort_id: string; primary_cohort_display_name: string;
  primary_composite: number; primary_smart: number; primary_grit: number; primary_build: number;
  recruiter_bar: number; above_bar: boolean;
  matched_signals: RubricSignal[]; unmatched_signals: RubricSignal[];
  fastest_path_moves: (string | RubricPathMove)[];
  common_rejection_reasons?: (string | { text: string; source?: string })[];
  other_cohorts?: OtherCohort[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dimColor(dim: string): string {
  return dim === 'smart' ? BLUE : dim === 'grit' ? GOLD : GREEN;
}
function dimLabel(dim: string): string {
  return dim.charAt(0).toUpperCase() + dim.slice(1);
}
function scoreColor(s: number): string {
  return s >= 75 ? GREEN : s >= 50 ? GOLD : CORAL;
}
function extractMoveText(m: string | RubricPathMove): string {
  if (typeof m === 'string') return m;
  return m.move || m.action || m.title || '';
}
function extractRejectText(r: string | { text: string; source?: string }): { text: string; source?: string } {
  if (typeof r === 'string') return { text: r };
  return { text: r.text || '', source: r.source };
}

// ── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const strokeWidth = 5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const color = scoreColor(score);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.b1} strokeWidth={strokeWidth} fill="transparent" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[f.ringNum, { color, position: 'absolute' }]}>{Math.round(score)}</Text>
    </View>
  );
}

// ── Dimension Bar ────────────────────────────────────────────────────────────

function DimBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={f.dimBarRow}>
      <Text style={f.dimBarLabel}>{label}</Text>
      <View style={f.dimBarTrack}>
        <View style={[f.dimBarFill, { width: `${Math.min(100, value)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[f.dimBarScore, { color }]}>{Math.round(value)}</Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState<any>(null);
  const [ra, setRa] = useState<RubricAnalysis | null>(null);
  const [cohortScores, setCohortScores] = useState<CohortScore[]>([]);
  const [activeCohortIdx, setActiveCohortIdx] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        // Try AsyncStorage cache first (fast), then API (canonical)
        let auditObj: any = null;
        try {
          const cached = await AsyncStorage.getItem('dilly_latest_audit');
          if (cached) auditObj = JSON.parse(cached);
        } catch {}

        const [profileRes, auditRes] = await Promise.all([
          dilly.get('/profile').catch(() => null),
          dilly.get('/audit/latest').catch(() => null),
        ]);

        const apiAudit = auditRes?.audit ?? auditRes;
        if (apiAudit?.rubric_analysis) {
          auditObj = apiAudit;
          AsyncStorage.setItem('dilly_latest_audit', JSON.stringify(apiAudit)).catch(() => {});
        }

        setAudit(auditObj);
        if (auditObj?.rubric_analysis) setRa(auditObj.rubric_analysis as RubricAnalysis);

        // Load cohort scores for switcher
        const parsed = parseCohortScores(profileRes?.cohort_scores);
        // Also include ALL cohort_scores (not just major) for the full view
        const allRaw = profileRes?.cohort_scores;
        if (allRaw && Object.keys(allRaw).length > 0) {
          const all: CohortScore[] = Object.entries(allRaw)
            .filter(([_, v]: [string, any]) => v && typeof v === 'object')
            .map(([key, v]: [string, any]) => ({
              cohort_id: key,
              display_name: v.field || v.cohort || key,
              smart: Number(v.smart) || 0,
              grit: Number(v.grit) || 0,
              build: Number(v.build) || 0,
              dilly_score: Number(v.dilly_score) || 0,
              level: (v.level || 'interest') as CohortScore['level'],
              weight: Number(v.weight) ?? 0,
              scored_by_claude: !!v.scored_by_claude,
            }))
            .sort((a, b) => {
              const lo: Record<string, number> = { primary: 0, major: 1, minor: 2, interest: 3 };
              return (lo[a.level] ?? 9) - (lo[b.level] ?? 9) || b.dilly_score - a.dilly_score;
            });
          setCohortScores(all);
        } else {
          setCohortScores(parsed);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const activeCohort = cohortScores[activeCohortIdx] ?? null;

  if (loading) {
    return (
      <View style={[f.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  // No rubric data — show empty state with action
  if (!ra) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[f.container, { paddingTop: insets.top }]}>
          <TouchableOpacity style={f.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color={GOLD} />
            <Text style={f.backText}>Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
            <Ionicons name="analytics-outline" size={48} color={colors.t3} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.t1, marginTop: 16, textAlign: 'center' }}>No feedback yet</Text>
            <Text style={{ fontSize: 14, color: colors.t2, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              Run an audit on your resume to get detailed feedback with Smart, Grit, and Build scores.
            </Text>
            <AnimatedPressable
              style={{ marginTop: 24, backgroundColor: GOLD, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 }}
              onPress={() => router.push('/(app)/new-audit')}
              scaleDown={0.97}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Run my first audit</Text>
            </AnimatedPressable>
          </View>
        </View>
      </>
    );
  }

  // Prefer Claude-scored cohort data; fall back to rubric_analysis only if no cohort data
  // The rubric scores (ra.primary_*) are from the rule-based scorer and are lower than
  // the Claude per-cohort scores. Always prefer cohortScores when available.
  const hasCohortData = activeCohort != null && activeCohort.dilly_score > 0;
  const composite = hasCohortData ? activeCohort.dilly_score : ra.primary_composite;
  const smart = hasCohortData ? activeCohort.smart : ra.primary_smart;
  const grit = hasCohortData ? activeCohort.grit : ra.primary_grit;
  const build = hasCohortData ? activeCohort.build : ra.primary_build;
  const cohortName = hasCohortData ? activeCohort.display_name : ra.primary_cohort_display_name;
  const bar = ra.recruiter_bar || 70;
  const aboveBar = composite >= bar;
  const pointsAway = Math.max(0, bar - composite);

  // Weakest dimension
  const dims = { smart, grit, build };
  const weakest = (Object.entries(dims) as [string, number][]).sort((a, b) => a[1] - b[1])[0];

  // Group signals by dimension
  const matchedByDim: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  for (const sig of ra.matched_signals || []) {
    if (sig.dimension in matchedByDim) matchedByDim[sig.dimension].push(sig);
  }
  const unmatchedHigh: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  for (const sig of ra.unmatched_signals || []) {
    if (sig.tier === 'high' && sig.dimension in unmatchedHigh) unmatchedHigh[sig.dimension].push(sig);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[f.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={f.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={GOLD} />
          <Text style={f.backText}>Back</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={[f.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── 1. Cohort Switcher ──────────────────────────── */}
          {cohortScores.length > 1 && (
            <CohortSwitcher
              cohorts={cohortScores}
              activeIndex={activeCohortIdx}
              onSwitch={setActiveCohortIdx}
            />
          )}

          {/* ── 2. Hero Score (matches My Scores page style) ── */}
          <View style={f.hero}>
            <Text style={[f.heroScoreBig, { color: scoreColor(Math.round(composite)) }]}>{Math.round(composite)}</Text>
            <Text style={f.heroCohortName}>{cohortName}</Text>
            <View style={[f.barBadge, { backgroundColor: aboveBar ? GREEN + '15' : GOLD + '15' }]}>
              <Text style={[f.barBadgeText, { color: aboveBar ? GREEN : GOLD }]}>
                {aboveBar ? 'Above the recruiter bar' : `${Math.round(pointsAway)} ${Math.round(pointsAway) === 1 ? 'point' : 'points'} to the bar`}
              </Text>
            </View>
          </View>

          {/* S/G/B Dimension Bars */}
          <View style={{ gap: 10, paddingHorizontal: 4 }}>
            <DimBar label="Smart" value={smart} color={BLUE} />
            <DimBar label="Grit" value={grit} color={AMBER} />
            <DimBar label="Build" value={build} color={GREEN} />
          </View>

          {/* Dilly take */}
          {audit?.dilly_take ? (
            <View style={f.takeCard}>
              <Ionicons name="chatbubble-outline" size={12} color={GOLD} />
              <Text style={f.takeText}>{audit.dilly_take}</Text>
            </View>
          ) : null}

          {/* ── 4. Weakest Dimension Callout ─────────────────── */}
          {weakest && weakest[1] < 80 && (
            <View style={[f.calloutCard, { borderLeftColor: dimColor(weakest[0]) }]}>
              <Text style={f.calloutTitle}>Focus area: {dimLabel(weakest[0])}</Text>
              <Text style={f.calloutBody}>
                Your {dimLabel(weakest[0])} score ({Math.round(weakest[1])}) is your biggest opportunity.
                Improving it lifts your overall score the fastest.
              </Text>
              <View style={f.calloutActions}>
                <AnimatedPressable
                  style={f.calloutBtn}
                  onPress={() => router.push('/(app)/resume-editor')}
                  scaleDown={0.97}
                >
                  <Ionicons name="document-text-outline" size={13} color={GOLD} />
                  <Text style={f.calloutBtnText}>Fix in editor</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={f.calloutBtn}
                  onPress={() => openDillyOverlay({
                    isPaid: true,
                    initialMessage: `My weakest dimension is ${dimLabel(weakest[0])} at ${Math.round(weakest[1])}. What specific things can I add to my resume to improve it?`,
                  })}
                  scaleDown={0.97}
                >
                  <Ionicons name="sparkles" size={13} color={GOLD} />
                  <Text style={f.calloutBtnText}>Ask Dilly</Text>
                </AnimatedPressable>
              </View>
            </View>
          )}

          {/* ── 5. What's Working ────────────────────────────── */}
          {(ra.matched_signals || []).length > 0 && (
            <View style={f.section}>
              <Text style={f.sectionHeading}>What's working</Text>
              <Text style={f.sectionSub}>Signals recruiters will notice immediately.</Text>
              {(['smart', 'grit', 'build'] as const).map(dim => {
                const sigs = matchedByDim[dim];
                if (sigs.length === 0) return null;
                return (
                  <View key={dim} style={f.dimGroup}>
                    <Text style={[f.dimGroupLabel, { color: dimColor(dim) }]}>{dimLabel(dim)}</Text>
                    {sigs.slice(0, 4).map((sig, i) => (
                      <View key={i} style={f.matchedRow}>
                        <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                        <Text style={f.matchedText}>{sig.signal}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── 6. Biggest Levers ────────────────────────────── */}
          {Object.values(unmatchedHigh).some(a => a.length > 0) && (
            <View style={f.section}>
              <Text style={f.sectionHeading}>Biggest levers</Text>
              <Text style={f.sectionSub}>High-impact signals missing from your resume.</Text>
              {(['smart', 'grit', 'build'] as const).map(dim => {
                const sigs = unmatchedHigh[dim];
                if (sigs.length === 0) return null;
                return (
                  <View key={dim} style={f.dimGroup}>
                    <Text style={[f.dimGroupLabel, { color: dimColor(dim) }]}>
                      {dimLabel(dim)} · {sigs.length} lever{sigs.length !== 1 ? 's' : ''}
                    </Text>
                    {sigs.map((sig, i) => (
                      <AnimatedPressable
                        key={i}
                        style={f.leverCard}
                        onPress={() => openDillyOverlay({
                          isPaid: true,
                          initialMessage: `My resume is missing "${sig.signal}" (${dimLabel(dim)} dimension). ${sig.rationale || ''} Help me add this to my resume.`,
                        })}
                        scaleDown={0.98}
                      >
                        <View style={[f.leverNum, { borderColor: dimColor(dim) }]}>
                          <Text style={[f.leverNumText, { color: dimColor(dim) }]}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={f.leverTitle}>{sig.signal}</Text>
                          {sig.rationale ? <Text style={f.leverBody}>{sig.rationale}</Text> : null}
                        </View>
                        <Ionicons name="sparkles" size={10} color={GOLD} style={{ opacity: 0.4 }} />
                      </AnimatedPressable>
                    ))}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── 7. Fastest Path Forward ──────────────────────── */}
          {ra.fastest_path_moves && ra.fastest_path_moves.length > 0 && (
            <View style={f.section}>
              <Text style={f.sectionHeading}>Your fastest path forward</Text>
              <Text style={f.sectionSub}>Do these this week.</Text>
              {ra.fastest_path_moves.slice(0, 6).map((move, i) => {
                const text = extractMoveText(move);
                if (!text) return null;
                return (
                  <AnimatedPressable
                    key={i}
                    style={f.moveCard}
                    onPress={() => openDillyOverlay({
                      isPaid: true,
                      initialMessage: `My feedback says I should: "${text}". Help me do this step by step.`,
                    })}
                    scaleDown={0.98}
                  >
                    <View style={f.moveNum}><Text style={f.moveNumText}>{i + 1}</Text></View>
                    <Text style={[f.moveText, { flex: 1 }]}>{text}</Text>
                    <Ionicons name="sparkles" size={10} color={GOLD} style={{ opacity: 0.4 }} />
                  </AnimatedPressable>
                );
              })}
            </View>
          )}

          {/* ── 8. Common Rejection Reasons ───────────────────── */}
          {ra.common_rejection_reasons && ra.common_rejection_reasons.length > 0 && (
            <View style={f.section}>
              <Text style={f.sectionHeading}>What employers reject for</Text>
              <Text style={f.sectionSub}>Make sure none of these apply before you hit submit.</Text>
              {ra.common_rejection_reasons.map((r, i) => {
                const { text } = extractRejectText(r);
                if (!text) return null;
                return (
                  <AnimatedPressable
                    key={i}
                    style={f.rejectRow}
                    onPress={() => openDillyOverlay({
                      isPaid: true,
                      initialMessage: `Employers in my cohort reject resumes for: "${text}". Check my resume — do I have this issue? What should I do?`,
                    })}
                    scaleDown={0.98}
                  >
                    <Ionicons name="alert-circle-outline" size={13} color={CORAL} style={{ marginTop: 2 }} />
                    <Text style={[f.rejectText, { flex: 1 }]}>{text}</Text>
                    <Ionicons name="sparkles" size={10} color={GOLD} style={{ opacity: 0.4 }} />
                  </AnimatedPressable>
                );
              })}
            </View>
          )}

          {/* ── 9. AI Readiness ─────────────────────────────────── */}
          <View style={[f.section, { backgroundColor: '#0D1117', borderRadius: 0, padding: spacing.md, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg + spacing.md }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name="flash" size={14} color="#58A6FF" />
              <Text style={[f.sectionHeading, { color: '#F0F6FC', marginBottom: 0 }]}>AI Readiness</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#8B949E', lineHeight: 18, marginBottom: 12 }}>
              AI is disrupting entry-level roles across every field. Your resume needs to show skills AI can't replace.
            </Text>
            <AnimatedPressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: '#161B22', borderWidth: 1, borderColor: '#21262D' }}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `AI is disrupting entry-level ${cohortName} roles. Review my resume and tell me: which of my skills are AI-proof, which are at risk, and what should I change to be competitive in an AI-driven job market?`,
              })}
              scaleDown={0.98}
            >
              <Ionicons name="shield-checkmark" size={16} color="#3FB950" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#F0F6FC' }}>Is my resume AI-proof?</Text>
                <Text style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>Dilly will analyze which of your skills are safe and which are at risk</Text>
              </View>
              <Ionicons name="sparkles" size={12} color="#58A6FF" />
            </AnimatedPressable>
            <AnimatedPressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: '#161B22', borderWidth: 1, borderColor: '#21262D', marginTop: 8 }}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `What skills should I develop to be AI-proof in ${cohortName}? I want to know what AI can't replace in my field and how to emphasize those skills on my resume.`,
              })}
              scaleDown={0.98}
            >
              <Ionicons name="rocket" size={16} color="#D29922" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#F0F6FC' }}>What skills should I develop?</Text>
                <Text style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>AI-proof skills for {cohortName.replace(/ & .*$/, '')} careers</Text>
              </View>
              <Ionicons name="sparkles" size={12} color="#58A6FF" />
            </AnimatedPressable>
          </View>

          {/* ── 10. Other Cohorts ──────────────────────────────── */}
          {ra.other_cohorts && ra.other_cohorts.length > 0 && (
            <View style={f.section}>
              <Text style={f.sectionHeading}>Other tracks you fit</Text>
              {ra.other_cohorts.slice(0, 5).map((c, i) => (
                <View key={i} style={f.otherRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={f.otherName}>{c.display_name}</Text>
                    <Text style={f.otherDims}>S {Math.round(c.smart)} · G {Math.round(c.grit)} · B {Math.round(c.build)}</Text>
                  </View>
                  <Text style={[f.otherScore, { color: c.above_bar ? GREEN : GOLD }]}>{Math.round(c.composite)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 10. CTAs ─────────────────────────────────────── */}
          <View style={f.ctaRow}>
            <AnimatedPressable style={f.ctaPrimary} onPress={() => router.push('/(app)/new-audit')} scaleDown={0.97}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={f.ctaPrimaryText}>Run new audit</Text>
            </AnimatedPressable>
            <AnimatedPressable style={f.ctaSecondary} onPress={() => router.push('/(app)/resume-editor')} scaleDown={0.97}>
              <Ionicons name="document-text-outline" size={16} color={GOLD} />
              <Text style={f.ctaSecondaryText}>Open editor</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const f = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 10 },
  backText: { fontSize: 15, color: GOLD, fontWeight: '600' },
  scroll: { paddingHorizontal: spacing.lg, gap: 16 },

  // Hero — matches score-detail page with big Cinzel score
  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 8, gap: 6 },
  heroEyebrow: { fontFamily: 'Cinzel_700Bold', fontSize: 11, letterSpacing: 1.2, color: colors.t3, textTransform: 'uppercase' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 20, width: '100%', paddingHorizontal: 8 },
  heroDims: { flex: 1, gap: 8 },
  barBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  barBadgeText: { fontSize: 12, fontWeight: '700' },
  ringNum: { fontSize: 28, fontWeight: '800' },
  heroScoreBig: { fontFamily: 'Cinzel_700Bold', fontSize: 64, lineHeight: 72 },
  heroCohortName: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.8, color: colors.t1, textAlign: 'center' },

  // Dim bar
  dimBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dimBarLabel: { width: 40, fontSize: 11, fontWeight: '600', color: colors.t3 },
  dimBarTrack: { flex: 1, height: 6, backgroundColor: colors.s3, borderRadius: 3, overflow: 'hidden' },
  dimBarFill: { height: '100%', borderRadius: 3 },
  dimBarScore: { width: 28, fontSize: 13, fontWeight: '700', textAlign: 'right' },

  // Take
  takeCard: { flexDirection: 'row', gap: 8, backgroundColor: colors.s1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b1, padding: spacing.md },
  takeText: { flex: 1, fontSize: 13, color: colors.t2, lineHeight: 19 },

  // Section
  section: { gap: 10 },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  sectionSub: { fontSize: 12, color: colors.t3, marginBottom: 4 },

  // Callout
  calloutCard: { backgroundColor: colors.s1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b1, borderLeftWidth: 4, padding: spacing.md, gap: 8 },
  calloutTitle: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  calloutBody: { fontSize: 12, color: colors.t2, lineHeight: 18 },
  calloutActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  calloutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '20' },
  calloutBtnText: { fontSize: 12, fontWeight: '600', color: GOLD },

  // Dim group
  dimGroup: { gap: 6, marginBottom: 8 },
  dimGroupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Matched signals
  matchedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  matchedText: { flex: 1, fontSize: 13, color: colors.t1, lineHeight: 18 },

  // Levers
  leverCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 },
  leverNum: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  leverNumText: { fontSize: 10, fontWeight: '800' },
  leverTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  leverBody: { fontSize: 11, color: colors.t3, lineHeight: 16, marginTop: 2 },

  // Moves
  moveCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 },
  moveNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center' },
  moveNumText: { fontSize: 10, fontWeight: '800', color: GOLD },
  moveText: { fontSize: 13, color: colors.t1, lineHeight: 18 },

  // Rejections
  rejectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: CORAL + '06', borderWidth: 1, borderColor: CORAL + '15' },
  rejectText: { fontSize: 13, color: colors.t1, lineHeight: 18 },

  // Other cohorts
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 },
  otherName: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  otherDims: { fontSize: 11, color: colors.t3, marginTop: 2 },
  otherScore: { fontSize: 20, fontWeight: '800' },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  ctaPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.xl, backgroundColor: GOLD },
  ctaPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  ctaSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.xl, backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '25' },
  ctaSecondaryText: { fontSize: 14, fontWeight: '600', color: GOLD },
});
