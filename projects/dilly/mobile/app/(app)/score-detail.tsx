import { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../lib/auth';
import { colors, spacing } from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Rec {
  type?: string;
  title: string;
  action: string;
  current_line?: string | null;
}

interface Audit {
  final_score: number;
  scores: { smart: number; grit: number; build: number };
  evidence: { smart?: string; grit?: string; build?: string };
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  recommendations: Rec[];
  detected_track: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const COHORT: Record<string, { bar: number; company: string }> = {
  Tech:    { bar: 75, company: 'Google' },
  Finance: { bar: 72, company: 'Goldman Sachs' },
  Health:  { bar: 68, company: 'Mayo Clinic' },
  General: { bar: 65, company: 'your target company' },
};

const DIM_SUB_BAR: Record<string, number> = { smart: 70, grit: 68, build: 72 };
const DIM_COLOR: Record<string, string> = {
  smart: colors.blue, grit: colors.gold, build: colors.green,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(n: number) {
  return n >= 80 ? colors.green : n >= 55 ? colors.amber : colors.coral;
}

function percentileLabel(n: number) {
  if (n >= 90) return 5;
  if (n >= 80) return 15;
  if (n >= 70) return 30;
  if (n >= 60) return 50;
  return 65;
}

function dimTagFromRec(rec: Rec): string {
  const t = rec.title.toLowerCase() + rec.action.toLowerCase();
  if (t.includes('grit') || t.includes('leadership') || t.includes('impact')) return 'grit';
  if (t.includes('smart') || t.includes('academic') || t.includes('gpa')) return 'smart';
  return 'build';
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ScoreDetailScreen() {
  const insets = useSafeAreaInsets();
  const [audit,   setAudit]   = useState<Audit | null>(null);
  const [track,   setTrack]   = useState('General');
  const [loading, setLoading] = useState(true);
  const [display, setDisplay] = useState(0);

  const scoreAnim = useRef(new Animated.Value(0)).current;
  const barAnim   = useRef(new Animated.Value(0)).current;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, auditRaw] = await Promise.all([
          apiFetch('/profile').then(r => r.json()),
          apiFetch('/audit/latest').then(r => r.json()),
        ]);

        const p = profileRes as any;
        setTrack(p.track || p.cohort || 'General');

        const auditObj = auditRaw?.audit ?? auditRaw;
        if (!auditObj?.final_score) { setLoading(false); return; }

        const snap  = profileRes?.first_audit_snapshot?.scores;
        const smart = auditObj.scores?.smart ?? snap?.smart ?? 0;
        const grit  = auditObj.scores?.grit  ?? snap?.grit  ?? 0;
        const build = auditObj.scores?.build ?? snap?.build ?? 0;

        const w     = { smart: 0.20, grit: 0.30, build: 0.50 };
        const calc  = Math.round(smart * w.smart + grit * w.grit + build * w.build);

        setAudit({
          final_score:    auditObj.final_score ?? calc,
          scores:         { smart, grit, build },
          evidence:       auditObj.evidence   || {},
          peer_percentiles: auditObj.peer_percentiles,
          recommendations: auditObj.recommendations || [],
          detected_track: auditObj.detected_track || p.track || 'General',
        });
      } catch {
        // leave null
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Animate ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!audit) return;
    scoreAnim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(scoreAnim, { toValue: audit.final_score, duration: 1000, useNativeDriver: false }).start();
    Animated.timing(barAnim,   { toValue: audit.final_score, duration: 1000, useNativeDriver: false }).start();
    return () => scoreAnim.removeAllListeners();
  }, [audit]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const cfg      = COHORT[track] || COHORT.General;
  const fs       = audit?.final_score ?? 0;
  const sc       = scoreColor(fs);
  const pct      = percentileLabel(fs);
  const gap      = cfg.bar - fs;
  const aboveBar = gap <= 0;

  const scores   = audit?.scores || { smart: 0, grit: 0, build: 0 };
  const weakest  = (Object.entries(scores) as [string, number][])
    .sort((a, b) => a[1] - b[1])[0]?.[0] || 'build';
  const weakestLabel = weakest.charAt(0).toUpperCase() + weakest.slice(1);

  const recs     = audit?.recommendations || [];
  const visRecs  = recs.slice(0, 2);
  const hasLocked = recs.length > 2;

  const barWidth = barAnim.interpolate({
    inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp',
  });

  const trackLabel   = (audit?.detected_track || track).toUpperCase();
  const companyLabel = cfg.company.toUpperCase();

  // ── Empty / loading states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!audit) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={[s.backBtn, { top: insets.top + 14 }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyText}>No audit yet — upload your resume to get started.</Text>
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>SCORE BREAKDOWN</Text>
        <View style={s.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Score Hero ─────────────────────────────────────────────────── */}
        <View style={s.hero}>
          <View style={s.heroScoreRow}>
            <Text style={[s.heroScore, { color: sc }]}>{display}</Text>
            <Text style={[s.heroOf, { color: colors.t3 }]}>/100</Text>
          </View>
          <Text style={s.heroPct}>Top {pct}% of your cohort</Text>

          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, { width: barWidth, backgroundColor: sc }]} />
          </View>

          <View style={s.cohortPill}>
            <Text style={s.cohortPillText}>{trackLabel} · {companyLabel}</Text>
          </View>
        </View>

        {/* ── Dimension Row ─────────────────────────────────────────────── */}
        <View style={s.dimRow}>
          {(['smart', 'grit', 'build'] as const).map(dim => {
            const score   = scores[dim] ?? 0;
            const color   = DIM_COLOR[dim];
            const above   = score >= (DIM_SUB_BAR[dim] ?? 70);
            const evidence = audit.evidence?.[dim];
            return (
              <View key={dim} style={s.dimCard}>
                <Text style={s.dimName}>{dim.toUpperCase()}</Text>
                <Text style={[s.dimScore, { color: above ? colors.green : colors.coral }]}>
                  {Math.round(score)}
                </Text>
                <View style={[s.dimPill, { backgroundColor: (above ? colors.green : colors.coral) + '26', borderColor: (above ? colors.green : colors.coral) + '55' }]}>
                  <Text style={[s.dimPillText, { color: above ? colors.green : colors.coral }]}>
                    {above ? '✓ Above' : '↓ Below'}
                  </Text>
                </View>
                {evidence ? (
                  <Text style={s.dimEvidence} numberOfLines={2}>{evidence}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* ── Gap Callout ───────────────────────────────────────────────── */}
        <View style={[s.gapCard, { borderLeftColor: aboveBar ? colors.green : colors.gold }]}>
          <Text style={[s.gapHeadline, { color: aboveBar ? colors.green : colors.t1 }]}>
            {aboveBar ? "You're above the bar" : `${Math.round(Math.abs(gap))} points to the bar`}
          </Text>
          <Text style={s.gapSub}>
            {aboveBar
              ? `You're competitive at ${cfg.company}. Apply this week.`
              : `Your ${weakestLabel} is the gap — improve quantified project impact to close it.`}
          </Text>
        </View>

        {/* ── Recommendations ───────────────────────────────────────────── */}
        <Text style={s.eyebrow}>WHAT TO DO NEXT</Text>

        {visRecs.length === 0 ? (
          <Text style={s.emptyText}>No recommendations available.</Text>
        ) : (
          visRecs.map((rec, i) => {
            const dim   = dimTagFromRec(rec);
            const color = DIM_COLOR[dim];
            const isLast = i === visRecs.length - 1 && !hasLocked;
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
                {!isLast && <View style={s.divider} />}
              </View>
            );
          })
        )}

        {/* Locked recs */}
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
                <Text style={s.lockedCount}>{recs.length - 2} more locked</Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.unlockBtn}
              onPress={() => { /* TODO: paywall */ }}
              activeOpacity={0.85}
            >
              <Text style={s.unlockBtnText}>Unlock all recommendations →</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 12, color: colors.t3 },
  emptyText:   { fontSize: 13, color: colors.t2, textAlign: 'center', paddingHorizontal: 32 },

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
  backBtn:     { width: 36 },
  headerTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 11, letterSpacing: 1.4, color: colors.t1 },
  headerRight: { width: 36 },

  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // Hero
  hero: { marginBottom: 14 },
  heroScoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 2 },
  heroScore: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 64, lineHeight: 70 },
  heroOf:    { fontSize: 16, fontWeight: '300', paddingBottom: 10 },
  heroPct:   { fontSize: 12, color: colors.t2, marginBottom: 10 },
  barTrack: {
    height: 4, backgroundColor: colors.b2, borderRadius: 999,
    overflow: 'hidden', marginBottom: 10,
  },
  barFill: { height: '100%', borderRadius: 999 },
  cohortPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cohortPillText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.gold,
  },

  // Dimension row
  dimRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dimCard: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  dimName:     { fontFamily: 'Cinzel_700Bold', fontSize: 7, letterSpacing: 1, color: colors.t3, marginBottom: 4 },
  dimScore:    { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, lineHeight: 32, marginBottom: 6 },
  dimPill:     { alignSelf: 'flex-start', borderRadius: 99, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 },
  dimPillText: { fontSize: 9, fontWeight: '700' },
  dimEvidence: { fontSize: 11, color: colors.t2, lineHeight: 15 },

  // Gap callout
  gapCard: {
    backgroundColor: colors.s3,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  gapHeadline: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  gapSub:      { fontSize: 12, color: colors.t2, lineHeight: 18 },

  // Eyebrow
  eyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.t3,
    marginBottom: 12,
  },

  // Rec rows
  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  recTag: {
    borderRadius: 99, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3,
    marginTop: 1,
  },
  recTagText: { fontFamily: 'Cinzel_700Bold', fontSize: 7, letterSpacing: 0.8 },
  recBody:    { flex: 1 },
  recTitle:   { fontSize: 13, fontWeight: '600', color: colors.t1, marginBottom: 3 },
  recAction:  { fontSize: 12, color: colors.t2, lineHeight: 17 },
  divider:    { height: 1, backgroundColor: colors.b1 },

  // Locked
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
