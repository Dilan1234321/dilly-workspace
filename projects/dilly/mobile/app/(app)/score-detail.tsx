import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
  Dimensions, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../lib/auth';
import { colors, spacing, radius } from '../../lib/tokens';

// ── Types ────────────────────────────────────────────────────────────────────

interface CohortScore {
  smart: number;
  grit: number;
  build: number;
  final?: number;
}

interface CohortEntry {
  name: string;
  type: 'MAJOR' | 'MINOR' | 'INTEREST';
  scores: CohortScore;
}

interface Rec {
  type?: string;
  title: string;
  action: string;
  current_line?: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

const DIM_COLOR: Record<string, string> = {
  smart: colors.blue,
  grit: colors.gold,
  build: colors.green,
};

const DIM_LABEL: Record<string, string> = {
  smart: 'SMART',
  grit: 'GRIT',
  build: 'BUILD',
};

// Peer avg fallbacks per dimension (used when real data unavailable)
const PEER_AVG_FALLBACK: Record<string, number> = { smart: 62, grit: 58, build: 55 };

const TYPE_ORDER: Record<string, number> = { MAJOR: 0, MINOR: 1, INTEREST: 2 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(n: number) {
  return n >= 75 ? colors.green : n >= 55 ? colors.amber : colors.coral;
}

function cohortFinal(s: CohortScore): number {
  if (s.final && s.final > 0) return Math.round(s.final);
  return Math.round((s.smart + s.grit + s.build) / 3);
}

function dimTagFromRec(rec: Rec): string {
  const t = (rec.title + rec.action).toLowerCase();
  if (t.includes('grit') || t.includes('leadership') || t.includes('impact')) return 'grit';
  if (t.includes('smart') || t.includes('academic') || t.includes('gpa')) return 'smart';
  return 'build';
}

// ── Screen ───────────────────────────────────────────────────────────────────

function Skeleton({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[{ width: width as any, height, borderRadius: 6, backgroundColor: '#E4E6F0', opacity }, style]} />;
}

export default function ScoreDetailScreen() {
  const insets = useSafeAreaInsets();
  const [cohorts, setCohorts]           = useState<CohortEntry[]>([]);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [recs, setRecs]                 = useState<Rec[]>([]);
  const [peerAvgs, setPeerAvgs]         = useState<Record<string, number>>(PEER_AVG_FALLBACK);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [fetchKey, setFetchKey]         = useState(0);
  const [displayScore, setDisplayScore] = useState(0);

  // Legacy fallback (single score, no cohort_scores)
  const [legacyAudit, setLegacyAudit] = useState<{
    final_score: number;
    scores: { smart: number; grit: number; build: number };
    evidence: Record<string, string>;
  } | null>(null);

  const scoreAnim = useRef(new Animated.Value(0)).current;
  const barAnims = useRef({
    smart: new Animated.Value(0),
    grit: new Animated.Value(0),
    build: new Animated.Value(0),
  }).current;

  const pillScrollRef = useRef<ScrollView>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, auditRaw] = await Promise.all([
          apiFetch('/profile').then(r => r.json()),
          apiFetch('/audit/latest').then(r => r.json()),
        ]);

        const p = profileRes as any;
        const auditObj = auditRaw?.audit ?? auditRaw;

        // Extract recommendations
        setRecs(auditObj?.recommendations || []);

        // Extract peer dimension bars if available
        const dimBarS = p?.dimension_bar_smart || auditObj?.dimension_bar_smart;
        const dimBarG = p?.dimension_bar_grit || auditObj?.dimension_bar_grit;
        const dimBarB = p?.dimension_bar_build || auditObj?.dimension_bar_build;
        if (dimBarS || dimBarG || dimBarB) {
          setPeerAvgs({
            smart: dimBarS || PEER_AVG_FALLBACK.smart,
            grit: dimBarG || PEER_AVG_FALLBACK.grit,
            build: dimBarB || PEER_AVG_FALLBACK.build,
          });
        }

        // Build cohort list from cohort_scores
        const cs = p?.cohort_scores;
        if (cs && typeof cs === 'object' && Object.keys(cs).length > 0) {
          const majors  = Array.isArray(p.majors) ? p.majors : (p.major ? [p.major] : []);
          const minors  = Array.isArray(p.minors) ? p.minors : (p.minor ? [p.minor] : []);
          const interests = Array.isArray(p.interests) ? p.interests : [];

          const majorSet = new Set(majors.map((m: string) => m.toLowerCase()));
          const minorSet = new Set(minors.map((m: string) => m.toLowerCase()));

          const entries: CohortEntry[] = [];
          for (const [name, scores] of Object.entries(cs)) {
            if (!scores || typeof scores !== 'object') continue;
            const s = scores as any;
            const smart = Number(s.smart) || 0;
            const grit  = Number(s.grit) || 0;
            const build = Number(s.build) || 0;
            if (smart === 0 && grit === 0 && build === 0) continue;

            let type: 'MAJOR' | 'MINOR' | 'INTEREST' = 'INTEREST';
            const nl = name.toLowerCase();
            if (majorSet.has(nl) || majors.some((m: string) => nl.includes(m.toLowerCase().split(' ')[0]))) {
              type = 'MAJOR';
            } else if (minorSet.has(nl) || minors.some((m: string) => nl.includes(m.toLowerCase().split(' ')[0]))) {
              type = 'MINOR';
            }

            entries.push({
              name,
              type,
              scores: { smart, grit, build, final: Number(s.final) || 0 },
            });
          }

          // Sort: Major first, then Minor, then Interest
          entries.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);

          if (entries.length > 0) {
            setCohorts(entries);
            setLoading(false);
            return;
          }
        }

        // ── Legacy fallback: no cohort_scores ────────────────────────────
        if (auditObj?.final_score) {
          const snap = p?.first_audit_snapshot?.scores;
          const smart = auditObj.scores?.smart ?? snap?.smart ?? 0;
          const grit  = auditObj.scores?.grit  ?? snap?.grit  ?? 0;
          const build = auditObj.scores?.build ?? snap?.build ?? 0;
          setLegacyAudit({
            final_score: auditObj.final_score,
            scores: { smart, grit, build },
            evidence: auditObj.evidence || {},
          });
        }
      } catch {
        // leave empty
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFetchKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  // ── Animate on cohort change ─────────────────────────────────────────────

  const active = cohorts[activeIdx];
  const activeScores = active?.scores;
  const activeFinal = activeScores ? cohortFinal(activeScores) : 0;

  useEffect(() => {
    if (!activeScores) return;
    const final = cohortFinal(activeScores);

    scoreAnim.setValue(0);
    const listener = scoreAnim.addListener(({ value }) => setDisplayScore(Math.round(value)));
    Animated.timing(scoreAnim, { toValue: final, duration: 600, useNativeDriver: false }).start();

    (['smart', 'grit', 'build'] as const).forEach(dim => {
      barAnims[dim].setValue(0);
      Animated.timing(barAnims[dim], {
        toValue: activeScores[dim],
        duration: 700,
        useNativeDriver: false,
      }).start();
    });

    return () => scoreAnim.removeListener(listener);
  }, [activeIdx, cohorts.length]);

  // Legacy animation
  useEffect(() => {
    if (!legacyAudit) return;
    scoreAnim.setValue(0);
    const listener = scoreAnim.addListener(({ value }) => setDisplayScore(Math.round(value)));
    Animated.timing(scoreAnim, { toValue: legacyAudit.final_score, duration: 800, useNativeDriver: false }).start();

    (['smart', 'grit', 'build'] as const).forEach(dim => {
      barAnims[dim].setValue(0);
      Animated.timing(barAnims[dim], {
        toValue: legacyAudit.scores[dim],
        duration: 700,
        useNativeDriver: false,
      }).start();
    });

    return () => scoreAnim.removeListener(listener);
  }, [legacyAudit]);

  const selectCohort = useCallback((idx: number) => {
    setActiveIdx(idx);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────

  const sc = scoreColor(activeFinal);

  const weakestDim = activeScores
    ? (['smart', 'grit', 'build'] as const).reduce((w, d) =>
        activeScores[d] < activeScores[w] ? d : w, 'smart' as const)
    : 'build';

  const visRecs = recs.slice(0, 2);
  const hasLocked = recs.length > 2;

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <View style={{ width: 36 }} />
          <Skeleton width={90} height={11} />
          <View style={{ width: 36 }} />
        </View>
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: 16 }}>
          {/* Hero score skeleton */}
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Skeleton width={100} height={72} style={{ borderRadius: 8, marginBottom: 8 }} />
            <Skeleton width={140} height={13} style={{ marginBottom: 6 }} />
            <Skeleton width={60} height={20} style={{ borderRadius: 10 }} />
          </View>
          {/* Dimension bars skeleton */}
          {[1, 2, 3].map(i => (
            <View key={i} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Skeleton width={50} height={9} />
                <Skeleton width={30} height={22} />
              </View>
              <Skeleton width="100%" height={8} style={{ borderRadius: 4 }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────

  if (cohorts.length === 0 && !legacyAudit) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={[s.backBtn, { top: insets.top + 14 }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </TouchableOpacity>
        <View style={s.center}>
          <Ionicons name="analytics-outline" size={48} color={colors.t3} style={{ marginBottom: 16 }} />
          <Text style={s.emptyTitle}>No scores yet</Text>
          <Text style={s.emptyText}>Upload your resume to see how you score across career fields.</Text>
        </View>
      </View>
    );
  }

  // ── Legacy single-score render ───────────────────────────────────────────

  if (cohorts.length === 0 && legacyAudit) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={s.backBtnHeader} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.t1} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>MY SCORES</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 36 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2B3A8E" />}>
          {/* Hero */}
          <View style={s.heroSection}>
            <Text style={[s.heroScore, { color: scoreColor(legacyAudit.final_score) }]}>{displayScore}</Text>
            <Text style={s.heroLabel}>Overall Score</Text>
          </View>
          {/* Dim bars */}
          {renderDimBars(legacyAudit.scores, barAnims, peerAvgs)}
          {/* Recs */}
          {renderRecs(visRecs, hasLocked, recs.length)}
        </ScrollView>
      </View>
    );
  }

  // ── Cohort-first render ──────────────────────────────────────────────────

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtnHeader} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>MY SCORES</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2B3A8E" />}
      >
        {/* ── Cohort Pills ─────────────────────────────────────────────── */}
        <ScrollView
          ref={pillScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillRow}
          style={s.pillScroll}
        >
          {cohorts.map((c, i) => {
            const isActive = i === activeIdx;
            return (
              <TouchableOpacity
                key={c.name}
                style={[
                  s.pill,
                  isActive && s.pillActive,
                ]}
                onPress={() => selectCohort(i)}
                activeOpacity={0.7}
              >
                <Text style={[s.pillText, isActive && s.pillTextActive]} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={[s.pillType, isActive && s.pillTypeActive]}>
                  {c.type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Cohort Hero ──────────────────────────────────────────────── */}
        {active && (
          <View style={s.heroSection}>
            <Text style={[s.heroScore, { color: sc }]}>{displayScore}</Text>
            <Text style={s.heroName}>{active.name}</Text>
            <View style={s.heroTypeBadge}>
              <Text style={s.heroTypeText}>{active.type}</Text>
            </View>
          </View>
        )}

        {/* ── S/G/B Dimension Bars ─────────────────────────────────────── */}
        {activeScores && renderDimBars(activeScores, barAnims, peerAvgs)}

        {/* ── All Cohorts At-a-Glance ──────────────────────────────────── */}
        {cohorts.length > 1 && (
          <>
            <Text style={s.sectionEyebrow}>ALL COHORTS</Text>
            <View style={s.glanceCard}>
              {cohorts.map((c, i) => {
                const final = cohortFinal(c.scores);
                const isActive = i === activeIdx;
                return (
                  <TouchableOpacity
                    key={c.name}
                    style={[s.glanceRow, isActive && s.glanceRowActive, i < cohorts.length - 1 && s.glanceRowBorder]}
                    onPress={() => selectCohort(i)}
                    activeOpacity={0.7}
                  >
                    <View style={s.glanceLeft}>
                      <Text style={[s.glanceName, isActive && s.glanceNameActive]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={s.glanceType}>{c.type}</Text>
                    </View>
                    <View style={s.glanceScores}>
                      <Text style={[s.glanceDim, { color: scoreColor(c.scores.smart) }]}>
                        {Math.round(c.scores.smart)}
                      </Text>
                      <Text style={[s.glanceDim, { color: scoreColor(c.scores.grit) }]}>
                        {Math.round(c.scores.grit)}
                      </Text>
                      <Text style={[s.glanceDim, { color: scoreColor(c.scores.build) }]}>
                        {Math.round(c.scores.build)}
                      </Text>
                      <View style={s.glanceFinalPill}>
                        <Text style={[s.glanceFinal, { color: scoreColor(final) }]}>{final}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {/* Column headers (S / G / B / F) */}
              <View style={s.glanceHeaders}>
                <View style={s.glanceLeft} />
                <View style={s.glanceScores}>
                  <Text style={s.glanceHeaderLabel}>S</Text>
                  <Text style={s.glanceHeaderLabel}>G</Text>
                  <Text style={s.glanceHeaderLabel}>B</Text>
                  <View style={s.glanceFinalPill}>
                    <Text style={s.glanceHeaderLabel}>F</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Gap Callout ──────────────────────────────────────────────── */}
        {activeScores && (
          <View style={[s.gapCard, { borderLeftColor: scoreColor(activeScores[weakestDim]) }]}>
            <Text style={s.gapHeadline}>
              {weakestDim.charAt(0).toUpperCase() + weakestDim.slice(1)} is your biggest opportunity
            </Text>
            <Text style={s.gapSub}>
              Your {weakestDim.charAt(0).toUpperCase() + weakestDim.slice(1)} is {Math.round(activeScores[weakestDim])} in {active?.name}. Peer average is around {peerAvgs[weakestDim]}. Close this gap to move up.
            </Text>
          </View>
        )}

        {/* ── Recommendations ──────────────────────────────────────────── */}
        {renderRecs(visRecs, hasLocked, recs.length)}
      </ScrollView>
    </View>
  );
}

// ── Shared render helpers ──────────────────────────────────────────────────

function renderDimBars(
  scores: { smart: number; grit: number; build: number },
  anims: Record<string, Animated.Value>,
  peerAvgs: Record<string, number>,
) {
  return (
    <View style={s.dimSection}>
      {(['smart', 'grit', 'build'] as const).map(dim => {
        const score = Math.round(scores[dim]);
        const color = DIM_COLOR[dim];
        const peerAvg = peerAvgs[dim] || 60;
        const barWidth = anims[dim].interpolate({
          inputRange: [0, 100],
          outputRange: ['0%', '100%'],
          extrapolate: 'clamp',
        });

        return (
          <View key={dim} style={s.dimRow}>
            <View style={s.dimLabelRow}>
              <Text style={s.dimLabel}>{DIM_LABEL[dim]}</Text>
              <Text style={[s.dimScore, { color: scoreColor(score) }]}>{score}</Text>
            </View>
            <View style={s.barTrack}>
              <Animated.View style={[s.barFill, { width: barWidth, backgroundColor: color }]} />
              {/* Peer avg marker */}
              <View style={[s.peerMarker, { left: `${Math.min(peerAvg, 100)}%` }]}>
                <View style={s.peerMarkerLine} />
              </View>
            </View>
            <View style={s.barLegendRow}>
              <Text style={s.barLegendYou}>You</Text>
              <Text style={s.barLegendPeer}>▾ Peer avg {peerAvg}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function renderRecs(visRecs: Rec[], hasLocked: boolean, totalCount: number) {
  if (visRecs.length === 0 && !hasLocked) return null;
  return (
    <>
      <Text style={s.sectionEyebrow}>WHAT TO DO NEXT</Text>
      {visRecs.map((rec, i) => {
        const dim = dimTagFromRec(rec);
        const color = DIM_COLOR[dim];
        return (
          <View key={i}>
            <View style={s.recRow}>
              <View style={[s.recTag, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                <Text style={[s.recTagText, { color }]}>{dim.toUpperCase()}</Text>
              </View>
              <View style={s.recBody}>
                <Text style={s.recTitle} numberOfLines={1}>{rec.title}</Text>
                <Text style={s.recAction} numberOfLines={2}>{rec.action}</Text>
              </View>
            </View>
            {i < visRecs.length - 1 && <View style={s.divider} />}
          </View>
        );
      })}
      {hasLocked && (
        <>
          <View style={s.divider} />
          <View style={s.lockedRow}>
            <View style={s.lockedBlur}>
              <Text style={s.lockedBlurText}>████████████████ ██████████</Text>
              <Text style={[s.lockedBlurText, { opacity: 0.4 }]}>████████████ ████████</Text>
            </View>
            <View style={s.lockedOverlay}>
              <Ionicons name="lock-closed" size={12} color={colors.indigo} />
              <Text style={s.lockedCount}>{totalCount - 2} more locked</Text>
            </View>
          </View>
          <TouchableOpacity style={s.unlockBtn} onPress={() => {}} activeOpacity={0.85}>
            <Text style={s.unlockBtnText}>Unlock all recommendations →</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { fontSize: 13, color: colors.t3 },

  // Empty
  emptyTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 16, color: colors.t1, marginBottom: 8 },
  emptyText:  { fontSize: 14, color: colors.t2, textAlign: 'center', lineHeight: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  backBtn: { position: 'absolute', left: spacing.xl, zIndex: 10 },
  backBtnHeader: { width: 36 },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.t1,
  },

  scroll: { paddingHorizontal: spacing.xl, paddingTop: 8 },

  // ── Cohort Pills ─────────────────────────────────────────────────────────
  pillScroll: { marginHorizontal: -spacing.xl, marginBottom: 4 },
  pillRow: { paddingHorizontal: spacing.xl, gap: 8, paddingVertical: 12 },
  pill: {
    borderWidth: 1,
    borderColor: colors.b2,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.s2,
    alignItems: 'center',
    maxWidth: 200,
  },
  pillActive: {
    borderColor: colors.gold,
    backgroundColor: colors.golddim,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.t2,
  },
  pillTextActive: {
    color: colors.gold,
  },
  pillType: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 7,
    letterSpacing: 1,
    color: colors.t3,
    marginTop: 2,
  },
  pillTypeActive: {
    color: colors.gold,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },
  heroScore: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 72,
    lineHeight: 80,
  },
  heroLabel: {
    fontSize: 13,
    color: colors.t2,
    marginTop: 4,
  },
  heroName: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 13,
    letterSpacing: 0.8,
    color: colors.t1,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
  heroTypeBadge: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroTypeText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 7,
    letterSpacing: 1.2,
    color: colors.gold,
  },

  // ── Dimension Bars ────────────────────────────────────────────────────────
  dimSection: { gap: 16, marginBottom: 24 },
  dimRow: {},
  dimLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  dimLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.t3,
  },
  dimScore: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    lineHeight: 26,
  },
  barTrack: {
    height: 8,
    backgroundColor: colors.b2,
    borderRadius: radius.full,
    overflow: 'visible',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
    opacity: 0.85,
  },
  peerMarker: {
    position: 'absolute',
    top: -3,
    transform: [{ translateX: -1 }],
  },
  peerMarkerLine: {
    width: 2,
    height: 14,
    backgroundColor: colors.t1,
    borderRadius: 1,
    opacity: 0.45,
  },
  barLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  barLegendYou: {
    fontSize: 9,
    color: colors.t3,
  },
  barLegendPeer: {
    fontSize: 9,
    color: colors.t3,
  },

  // ── Section eyebrow ───────────────────────────────────────────────────────
  sectionEyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.t3,
    marginBottom: 12,
    marginTop: 8,
  },

  // ── Glance Card ───────────────────────────────────────────────────────────
  glanceCard: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  glanceHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
    backgroundColor: colors.s3,
  },
  glanceHeaderLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 7,
    letterSpacing: 0.8,
    color: colors.t3,
    width: 32,
    textAlign: 'center',
  },
  glanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  glanceRowActive: {
    backgroundColor: colors.golddim,
  },
  glanceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  glanceLeft: {
    flex: 1,
    marginRight: 10,
  },
  glanceName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.t2,
  },
  glanceNameActive: {
    color: colors.gold,
    fontWeight: '700',
  },
  glanceType: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 7,
    letterSpacing: 0.8,
    color: colors.t3,
    marginTop: 2,
  },
  glanceScores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  glanceDim: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 13,
    width: 32,
    textAlign: 'center',
  },
  glanceFinalPill: {
    width: 36,
    alignItems: 'center',
  },
  glanceFinal: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Gap Callout ───────────────────────────────────────────────────────────
  gapCard: {
    backgroundColor: colors.s3,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 20,
  },
  gapHeadline: { fontSize: 14, fontWeight: '700', color: colors.t1, marginBottom: 4 },
  gapSub:      { fontSize: 12, color: colors.t2, lineHeight: 18 },

  // ── Recommendations ───────────────────────────────────────────────────────
  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  recTag: {
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3,
    marginTop: 1,
  },
  recTagText: { fontFamily: 'Cinzel_700Bold', fontSize: 7, letterSpacing: 0.8 },
  recBody:    { flex: 1 },
  recTitle:   { fontSize: 13, fontWeight: '600', color: colors.t1, marginBottom: 3 },
  recAction:  { fontSize: 12, color: colors.t2, lineHeight: 17 },
  divider:    { height: 1, backgroundColor: colors.b1 },

  // ── Locked ────────────────────────────────────────────────────────────────
  lockedRow: {
    position: 'relative',
    paddingVertical: 14,
    overflow: 'hidden',
  },
  lockedBlur: { opacity: 0.2 },
  lockedBlurText: { fontSize: 13, color: colors.t1, marginBottom: 4, letterSpacing: 2 },
  lockedOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  lockedCount: { fontSize: 12, color: colors.indigo },
  unlockBtn: {
    backgroundColor: colors.indigo,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  unlockBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
