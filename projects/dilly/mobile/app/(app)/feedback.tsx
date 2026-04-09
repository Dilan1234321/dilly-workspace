/**
 * FEEDBACK SCREEN  -  detailed rubric-driven resume feedback.
 *
 * Purpose
 * ───────
 * The student's "what should I change on my resume" page. Reads the rich
 * `rubric_analysis` payload that the backend already attaches to audit
 * responses (post Tier 2 cutover 2026-04-08) and renders it as a complete,
 * actionable feedback experience.
 *
 * This page is the deep-dive companion to results.tsx / new-audit.tsx  - 
 * those screens show the summary, this screen shows every detail: every
 * matched signal with the exact text from the rubric, every unmatched
 * high-impact signal with its cited rationale, every fastest-path move,
 * and every common rejection reason.
 *
 * Data source
 * ───────────
 * Reads from AsyncStorage key 'dilly_latest_audit' (written by the audit
 * flow) on mount, and re-fetches via GET /audit/latest if stale or missing.
 * Falls back to a "run your first audit" empty state if no audit exists.
 *
 * Cohort awareness
 * ────────────────
 * For pre_health and pre_law cohorts, the feedback language shifts from
 * employer/recruiter framing to adcom/admissions framing ("matriculants"
 * instead of "recruiters", "admissions officers" instead of "hiring
 * managers"). The rubric content is already cohort-appropriate; only the
 * wrapper copy changes.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';

const GOLD  = '#2B3A8E'; // Dilly brand blue
const GREEN = '#34C759';
const BLUE  = '#0A84FF';

// ─── Types (match rubric_analysis shape from backend) ────────────────

interface RubricSignal {
  signal: string;
  dimension: 'smart' | 'grit' | 'build';
  tier: 'high' | 'medium' | 'low';
  weight: number;
  rationale: string;
}

type RubricPathMove = string | {
  move?: string;
  expected_lift?: string;
  source?: string;
  title?: string;
  action?: string;
};

type RubricRejection = string | {
  reason?: string;
  source?: string;
};

interface OtherCohort {
  cohort_id: string;
  display_name: string;
  composite: number;
  smart: number;
  grit: number;
  build: number;
  recruiter_bar: number;
  above_bar: boolean;
}

interface RubricAnalysis {
  primary_cohort_id: string;
  primary_cohort_display_name: string;
  primary_composite: number;
  primary_smart: number;
  primary_grit: number;
  primary_build: number;
  recruiter_bar: number;
  above_bar: boolean;
  matched_signals: RubricSignal[];
  unmatched_signals: RubricSignal[];
  fastest_path_moves: RubricPathMove[];
  common_rejection_reasons?: RubricRejection[];
  other_cohorts?: OtherCohort[];
}

interface AuditLike {
  final_score?: number;
  scores?: { smart?: number; grit?: number; build?: number };
  detected_track?: string;
  major?: string;
  candidate_name?: string;
  dilly_take?: string;
  rubric_analysis?: RubricAnalysis;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractFastestPathText(move: RubricPathMove): string {
  if (typeof move === 'string') return move;
  return move.move || move.action || move.title || '';
}

function extractRejectionText(r: RubricRejection): { text: string; source: string | null } {
  if (typeof r === 'string') return { text: r, source: null };
  return { text: r.reason || '', source: r.source || null };
}

function dimensionLabel(d: 'smart' | 'grit' | 'build'): string {
  if (d === 'smart') return 'Smart';
  if (d === 'grit') return 'Grit';
  return 'Build';
}

function dimensionColor(d: 'smart' | 'grit' | 'build'): string {
  if (d === 'smart') return BLUE;
  if (d === 'grit') return GOLD;
  return GREEN;
}

function isAdmissionsCohort(cohortId: string | undefined): 'pre_health' | 'pre_law' | null {
  if (!cohortId) return null;
  if (cohortId === 'pre_health') return 'pre_health';
  if (cohortId === 'pre_law') return 'pre_law';
  return null;
}

// ─── Main screen ─────────────────────────────────────────────────────

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditLike | null>(null);

  // Load the latest audit on mount. Strategy:
  //  1. Try AsyncStorage (dilly_latest_audit)  -  fastest, populated by audit flow
  //  2. Fall back to /audit/latest API  -  canonical server-side record
  //  3. If both fail, show empty state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // First try AsyncStorage
        const cached = await AsyncStorage.getItem('dilly_latest_audit');
        if (cached && !cancelled) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.final_score != null) {
              setAudit(parsed);
              setLoading(false);
              // Continue to fetch fresh version in the background
            }
          } catch {}
        }

        // Then try the API for the freshest version
        try {
          const res = await dilly.get('/audit/latest');
          if (!cancelled && res?.audit) {
            setAudit(res.audit);
            // Update AsyncStorage cache
            try {
              await AsyncStorage.setItem('dilly_latest_audit', JSON.stringify(res.audit));
            } catch {}
          }
        } catch (apiErr: any) {
          // API failed  -  if we already have a cached version, that's fine
          if (!cancelled && !audit) {
            setError('Could not load your latest audit. Tap to retry.');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Something went wrong loading your feedback.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  // ── Empty state  -  no audit yet ─────────────────────────────────────
  if (!audit || !audit.rubric_analysis) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={GOLD} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <View style={s.emptyWrap}>
          <View style={s.emptyIconCircle}>
            <Ionicons name="document-text-outline" size={32} color={GOLD} />
          </View>
          <Text style={s.emptyHeading}>No feedback yet.</Text>
          <Text style={s.emptyBody}>
            Run your first audit to see exactly which signals on your resume are working,
            which ones are missing, and the specific actions that move your score fastest  - 
            each one cited from real employer research.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.push('/(app)/new-audit')}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Run my first audit</Text>
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Loaded state  -  render full feedback ───────────────────────────
  const ra = audit.rubric_analysis;
  const admissionType = isAdmissionsCohort(ra.primary_cohort_id);
  const isAdmissions = !!admissionType;

  // Cohort-aware copy
  const barLabel = isAdmissions ? 'admissions bar' : 'recruiter bar';
  const whoLooks = isAdmissions ? 'adcoms' : 'recruiters';
  const rejectionHeading = isAdmissions
    ? 'What adcoms reject for in this cohort'
    : 'What employers reject for in this cohort';
  const pathHeading = isAdmissions
    ? 'Your path to the admissions bar'
    : 'Your path to the recruiter bar';
  const composite = ra.primary_composite;
  const bar = ra.recruiter_bar;
  const pointsAway = Math.max(0, bar - composite);
  const aboveBar = ra.above_bar;

  // Group matched and unmatched signals by dimension for the three-card layout
  const matchedByDim: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  for (const sig of ra.matched_signals) {
    if (sig.dimension in matchedByDim) matchedByDim[sig.dimension].push(sig);
  }
  const unmatchedByDim: Record<string, RubricSignal[]> = { smart: [], grit: [], build: [] };
  // Only high-impact unmatched signals go in the "biggest levers" section
  for (const sig of ra.unmatched_signals) {
    if (sig.tier === 'high' && sig.dimension in unmatchedByDim) {
      unmatchedByDim[sig.dimension].push(sig);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Back button */}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={GOLD} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ─── HERO ─────────────────────────────────────────────── */}
          <Text style={s.eyebrow}>Your detailed feedback</Text>
          <Text style={s.heading}>
            {ra.primary_cohort_display_name}
          </Text>
          <View style={s.heroScoreRow}>
            <Text style={s.heroScore}>{Math.round(composite)}</Text>
            <Text style={s.heroScoreOf}>/100</Text>
            <View style={s.heroBarDistance}>
              <Text style={s.heroBarDistanceLabel}>
                {aboveBar
                  ? `Above the ${barLabel}`
                  : `${Math.round(pointsAway)} pts to the ${barLabel}`}
              </Text>
              <Text style={s.heroBarDistanceBar}>
                {aboveBar ? '✓' : `bar: ${Math.round(bar)}`}
              </Text>
            </View>
          </View>
          <View style={s.heroDimsRow}>
            {(['smart', 'grit', 'build'] as const).map((dim) => {
              const val = Math.round(
                dim === 'smart' ? ra.primary_smart :
                dim === 'grit' ? ra.primary_grit :
                ra.primary_build
              );
              return (
                <View key={dim} style={s.heroDimTile}>
                  <Text style={[s.heroDimScore, { color: dimensionColor(dim) }]}>{val}</Text>
                  <Text style={s.heroDimLabel}>{dimensionLabel(dim)}</Text>
                </View>
              );
            })}
          </View>

          {/* Dilly take */}
          {audit.dilly_take ? (
            <View style={s.takeCard}>
              <Ionicons name="chatbubble-outline" size={13} color={GOLD} style={{ marginTop: 1 }} />
              <Text style={s.takeText}>{audit.dilly_take}</Text>
            </View>
          ) : null}

          {/* ─── SECTION 1: WHAT'S WORKING ───────────────────────── */}
          {ra.matched_signals.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionHeading}>What's working</Text>
              <Text style={s.sectionSub}>
                {isAdmissions
                  ? `Signals adcoms will notice immediately.`
                  : `Signals ${whoLooks} will notice immediately.`}
              </Text>
              {(['smart', 'grit', 'build'] as const).map((dim) => {
                const sigs = matchedByDim[dim];
                if (sigs.length === 0) return null;
                return (
                  <View key={`m-${dim}`} style={s.dimGroup}>
                    <Text style={[s.dimGroupLabel, { color: dimensionColor(dim) }]}>
                      {dimensionLabel(dim)} · {sigs.length} matched
                    </Text>
                    {sigs.map((sig, i) => (
                      <View key={`m-${dim}-${i}`} style={s.matchedRow}>
                        <Ionicons name="checkmark-circle" size={14} color={GREEN} style={{ marginTop: 1, marginRight: 8 }} />
                        <Text style={s.matchedText}>{sig.signal}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          )}

          {/* ─── SECTION 2: BIGGEST LEVERS (unmatched high-impact) ─ */}
          {(unmatchedByDim.smart.length + unmatchedByDim.grit.length + unmatchedByDim.build.length) > 0 && (
            <View style={s.section}>
              <Text style={s.sectionHeading}>Biggest levers</Text>
              <Text style={s.sectionSub}>
                High-impact signals you haven't hit yet. Each one cited to real {isAdmissions ? 'admissions' : 'hiring'} research.
              </Text>
              {(['smart', 'grit', 'build'] as const).map((dim) => {
                const sigs = unmatchedByDim[dim];
                if (sigs.length === 0) return null;
                return (
                  <View key={`u-${dim}`} style={s.dimGroup}>
                    <Text style={[s.dimGroupLabel, { color: dimensionColor(dim) }]}>
                      {dimensionLabel(dim)} · {sigs.length} lever{sigs.length !== 1 ? 's' : ''}
                    </Text>
                    {sigs.map((sig, i) => (
                      <View key={`u-${dim}-${i}`} style={s.leverCard}>
                        <View style={[s.leverNum, { borderColor: dimensionColor(dim) }]}>
                          <Text style={[s.leverNumText, { color: dimensionColor(dim) }]}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.leverTitle}>{sig.signal}</Text>
                          {sig.rationale ? (
                            <Text style={s.leverBody}>{sig.rationale}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          )}

          {/* ─── SECTION 3: FASTEST PATH FORWARD ──────────────────── */}
          {ra.fastest_path_moves && ra.fastest_path_moves.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionHeading}>{pathHeading}</Text>
              <Text style={s.sectionSub}>
                Specific moves that move the score fastest. Do these this week.
              </Text>
              {ra.fastest_path_moves.map((move, i) => {
                const text = extractFastestPathText(move);
                if (!text) return null;
                return (
                  <View key={`p-${i}`} style={s.moveCard}>
                    <View style={s.moveNum}>
                      <Text style={s.moveNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.moveText}>{text}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* ─── SECTION 4: COMMON REJECTION REASONS ──────────────── */}
          {ra.common_rejection_reasons && ra.common_rejection_reasons.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionHeading}>{rejectionHeading}</Text>
              <Text style={s.sectionSub}>
                Make sure none of these apply to your resume before you apply.
              </Text>
              {ra.common_rejection_reasons.map((r, i) => {
                const { text, source } = extractRejectionText(r);
                if (!text) return null;
                return (
                  <View key={`r-${i}`} style={s.rejectRow}>
                    <Ionicons name="alert-circle-outline" size={13} color={colors.t2} style={{ marginTop: 2, marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rejectText}>{text}</Text>
                      {source ? (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(source).catch(() => null)}
                          activeOpacity={0.7}
                        >
                          <Text style={s.rejectSource}>Source: {source}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ─── SECTION 5: OTHER TRACKS YOU FIT ──────────────────── */}
          {ra.other_cohorts && ra.other_cohorts.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionHeading}>Other tracks you fit</Text>
              <Text style={s.sectionSub}>
                Secondary cohorts based on your minors and interests.
              </Text>
              {ra.other_cohorts.slice(0, 5).map((c, i) => (
                <View key={`o-${i}`} style={s.otherCohortRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.otherCohortName}>{c.display_name}</Text>
                    <Text style={s.otherCohortDims}>
                      Smart {Math.round(c.smart)} · Grit {Math.round(c.grit)} · Build {Math.round(c.build)}
                    </Text>
                  </View>
                  <Text style={[s.otherCohortScore, { color: c.above_bar ? GREEN : GOLD }]}>
                    {Math.round(c.composite)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ─── CTA ROW ─────────────────────────────────────────── */}
          <View style={s.ctaRow}>
            <TouchableOpacity
              style={s.ctaPrimary}
              onPress={() => router.push('/(app)/new-audit')}
              activeOpacity={0.85}
            >
              <Text style={s.ctaPrimaryText}>Re-audit my resume</Text>
              <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.ctaSecondary}
              onPress={() => router.push('/(app)/resume-editor')}
              activeOpacity={0.85}
            >
              <Text style={s.ctaSecondaryText}>Open resume editor</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: GOLD,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emptyHeading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: colors.t1,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: colors.t2,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Hero
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: GOLD,
    marginBottom: 5,
    marginTop: spacing.md,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: colors.t1,
    lineHeight: 27,
    marginBottom: spacing.md,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginBottom: spacing.sm,
  },
  heroScore: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 56,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: 60,
    color: colors.t1,
  },
  heroScoreOf: {
    fontSize: 16,
    fontWeight: '300',
    color: colors.t3,
    paddingBottom: 8,
    marginRight: spacing.md,
  },
  heroBarDistance: {
    flex: 1,
    alignItems: 'flex-end',
    paddingBottom: 10,
  },
  heroBarDistanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.t1,
    textAlign: 'right',
  },
  heroBarDistanceBar: {
    fontSize: 9,
    fontWeight: '500',
    color: colors.t3,
    marginTop: 2,
  },
  heroDimsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  heroDimTile: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.b1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  heroDimScore: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    fontWeight: '300',
    marginBottom: 2,
  },
  heroDimLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.t3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  takeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: 11,
    padding: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.lg,
  },
  takeText: {
    fontSize: 11,
    color: colors.t1,
    lineHeight: 16,
    fontWeight: '600',
    flex: 1,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 17,
    color: colors.t1,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 11,
    color: colors.t2,
    lineHeight: 16,
    marginBottom: spacing.md,
  },

  // Dimension groups
  dimGroup: {
    marginBottom: spacing.md,
  },
  dimGroupLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    marginBottom: 6,
  },

  // Matched signals
  matchedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(52,199,89,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.18)',
    borderRadius: 9,
    padding: 9,
    paddingHorizontal: 11,
    marginBottom: 4,
  },
  matchedText: {
    fontSize: 11,
    color: colors.t1,
    lineHeight: 15,
    fontWeight: '500',
    flex: 1,
  },

  // Unmatched levers
  leverCard: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: 'rgba(43,58,142,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(43,58,142,0.18)',
    borderRadius: 11,
    padding: 11,
    marginBottom: 6,
  },
  leverNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  leverNumText: {
    fontSize: 10,
    fontWeight: '700',
  },
  leverTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 4,
    lineHeight: 16,
  },
  leverBody: {
    fontSize: 10.5,
    color: colors.t2,
    lineHeight: 15,
  },

  // Fastest path moves
  moveCard: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 11,
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  moveNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  moveNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
  },
  moveText: {
    fontSize: 11.5,
    color: colors.t1,
    lineHeight: 16,
    fontWeight: '500',
    flex: 1,
  },

  // Rejection reasons
  rejectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: 9,
    padding: 9,
    paddingHorizontal: 11,
    marginBottom: 4,
  },
  rejectText: {
    fontSize: 11,
    color: colors.t1,
    lineHeight: 15,
  },
  rejectSource: {
    fontSize: 9,
    color: BLUE,
    marginTop: 3,
    textDecorationLine: 'underline',
  },

  // Other cohorts
  otherCohortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: 11,
    padding: 12,
    marginBottom: 6,
  },
  otherCohortName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 2,
  },
  otherCohortDims: {
    fontSize: 9,
    color: colors.t3,
  },
  otherCohortScore: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    fontWeight: '400',
    marginLeft: spacing.sm,
  },

  // CTA row
  ctaRow: {
    flexDirection: 'column',
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  ctaPrimary: {
    backgroundColor: GOLD,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  ctaPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ctaSecondary: {
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.t2,
  },
});
