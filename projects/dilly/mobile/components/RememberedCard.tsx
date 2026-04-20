/**
 * RememberedCard — proof Dilly is tracking.
 *
 * Surfaces one specific callback to a past pulse / Chapter / deadline
 * on Home. Tapping it opens the AI overlay seeded with a follow-up
 * question, turning the reminder into a conversation.
 *
 * Hides entirely if the user has no meaningful recent signal OR if
 * they already dismissed it today. "Not now" on the card marks it
 * dismissed for the current calendar day.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../lib/dilly';
import { useResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';
import { openDillyOverlay } from '../hooks/useDillyOverlay';

interface RememberResponse {
  ok: boolean;
  none?: boolean;
  reason?: string;
  type?: 'pulse' | 'one_move' | 'deadline';
  headline?: string;
  context?: string;
  seed_prompt?: string;
}

export default function RememberedCard() {
  const theme = useResolvedTheme();
  const [data, setData] = useState<RememberResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = (await dilly.get('/remember/today')) as RememberResponse;
        setData(r);
      } catch (_e) {
        // Fail quietly — this is a nice-to-have.
      }
    })();
  }, []);

  const onTap = useCallback(() => {
    if (!data || data.none || !data.seed_prompt) return;
    // Seed a chat with the callback so Dilly opens ready to follow up.
    openDillyOverlay({ initialMessage: data.seed_prompt });
  }, [data]);

  const onDismiss = useCallback(() => {
    setHidden(true);
    dilly.fetch('/remember/dismiss', { method: 'POST' }).catch(() => {});
  }, []);

  if (!data || data.none || hidden) return null;

  const iconName = data.type === 'pulse'
    ? 'chatbubble-ellipses'
    : data.type === 'one_move'
    ? 'footsteps'
    : 'calendar';

  return (
    <View style={[
      s.card,
      { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder },
    ]}>
      <View style={s.header}>
        <Ionicons name={iconName as any} size={14} color={theme.accent} />
        <Text style={[s.eyebrow, { color: theme.accent }]}>DILLY REMEMBERED</Text>
      </View>
      <Text style={[s.headline, { color: theme.surface.t2 }]} numberOfLines={2}>
        {data.headline}
      </Text>
      {data.context ? (
        <Text style={[s.context, { color: theme.surface.t1 }]} numberOfLines={3}>
          "{data.context}"
        </Text>
      ) : null}
      <View style={s.actions}>
        <AnimatedPressable
          onPress={onTap}
          scaleDown={0.97}
          style={[s.primary, { backgroundColor: theme.accent }]}
        >
          <Text style={s.primaryText}>Talk it through</Text>
          <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
        </AnimatedPressable>
        <AnimatedPressable onPress={onDismiss} scaleDown={0.95} hitSlop={8}>
          <Text style={[s.dismiss, { color: theme.surface.t3 }]}>Not now</Text>
        </AnimatedPressable>
      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  headline: { fontSize: 12, fontWeight: '600', lineHeight: 17, marginBottom: 6 },
  context: {
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
    letterSpacing: -0.1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    justifyContent: 'space-between',
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  dismiss: { fontSize: 12, fontWeight: '600' },
});
