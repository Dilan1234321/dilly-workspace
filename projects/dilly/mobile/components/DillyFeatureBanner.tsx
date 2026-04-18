/**
 * DillyFeatureBanner — quiet "this is a Dilly feature" reminder.
 *
 * Shown on paid feature setup screens (Generate Resume, Interview
 * Practice) to free-tier users. Not a blocker: they can still tap
 * through. If they do, the backend returns 402 and the global
 * paywall wrapper shows the full-screen upgrade modal.
 *
 * Hidden entirely for paid users so we don't pester them about
 * features they already have.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { colors } from '../lib/tokens';
import { useAccent } from '../hooks/useTheme';

const INDIGO = colors.indigo;

interface DillyFeatureBannerProps {
  /** Human-readable feature name, e.g. "The Forge" or "The Interview Room". */
  feature: string;
  /** One-line explanation. */
  sub?: string;
}

export function DillyFeatureBanner({ feature, sub }: DillyFeatureBannerProps) {
  const { isPaid, loading } = useSubscription();
  const accent = useAccent();
  // Don't show while subscription state is still resolving — avoids
  // a flash of the banner for paid users on cold start.
  if (loading || isPaid) return null;
  return (
    <View style={[s.card, { borderColor: accent + '35', backgroundColor: accent + '0a' }]}>
      <View style={[s.iconBubble, { backgroundColor: accent + '22', borderColor: accent + '40' }]}>
        <Ionicons name="sparkles" size={13} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: accent }]}>{feature} is a Dilly feature.</Text>
        <Text style={s.sub}>
          {sub || "You can explore for free. Generating the result unlocks with Dilly."}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  iconBubble: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  title: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  sub: { fontSize: 11, color: colors.t2, lineHeight: 15, marginTop: 2 },
});
