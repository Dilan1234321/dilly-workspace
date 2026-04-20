/**
 * Escape Hatch. a quiet read on "what you'd walk into if you left."
 * Holder-only. Zero apply pressure by design. there's no save-job,
 * no "apply" CTA at the top, no pipeline. Just the doors, the comp
 * deltas, and 1-3 concrete listings per door so they see this is
 * real, not a vibe.
 *
 * This is the wedge feature. nobody else serves "I have a job but I
 * want to know what's out there without applying."
 */

import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { useCachedFetch } from '../../lib/sessionCache';
import { useResolvedTheme } from '../../hooks/useTheme';

const INDIGO = '#1B3FA0';

type Door = {
  move: string;
  label: string;
  estimated_wage: number;
  delta_usd: number;
  delta_pct: number;
  soc: string;
  market_count: number;
  sample_jobs: { id: string; title: string; company: string; location: string; apply_url: string }[];
};

type Data = {
  you:          { role: string; company: string; estimated_wage: number | null };
  doors:        Door[];
  total_market: number | null;
  updated_at:   string;
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 1000) return '$' + Math.round(n / 1000).toLocaleString() + 'K';
  return '$' + n.toLocaleString();
}
function fmtDelta(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? '$' + Math.round(abs / 1000) + 'K' : '$' + abs.toLocaleString();
  return (n >= 0 ? '+' : '-') + s;
}

export default function EscapeHatchScreen() {
  const insets = useSafeAreaInsets();
  // Theme the root surface so the "sorry you lost your job" flow
  // respects Customize Dilly. Deep component-level audit deferred —
  // root bg is the most visible regression.
  const theme = useResolvedTheme();
  const { data, loading, refreshing, refresh } = useCachedFetch<Data>(
    'holder:escape-hatch',
    async () => {
      const res = await dilly.fetch('/holder/escape-hatch');
      return res?.ok ? await res.json() : null;
    },
    { ttlMs: 120_000 },   // 2 min. market doesn't move fast
  );

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}>
        <View style={{ padding: spacing.lg, gap: 14 }}>
          <View style={[s.skelBlock, { height: 36, width: '40%' }]} />
          <View style={[s.skelBlock, { height: 180 }]} />
          <View style={[s.skelBlock, { height: 140 }]} />
          <View style={[s.skelBlock, { height: 140 }]} />
        </View>
      </View>
    );
  }

  const d = data as Data | undefined;
  const doors = d?.doors || [];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header bar */}
      <View style={s.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.t2} />
        </Pressable>
        <Text style={s.headerTitle}>ESCAPE HATCH</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={INDIGO} />}
      >
        <FadeInView delay={0}>
          <Text style={s.eyebrow}>A QUIET LOOK</Text>
          <Text style={s.title}>What you'd walk into.</Text>
          <Text style={s.sub}>
            No applications, no alerts. Just a read on what's out there
            for someone like you. open it any time.
          </Text>
        </FadeInView>

        {/* Anchor card: where you are now */}
        {d?.you ? (
          <FadeInView delay={40}>
            <View style={s.anchorCard}>
              <Text style={s.anchorEyebrow}>WHERE YOU ARE NOW</Text>
              <Text style={s.anchorRole}>
                {d.you.role || 'Your current role'}
                {d.you.company ? <Text style={s.anchorCompany}>{'  ·  '}{d.you.company}</Text> : null}
              </Text>
              {d.you.estimated_wage ? (
                <Text style={s.anchorValue}>{fmtUsd(d.you.estimated_wage)}</Text>
              ) : null}
            </View>
          </FadeInView>
        ) : null}

        <FadeInView delay={80}>
          <View style={s.doorsHeaderRow}>
            <Text style={s.sectionLabel}>YOUR DOORS</Text>
            {d?.total_market != null ? (
              <Text style={s.marketCount}>
                {d.total_market.toLocaleString()} live listings across the market
              </Text>
            ) : null}
          </View>
        </FadeInView>

        {doors.length === 0 ? (
          <FadeInView delay={120}>
            <View style={s.emptyCard}>
              <Ionicons name="compass-outline" size={24} color={colors.t3} />
              <Text style={s.emptyText}>
                Add your current role in My Career so Dilly can map your
                nearest doors. Takes about a minute.
              </Text>
              <AnimatedPressable
                style={s.emptyCta}
                scaleDown={0.97}
                onPress={() => router.push('/(app)/my-dilly-profile' as any)}
              >
                <Text style={s.emptyCtaText}>Open My Career</Text>
                <Ionicons name="arrow-forward" size={14} color={INDIGO} />
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          doors.map((door, i) => (
            <FadeInView key={`${door.label}-${i}`} delay={120 + i * 40}>
              <View style={s.doorCard}>
                <View style={s.doorHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.doorMove}>{door.move.toUpperCase()}</Text>
                    <Text style={s.doorLabel}>{door.label}</Text>
                  </View>
                  <View style={s.doorValueCol}>
                    <Text style={s.doorValue}>{fmtUsd(door.estimated_wage)}</Text>
                    <View
                      style={[
                        s.deltaPill,
                        door.delta_usd >= 0 ? s.deltaPillPos : s.deltaPillNeg,
                      ]}
                    >
                      <Text
                        style={[
                          s.deltaText,
                          { color: door.delta_usd >= 0 ? '#4ADE80' : '#F87171' },
                        ]}
                      >
                        {fmtDelta(door.delta_usd)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Sample listings */}
                {door.sample_jobs.length > 0 ? (
                  <View style={s.samplesWrap}>
                    {door.sample_jobs.slice(0, 3).map((j, k) => (
                      <Pressable
                        key={j.id || k}
                        style={s.sampleRow}
                        onPress={() => j.apply_url && Linking.openURL(j.apply_url).catch(() => {})}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.sampleTitle} numberOfLines={1}>{j.title}</Text>
                          <Text style={s.sampleMeta} numberOfLines={1}>
                            {j.company}
                            {j.location ? `  ·  ${j.location}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="open-outline" size={14} color={colors.t3} />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={s.samplesEmpty}>No live listings matched this one in our feed.</Text>
                )}
              </View>
            </FadeInView>
          ))
        )}

        <FadeInView delay={400}>
          <Text style={s.foot}>
            Comp figures: BLS OES (May 2024) adjusted for your YOE.
            Listings from our live feed. The Escape Hatch never notifies
            you, never saves you into a pipeline, and never tells anyone
            you looked.
          </Text>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  skelBlock: { borderRadius: 12, backgroundColor: '#EEF0F6' },

  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: colors.t2 },

  scroll: { padding: spacing.lg, gap: 20 },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    color: INDIGO, marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.t1, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.t2, marginTop: 6, lineHeight: 20 },

  // Anchor
  anchorCard: {
    backgroundColor: '#FAFAFC',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 14, padding: 14,
  },
  anchorEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.t3, marginBottom: 4 },
  anchorRole:    { fontSize: 15, fontWeight: '700', color: colors.t1 },
  anchorCompany: { fontWeight: '400', color: colors.t2 },
  anchorValue:   { fontSize: 18, fontWeight: '800', color: INDIGO, marginTop: 6, letterSpacing: -0.3 },

  doorsHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    color: colors.t3, marginBottom: 10,
  },
  marketCount: { fontSize: 10, color: colors.t3, marginBottom: 10 },

  // Door card
  doorCard: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 16, padding: 14, gap: 12,
  },
  doorHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doorMove:   { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: INDIGO },
  doorLabel:  { fontSize: 15, fontWeight: '700', color: colors.t1, marginTop: 2 },
  doorValueCol: { alignItems: 'flex-end', gap: 6 },
  doorValue:  { fontSize: 15, fontWeight: '800', color: colors.t1 },
  deltaPill:  {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
    minWidth: 54, alignItems: 'center',
  },
  deltaPillPos: { backgroundColor: '#0F2B2215', borderColor: '#1F6B4F55' },
  deltaPillNeg: { backgroundColor: '#2B141415', borderColor: '#6B1F1F55' },
  deltaText:  { fontSize: 11, fontWeight: '800' },

  samplesWrap: {
    borderTopWidth: 1, borderTopColor: colors.b1, paddingTop: 8, gap: 4,
  },
  sampleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
  },
  sampleTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  sampleMeta:  { fontSize: 11, color: colors.t3, marginTop: 2 },
  samplesEmpty: { fontSize: 11, color: colors.t3, fontStyle: 'italic' },

  // Empty
  emptyCard: {
    backgroundColor: '#FAFAFC',
    borderWidth: 1, borderColor: colors.b1, borderStyle: 'dashed',
    borderRadius: 14, padding: 18, gap: 10, alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: colors.t2, textAlign: 'center', lineHeight: 19 },
  emptyCta:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: INDIGO + '14',
  },
  emptyCtaText: { fontSize: 13, fontWeight: '700', color: INDIGO },

  foot: {
    fontSize: 11, color: colors.t3, lineHeight: 17,
    textAlign: 'center', marginTop: 10,
  },
});
