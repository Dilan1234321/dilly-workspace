/**
 * BulletWorthSheet — "What's this bullet worth?"
 *
 * Bottom-sheet modal that opens when a user taps any bullet in the resume
 * editor. Calls POST /resume/bullet-worth, shows which rubric signals the
 * bullet hits + which are missing + current contribution + potential lift
 * if the user fixes the gaps.
 *
 * Parent owns the visible state and the target bullet text; this component
 * fires the network request once per open, renders the results, and exposes
 * a "Rewrite with Dilly" button that hands control back via onRewritePress.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens';
import { dilly } from '../lib/dilly';
import AnimatedPressable from './AnimatedPressable';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE = '#0A84FF';

type Signal = {
  title: string;
  dimension: 'smart' | 'grit' | 'build' | string;
  weight: number;
  rationale: string;
};

type BulletWorth = {
  bullet: string;
  cohort_id: string;
  cohort_display: string;
  signals_hit: Signal[];
  signals_missing: Signal[];
  current_contribution: number;
  potential_lift: number;
  word_count: number;
};

function dimIcon(dim: string): keyof typeof Ionicons.glyphMap {
  switch (dim) {
    case 'smart': return 'bulb';
    case 'grit':  return 'fitness';
    case 'build': return 'hammer';
    default:      return 'ellipse';
  }
}

function dimColor(dim: string): string {
  switch (dim) {
    case 'smart': return BLUE;
    case 'grit':  return AMBER;
    case 'build': return GREEN;
    default:      return colors.t3;
  }
}

export default function BulletWorthSheet({
  visible, bullet, cohortId, onClose, onRewritePress,
}: {
  visible: boolean;
  bullet: string;
  cohortId?: string | null;
  onClose: () => void;
  onRewritePress?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BulletWorth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !bullet) return;
    setLoading(true);
    setData(null);
    setError(null);
    dilly.fetch('/resume/bullet-worth', {
      method: 'POST',
      body: JSON.stringify({ bullet, cohort_id: cohortId || undefined }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) setData(j as BulletWorth);
        else setError(j?.detail || 'Could not score this bullet.');
      })
      .catch(e => setError(e?.message || 'Network error.'))
      .finally(() => setLoading(false));
  }, [visible, bullet, cohortId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Handle + close */}
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>What's this bullet worth?</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.t2} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.scroll}>
            {/* The bullet itself */}
            <View style={s.bulletQuote}>
              <Text style={s.bulletQuoteText}>{bullet}</Text>
            </View>

            {loading && (
              <View style={s.loadingWrap}>
                <ActivityIndicator size="small" color={GOLD} />
                <Text style={s.loadingText}>Scoring against your rubric…</Text>
              </View>
            )}

            {error && (
              <View style={s.errorWrap}>
                <Ionicons name="alert-circle" size={18} color={CORAL} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {data && (
              <>
                {/* Headline: current vs potential */}
                <View style={s.headlineRow}>
                  <View style={s.headlineCol}>
                    <Text style={s.headlineLabel}>CURRENT</Text>
                    <Text style={[s.headlineNum, { color: GOLD }]}>+{data.current_contribution}</Text>
                    <Text style={s.headlineSub}>pts contributed</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.t3} />
                  <View style={s.headlineCol}>
                    <Text style={s.headlineLabel}>POTENTIAL</Text>
                    <Text style={[s.headlineNum, { color: GREEN }]}>+{data.potential_lift}</Text>
                    <Text style={s.headlineSub}>if all fixes applied</Text>
                  </View>
                </View>

                <Text style={s.cohortHint} numberOfLines={1}>
                  Scored against: <Text style={{ fontWeight: '700' }}>{data.cohort_display}</Text>
                </Text>

                {/* Signals hit */}
                {data.signals_hit.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>WHAT'S WORKING</Text>
                    {data.signals_hit.map((sig, i) => (
                      <View key={`hit-${i}`} style={[s.signalRow, { borderLeftColor: GREEN }]}>
                        <Ionicons name={dimIcon(sig.dimension)} size={13} color={dimColor(sig.dimension)} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.signalTitle}>{sig.title}</Text>
                            <View style={[s.weightPill, { backgroundColor: GREEN + '15' }]}>
                              <Text style={[s.weightText, { color: GREEN }]}>+{sig.weight}</Text>
                            </View>
                          </View>
                          <Text style={s.signalRationale} numberOfLines={3}>{sig.rationale}</Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                      </View>
                    ))}
                  </>
                )}

                {/* Signals missing */}
                {data.signals_missing.length > 0 && (
                  <>
                    <Text style={[s.sectionLabel, { marginTop: 14 }]}>BIGGEST LEVERS</Text>
                    {data.signals_missing.map((sig, i) => (
                      <View key={`miss-${i}`} style={[s.signalRow, { borderLeftColor: AMBER }]}>
                        <Ionicons name={dimIcon(sig.dimension)} size={13} color={dimColor(sig.dimension)} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.signalTitle}>{sig.title}</Text>
                            <View style={[s.weightPill, { backgroundColor: AMBER + '15' }]}>
                              <Text style={[s.weightText, { color: AMBER }]}>+{sig.weight}</Text>
                            </View>
                          </View>
                          <Text style={s.signalRationale} numberOfLines={3}>{sig.rationale}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {/* Actions */}
                {onRewritePress && (
                  <View style={s.actionRow}>
                    <AnimatedPressable style={s.rewriteBtn} onPress={onRewritePress} scaleDown={0.97}>
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                      <Text style={s.rewriteBtnText}>Rewrite with Dilly</Text>
                    </AnimatedPressable>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingBottom: 28,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.b1, alignSelf: 'center', marginTop: 8, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.t1 },
  scroll: { padding: 18 },

  bulletQuote: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 14,
  },
  bulletQuoteText: { fontSize: 13, color: colors.t1, lineHeight: 19, fontStyle: 'italic' },

  loadingWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  loadingText: { fontSize: 11, color: colors.t3 },

  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CORAL + '10', borderRadius: 10, padding: 10 },
  errorText: { fontSize: 12, color: colors.t2, flex: 1 },

  headlineRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 8,
  },
  headlineCol: { alignItems: 'center' },
  headlineLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.2, color: colors.t3, marginBottom: 4 },
  headlineNum: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  headlineSub: { fontSize: 10, color: colors.t3, marginTop: 2 },

  cohortHint: { fontSize: 10, color: colors.t3, textAlign: 'center', marginBottom: 16 },

  sectionLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: GOLD,
    marginBottom: 8, marginTop: 4,
  },
  signalRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    borderLeftWidth: 3, padding: 12, marginBottom: 6,
  },
  signalTitle: { fontSize: 12, fontWeight: '700', color: colors.t1 },
  weightPill: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  weightText: { fontSize: 9, fontWeight: '800' },
  signalRationale: { fontSize: 11, color: colors.t3, lineHeight: 15, marginTop: 3 },

  actionRow: { flexDirection: 'row', marginTop: 16 },
  rewriteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 13,
  },
  rewriteBtnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
});
