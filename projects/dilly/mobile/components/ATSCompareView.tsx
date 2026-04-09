/**
 * ATSCompareView  -  multi-version ATS score comparison.
 *
 * Pulls the last 2-3 audits via POST /ats/compare and renders:
 *   - A side-by-side grid of composite scores across vendors
 *   - Best-version badges per vendor ("Best on Workday: Apr 8")
 *   - A delta summary showing the biggest score moves between versions
 *
 * Used from ats.tsx. Controlled by a `visible` boolean  -  parent decides
 * when to mount it so the /ats/compare request only fires on open.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens';
import { dilly } from '../lib/dilly';
import AnimatedPressable from './AnimatedPressable';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';

const VENDOR_ORDER = [
  'workday', 'taleo', 'icims', 'successfactors', 'greenhouse', 'lever', 'ashby',
];

type Version = {
  audit_id: string;
  ts: number;
  label: string;
  overall: number;
  forecast: number;
  vendor_scores: Record<string, number>;
  vendor_displays: Record<string, string>;
  issue_count: number;
  top_issue: string | null;
  candidate_name?: string;
};

type BestByVendor = Record<string, {
  audit_id: string;
  label: string;
  score: number;
  runner_up_delta: number;
}>;

type Delta = {
  from_label: string;
  to_label: string;
  overall_delta: number;
  top_moves: Array<{ vendor_key: string; vendor_display: string; delta: number }>;
};

type CompareResponse = {
  versions: Version[];
  best_by_vendor: BestByVendor;
  deltas: Delta[];
  message?: string;
};

function scoreColor(v: number): string {
  if (v >= 85) return GREEN;
  if (v >= 70) return AMBER;
  return CORAL;
}

function deltaColor(d: number): string {
  if (d >= 1) return GREEN;
  if (d <= -1) return CORAL;
  return colors.t3;
}

function deltaLabel(d: number): string {
  const sign = d > 0 ? '+' : '';
  return `${sign}${Math.round(d)}`;
}

export default function ATSCompareView({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setData(null);
    dilly.fetch('/ats/compare', {
      method: 'POST',
      body: JSON.stringify({ limit: 3 }),
    })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e?.message || 'Compare failed'))
      .finally(() => setLoading(false));
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Nav */}
        <View style={s.navBar}>
          <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.t1} />
          </AnimatedPressable>
          <Text style={s.navTitle}>Compare Versions</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll}>
          {loading && (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="large" color={GOLD} />
              <Text style={s.loadingText}>Re-scoring your audits…</Text>
            </View>
          )}

          {error && (
            <View style={s.errorWrap}>
              <Ionicons name="alert-circle" size={24} color={CORAL} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {data && data.message && data.versions.length < 2 && (
            <View style={s.emptyWrap}>
              <Ionicons name="git-compare-outline" size={40} color={colors.t3 + '80'} />
              <Text style={s.emptyTitle}>Need more audits</Text>
              <Text style={s.emptyText}>
                Upload at least 2 resume versions so we can show you which one the ATS prefers.
              </Text>
            </View>
          )}

          {data && data.versions.length >= 2 && (
            <>
              {/* ── Overall delta headline ───────────────────────────── */}
              {data.deltas.length > 0 && (
                <View style={s.headlineWrap}>
                  <Text style={s.headlineLabel}>LATEST VS PREVIOUS</Text>
                  {data.deltas.map((d, i) => (
                    <View key={i} style={s.headlineRow}>
                      <Text style={s.headlineLabelText}>{d.to_label}</Text>
                      <Ionicons name="arrow-back" size={12} color={colors.t3} />
                      <Text style={s.headlineLabelText}>{d.from_label}</Text>
                      <View
                        style={[
                          s.headlineDeltaPill,
                          { backgroundColor: deltaColor(d.overall_delta) + '18' },
                        ]}
                      >
                        <Text style={[s.headlineDeltaText, { color: deltaColor(d.overall_delta) }]}>
                          {deltaLabel(d.overall_delta)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Version grid (side by side composite scores) ────── */}
              <Text style={s.sectionLabel}>COMPOSITE SCORES</Text>
              <View style={s.versionGrid}>
                <View style={[s.versionCell, s.versionHeaderCell]}>
                  <Text style={s.versionHeaderText}>ATS</Text>
                </View>
                {data.versions.map(v => (
                  <View key={v.audit_id} style={[s.versionCell, s.versionHeaderCell]}>
                    <Text style={s.versionHeaderText}>{v.label}</Text>
                  </View>
                ))}
              </View>

              {/* Overall row */}
              <View style={s.versionGrid}>
                <View style={s.versionCell}>
                  <Text style={s.rowLabel}>Overall</Text>
                </View>
                {data.versions.map(v => (
                  <View key={v.audit_id} style={s.versionCell}>
                    <Text style={[s.rowScore, { color: scoreColor(v.overall) }]}>
                      {Math.round(v.overall)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Vendor rows */}
              {VENDOR_ORDER.map(vkey => {
                // Skip vendors where all versions have zero (prevents empty rows)
                const anyScore = data.versions.some(v => (v.vendor_scores[vkey] || 0) > 0);
                if (!anyScore) return null;
                const bestId = data.best_by_vendor[vkey]?.audit_id;
                const vendorDisplay = data.versions[0]?.vendor_displays?.[vkey] || vkey;
                return (
                  <View key={vkey} style={s.versionGrid}>
                    <View style={s.versionCell}>
                      <Text style={s.rowLabel} numberOfLines={1}>
                        {vendorDisplay}
                      </Text>
                    </View>
                    {data.versions.map(v => {
                      const score = v.vendor_scores[vkey] || 0;
                      const isBest = bestId === v.audit_id && data.versions.length > 1;
                      return (
                        <View
                          key={v.audit_id}
                          style={[
                            s.versionCell,
                            isBest && s.versionCellBest,
                          ]}
                        >
                          <Text style={[s.rowScoreSmall, { color: scoreColor(score) }]}>
                            {Math.round(score)}
                          </Text>
                          {isBest && (
                            <View style={s.bestBadge}>
                              <Ionicons name="trophy" size={8} color="#FFFFFF" />
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}

              {/* ── Biggest moves ──────────────────────────────────── */}
              {data.deltas.length > 0 && data.deltas[0].top_moves.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: 18 }]}>
                    BIGGEST CHANGES
                  </Text>
                  {data.deltas[0].top_moves.map((move, i) => (
                    <View key={`${move.vendor_key}-${i}`} style={s.moveRow}>
                      <Text style={s.moveVendor}>{move.vendor_display}</Text>
                      <View style={s.moveArrow}>
                        <Ionicons
                          name={move.delta >= 0 ? 'trending-up' : 'trending-down'}
                          size={13}
                          color={deltaColor(move.delta)}
                        />
                      </View>
                      <Text style={[s.moveDelta, { color: deltaColor(move.delta) }]}>
                        {deltaLabel(move.delta)}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* ── Best-per-vendor summary ────────────────────────── */}
              <Text style={[s.sectionLabel, { marginTop: 18 }]}>BEST VERSION PER ATS</Text>
              {VENDOR_ORDER.map(vkey => {
                const best = data.best_by_vendor[vkey];
                if (!best) return null;
                const vendorDisplay = data.versions[0]?.vendor_displays?.[vkey] || vkey;
                return (
                  <View key={vkey} style={s.bestRow}>
                    <Text style={s.bestVendor}>{vendorDisplay}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.bestLabelText}>{best.label}</Text>
                      <Text style={[s.bestScore, { color: scoreColor(best.score) }]}>
                        {Math.round(best.score)}
                      </Text>
                      {best.runner_up_delta > 0 && (
                        <View style={s.runnerUpPill}>
                          <Text style={s.runnerUpText}>
                            +{Math.round(best.runner_up_delta)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 48, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontSize: 15, fontWeight: '700', color: colors.t1 },
  scroll: { padding: 18, paddingBottom: 60 },

  loadingWrap: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { fontSize: 12, color: colors.t3, marginTop: 12 },

  errorWrap: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  errorText: { fontSize: 12, color: colors.t2, textAlign: 'center' },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  emptyText: { fontSize: 12, color: colors.t3, textAlign: 'center', paddingHorizontal: 40 },

  headlineWrap: { marginBottom: 18, backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 14 },
  headlineLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3, color: GOLD, marginBottom: 10 },
  headlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headlineLabelText: { fontSize: 12, color: colors.t1, fontWeight: '600' },
  headlineDeltaPill: { marginLeft: 'auto', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  headlineDeltaText: { fontSize: 13, fontWeight: '800' },

  sectionLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3, color: GOLD, marginBottom: 10 },

  versionGrid: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  versionCell: {
    flex: 1, backgroundColor: colors.s2, borderRadius: 8, borderWidth: 1, borderColor: colors.b1,
    paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    minHeight: 40,
  },
  versionHeaderCell: { backgroundColor: colors.s3, paddingVertical: 6, minHeight: 28 },
  versionHeaderText: { fontSize: 10, fontWeight: '700', color: colors.t3, letterSpacing: 0.3 },
  versionCellBest: { borderColor: GREEN + '60', backgroundColor: GREEN + '08' },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.t2 },
  rowScore: { fontSize: 18, fontWeight: '800' },
  rowScoreSmall: { fontSize: 15, fontWeight: '700' },
  bestBadge: {
    position: 'absolute', top: 3, right: 3,
    width: 14, height: 14, borderRadius: 7, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },

  moveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.s2, borderRadius: 8, borderWidth: 1, borderColor: colors.b1,
    padding: 10, marginBottom: 6,
  },
  moveVendor: { flex: 1, fontSize: 12, color: colors.t1, fontWeight: '600' },
  moveArrow: { width: 20, alignItems: 'center' },
  moveDelta: { fontSize: 14, fontWeight: '800' },

  bestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.s2, borderRadius: 8, borderWidth: 1, borderColor: colors.b1,
    padding: 10, marginBottom: 6,
  },
  bestVendor: { fontSize: 12, color: colors.t1, fontWeight: '600' },
  bestLabelText: { fontSize: 11, color: colors.t3 },
  bestScore: { fontSize: 14, fontWeight: '800' },
  runnerUpPill: { backgroundColor: GREEN + '15', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  runnerUpText: { fontSize: 9, color: GREEN, fontWeight: '700' },
});
