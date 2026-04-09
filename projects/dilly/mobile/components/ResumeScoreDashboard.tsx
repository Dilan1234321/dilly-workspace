/**
 * ResumeScoreDashboard  -  powers the build-63 resume editor coaching surface.
 *
 * Single component that renders three coaching sections using data from the
 * new /resume/editor-scan endpoint:
 *
 *   1. Per-vendor ATS sidebar  -  Workday / Taleo / iCIMS / Greenhouse / Lever
 *      composite scores with a colored bar per vendor
 *   2. Rubric dimension rings  -  Smart / Grit / Build mini progress rings
 *      showing how the student's resume matches their primary cohort rubric
 *   3. Prioritized "Fix this first" issue list  -  top 5 actions ranked by
 *      estimated score lift, with a "Fix with Dilly" action button on each
 *
 * Designed to render in a collapsible panel inside the resume editor. Parent
 * controls visibility and feeds the scan data via props so the debounced
 * network call lives in ats/resume-editor.tsx.
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE = '#0A84FF';

// ── Types (mirror backend /resume/editor-scan response) ────────────────────

type FactorScore = {
  value: number;
  low: number;
  high: number;
  reasons?: Array<{ id: string; title: string; delta: number }>;
};

type VendorScore = {
  vendor_key: string;
  vendor_display: string;
  parseability: FactorScore;
  extraction: FactorScore;
  keyword: FactorScore;
  composite: FactorScore;
  forecast_if_all_fixed: number;
};

type V2Payload = {
  overall: FactorScore;
  overall_forecast_if_all_fixed: number;
  vendors: VendorScore[];
  issues: any[];
};

type RubricPayload = {
  primary_cohort_display_name?: string;
  primary_composite?: number;
  primary_smart?: number;
  primary_grit?: number;
  primary_build?: number;
  unmatched_signals?: Array<{
    signal: string;
    dimension?: string;
    tier?: string;
    rationale?: string;
  }>;
};

type TopIssue = {
  id: string;
  source: 'ats' | 'rubric';
  severity: string;
  title: string;
  fix: string;
  category?: string;
  avg_lift: number;
  total_lift: number;
  affects_vendors?: string[];
  lift_per_vendor?: Record<string, number>;
};

export type KeywordCell = {
  keyword: string;
  count: number;
  placement: 'strong' | 'adequate' | 'weak' | 'missing';
};

export type ReorderSuggestion = {
  vendor: string;
  message: string;
  current_order: string[];
  suggested_order: string[];
};

export type EditorScanData = {
  v2: V2Payload;
  rubric_analysis: RubricPayload;
  top_issues: TopIssue[];
  keyword_cells?: KeywordCell[];
  reorder_suggestion?: ReorderSuggestion | null;
  legacy_ats_vendors?: Record<string, { system: string; score: number }>;
  legacy_ats_overall?: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(v: number): string {
  if (v >= 85) return GREEN;
  if (v >= 70) return AMBER;
  if (v >= 50) return GOLD;
  return CORAL;
}

function dimensionColor(v: number): string {
  if (v >= 70) return GREEN;
  if (v >= 50) return AMBER;
  return CORAL;
}

// ── Dimension ring (SVG circular progress with number in the middle) ─────

function DimensionRing({ label, value, missing }: {
  label: string;
  value: number;
  missing?: string[];
}) {
  const color = dimensionColor(value);
  const clamped = Math.max(0, Math.min(100, value));
  const size = 56;
  const strokeWidth = 4.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // SVG strokeDashoffset advances CLOCKWISE from 12 o'clock thanks to the rotate(-90)
  const progressLength = (clamped / 100) * circumference;
  const dashOffset = circumference - progressLength;

  return (
    <View style={s.dimensionCol}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.b1}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress arc  -  start at 12 o'clock by rotating -90deg around center */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Text style={[s.dimRingNum, { color, position: 'absolute' }]}>
          {Math.round(value)}
        </Text>
      </View>
      <Text style={s.dimLabel}>{label}</Text>
      {missing && missing.length > 0 && (
        <Text style={s.dimMissing} numberOfLines={2}>
          {missing[0]}
        </Text>
      )}
    </View>
  );
}

// ── Vendor score bar (one per ATS vendor) ─────────────────────────────────

function VendorBar({ vendor }: { vendor: VendorScore }) {
  const color = scoreColor(vendor.composite.value);
  const lift = vendor.forecast_if_all_fixed - vendor.composite.value;
  return (
    <View style={s.vendorBarRow}>
      <Text style={s.vendorBarLabel} numberOfLines={1}>
        {vendor.vendor_display}
      </Text>
      <View style={s.vendorBarTrackWrap}>
        <View style={s.vendorBarTrack}>
          <View
            style={[
              s.vendorBarFill,
              { width: `${Math.max(0, Math.min(100, vendor.composite.value))}%`, backgroundColor: color },
            ]}
          />
        </View>
      </View>
      <Text style={[s.vendorBarScore, { color }]}>{Math.round(vendor.composite.value)}</Text>
      {lift >= 1 && (
        <Text style={s.vendorBarLift}>+{Math.round(lift)}</Text>
      )}
    </View>
  );
}

// ── Top issue row ──────────────────────────────────────────────────────────

function TopIssueRow({ issue, rank, onFix }: {
  issue: TopIssue;
  rank: number;
  onFix: (i: TopIssue) => void;
}) {
  const sev = issue.severity || 'medium';
  const sevColor = sev === 'critical' ? CORAL : sev === 'high' ? AMBER : BLUE;
  const lift = Math.round(issue.total_lift || issue.avg_lift || 0);
  return (
    <Pressable style={s.issueRow} onPress={() => onFix(issue)}>
      <View style={[s.issueRank, { backgroundColor: sevColor + '20' }]}>
        <Text style={[s.issueRankText, { color: sevColor }]}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.issueTitle} numberOfLines={2}>{issue.title}</Text>
        <Text style={s.issueFix} numberOfLines={2}>{issue.fix}</Text>
        <View style={s.issueMetaRow}>
          <View style={[s.liftPill, { backgroundColor: GREEN + '18' }]}>
            <Ionicons name="trending-up" size={9} color={GREEN} />
            <Text style={s.liftText}>+{lift}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="sparkles" size={14} color={GOLD} />
    </Pressable>
  );
}

// ── Cohort switcher chip row ───────────────────────────────────────────────

function ScrollableChips({ options, activeId, onSelect }: {
  options: Array<{ cohort_id: string; display_name: string }>;
  activeId: string | null;
  onSelect: (cohortId: string | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
      <Pressable
        style={[s.cohortChip, !activeId && s.cohortChipActive]}
        onPress={() => onSelect(null)}
      >
        <Text style={[s.cohortChipText, !activeId && s.cohortChipTextActive]}>Auto</Text>
      </Pressable>
      {options.map(opt => {
        const isActive = opt.cohort_id === activeId;
        // Trim the "Tech  - " / "Business  - " prefix for tighter chip labels
        const short = opt.display_name.replace(/^(Tech|Business|Science|Health|Social Sciences|Quantitative|Arts & Design)\s*[ - -]\s*/i, '');
        return (
          <Pressable
            key={opt.cohort_id}
            style={[s.cohortChip, isActive && s.cohortChipActive]}
            onPress={() => onSelect(opt.cohort_id)}
          >
            <Text
              style={[s.cohortChipText, isActive && s.cohortChipTextActive]}
              numberOfLines={1}
            >
              {short}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export type CohortOption = { cohort_id: string; display_name: string };

export default function ResumeScoreDashboard({
  scan, loading, onFixIssue,
  cohortOptions, activeCohortId, onSelectCohort,
  onApplyReorder,
}: {
  scan: EditorScanData | null;
  loading: boolean;
  onFixIssue: (issue: TopIssue) => void;
  cohortOptions?: CohortOption[];
  activeCohortId?: string | null;
  onSelectCohort?: (cohortId: string | null) => void;
  onApplyReorder?: (suggestedOrder: string[]) => void;
}) {
  const ringMissingByDim = useMemo(() => {
    const out: Record<string, string[]> = { smart: [], grit: [], build: [] };
    const unmatched = scan?.rubric_analysis?.unmatched_signals || [];
    for (const sig of unmatched) {
      const dim = (sig.dimension || '').toLowerCase();
      if (dim in out && out[dim].length < 2) {
        out[dim].push(sig.signal);
      }
    }
    return out;
  }, [scan]);

  if (loading && !scan) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={GOLD} />
        <Text style={s.loadingText}>Analyzing your resume…</Text>
      </View>
    );
  }

  if (!scan || !scan.v2) {
    return (
      <View style={s.emptyWrap}>
        <Text style={s.emptyText}>Add a few more details and we'll score your resume.</Text>
      </View>
    );
  }

  // Per-vendor ATS bars now read from legacy_ats_vendors so the numbers
  // match the dedicated /ats page. The hero "overall score" was removed
  // per product decision  -  Smart/Grit/Build rings are the only scores
  // the coaching dashboard surfaces.
  const legacyVendors = scan.legacy_ats_vendors || {};
  const vendorOrder = ['workday', 'taleo', 'icims', 'greenhouse', 'lever', 'ashby', 'successfactors'];
  const vendorBars = vendorOrder
    .filter(k => legacyVendors[k] != null)
    .map(k => ({
      vendor_key: k,
      vendor_display: legacyVendors[k].system || k,
      score: Math.round(legacyVendors[k].score || 0),
    }));

  const ra = scan.rubric_analysis;
  const hasRubric = !!ra && (
    (typeof ra.primary_smart === 'number' && ra.primary_smart > 0) ||
    (typeof ra.primary_grit  === 'number' && ra.primary_grit  > 0) ||
    (typeof ra.primary_build === 'number' && ra.primary_build > 0)
  );

  return (
    <View style={s.container}>
      {/* ── Cohort switcher (preview against a different rubric) ───── */}
      {cohortOptions && cohortOptions.length > 1 && onSelectCohort && (
        <View style={s.cohortSwitcherWrap}>
          <Text style={s.cohortSwitcherLabel}>SCORING AGAINST</Text>
          <ScrollableChips
            options={cohortOptions}
            activeId={activeCohortId || null}
            onSelect={onSelectCohort}
          />
        </View>
      )}

      {/* ── Rubric dimension rings ──────────────────────────────────── */}
      {hasRubric && (
        <View style={s.rubricBlock}>
          <Text style={s.sectionLabel}>
            {ra?.primary_cohort_display_name
              ? `${ra.primary_cohort_display_name.toUpperCase()} FIT`
              : 'COHORT FIT'}
          </Text>
          <View style={s.ringsRow}>
            <DimensionRing label="Smart" value={ra?.primary_smart ?? 0} missing={ringMissingByDim.smart} />
            <DimensionRing label="Grit"  value={ra?.primary_grit  ?? 0} missing={ringMissingByDim.grit} />
            <DimensionRing label="Build" value={ra?.primary_build ?? 0} missing={ringMissingByDim.build} />
          </View>
        </View>
      )}

      {/* ── Per-vendor ATS bars (from legacy engine, matches /ats page) ── */}
      {vendorBars.length > 0 && (
        <View style={s.vendorBlock}>
          <Text style={s.sectionLabel}>BY ATS VENDOR</Text>
          {vendorBars.map(v => (
            <View key={v.vendor_key} style={s.legacyVendorRow}>
              <Text style={s.legacyVendorName}>{v.vendor_display}</Text>
              <View style={s.legacyVendorBarTrack}>
                <View style={[s.legacyVendorBarFill, {
                  width: `${Math.max(0, Math.min(100, v.score))}%`,
                  backgroundColor: scoreColor(v.score),
                }]} />
              </View>
              <Text style={[s.legacyVendorScore, { color: scoreColor(v.score) }]}>
                {v.score}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Prioritized top issues ──────────────────────────────────── */}
      {scan.top_issues && scan.top_issues.length > 0 && (
        <View style={s.issueBlock}>
          <Text style={s.sectionLabel}>FIX THIS FIRST</Text>
          {scan.top_issues.slice(0, 5).map((iss, i) => (
            <TopIssueRow
              key={`${iss.id}-${i}`}
              issue={iss}
              rank={i + 1}
              onFix={onFixIssue}
            />
          ))}
        </View>
      )}

      {scan.top_issues && scan.top_issues.length === 0 && (
        <View style={s.allClearWrap}>
          <Ionicons name="checkmark-circle" size={18} color={GREEN} />
          <Text style={s.allClearText}>No blocking issues. Your resume is in great shape.</Text>
        </View>
      )}

      {/* Build 69: cohort-aware section reorder suggestion */}
      {scan.reorder_suggestion && (
        <View style={s.reorderCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Ionicons name="reorder-three" size={14} color={GOLD} />
            <Text style={s.reorderLabel}>SECTION ORDER</Text>
          </View>
          <Text style={s.reorderMessage}>{scan.reorder_suggestion.message}</Text>
          <View style={s.reorderOrderRow}>
            {scan.reorder_suggestion.suggested_order.slice(0, 6).map((sec, i) => (
              <View key={`${sec}-${i}`} style={s.reorderChip}>
                <Text style={s.reorderChipText}>{sec.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
          {onApplyReorder && (
            <Pressable
              style={s.reorderApplyBtn}
              onPress={() => onApplyReorder(scan.reorder_suggestion!.suggested_order)}
            >
              <Ionicons name="checkmark-circle" size={12} color={GOLD} />
              <Text style={s.reorderApplyText}>Apply this order</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Build 69: inline keyword heatmap */}
      {scan.keyword_cells && scan.keyword_cells.length > 0 && (
        <View style={s.keywordBlock}>
          <Text style={s.sectionLabel}>KEYWORD PLACEMENT</Text>
          <View style={s.keywordGrid}>
            {scan.keyword_cells.slice(0, 20).map((cell, i) => {
              const colorMap: Record<string, string> = {
                strong:   GREEN,
                adequate: BLUE,
                weak:     AMBER,
                missing:  CORAL,
              };
              const c = colorMap[cell.placement] || colors.t3;
              return (
                <View
                  key={`${cell.keyword}-${i}`}
                  style={[s.keywordChip, { backgroundColor: c + '15', borderColor: c + '35' }]}
                >
                  <Text style={[s.keywordChipText, { color: c }]}>{cell.keyword}</Text>
                  {cell.count > 0 && (
                    <Text style={[s.keywordChipCount, { color: c }]}>·{cell.count}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.s2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
    marginBottom: 12,
  },

  loadingWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 24,
  },
  loadingText: { fontSize: 11, color: colors.t3 },

  emptyWrap: {
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 16, alignItems: 'center',
  },
  emptyText: { fontSize: 11, color: colors.t3 },

  // Cohort switcher
  cohortSwitcherWrap: { marginBottom: 14 },
  cohortSwitcherLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.2, color: GOLD,
    marginBottom: 6,
  },
  chipScroll: { gap: 6, paddingVertical: 2 },
  cohortChip: {
    backgroundColor: colors.s3, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 10, paddingVertical: 5, marginRight: 6,
  },
  cohortChipActive: {
    backgroundColor: GOLD + '18', borderColor: GOLD + '60',
  },
  cohortChipText: { fontSize: 11, color: colors.t3, fontWeight: '600', maxWidth: 140 },
  cohortChipTextActive: { color: GOLD, fontWeight: '700' },

  heroRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroLeft: { flexDirection: 'column' },
  heroLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3, color: GOLD, marginBottom: 2 },
  heroNum: { fontSize: 32, fontWeight: '800', lineHeight: 34 },
  heroOf: { fontSize: 12, color: colors.t3 },
  heroSub: { fontSize: 10, color: colors.t3, marginTop: 2 },
  forecastChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN + '15', borderRadius: 16, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: GREEN + '30',
  },
  forecastChipText: { fontSize: 10, fontWeight: '700', color: GREEN },

  sectionLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.2, color: GOLD,
    marginBottom: 8, marginTop: 4,
  },

  // Rubric dimension rings
  rubricBlock: { marginBottom: 12 },
  ringsRow: { flexDirection: 'row', gap: 10 },
  dimensionCol: { flex: 1, alignItems: 'center' },
  dimRingOuter: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  dimRingTrack: {
    position: 'absolute', top: 0, left: 0, width: 52, height: 52, borderRadius: 26,
    borderWidth: 4, borderColor: colors.b1,
  },
  dimRingFill: {
    position: 'absolute', top: 0, left: 0, width: 52, height: 52, borderRadius: 26,
    borderWidth: 4, borderColor: 'transparent',
  },
  dimRingNum: { fontSize: 13, fontWeight: '800' },
  dimLabel: { fontSize: 10, fontWeight: '700', color: colors.t2, marginTop: 4 },
  dimMissing: { fontSize: 9, color: colors.t3, textAlign: 'center', marginTop: 2, lineHeight: 12 },

  // Vendor bars
  vendorBlock: { marginBottom: 12 },
  legacyVendorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  legacyVendorName: { flex: 0, width: 90, fontSize: 11, color: colors.t2 },
  legacyVendorBarTrack: {
    flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.b1, overflow: 'hidden',
  },
  legacyVendorBarFill: { height: '100%', borderRadius: 3 },
  legacyVendorScore: { fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right' },
  vendorBarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  vendorBarLabel: { width: 62, fontSize: 10, color: colors.t2, fontWeight: '600' },
  vendorBarTrackWrap: { flex: 1 },
  vendorBarTrack: { height: 5, backgroundColor: colors.b1, borderRadius: 999, overflow: 'hidden' },
  vendorBarFill: { height: '100%', borderRadius: 999 },
  vendorBarScore: { width: 24, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  vendorBarLift: { fontSize: 9, color: GREEN, fontWeight: '600', width: 22, textAlign: 'right' },

  // Top issues
  issueBlock: {},
  issueRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.s3, borderRadius: 10,
    padding: 10, marginBottom: 6,
  },
  issueRank: {
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  issueRankText: { fontSize: 10, fontWeight: '800' },
  issueTitle: { fontSize: 12, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  issueFix: { fontSize: 10, color: colors.t3, lineHeight: 14, marginBottom: 4 },
  issueMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liftPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  liftText: { fontSize: 9, fontWeight: '700', color: GREEN },
  effortText: { fontSize: 9, color: colors.t3 },

  allClearWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREEN + '10', borderRadius: 10, borderWidth: 1, borderColor: GREEN + '30',
    padding: 10,
  },
  allClearText: { flex: 1, fontSize: 11, color: colors.t1, fontWeight: '600' },

  // Build 69  -  section reorder suggestion
  reorderCard: {
    backgroundColor: GOLD + '08', borderRadius: 10, borderWidth: 1, borderColor: GOLD + '30',
    padding: 12, marginTop: 14,
  },
  reorderLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: GOLD },
  reorderMessage: { fontSize: 11, color: colors.t1, lineHeight: 15, marginBottom: 8 },
  reorderOrderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  reorderChip: {
    backgroundColor: colors.s3, borderRadius: 6, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  reorderChipText: { fontSize: 9, color: colors.t2, fontWeight: '600', textTransform: 'capitalize' },
  reorderApplyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: 10, paddingVertical: 8,
    backgroundColor: GOLD + '12', borderRadius: 8, borderWidth: 1, borderColor: GOLD + '30',
  },
  reorderApplyText: { fontSize: 11, color: GOLD, fontWeight: '700' },

  // Build 69  -  inline keyword heatmap
  keywordBlock: { marginTop: 14 },
  keywordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  keywordChip: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3,
  },
  keywordChipText: { fontSize: 10, fontWeight: '600' },
  keywordChipCount: { fontSize: 9, fontWeight: '700' },
});
