/**
 * FEEDBACK PAGE — tabbed card system.
 *
 * Build 161: Removed scoring displays (S/G/B bars, composite number, bar badge).
 * Kept narrative feedback: Dilly's Take, focus areas, signals, action plan.
 *
 *   - Tab 1 "Overview": Dilly's take, focus area, congrats card
 *   - Tab 2 "Signals": working for you (green) + missing (red), grouped by dim
 *   - Tab 3 "Action Plan": this week moves, watch out, biggest opportunities
 *
 * Data fetching & types unchanged from build 98.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, RefreshControl,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { mediumHaptic, selectionHaptic } from '../../lib/haptics';
import { parseCohortScores, type CohortScore } from '../../lib/cohorts';
import CohortSwitcher from '../../components/CohortSwitcher';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
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
function extractMoveText(m: string | RubricPathMove): string {
  if (typeof m === 'string') return m;
  return m.move || m.action || m.title || '';
}
function extractRejectText(r: string | { text: string; source?: string }): { text: string; source?: string } {
  if (typeof r === 'string') return { text: r };
  return { text: r.text || '', source: r.source };
}

type TabKey = 'overview' | 'signals' | 'action';

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [audit, setAudit] = useState<any>(null);
  const [ra, setRa] = useState<RubricAnalysis | null>(null);
  const [cohortScores, setCohortScores] = useState<CohortScore[]>([]);
  const [activeCohortIdx, setActiveCohortIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const fetchFeedbackData = useCallback(async () => {
    try {
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

      const explicitCohorts: string[] | null = Array.isArray(profileRes?.cohorts) && profileRes.cohorts.length > 0
        ? profileRes.cohorts : null;
      const parsed = parseCohortScores(profileRes?.cohort_scores);
      if (explicitCohorts) {
        const filtered = parsed.filter(c => explicitCohorts.includes(c.cohort_id));
        setCohortScores(filtered.length > 0 ? filtered : parsed);
      } else {
        setCohortScores(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await fetchFeedbackData();
      setLoading(false);
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    mediumHaptic();
    setRefreshing(true);
    await fetchFeedbackData();
    setRefreshing(false);
  }, [fetchFeedbackData]);

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
              Run an audit on your resume to get detailed feedback on your strengths and gaps.
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

  const hasCohortData = activeCohort != null && activeCohort.dilly_score > 0;
  const cohortName = hasCohortData ? activeCohort.display_name : ra.primary_cohort_display_name;
  const aboveBar = hasCohortData ? activeCohort.dilly_score >= (ra.recruiter_bar || 70) : ra.above_bar;

  // Group signals by dimension
  const matchedByDim: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  for (const sig of ra.matched_signals || []) {
    if (sig.dimension in matchedByDim) matchedByDim[sig.dimension].push(sig);
  }
  const unmatchedHigh: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  for (const sig of ra.unmatched_signals || []) {
    if (sig.tier === 'high' && sig.dimension in unmatchedHigh) unmatchedHigh[sig.dimension].push(sig);
  }

  // All unmatched grouped by dimension (for Signals tab)
  const unmatchedByDim: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  for (const sig of ra.unmatched_signals || []) {
    if (sig.dimension in unmatchedByDim) unmatchedByDim[sig.dimension].push(sig);
  }

  // Find the dimension with the most missing signals for the focus area
  const unmatchedCounts = Object.entries(unmatchedByDim).map(([dim, sigs]) => ({ dim, count: sigs.length }));
  unmatchedCounts.sort((a, b) => b.count - a.count);
  const focusDim = unmatchedCounts[0]?.count > 0 ? unmatchedCounts[0].dim : null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'signals', label: 'Signals' },
    { key: 'action', label: 'Action Plan' },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[f.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={f.header}>
          <TouchableOpacity style={f.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color={GOLD} />
            <Text style={f.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={f.headerTitle}>YOUR FEEDBACK</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={[f.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {/* ── Cohort Switcher ──────────────────────────── */}
          {cohortScores.length > 1 && (
            <CohortSwitcher
              cohorts={cohortScores}
              activeIndex={activeCohortIdx}
              onSwitch={(idx: number) => { selectionHaptic(); setActiveCohortIdx(idx); }}
            />
          )}

          {/* ── Cohort Hero ──────────────────────────────── */}
          <FadeInView delay={0}>
            <View style={f.heroCard}>
              <Text style={f.heroCohortName}>{cohortName}</Text>
              <View style={[f.barBadge, { backgroundColor: aboveBar ? GREEN + '15' : GOLD + '15' }]}>
                <Text style={[f.barBadgeText, { color: aboveBar ? GREEN : GOLD }]}>
                  {aboveBar ? 'Competitive for this cohort' : 'Room to grow in this cohort'}
                </Text>
              </View>
            </View>
          </FadeInView>

          {/* ── Tab Switcher ─────────────────────────────── */}
          <FadeInView delay={60}>
            <View style={f.tabRow}>
              {tabs.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <AnimatedPressable
                    key={tab.key}
                    style={[f.tabPill, isActive && f.tabPillActive]}
                    onPress={() => { selectionHaptic(); setActiveTab(tab.key); }}
                    scaleDown={0.97}
                  >
                    <Text style={[f.tabPillText, isActive && f.tabPillTextActive]}>
                      {tab.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </FadeInView>

          {/* ── Tab Content ──────────────────────────────── */}

          {activeTab === 'overview' && (
            <FadeInView delay={100}>
              <View style={f.tabContent}>
                {/* Dilly's take */}
                {audit?.dilly_take ? (
                  <View style={f.card}>
                    <View style={f.cardHeader}>
                      <Ionicons name="chatbubble-outline" size={13} color={GOLD} />
                      <Text style={f.cardHeaderText}>Dilly's Take</Text>
                    </View>
                    <Text style={f.cardBody}>{audit.dilly_take}</Text>
                  </View>
                ) : null}

                {/* Focus area callout */}
                {focusDim && (
                  <View style={[f.card, { borderLeftWidth: 4, borderLeftColor: dimColor(focusDim) }]}>
                    <Text style={f.cardTitle}>Focus area: {dimLabel(focusDim)}</Text>
                    <Text style={f.cardBody}>
                      {dimLabel(focusDim)} has the most gaps in your resume right now.
                      Strengthening it will have the biggest impact on your competitiveness.
                    </Text>
                    <View style={f.cardActions}>
                      <AnimatedPressable
                        style={f.actionBtn}
                        onPress={() => openDillyOverlay({
                          isPaid: true,
                          initialMessage: `My biggest area for improvement is ${dimLabel(focusDim)}. What specific things can I add to my resume to strengthen it?`,
                        })}
                        scaleDown={0.97}
                      >
                        <Ionicons name="sparkles" size={13} color={GOLD} />
                        <Text style={f.actionBtnText}>Ask Dilly</Text>
                      </AnimatedPressable>
                    </View>
                  </View>
                )}

                {/* Above bar congratulations */}
                {aboveBar && (
                  <View style={[f.card, { backgroundColor: GREEN + '08', borderColor: GREEN + '20' }]}>
                    <View style={f.cardHeader}>
                      <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                      <Text style={[f.cardHeaderText, { color: GREEN }]}>Competitive</Text>
                    </View>
                    <Text style={f.cardBody}>
                      Your resume is competitive for {cohortName}. You're well-positioned for roles in this cohort.
                    </Text>
                    <View style={f.cardActions}>
                      <AnimatedPressable
                        style={[f.actionBtn, { backgroundColor: GREEN + '12', borderColor: GREEN + '25' }]}
                        onPress={() => router.push('/(app)/jobs')}
                        scaleDown={0.97}
                      >
                        <Ionicons name="briefcase-outline" size={13} color={GREEN} />
                        <Text style={[f.actionBtnText, { color: GREEN }]}>See matching jobs</Text>
                      </AnimatedPressable>
                    </View>
                  </View>
                )}

                {/* CTAs */}
                <View style={f.ctaRow}>
                  <AnimatedPressable style={f.ctaPrimary} onPress={() => router.push('/(app)/new-audit')} scaleDown={0.97}>
                    <Ionicons name="flash" size={16} color="#fff" />
                    <Text style={f.ctaPrimaryText}>Run new audit</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={f.ctaSecondary} onPress={() => router.push('/(app)/my-dilly-profile')} scaleDown={0.97}>
                    <Ionicons name="document-text-outline" size={16} color={GOLD} />
                    <Text style={f.ctaSecondaryText}>Talk to Dilly</Text>
                  </AnimatedPressable>
                </View>
              </View>
            </FadeInView>
          )}

          {activeTab === 'signals' && (
            <FadeInView delay={100}>
              <View style={f.tabContent}>
                {/* Working for you */}
                {(ra.matched_signals || []).length > 0 && (
                  <View style={f.card}>
                    <Text style={[f.cardTitle, { color: GREEN }]}>Working for you</Text>
                    {(['smart', 'grit', 'build'] as const).map(dim => {
                      const sigs = matchedByDim[dim];
                      if (sigs.length === 0) return null;
                      return (
                        <View key={dim} style={f.dimGroup}>
                          <Text style={[f.dimGroupLabel, { color: dimColor(dim) }]}>{dimLabel(dim)}</Text>
                          {sigs.slice(0, 3).map((sig, i) => (
                            <View key={i} style={f.signalRow}>
                              <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                              <Text style={f.signalText}>{sig.signal}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Missing */}
                {(ra.unmatched_signals || []).length > 0 && (
                  <View style={f.card}>
                    <Text style={[f.cardTitle, { color: CORAL }]}>Missing</Text>
                    {(['smart', 'grit', 'build'] as const).map(dim => {
                      const sigs = unmatchedByDim[dim];
                      if (sigs.length === 0) return null;
                      return (
                        <View key={dim} style={f.dimGroup}>
                          <Text style={[f.dimGroupLabel, { color: dimColor(dim) }]}>{dimLabel(dim)}</Text>
                          {sigs.slice(0, 3).map((sig, i) => (
                            <AnimatedPressable
                              key={i}
                              style={f.signalRow}
                              onPress={() => openDillyOverlay({
                                isPaid: true,
                                initialMessage: `My resume is missing "${sig.signal}" in the ${dimLabel(dim)} area. ${sig.rationale || ''} How do I add this to my resume?`,
                              })}
                              scaleDown={0.98}
                            >
                              <Ionicons name="close-circle" size={14} color={CORAL} />
                              <Text style={[f.signalText, { flex: 1 }]}>{sig.signal}</Text>
                              <Ionicons name="sparkles" size={10} color={GOLD} style={{ opacity: 0.4 }} />
                            </AnimatedPressable>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </FadeInView>
          )}

          {activeTab === 'action' && (
            <FadeInView delay={100}>
              <View style={f.tabContent}>
                {/* This week */}
                {ra.fastest_path_moves && ra.fastest_path_moves.length > 0 && (
                  <View style={f.card}>
                    <Text style={f.cardTitle}>This week</Text>
                    <Text style={f.cardSub}>Do these first for the fastest improvement.</Text>
                    {ra.fastest_path_moves.slice(0, 6).map((move, i) => {
                      const text = extractMoveText(move);
                      if (!text) return null;
                      return (
                        <AnimatedPressable
                          key={i}
                          style={f.numberedRow}
                          onPress={() => openDillyOverlay({
                            isPaid: true,
                            initialMessage: `My feedback says I should: "${text}". Help me do this step by step.`,
                          })}
                          scaleDown={0.98}
                        >
                          <View style={f.numBadge}>
                            <Text style={f.numBadgeText}>{i + 1}</Text>
                          </View>
                          <Text style={[f.numberedText, { flex: 1 }]}>{text}</Text>
                          <Ionicons name="sparkles" size={10} color={GOLD} style={{ opacity: 0.4 }} />
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                )}

                {/* Watch out for */}
                {ra.common_rejection_reasons && ra.common_rejection_reasons.length > 0 && (
                  <View style={[f.card, { backgroundColor: CORAL + '06', borderColor: CORAL + '15' }]}>
                    <View style={f.cardHeader}>
                      <Ionicons name="alert-circle" size={14} color={CORAL} />
                      <Text style={[f.cardTitle, { color: CORAL, marginBottom: 0 }]}>Watch out for</Text>
                    </View>
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

                {/* Biggest opportunities */}
                {Object.values(unmatchedHigh).some(a => a.length > 0) && (
                  <View style={f.card}>
                    <Text style={f.cardTitle}>Biggest opportunities</Text>
                    <Text style={f.cardSub}>High-impact signals missing from your resume.</Text>
                    {(['smart', 'grit', 'build'] as const).map(dim => {
                      const sigs = unmatchedHigh[dim];
                      if (sigs.length === 0) return null;
                      return (
                        <View key={dim} style={f.dimGroup}>
                          <Text style={[f.dimGroupLabel, { color: dimColor(dim) }]}>{dimLabel(dim)}</Text>
                          {sigs.map((sig, i) => (
                            <AnimatedPressable
                              key={i}
                              style={f.numberedRow}
                              onPress={() => openDillyOverlay({
                                isPaid: true,
                                initialMessage: `My resume is missing "${sig.signal}" (${dimLabel(dim)} area). ${sig.rationale || ''} Help me add this to my resume.`,
                              })}
                              scaleDown={0.98}
                            >
                              <View style={[f.numBadge, { borderColor: dimColor(dim), backgroundColor: 'transparent' }]}>
                                <Text style={[f.numBadgeText, { color: dimColor(dim) }]}>{i + 1}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={f.numberedText}>{sig.signal}</Text>
                                {sig.rationale ? <Text style={f.numberedSub}>{sig.rationale}</Text> : null}
                              </View>
                              <Ionicons name="sparkles" size={10} color={GOLD} style={{ opacity: 0.4 }} />
                            </AnimatedPressable>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </FadeInView>
          )}
        </ScrollView>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const f = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.t3, textAlign: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 10 },
  backText: { fontSize: 15, color: GOLD, fontWeight: '600' },

  scroll: { paddingHorizontal: spacing.lg, gap: 12 },

  // Cohort Hero card
  heroCard: {
    alignItems: 'center', paddingTop: 20, paddingBottom: 16, gap: 8,
    backgroundColor: colors.s1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: spacing.md,
  },
  heroCohortName: { fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 0.8, color: colors.t1, textAlign: 'center' },
  barBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  barBadgeText: { fontSize: 12, fontWeight: '700' },

  // Tab switcher
  tabRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 4 },
  tabPill: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.s2,
  },
  tabPillActive: { backgroundColor: GOLD },
  tabPillText: { fontSize: 13, fontWeight: '600', color: colors.t2 },
  tabPillTextActive: { color: '#fff' },

  // Tab content wrapper
  tabContent: { gap: 12 },

  // Card (generic)
  card: {
    backgroundColor: colors.s1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b1,
    padding: spacing.md, gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  cardHeaderText: { fontSize: 13, fontWeight: '700', color: GOLD },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  cardSub: { fontSize: 12, color: colors.t3, marginBottom: 4 },
  cardBody: { fontSize: 13, color: colors.t2, lineHeight: 19 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },

  // Action buttons
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '20',
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: GOLD },

  // Dim group
  dimGroup: { gap: 6, marginBottom: 4 },
  dimGroupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },

  // Signal rows (Signals tab)
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  signalText: { flex: 1, fontSize: 13, color: colors.t1, lineHeight: 18 },

  // Numbered rows (Action Plan tab)
  numberedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  numBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: GOLD,
  },
  numBadgeText: { fontSize: 10, fontWeight: '800', color: GOLD },
  numberedText: { fontSize: 13, color: colors.t1, lineHeight: 18 },
  numberedSub: { fontSize: 11, color: colors.t3, lineHeight: 16, marginTop: 2 },

  // Rejection rows
  rejectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  rejectText: { fontSize: 13, color: colors.t1, lineHeight: 18 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ctaPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.xl, backgroundColor: GOLD },
  ctaPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  ctaSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.xl, backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '25' },
  ctaSecondaryText: { fontSize: 14, fontWeight: '600', color: GOLD },
});
