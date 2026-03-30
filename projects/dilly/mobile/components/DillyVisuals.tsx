/**
 * DillyVisuals — full-width visual cards rendered between chat messages.
 *
 * Visual types:
 *   score_breakdown      — Smart / Grit / Build animated bars
 *   cohort_comparison    — rank, percentile, peer count
 *   interview_checklist  — prep items with priority
 *   bullet_comparison    — before/after resume bullet
 *   timeline             — horizontal scrolling deadline timeline
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { colors } from '../lib/tokens';

const GOLD   = '#2B3A8E';
const GREEN  = '#34C759';
const AMBER  = '#FF9F0A';
const CORAL  = '#FF453A';
const BLUE   = '#0A84FF';
const INDIGO = '#5E5CE6';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VisualType =
  | 'score_breakdown'
  | 'cohort_comparison'
  | 'interview_checklist'
  | 'bullet_comparison'
  | 'timeline';

export interface ScoreBreakdownPayload {
  type: 'score_breakdown';
  overall: number;
  smart: number;
  grit: number;
  build: number;
  bar: number;
  cohort: string;
  reference_company?: string;
  smart_label?: string;
  grit_label?: string;
  build_label?: string;
}

export interface CohortComparisonPayload {
  type: 'cohort_comparison';
  rank: number;
  total: number;
  percentile: number;
  cohort: string;
  score: number;
  bar: number;
  reference_company?: string;
}

export interface InterviewChecklistPayload {
  type: 'interview_checklist';
  company: string;
  role?: string;
  round?: string;
  items: Array<{
    label: string;
    priority: 'high' | 'medium' | 'low';
    done?: boolean;
  }>;
}

export interface BulletComparisonPayload {
  type: 'bullet_comparison';
  before: string;
  after: string;
  dimension: string;
  impact: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  date: string;
  event_type?: 'interview' | 'meeting' | 'deadline' | 'other';
  createdBy?: string;
}

export interface TimelinePayload {
  type: 'timeline';
  events: TimelineEvent[];
  title?: string;
}

export type VisualPayload =
  | ScoreBreakdownPayload
  | CohortComparisonPayload
  | InterviewChecklistPayload
  | BulletComparisonPayload
  | TimelinePayload;

// ── Animated bar ──────────────────────────────────────────────────────────────

function AnimBar({
  value, max = 100, color, barValue, delay = 0,
}: {
  value: number; max?: number; color: string; barValue?: number; delay?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value / max, duration: 900, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [value]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const barPct = barValue != null ? `${(barValue / max) * 100}%` : null;

  return (
    <View style={vStyles.barTrack}>
      <Animated.View style={[vStyles.barFill, { width, backgroundColor: color, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6 }]} />
      {barPct && <View style={[vStyles.barLine, { left: barPct as any }]} />}
    </View>
  );
}

// ── Score Breakdown ───────────────────────────────────────────────────────────

function scoreColor(score: number, bar: number) {
  if (score >= bar) return GREEN;
  if (score >= bar - 10) return AMBER;
  return CORAL;
}

export function ScoreBreakdownCard({ data }: { data: ScoreBreakdownPayload }) {
  const overallColor = scoreColor(data.overall, data.bar);

  return (
    <View style={vStyles.card}>
      <View style={vStyles.cardHeader}>
        <Text style={vStyles.cardEyebrow}>DILLY SCORE</Text>
        <View style={vStyles.overallBadge}>
          <Text style={[vStyles.overallScore, { color: overallColor }]}>{data.overall}</Text>
          <Text style={vStyles.overallMax}>/100</Text>
        </View>
      </View>
      <Text style={vStyles.barHint}>
        Recruiter bar{data.reference_company ? ` at ${data.reference_company}` : ''}: {data.bar}
      </Text>
      <View style={vStyles.dims}>
        {[
          { label: 'Smart', value: data.smart, hint: data.smart_label, delay: 0 },
          { label: 'Grit',  value: data.grit,  hint: data.grit_label,  delay: 120 },
          { label: 'Build', value: data.build, hint: data.build_label, delay: 240 },
        ].map(d => (
          <View key={d.label} style={vStyles.dimRow}>
            <View style={vStyles.dimLabelRow}>
              <Text style={vStyles.dimLabel}>{d.label}</Text>
              <Text style={[vStyles.dimScore, { color: scoreColor(d.value, data.bar) }]}>{d.value}</Text>
            </View>
            <AnimBar value={d.value} color={scoreColor(d.value, data.bar)} barValue={data.bar} delay={d.delay} />
            {d.hint && <Text style={vStyles.dimHint} numberOfLines={2}>{d.hint}</Text>}
          </View>
        ))}
      </View>
      <Text style={vStyles.cardFooter}>{data.cohort} cohort</Text>
    </View>
  );
}

// ── Cohort Comparison ─────────────────────────────────────────────────────────

export function CohortComparisonCard({ data }: { data: CohortComparisonPayload }) {
  const rankColor = data.percentile >= 75 ? GREEN : data.percentile >= 50 ? GOLD : data.percentile >= 25 ? AMBER : CORAL;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: data.percentile / 100, duration: 1000,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, []);

  const fillWidth = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={vStyles.card}>
      <Text style={vStyles.cardEyebrow}>COHORT RANK</Text>
      <View style={vStyles.rankRow}>
        <View>
          <Text style={[vStyles.rankNum, { color: rankColor }]}>#{data.rank}</Text>
          <Text style={vStyles.rankOf}>of {data.total} students</Text>
        </View>
        <View style={vStyles.pctBadge}>
          <Text style={[vStyles.pctNum, { color: rankColor }]}>Top {100 - data.percentile}%</Text>
        </View>
      </View>
      <View style={[vStyles.barTrack, { marginTop: 12 }]}>
        <Animated.View style={[vStyles.barFill, { width: fillWidth, backgroundColor: rankColor, shadowColor: rankColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6 }]} />
      </View>
      <View style={vStyles.pctLabels}>
        <Text style={vStyles.pctLabel}>Bottom</Text>
        <Text style={vStyles.pctLabel}>Top</Text>
      </View>
      {data.reference_company && <Text style={vStyles.barHint}>Bar at {data.reference_company}: {data.bar}</Text>}
      <Text style={vStyles.cardFooter}>{data.cohort} cohort</Text>
    </View>
  );
}

// ── Interview Checklist ───────────────────────────────────────────────────────

const priorityColor = { high: CORAL, medium: AMBER, low: GREEN };
const priorityLabel = { high: 'Must do', medium: 'Important', low: 'Nice to have' };

export function InterviewChecklistCard({ data }: { data: InterviewChecklistPayload }) {
  const [checked, setChecked] = useState<boolean[]>(data.items.map(i => i.done ?? false));
  const toggle = (idx: number) => setChecked(prev => { const next = [...prev]; next[idx] = !next[idx]; return next; });
  const done = checked.filter(Boolean).length;

  return (
    <View style={vStyles.card}>
      <View style={vStyles.cardHeader}>
        <Text style={vStyles.cardEyebrow}>INTERVIEW PREP</Text>
        <Text style={[vStyles.checkProgress, { color: done === data.items.length ? GREEN : GOLD }]}>{done}/{data.items.length}</Text>
      </View>
      <Text style={vStyles.checkTitle}>
        {data.company}{data.role ? ` — ${data.role}` : ''}{data.round ? ` (${data.round})` : ''}
      </Text>
      {data.items.map((item, i) => (
        <TouchableOpacity key={i} style={vStyles.checkRow} onPress={() => toggle(i)} activeOpacity={0.7}>
          <View style={[vStyles.checkbox, checked[i] && { backgroundColor: GREEN, borderColor: GREEN }]}>
            {checked[i] && <Text style={vStyles.checkmark}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[vStyles.checkLabel, checked[i] && vStyles.checkLabelDone]}>{item.label}</Text>
          </View>
          <View style={[vStyles.priorityPill, { backgroundColor: priorityColor[item.priority] + '20' }]}>
            <Text style={[vStyles.priorityText, { color: priorityColor[item.priority] }]}>{priorityLabel[item.priority]}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Bullet Comparison ─────────────────────────────────────────────────────────

export function BulletComparisonCard({ data }: { data: BulletComparisonPayload }) {
  return (
    <View style={vStyles.card}>
      <Text style={vStyles.cardEyebrow}>RESUME REWRITE</Text>
      <View style={vStyles.bulletBlock}>
        <View style={vStyles.bulletLabelRow}>
          <View style={[vStyles.bulletDot, { backgroundColor: CORAL }]} />
          <Text style={[vStyles.bulletLabel, { color: CORAL }]}>Before</Text>
        </View>
        <Text style={vStyles.bulletText}>{data.before}</Text>
      </View>
      <View style={[vStyles.bulletBlock, { marginTop: 10 }]}>
        <View style={vStyles.bulletLabelRow}>
          <View style={[vStyles.bulletDot, { backgroundColor: GREEN }]} />
          <Text style={[vStyles.bulletLabel, { color: GREEN }]}>After</Text>
        </View>
        <Text style={[vStyles.bulletText, { color: colors.t1 }]}>{data.after}</Text>
      </View>
      <View style={vStyles.impactRow}>
        <Text style={vStyles.impactLabel}>Impact: </Text>
        <Text style={[vStyles.impactValue, { color: GOLD }]}>{data.impact}</Text>
      </View>
      <Text style={vStyles.cardFooter}>Targets {data.dimension} score</Text>
    </View>
  );
}

// ── Timeline Card ─────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  interview: '🎯',
  meeting:   '📞',
  deadline:  '📋',
  other:     '📌',
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number): string {
  if (days < 0)   return colors.t3;
  if (days <= 7)  return CORAL;
  if (days <= 31) return AMBER;
  return GREEN;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function inferEventType(label: string): 'interview' | 'meeting' | 'deadline' | 'other' {
  const l = label.toLowerCase();
  if (l.includes('interview')) return 'interview';
  if (l.includes('meeting') || l.includes('zoom') || l.includes('call') || l.includes('coffee')) return 'meeting';
  if (l.includes('deadline') || l.includes('due') || l.includes('submit')) return 'deadline';
  return 'other';
}

export function TimelineCard({ data }: { data: TimelinePayload }) {
  const events = [...data.events]
    .map(e => ({ ...e, days: daysUntil(e.date), type: e.event_type ?? inferEventType(e.label) }))
    .filter(e => e.days >= -1)
    .sort((a, b) => a.days - b.days);

  if (events.length === 0) {
    return (
      <View style={vStyles.card}>
        <Text style={vStyles.cardEyebrow}>{data.title ?? 'UPCOMING'}</Text>
        <Text style={[vStyles.dimHint, { marginTop: 8 }]}>No upcoming deadlines.</Text>
      </View>
    );
  }

  const NODE_W  = 140;
  const NODE_GAP = 24;

  return (
    <View style={vStyles.card}>
      <Text style={vStyles.cardEyebrow}>{data.title ?? 'UPCOMING DEADLINES'}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 16, paddingRight: 16 }}
        style={{ marginHorizontal: -18, paddingHorizontal: 18 }}
      >
        {/* Axis line */}
        <View style={[vStyles.tlAxis, { width: events.length * (NODE_W + NODE_GAP) - NODE_GAP }]} />

        {/* Today marker */}
        <View style={vStyles.tlTodayMarker}>
          <View style={vStyles.tlTodayDot} />
          <Text style={vStyles.tlTodayLabel}>Today</Text>
        </View>

        {/* Events */}
        {events.map((event, idx) => {
          const color = urgencyColor(event.days);
          const icon  = EVENT_ICONS[event.type] ?? '📌';
          return (
            <View key={event.id} style={[vStyles.tlNode, { width: NODE_W, marginRight: idx < events.length - 1 ? NODE_GAP : 0 }]}>
              <View style={[vStyles.tlDot, { backgroundColor: color, shadowColor: color }]} />
              <View style={[vStyles.tlCard, { borderColor: color + '40' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <Text style={{ fontSize: 14 }}>{icon}</Text>
                  <Text style={[vStyles.cardEyebrow, { color }]}>{event.type.toUpperCase()}</Text>
                </View>
                <Text style={vStyles.tlLabel} numberOfLines={2}>{event.label}</Text>
                <Text style={[vStyles.tlDate, { color }]}>{formatDate(event.date)}</Text>
                <View style={[vStyles.tlCountdown, { backgroundColor: color + '18' }]}>
                  <Text style={[vStyles.tlCountdownText, { color }]}>
                    {event.days === 0 ? 'Today' : event.days === 1 ? 'Tomorrow' : `${event.days}d away`}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

export function DillyVisual({ payload }: { payload: VisualPayload }) {
  switch (payload.type) {
    case 'score_breakdown':     return <ScoreBreakdownCard data={payload} />;
    case 'cohort_comparison':   return <CohortComparisonCard data={payload} />;
    case 'interview_checklist': return <InterviewChecklistCard data={payload} />;
    case 'bullet_comparison':   return <BulletComparisonCard data={payload} />;
    case 'timeline':            return <TimelineCard data={payload} />;
    default:                    return null;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const vStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.s2,
    borderRadius: 18,
    padding: 18,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: colors.b2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardEyebrow: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 2, color: colors.t3 },
  cardFooter: { fontSize: 11, color: colors.t3, marginTop: 12, fontFamily: 'Inter' },
  overallBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  overallScore: { fontFamily: 'Cinzel_700Bold', fontSize: 28 },
  overallMax: { fontFamily: 'Inter', fontSize: 12, color: colors.t3 },
  barHint: { fontSize: 11, color: colors.t3, marginBottom: 14, fontFamily: 'Inter' },
  dims: { gap: 14 },
  dimRow: { gap: 5 },
  dimLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dimLabel: { fontFamily: 'Cinzel_400Regular', fontSize: 11, letterSpacing: 0.5, color: colors.t2 },
  dimScore: { fontFamily: 'Cinzel_700Bold', fontSize: 13 },
  dimHint: { fontSize: 11, color: colors.t3, fontFamily: 'Inter', lineHeight: 16 },
  barTrack: { height: 8, backgroundColor: colors.s3, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  barFill: { height: '100%', borderRadius: 4 },
  barLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1 },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rankNum: { fontFamily: 'Cinzel_700Bold', fontSize: 32 },
  rankOf: { fontFamily: 'Inter', fontSize: 12, color: colors.t3, marginTop: 2 },
  pctBadge: { backgroundColor: colors.s3, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  pctNum: { fontFamily: 'Cinzel_700Bold', fontSize: 16 },
  pctLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  pctLabel: { fontSize: 10, color: colors.t3, fontFamily: 'Inter' },
  checkTitle: { fontSize: 14, fontWeight: '600', color: colors.t1, marginBottom: 14, fontFamily: 'Inter' },
  checkProgress: { fontFamily: 'Cinzel_700Bold', fontSize: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.b3, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkLabel: { fontSize: 13, color: colors.t1, lineHeight: 18, fontFamily: 'Inter' },
  checkLabelDone: { color: colors.t3, textDecorationLine: 'line-through' },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  priorityText: { fontSize: 10, fontWeight: '600', fontFamily: 'Inter' },
  bulletBlock: { backgroundColor: colors.s3, borderRadius: 12, padding: 12 },
  bulletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bulletDot: { width: 6, height: 6, borderRadius: 3 },
  bulletLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1 },
  bulletText: { fontSize: 13, color: colors.t2, lineHeight: 20, fontFamily: 'Inter' },
  impactRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  impactLabel: { fontSize: 12, color: colors.t3, fontFamily: 'Inter' },
  impactValue: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter' },

  // Timeline
  tlAxis: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.b2,
    top: 68,
    left: 0,
  },
  tlTodayMarker: {
    position: 'absolute',
    top: 58,
    left: -2,
    alignItems: 'center',
  },
  tlTodayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  tlTodayLabel: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 8,
    color: GOLD,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  tlNode: { alignItems: 'center' },
  tlDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 5,
    zIndex: 1,
  },
  tlCard: {
    backgroundColor: colors.s3,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    width: '100%',
  },
  tlLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: colors.t1,
    fontWeight: '600',
    lineHeight: 17,
    marginBottom: 4,
  },
  tlDate: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 11,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  tlCountdown: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  tlCountdownText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
});