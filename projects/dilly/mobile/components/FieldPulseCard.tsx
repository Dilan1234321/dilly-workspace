/**
 * FieldPulseCard — the weekly-return anchor on AI Arena.
 *
 * Wraps the existing Weekly Signal with three retention-forcing
 * affordances:
 *   1. "NEW" pill when the current iso_week is newer than what the
 *      user has seen before. Disappears after user scrolls past or
 *      taps Acknowledge.
 *   2. A personal tie-in line pulled from the user's recent pulse
 *      or wins (zero-LLM, templated server-side). Makes the global
 *      signal feel personal.
 *   3. A "Next refresh: Monday" countdown so users know when to
 *      come back. Concrete return trigger.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../lib/dilly';
import { useResolvedTheme } from '../hooks/useTheme';

interface Signal {
  iso_week?: string;
  headline?: string;
  source?: string;
  data_point?: string;
  move?: string;
}

interface FieldPulseResponse {
  ok: boolean;
  role_key: string | null;
  role_display: string | null;
  signal: Signal;
  personal_hook: string | null;
  signal_week: string;
  current_week: string;
  is_new_to_user: boolean;
  next_refresh_date: string;
}

function daysUntilLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gap = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (gap <= 0) return 'today';
    if (gap === 1) return 'tomorrow';
    return `in ${gap} days`;
  } catch {
    return '';
  }
}

export default function FieldPulseCard() {
  const theme = useResolvedTheme();
  const [data, setData] = useState<FieldPulseResponse | null>(null);
  const [seenAcknowledged, setSeenAcknowledged] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = (await dilly.get('/ai-arena/field-pulse')) as FieldPulseResponse;
        setData(r);
      } catch (_e) {
        // Fail quiet
      }
    })();
  }, []);

  const ack = useCallback(async () => {
    if (!data) return;
    setSeenAcknowledged(true);
    try {
      await dilly.fetch('/ai-arena/field-pulse/seen', {
        method: 'POST',
        body: JSON.stringify({ week: data.signal_week }),
      });
    } catch {}
  }, [data]);

  if (!data || !data.signal?.headline) return null;

  const showNewBadge = data.is_new_to_user && !seenAcknowledged;
  const roleLabel = data.role_display || 'your field';
  const nextRefresh = daysUntilLabel(data.next_refresh_date);

  return (
    <View style={[
      s.card,
      { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
    ]}>
      <View style={s.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={[s.dot, { backgroundColor: theme.accent }]} />
          <Text style={[s.eyebrow, { color: theme.accent }]} numberOfLines={1}>
            THIS WEEK · {roleLabel.toUpperCase()}
          </Text>
        </View>
        {showNewBadge && (
          <View style={[s.newPill, { backgroundColor: theme.accent }]}>
            <Text style={s.newPillText}>NEW</Text>
          </View>
        )}
      </View>

      <Text style={[s.headline, { color: theme.surface.t1 }]} numberOfLines={3}>
        {data.signal.headline}
      </Text>

      {data.signal.data_point ? (
        <View style={[s.dataCard, { backgroundColor: theme.surface.bg, borderColor: theme.accentBorder }]}>
          <Ionicons name="trending-up" size={13} color={theme.accent} />
          <Text style={[s.dataText, { color: theme.surface.t1 }]} numberOfLines={2}>
            {data.signal.data_point}
          </Text>
        </View>
      ) : null}

      {data.personal_hook ? (
        <View style={[s.personalCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Text style={[s.personalLabel, { color: theme.accent }]}>FOR YOU</Text>
          <Text style={[s.personalText, { color: theme.surface.t1 }]}>
            {data.personal_hook}
          </Text>
        </View>
      ) : null}

      {data.signal.move ? (
        <View style={s.moveRow}>
          <Text style={[s.moveLabel, { color: theme.surface.t3 }]}>THIS WEEK'S MOVE</Text>
          <Text style={[s.moveText, { color: theme.surface.t2 }]}>{data.signal.move}</Text>
        </View>
      ) : null}

      <View style={s.footer}>
        {data.signal.source ? (
          <Text style={[s.source, { color: theme.surface.t3 }]} numberOfLines={1}>
            {data.signal.source}
          </Text>
        ) : <View />}
        <Text style={[s.refresh, { color: theme.surface.t3 }]}>
          Next refresh {nextRefresh}
        </Text>
      </View>

      {showNewBadge ? (
        <View style={s.ackRow}>
          <Text onPress={ack} style={[s.ackLink, { color: theme.accent }]}>
            Got it
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  newPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  newPillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  headline: { fontSize: 17, fontWeight: '800', lineHeight: 23, letterSpacing: -0.2 },
  dataCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  dataText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  personalCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  personalLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
  personalText: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  moveRow: { marginTop: 10 },
  moveLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
  moveText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  source: { fontSize: 10, fontStyle: 'italic', flex: 1, marginRight: 8 },
  refresh: { fontSize: 10, fontWeight: '700' },
  ackRow: { alignItems: 'flex-end', marginTop: 8 },
  ackLink: { fontSize: 12, fontWeight: '700' },
});
