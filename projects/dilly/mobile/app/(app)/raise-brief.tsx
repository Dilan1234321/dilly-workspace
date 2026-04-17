/**
 * Raise Brief. pre-rendered page a holder reads 10 minutes before
 * walking into a comp conversation. Zero-LLM: everything comes from
 * /holder/raise-brief, which aggregates profile + memory + BLS wage
 * curve + company premium.
 *
 * Structure:
 *   1. Header. role + company + YOE + tenure
 *   2. THE ASK. three numbers (min / target / stretch), the money shot
 *   3. MARKET POSITION. percentile + p25/p50/p75 + optional company chip
 *   4. WINS. up to 4 achievement facts pulled from memory
 *   5. WHY NOW. three reasons computed from what we know
 *   6. YOUR OPENER. one-line script, copy-to-clipboard
 *
 * Cached via sessionCache so opening the page on a remount is instant.
 */

import { useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { useCachedFetch } from '../../lib/sessionCache';

const INDIGO = '#1B3FA0';

type Brief = {
  you: {
    name: string; role: string; company: string;
    years_experience: number; tenure_months: number;
    market_title: string | null;
  };
  market: {
    p25: number | null; p50: number | null; p75: number | null;
    your_estimated_wage: number | null; your_percentile: number | null;
    company_premium: number; company_match: string | null;
  };
  gap:     { label: string; usd: number; pct: number } | null;
  the_ask: { min: number | null; target: number | null; stretch: number | null };
  wins:    string[];
  why_now: string[];
  opener:  string;
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 1000) return '$' + Math.round(n / 1000).toLocaleString() + 'K';
  return '$' + n.toLocaleString();
}

function tenureLabel(months: number): string {
  if (!months || months < 1) return '';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} in role`;
  const yrs = months / 12;
  return `${yrs.toFixed(1)} yrs in role`;
}

export default function RaiseBriefScreen() {
  const insets = useSafeAreaInsets();
  const { data, loading, refreshing, refresh } = useCachedFetch<Brief>(
    'holder:raise-brief',
    async () => {
      const res = await dilly.fetch('/holder/raise-brief');
      return res?.ok ? await res.json() : null;
    },
    { ttlMs: 60_000 },
  );

  const onShare = useCallback(async () => {
    if (!data) return;
    const msg = [
      `Raise Brief. ${data.you.role || 'role'}`,
      data.you.company ? `@ ${data.you.company}` : '',
      '',
      data.market.your_estimated_wage
        ? `Est. market value: ${fmtUsd(data.market.your_estimated_wage)} (P${data.market.your_percentile ?? '?'})`
        : '',
      '',
      'The ask:',
      data.the_ask.min ? `  Floor:   ${fmtUsd(data.the_ask.min)}` : '',
      data.the_ask.target ? `  Target:  ${fmtUsd(data.the_ask.target)}` : '',
      data.the_ask.stretch ? `  Stretch: ${fmtUsd(data.the_ask.stretch)}` : '',
      '',
      data.wins.length > 0 ? 'Wins to bring up:' : '',
      ...data.wins.map(w => `  • ${w}`),
      '',
      'Why now:',
      ...data.why_now.map(r => `  • ${r}`),
      '',
      'Opener:',
      data.opener,
    ].filter(Boolean).join('\n');
    try { await Share.share({ message: msg }); } catch {}
  }, [data]);

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.lg, gap: 16 }}>
          <View style={[s.skelBlock, { height: 48, width: '60%' }]} />
          <View style={[s.skelBlock, { height: 200 }]} />
          <View style={[s.skelBlock, { height: 120 }]} />
        </View>
      </View>
    );
  }

  const d = data as Brief | undefined;
  if (!d) {
    return (
      <View style={[s.container, { paddingTop: insets.top, padding: spacing.lg }]}>
        <Text style={s.title}>Brief unavailable.</Text>
        <Text style={s.body}>We need a current role on file to build a raise brief. Head to My Career to fill it in.</Text>
      </View>
    );
  }

  const hasCompanyPremium = d.market.company_premium && d.market.company_premium !== 1;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header bar */}
      <View style={s.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.t2} />
        </Pressable>
        <Text style={s.headerTitle}>RAISE BRIEF</Text>
        <Pressable onPress={onShare} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="share-outline" size={20} color={colors.t2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={INDIGO} />}
      >
        {/* Eyebrow */}
        <FadeInView delay={0}>
          <Text style={s.eyebrow}>FOR YOUR NEXT COMP CONVERSATION</Text>
          <Text style={s.title}>{d.you.role || 'Your role'}</Text>
          {d.you.company ? (
            <Text style={s.sub}>
              {d.you.company}
              {d.you.tenure_months ? ` · ${tenureLabel(d.you.tenure_months)}` : ''}
            </Text>
          ) : null}
        </FadeInView>

        {/* THE ASK. the money shot */}
        <FadeInView delay={40}>
          <View style={s.askCard}>
            <Text style={s.askEyebrow}>THE ASK</Text>
            <View style={s.askRow}>
              <View style={s.askCol}>
                <Text style={s.askColLabel}>FLOOR</Text>
                <Text style={s.askColValue}>{fmtUsd(d.the_ask.min)}</Text>
                <Text style={s.askColSub}>walk-away</Text>
              </View>
              <View style={[s.askCol, s.askColCenter]}>
                <Text style={[s.askColLabel, { color: '#58A6FF' }]}>TARGET</Text>
                <Text style={[s.askColValue, s.askColValueBig]}>{fmtUsd(d.the_ask.target)}</Text>
                <Text style={s.askColSub}>what you want</Text>
              </View>
              <View style={s.askCol}>
                <Text style={s.askColLabel}>STRETCH</Text>
                <Text style={s.askColValue}>{fmtUsd(d.the_ask.stretch)}</Text>
                <Text style={s.askColSub}>opening bid</Text>
              </View>
            </View>
          </View>
        </FadeInView>

        {/* MARKET POSITION */}
        {d.market.your_estimated_wage != null ? (
          <FadeInView delay={80}>
            <Text style={s.sectionLabel}>MARKET POSITION</Text>
            <View style={s.marketCard}>
              <Text style={s.marketHeadline}>
                {d.you.market_title ? `${d.you.market_title}s` : 'Your role'} earn {fmtUsd(d.market.p25)}–{fmtUsd(d.market.p75)}
              </Text>
              <Text style={s.marketSub}>
                Your estimate: <Text style={s.marketStrong}>{fmtUsd(d.market.your_estimated_wage)}</Text>
                {' · '}
                P{d.market.your_percentile ?? '?'}
              </Text>
              {hasCompanyPremium ? (
                <View style={s.pill}>
                  <Ionicons
                    name={d.market.company_premium > 1 ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={d.market.company_premium > 1 ? '#4ADE80' : '#F87171'}
                  />
                  <Text style={s.pillText}>
                    Adjusted for {String(d.market.company_match || '').replace(/\b\w/g, c => c.toUpperCase())}{' '}
                    {d.market.company_premium > 1 ? '+' : ''}
                    {Math.round((d.market.company_premium - 1) * 100)}%
                  </Text>
                </View>
              ) : null}
            </View>
          </FadeInView>
        ) : null}

        {/* WINS */}
        <FadeInView delay={120}>
          <Text style={s.sectionLabel}>WINS TO BRING UP</Text>
          {d.wins.length > 0 ? (
            d.wins.map((w, i) => (
              <View key={i} style={s.winRow}>
                <View style={s.winDot} />
                <Text style={s.winText}>{w}</Text>
              </View>
            ))
          ) : (
            <AnimatedPressable
              style={s.emptyCard}
              scaleDown={0.98}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `I'm prepping for a raise conversation. Help me name 3 concrete wins from my current role. specific outcomes, not vague descriptions. I'm a ${d.you.role || 'professional'}${d.you.company ? ` at ${d.you.company}` : ''}.`,
              })}
            >
              <Ionicons name="sparkles" size={16} color={INDIGO} />
              <Text style={s.emptyText}>Dilly doesn't know your recent wins yet. Tap to talk them through together.</Text>
            </AnimatedPressable>
          )}
        </FadeInView>

        {/* WHY NOW */}
        {d.why_now.length > 0 ? (
          <FadeInView delay={160}>
            <Text style={s.sectionLabel}>WHY NOW</Text>
            {d.why_now.map((r, i) => (
              <View key={i} style={s.reasonRow}>
                <Text style={s.reasonNum}>{i + 1}</Text>
                <Text style={s.reasonText}>{r}</Text>
              </View>
            ))}
          </FadeInView>
        ) : null}

        {/* OPENER */}
        <FadeInView delay={200}>
          <Text style={s.sectionLabel}>YOUR OPENER</Text>
          <View style={s.openerCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.t3} />
            <Text style={s.openerText}>{d.opener}</Text>
          </View>
        </FadeInView>

        {/* Talk it through */}
        <FadeInView delay={240}>
          <AnimatedPressable
            style={s.coachCta}
            scaleDown={0.97}
            onPress={() => openDillyOverlay({
              isPaid: true,
              initialMessage: `I'm about to go into a raise conversation. I'm a ${d.you.role || 'professional'}${d.you.company ? ` at ${d.you.company}` : ''}${d.you.tenure_months ? `, ${Math.round(d.you.tenure_months)} months in` : ''}. My target number is ${fmtUsd(d.the_ask.target)}. Role-play this with me. you be the manager. Push back hard.`,
            })}
          >
            <View style={s.coachIcon}>
              <Ionicons name="mic-outline" size={18} color={INDIGO} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.coachTitle}>Role-play it with Dilly</Text>
              <Text style={s.coachSub}>Dilly plays the manager. Push you. Find your weak spots before they do.</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={INDIGO} />
          </AnimatedPressable>
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

  scroll: { padding: spacing.lg, gap: 22 },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    color: INDIGO, marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.t1, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: colors.t2, marginTop: 3 },
  body: { fontSize: 14, color: colors.t2, marginTop: 8, lineHeight: 21 },

  // The ask (dark, premium)
  askCard: {
    backgroundColor: '#0D1117',
    borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#21262D',
  },
  askEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.8,
    color: '#8B949E', marginBottom: 14, textAlign: 'center',
  },
  askRow: { flexDirection: 'row', alignItems: 'flex-end' },
  askCol: { flex: 1, alignItems: 'center' },
  askColCenter: {
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#21262D',
    paddingHorizontal: 4,
  },
  askColLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: '#8B949E' },
  askColValue: { fontSize: 18, fontWeight: '800', color: '#F0F6FC', marginTop: 6 },
  askColValueBig: { fontSize: 26, color: '#58A6FF', letterSpacing: -0.5 },
  askColSub: { fontSize: 10, color: '#6B7280', marginTop: 3 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    color: colors.t3, marginBottom: 10,
  },

  // Market
  marketCard: {
    backgroundColor: '#FAFAFC',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 14, padding: 14, gap: 8,
  },
  marketHeadline: { fontSize: 15, fontWeight: '700', color: colors.t1, lineHeight: 21 },
  marketSub:      { fontSize: 13, color: colors.t2 },
  marketStrong:   { fontWeight: '700', color: INDIGO },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.3)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.t2 },

  // Wins
  winRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  winDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: INDIGO, marginTop: 8,
  },
  winText: { flex: 1, fontSize: 14, color: colors.t1, lineHeight: 21 },

  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1, borderStyle: 'dashed',
    backgroundColor: '#FAFAFC',
  },
  emptyText: { flex: 1, fontSize: 13, color: colors.t2, lineHeight: 19 },

  // Why now
  reasonRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  reasonNum: {
    fontSize: 12, fontWeight: '800', color: INDIGO,
    width: 18, textAlign: 'center', paddingTop: 2,
  },
  reasonText: { flex: 1, fontSize: 14, color: colors.t1, lineHeight: 21 },

  // Opener
  openerCard: {
    flexDirection: 'row', gap: 10,
    padding: 14, borderRadius: 12,
    backgroundColor: INDIGO + '0D',
    borderWidth: 1, borderColor: INDIGO + '25',
  },
  openerText: { flex: 1, fontSize: 14, color: colors.t1, lineHeight: 21, fontStyle: 'italic' },

  // Role-play CTA
  coachCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.b1,
  },
  coachIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: INDIGO + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  coachTitle: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  coachSub:   { fontSize: 12, color: colors.t2, marginTop: 2 },
});
