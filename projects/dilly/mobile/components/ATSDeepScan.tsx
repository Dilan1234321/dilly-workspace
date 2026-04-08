/**
 * ATSDeepScan — v2 scoring UI for the ATS scanner screen.
 *
 * Renders the rich output of the new /ats/scan?v2 pipeline:
 *   1. Hero composite score with confidence band and forecast
 *   2. File-level red flags (image-only PDF, XFA, embedded fonts, etc.)
 *   3. Per-vendor cards: composite score, three sub-factors (Parseability /
 *      Extraction / Keyword), and the per-vendor extraction view showing
 *      what each parser pulls and drops.
 *   4. Top-lift fix list: the highest-impact issues with estimated score lift
 *      per vendor and a cumulative forecast.
 *   5. Side-by-side rewrite previews when rewrites data is provided.
 *   6. Keyword density heatmap when density data is provided.
 *
 * All sections are self-contained and render only when their data is present.
 */

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE = '#0A84FF';

// ── Types (mirror the backend v2 payload) ───────────────────────────────────

type FactorScore = {
  value: number;
  low: number;
  high: number;
  reasons: Array<{ id: string; title: string; category: string; delta: number }>;
};

type ExtractedField = {
  key: string;
  label: string;
  status: 'extracted' | 'partial' | 'dropped' | 'missing';
  value?: string | null;
  note?: string | null;
};

type VendorExtraction = {
  vendor_key: string;
  vendor_display: string;
  fields: ExtractedField[];
  experience_captured: number;
  experience_total: number;
  bullets_captured: number;
  bullets_total: number;
  sections_captured: string[];
  sections_dropped: string[];
  completeness: number;
};

type VendorScoreV2 = {
  vendor_key: string;
  vendor_display: string;
  parseability: FactorScore;
  extraction: FactorScore;
  keyword: FactorScore;
  composite: FactorScore;
  extraction_view: VendorExtraction;
  top_issues: Array<{
    id: string; title: string; severity: string; category: string;
    lift: number; fix: string;
  }>;
  forecast_if_all_fixed: number;
  notes: string;
};

export type ATSScoreV2 = {
  overall: FactorScore;
  overall_forecast_if_all_fixed: number;
  vendors: VendorScoreV2[];
  issues: Array<{
    id: string; category: string; severity: string;
    title: string; fix: string; detail: string;
    base_lift: number;
    affects: string[];
    lift_per_vendor: Record<string, number>;
  }>;
  file_redflags: Array<{ level: string; title: string; detail: string }>;
  meta?: Record<string, any>;
};

// Optional shapes for rewrite previews and keyword density
export type RewriteSuggestion = {
  original: string;
  rewritten: string;
  changes: Array<{ from: string; to: string; reason: string }>;
  confidence?: number;
};

export type KeywordCell = {
  keyword: string;
  count: number;
  placement: 'strong' | 'adequate' | 'weak' | 'missing';
  sections?: string[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number): string {
  if (v >= 85) return GREEN;
  if (v >= 70) return AMBER;
  return CORAL;
}

function severityColor(sev: string): string {
  return sev === 'critical' ? CORAL : sev === 'high' ? AMBER : sev === 'medium' ? BLUE : colors.t3;
}

function statusColor(s: string): string {
  if (s === 'extracted') return GREEN;
  if (s === 'partial')   return AMBER;
  if (s === 'dropped')   return CORAL;
  return colors.t3;
}

function statusIcon(s: string): keyof typeof Ionicons.glyphMap {
  if (s === 'extracted') return 'checkmark-circle';
  if (s === 'partial')   return 'alert-circle';
  if (s === 'dropped')   return 'close-circle';
  return 'help-circle';
}

// ── Hero score ──────────────────────────────────────────────────────────────

function HeroScore({ overall, forecast }: { overall: FactorScore; forecast: number }) {
  const delta = forecast - overall.value;
  return (
    <View style={s.heroWrap}>
      <View style={s.heroScoreRow}>
        <View>
          <Text style={s.heroLabel}>ATS COMPATIBILITY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={[s.heroNumber, { color: scoreColor(overall.value) }]}>
              {Math.round(overall.value)}
            </Text>
            <Text style={s.heroSuffix}>/100</Text>
          </View>
          <Text style={s.heroBand}>
            Confidence: {Math.round(overall.low)}–{Math.round(overall.high)}
          </Text>
        </View>
        {delta >= 1 && (
          <View style={s.forecastChip}>
            <Ionicons name="trending-up" size={12} color={GREEN} />
            <Text style={s.forecastChipText}>+{Math.round(delta)} if fixed</Text>
          </View>
        )}
      </View>
      {/* Progress bar */}
      <View style={s.heroBar}>
        <View
          style={[
            s.heroBarFill,
            { width: `${Math.min(100, Math.max(0, overall.value))}%`, backgroundColor: scoreColor(overall.value) },
          ]}
        />
        {delta > 0 && (
          <View
            style={[
              s.heroBarForecast,
              { left: `${Math.min(100, Math.max(0, overall.value))}%`,
                width: `${Math.min(100 - overall.value, delta)}%` },
            ]}
          />
        )}
      </View>
    </View>
  );
}

// ── File red flags ──────────────────────────────────────────────────────────

function FileRedFlags({ flags }: { flags: ATSScoreV2['file_redflags'] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <View style={s.redFlagsWrap}>
      <Text style={s.sectionLabel}>FILE RED FLAGS</Text>
      {flags.map((rf, i) => (
        <View
          key={`${rf.title}-${i}`}
          style={[
            s.redFlagCard,
            { borderLeftColor: rf.level === 'critical' ? CORAL : rf.level === 'high' ? AMBER : BLUE },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Ionicons
              name={rf.level === 'critical' ? 'alert' : 'warning'}
              size={14}
              color={rf.level === 'critical' ? CORAL : AMBER}
            />
            <Text style={s.redFlagTitle}>{rf.title}</Text>
          </View>
          <Text style={s.redFlagDetail}>{rf.detail}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Per-vendor card with expandable extraction view ─────────────────────────

function VendorCard({ vendor, onFixPress, pinned }: {
  vendor: VendorScoreV2;
  onFixPress?: (vendorName: string, issue: { title: string; fix: string; lift: number }) => void;
  pinned?: boolean;
}) {
  const [expanded, setExpanded] = useState(!!pinned);
  const color = scoreColor(vendor.composite.value);
  const ev = vendor.extraction_view;
  const expCapture = ev.experience_total > 0
    ? `${ev.experience_captured}/${ev.experience_total}`
    : '—';
  const bulletCapture = ev.bullets_total > 0
    ? `${ev.bullets_captured}/${ev.bullets_total}`
    : '—';
  const lift = vendor.forecast_if_all_fixed - vendor.composite.value;

  return (
    <Pressable onPress={() => setExpanded(e => !e)} style={[s.vendorCard, pinned && s.vendorCardPinned]}>
      {pinned && (
        <View style={s.pinnedBadge}>
          <Ionicons name="pin" size={10} color="#FFFFFF" />
          <Text style={s.pinnedBadgeText}>TARGET</Text>
        </View>
      )}
      {/* Header */}
      <View style={s.vendorHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.vendorName}>{vendor.vendor_display}</Text>
          <Text style={s.vendorNotes} numberOfLines={expanded ? undefined : 1}>
            {vendor.notes}
          </Text>
        </View>
        <View style={[s.vendorScorePill, { backgroundColor: color + '15', borderColor: color + '40' }]}>
          <Text style={[s.vendorScoreText, { color }]}>{Math.round(vendor.composite.value)}</Text>
        </View>
      </View>

      {/* Sub-factor bars */}
      <View style={s.factorBarsRow}>
        <FactorBar label="Parse"   score={vendor.parseability.value} />
        <FactorBar label="Extract" score={vendor.extraction.value} />
        <FactorBar label="Keyword" score={vendor.keyword.value} />
      </View>

      {/* Forecast chip */}
      {lift >= 1 && (
        <View style={s.vendorForecastRow}>
          <Ionicons name="trending-up" size={11} color={GREEN} />
          <Text style={s.vendorForecastText}>
            Fix all issues → <Text style={{ color: GREEN, fontWeight: '700' }}>{Math.round(vendor.forecast_if_all_fixed)}</Text> (+{Math.round(lift)})
          </Text>
        </View>
      )}

      {expanded && (
        <View style={s.vendorExpandedWrap}>
          {/* Extraction view */}
          <Text style={s.miniLabel}>WHAT {vendor.vendor_display.toUpperCase()} EXTRACTS</Text>
          <View style={s.extractFieldsCol}>
            {ev.fields.map(f => (
              <View key={f.key} style={s.extractFieldRow}>
                <Ionicons name={statusIcon(f.status)} size={12} color={statusColor(f.status)} />
                <Text style={s.extractFieldLabel}>{f.label}</Text>
                <Text style={[s.extractFieldStatus, { color: statusColor(f.status) }]}>
                  {f.status}
                </Text>
                {f.note && <Text style={s.extractFieldNote}> · {f.note}</Text>}
              </View>
            ))}
          </View>

          {/* Structural capture stats */}
          <View style={s.extractStatsRow}>
            <View style={s.extractStatCol}>
              <Text style={s.extractStatVal}>{expCapture}</Text>
              <Text style={s.extractStatLabel}>Experience</Text>
            </View>
            <View style={s.extractStatCol}>
              <Text style={s.extractStatVal}>{bulletCapture}</Text>
              <Text style={s.extractStatLabel}>Bullets</Text>
            </View>
            <View style={s.extractStatCol}>
              <Text style={s.extractStatVal}>{Math.round(ev.completeness * 100)}%</Text>
              <Text style={s.extractStatLabel}>Complete</Text>
            </View>
          </View>

          {ev.sections_dropped.length > 0 && (
            <View style={s.droppedRow}>
              <Ionicons name="close-circle" size={12} color={CORAL} />
              <Text style={s.droppedText}>
                Dropped: {ev.sections_dropped.join(', ')}
              </Text>
            </View>
          )}
          {ev.sections_captured.length > 0 && (
            <View style={s.capturedRow}>
              <Ionicons name="checkmark-circle" size={12} color={GREEN} />
              <Text style={s.capturedText}>
                Captured: {ev.sections_captured.join(', ')}
              </Text>
            </View>
          )}

          {/* Top-lift fix list */}
          {vendor.top_issues.length > 0 && (
            <>
              <Text style={[s.miniLabel, { marginTop: 12 }]}>
                TOP FIXES FOR {vendor.vendor_display.toUpperCase()}
              </Text>
              {vendor.top_issues.map((iss, i) => (
                <View key={`${iss.id}-${i}`} style={s.fixRow}>
                  <View style={[s.fixLiftPill, { backgroundColor: GREEN + '15' }]}>
                    <Text style={s.fixLiftText}>+{Math.round(iss.lift)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fixTitle}>{iss.title}</Text>
                    <Text style={s.fixDetail} numberOfLines={3}>{iss.fix}</Text>
                  </View>
                  {onFixPress && (
                    <AnimatedPressable
                      style={s.fixBtn}
                      onPress={() => onFixPress(vendor.vendor_display, iss)}
                      scaleDown={0.95}
                    >
                      <Ionicons name="sparkles" size={11} color={GOLD} />
                    </AnimatedPressable>
                  )}
                </View>
              ))}
            </>
          )}
        </View>
      )}

      <View style={s.vendorCollapseHint}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.t3} />
      </View>
    </Pressable>
  );
}

function FactorBar({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score);
  return (
    <View style={s.factorBarCol}>
      <Text style={s.factorBarLabel}>{label}</Text>
      <View style={s.factorBarTrack}>
        <View style={[s.factorBarFill, { width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.factorBarValue, { color }]}>{Math.round(score)}</Text>
    </View>
  );
}

// ── Issue ranking across all vendors (global top-fixes list) ────────────────

function GlobalFixList({ issues, onFixPress }: {
  issues: ATSScoreV2['issues'];
  onFixPress?: (iss: ATSScoreV2['issues'][0]) => void;
}) {
  const ranked = useMemo(
    () => [...issues].sort(
      (a, b) => {
        const sumB = Object.values(b.lift_per_vendor || {}).reduce((x, y) => x + y, 0);
        const sumA = Object.values(a.lift_per_vendor || {}).reduce((x, y) => x + y, 0);
        return sumB - sumA;
      },
    ).slice(0, 8),
    [issues],
  );

  if (ranked.length === 0) {
    return (
      <View style={s.allClearWrap}>
        <Ionicons name="checkmark-circle" size={18} color={GREEN} />
        <Text style={s.allClearText}>No blocking issues detected. Your resume parses cleanly.</Text>
      </View>
    );
  }

  return (
    <View style={s.globalFixWrap}>
      <Text style={s.sectionLabel}>YOUR TOP FIXES (RANKED BY IMPACT)</Text>
      {ranked.map((iss, i) => {
        const lifts = Object.entries(iss.lift_per_vendor || {}).filter(([, v]) => v > 0);
        const total = lifts.reduce((sum, [, v]) => sum + v, 0);
        return (
          <Pressable
            key={`${iss.id}-${i}`}
            style={s.globalFixCard}
            onPress={() => onFixPress && onFixPress(iss)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View style={[s.rankBadge, { backgroundColor: severityColor(iss.severity) + '20' }]}>
                <Text style={[s.rankBadgeText, { color: severityColor(iss.severity) }]}>{i + 1}</Text>
              </View>
              <Text style={s.globalFixTitle} numberOfLines={2}>{iss.title}</Text>
              <View style={[s.fixLiftPill, { backgroundColor: GREEN + '18', marginLeft: 8 }]}>
                <Text style={[s.fixLiftText, { color: GREEN }]}>+{Math.round(total / Math.max(lifts.length, 1))}</Text>
              </View>
            </View>
            <Text style={s.globalFixBody} numberOfLines={3}>{iss.fix}</Text>
            {lifts.length > 0 && (
              <View style={s.liftChipRow}>
                {lifts.slice(0, 4).map(([vkey, lift]) => (
                  <View key={vkey} style={s.liftChip}>
                    <Text style={s.liftChipText}>
                      +{Math.round(lift)} {vkey.replace('successfactors', 'SAP').replace('greenhouse', 'GH')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Rewrite diff view ───────────────────────────────────────────────────────

export function RewriteDiff({ suggestions, onAccept, onReject }: {
  suggestions: RewriteSuggestion[];
  onAccept?: (idx: number) => void;
  onReject?: (idx: number) => void;
}) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <View style={s.rewriteWrap}>
      <Text style={s.sectionLabel}>BULLET REWRITES</Text>
      {suggestions.map((r, i) => (
        <View key={i} style={s.rewriteCard}>
          <Text style={s.rewriteLabel}>BEFORE</Text>
          <Text style={s.rewriteBefore}>{r.original}</Text>
          <View style={s.rewriteArrowRow}>
            <Ionicons name="arrow-down" size={12} color={GOLD} />
          </View>
          <Text style={s.rewriteLabel}>AFTER</Text>
          <Text style={s.rewriteAfter}>{r.rewritten}</Text>

          {r.changes && r.changes.length > 0 && (
            <View style={s.changesWrap}>
              {r.changes.slice(0, 3).map((c, j) => (
                <View key={j} style={s.changeRow}>
                  <Text style={s.changeFrom}>"{c.from}"</Text>
                  <Ionicons name="arrow-forward" size={9} color={colors.t3} />
                  <Text style={s.changeTo}>"{c.to}"</Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.rewriteActionRow}>
            {onReject && (
              <AnimatedPressable style={s.rewriteRejectBtn} onPress={() => onReject(i)} scaleDown={0.95}>
                <Ionicons name="close" size={12} color={colors.t3} />
                <Text style={s.rewriteRejectText}>Skip</Text>
              </AnimatedPressable>
            )}
            {onAccept && (
              <AnimatedPressable style={s.rewriteAcceptBtn} onPress={() => onAccept(i)} scaleDown={0.95}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                <Text style={s.rewriteAcceptText}>Accept</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Keyword density heatmap ─────────────────────────────────────────────────

export function KeywordHeatmap({ cells }: { cells: KeywordCell[] }) {
  if (!cells || cells.length === 0) return null;
  const cfg = {
    strong:   { bg: GREEN + '22', border: GREEN + '55', text: GREEN,  label: 'Contextual' },
    adequate: { bg: BLUE + '22',  border: BLUE + '55',  text: BLUE,   label: 'Adequate' },
    weak:     { bg: AMBER + '22', border: AMBER + '55', text: AMBER,  label: 'Skills-only' },
    missing:  { bg: CORAL + '22', border: CORAL + '55', text: CORAL,  label: 'Missing' },
  } as const;
  const grouped: Record<string, KeywordCell[]> = { strong: [], adequate: [], weak: [], missing: [] };
  for (const c of cells) (grouped[c.placement] ||= []).push(c);

  return (
    <View style={s.heatmapWrap}>
      <Text style={s.sectionLabel}>KEYWORD PLACEMENT</Text>
      <View style={s.heatmapLegend}>
        {(['strong', 'adequate', 'weak', 'missing'] as const).map(k => (
          <View key={k} style={s.legendChip}>
            <View style={[s.legendDot, { backgroundColor: cfg[k].text }]} />
            <Text style={s.legendLabel}>{cfg[k].label}</Text>
          </View>
        ))}
      </View>
      {(['missing', 'weak', 'adequate', 'strong'] as const).map(k => {
        const list = grouped[k] || [];
        if (list.length === 0) return null;
        return (
          <View key={k} style={{ marginBottom: 10 }}>
            <Text style={[s.heatmapGroupLabel, { color: cfg[k].text }]}>
              {cfg[k].label.toUpperCase()} · {list.length}
            </Text>
            <View style={s.heatmapChipGrid}>
              {list.map((c, i) => (
                <View
                  key={`${c.keyword}-${i}`}
                  style={[s.heatmapChip, { backgroundColor: cfg[k].bg, borderColor: cfg[k].border }]}
                >
                  <Text style={[s.heatmapChipText, { color: cfg[k].text }]}>{c.keyword}</Text>
                  {c.count > 0 && (
                    <Text style={[s.heatmapChipCount, { color: cfg[k].text }]}>·{c.count}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main deep-scan component ────────────────────────────────────────────────

export default function ATSDeepScan({
  v2, rewrites, keywords, onFixPress, pinnedVendorKey, pinnedCompanyName,
}: {
  v2: ATSScoreV2;
  rewrites?: RewriteSuggestion[];
  keywords?: KeywordCell[];
  onFixPress?: (vendorName: string, issue: { title: string; fix: string; lift: number }) => void;
  pinnedVendorKey?: string;
  pinnedCompanyName?: string;
}) {
  if (!v2) return null;

  // If a target vendor is pinned, reorder the vendors array so that vendor
  // lands at the top of the list and gets auto-expanded.
  const vendors = v2.vendors || [];
  const orderedVendors = pinnedVendorKey
    ? [
        ...vendors.filter(v => v.vendor_key === pinnedVendorKey),
        ...vendors.filter(v => v.vendor_key !== pinnedVendorKey),
      ]
    : vendors;

  return (
    <View>
      <HeroScore overall={v2.overall} forecast={v2.overall_forecast_if_all_fixed} />
      <FileRedFlags flags={v2.file_redflags || []} />
      <GlobalFixList issues={v2.issues || []} />

      {pinnedVendorKey && pinnedCompanyName ? (
        <Text style={[s.sectionLabel, { marginTop: 18 }]}>
          {pinnedCompanyName.toUpperCase()} USES {(orderedVendors[0]?.vendor_display || '').toUpperCase()}
        </Text>
      ) : (
        <Text style={[s.sectionLabel, { marginTop: 18 }]}>BY ATS VENDOR (TAP TO EXPAND)</Text>
      )}
      {orderedVendors.map(v => (
        <VendorCard
          key={v.vendor_key}
          vendor={v}
          onFixPress={onFixPress}
          pinned={v.vendor_key === pinnedVendorKey}
        />
      ))}

      {rewrites && rewrites.length > 0 && (
        <RewriteDiff suggestions={rewrites} />
      )}

      {keywords && keywords.length > 0 && (
        <KeywordHeatmap cells={keywords} />
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Hero
  heroWrap: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 18, marginBottom: 16,
  },
  heroScoreRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  heroLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.4, color: GOLD, marginBottom: 4 },
  heroNumber: { fontSize: 44, fontWeight: '800', lineHeight: 48 },
  heroSuffix: { fontSize: 14, color: colors.t3 },
  heroBand: { fontSize: 10, color: colors.t3, marginTop: 4 },
  forecastChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: GREEN + '15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: GREEN + '30',
  },
  forecastChipText: { fontSize: 11, fontWeight: '700', color: GREEN },
  heroBar: { height: 6, backgroundColor: colors.b1, borderRadius: 999, overflow: 'hidden' },
  heroBarFill: { height: '100%', borderRadius: 999 },
  heroBarForecast: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GREEN + '30' },

  // Section labels
  sectionLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.4, color: GOLD, marginBottom: 10 },

  // File red flags
  redFlagsWrap: { marginBottom: 16 },
  redFlagCard: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    borderLeftWidth: 3, padding: 12, marginBottom: 8,
  },
  redFlagTitle: { fontSize: 13, fontWeight: '700', color: colors.t1, flex: 1 },
  redFlagDetail: { fontSize: 11, color: colors.t2, lineHeight: 16 },

  // Global fix list
  globalFixWrap: { marginBottom: 16 },
  globalFixCard: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 8,
  },
  rankBadge: {
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  rankBadgeText: { fontSize: 10, fontWeight: '800' },
  globalFixTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.t1 },
  globalFixBody: { fontSize: 11, color: colors.t2, lineHeight: 16, marginTop: 2 },
  liftChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  liftChip: { backgroundColor: GREEN + '10', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  liftChipText: { fontSize: 9, fontWeight: '700', color: GREEN },

  // Vendor card
  vendorCard: {
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 10,
  },
  vendorCardPinned: {
    borderColor: GOLD + '80', borderWidth: 2,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10,
  },
  pinnedBadge: {
    position: 'absolute', top: -8, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  pinnedBadgeText: { fontSize: 8, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.8 },
  vendorHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  vendorName: { fontSize: 14, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  vendorNotes: { fontSize: 10, color: colors.t3, lineHeight: 14 },
  vendorScorePill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  vendorScoreText: { fontSize: 16, fontWeight: '800' },
  vendorCollapseHint: { alignItems: 'center', marginTop: 6 },

  factorBarsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  factorBarCol: { flex: 1 },
  factorBarLabel: { fontSize: 9, color: colors.t3, fontWeight: '600', marginBottom: 3 },
  factorBarTrack: { height: 4, backgroundColor: colors.b1, borderRadius: 999, overflow: 'hidden' },
  factorBarFill: { height: '100%', borderRadius: 999 },
  factorBarValue: { fontSize: 10, fontWeight: '700', marginTop: 3 },

  vendorForecastRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  vendorForecastText: { fontSize: 10, color: colors.t2 },

  vendorExpandedWrap: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.b1 },
  miniLabel: { fontSize: 9, fontWeight: '800', color: GOLD, letterSpacing: 1.1, marginBottom: 6 },
  extractFieldsCol: { gap: 6, marginBottom: 10 },
  extractFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  extractFieldLabel: { fontSize: 11, color: colors.t1, fontWeight: '600', width: 70 },
  extractFieldStatus: { fontSize: 10, fontWeight: '700' },
  extractFieldNote: { fontSize: 10, color: colors.t3, fontStyle: 'italic' },
  extractStatsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.s3, borderRadius: 8, padding: 8, marginBottom: 8 },
  extractStatCol: { alignItems: 'center' },
  extractStatVal: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  extractStatLabel: { fontSize: 9, color: colors.t3, marginTop: 1 },
  droppedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  droppedText: { fontSize: 10, color: CORAL, fontWeight: '600' },
  capturedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  capturedText: { fontSize: 10, color: GREEN, fontWeight: '600' },

  fixRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  fixLiftPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  fixLiftText: { fontSize: 10, fontWeight: '700', color: GREEN },
  fixTitle: { fontSize: 11, fontWeight: '700', color: colors.t1, marginBottom: 1 },
  fixDetail: { fontSize: 10, color: colors.t3, lineHeight: 14 },
  fixBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD + '15' },

  allClearWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: GREEN + '10', borderRadius: 12, borderWidth: 1, borderColor: GREEN + '30',
    padding: 14, marginBottom: 16,
  },
  allClearText: { flex: 1, fontSize: 12, color: colors.t1, fontWeight: '600' },

  // Rewrites
  rewriteWrap: { marginTop: 18 },
  rewriteCard: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 10,
  },
  rewriteLabel: { fontSize: 9, color: colors.t3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  rewriteBefore: {
    fontSize: 12, color: colors.t2, lineHeight: 17,
    backgroundColor: CORAL + '08', borderRadius: 6, padding: 8, marginBottom: 8,
  },
  rewriteArrowRow: { alignItems: 'center', marginBottom: 6 },
  rewriteAfter: {
    fontSize: 12, color: colors.t1, fontWeight: '600', lineHeight: 17,
    backgroundColor: GREEN + '08', borderRadius: 6, padding: 8,
  },
  changesWrap: { marginTop: 8, gap: 3 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeFrom: { fontSize: 10, color: CORAL, textDecorationLine: 'line-through' },
  changeTo: { fontSize: 10, color: GREEN, fontWeight: '600' },

  rewriteActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rewriteRejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: colors.b1, borderRadius: 8, paddingVertical: 8 },
  rewriteRejectText: { fontSize: 11, color: colors.t3, fontWeight: '600' },
  rewriteAcceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: GOLD, borderRadius: 8, paddingVertical: 8 },
  rewriteAcceptText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },

  // Heatmap
  heatmapWrap: { marginTop: 18 },
  heatmapLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: colors.t2 },
  heatmapGroupLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  heatmapChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatmapChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5,
  },
  heatmapChipText: { fontSize: 11, fontWeight: '600' },
  heatmapChipCount: { fontSize: 9, fontWeight: '700' },
});
