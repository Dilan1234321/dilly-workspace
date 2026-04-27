/**
 * TierBadge - small visible member mark for paid tiers.
 *
 * Starter users see nothing (no anti-pattern where free users stare
 * at a locked badge telling them they don't have something). Dilly
 * and Pro users see a subtle chip near their greeting that confers
 * status.
 *
 * Tester feedback that drove this: "Change the UI of the app
 * depending on the tier, this is to avoid the feeling of 'oh, it
 * looks the same' when they started paying, giving the feeling
 * that they paid for nothing."
 *
 * Design constraints:
 *   - Never in the user's face. This is a quiet ambient cue, not an
 *     ad. It lives adjacent to the greeting on the home screen.
 *   - Respects the user's accent color from Customize Dilly so it
 *     doesn't fight whatever they've picked.
 *   - Pro gets the diamond glyph + 2px border + tighter letter-
 *     spacing to read as "heavier / more expensive." Dilly gets a
 *     star glyph and a softer fill.
 *   - Dark-mode aware via useResolvedTheme.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { useResolvedTheme } from '../hooks/useTheme';
import { DillyFace } from './DillyFace';

type Size = 'sm' | 'md';

export function TierBadge({ size = 'sm' }: { size?: Size }) {
  const { plan, loading } = useSubscription();
  const theme = useResolvedTheme();

  if (loading) return null;
  if (plan !== 'dilly' && plan !== 'pro') return null;

  const isPro = plan === 'pro';
  const h = size === 'md' ? 22 : 18;
  const fs = size === 'md' ? 10 : 9;
  const iconSize = size === 'md' ? 11 : 9;

  // Pro tier: render a tiny crowned Dilly + the PRO mark. The crowned
  // face IS the badge — no chip wrapper. Reads as "this user has
  // ascended" rather than "this user has a sticker." Dilly tier keeps
  // the existing star-chip treatment so the two tiers read as
  // different levels of earned status.
  if (isPro) {
    const faceSize = size === 'md' ? 26 : 22;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <DillyFace size={faceSize} mood="proud" accessory="crown" />
        <Text
          style={{
            fontSize: fs,
            fontWeight: '900',
            letterSpacing: 2.0,
            color: theme.accent,
            lineHeight: fs + 2,
          }}
        >
          DILLY PRO
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: h,
        paddingHorizontal: 8,
        borderRadius: h / 2,
        backgroundColor: theme.accentSoft,
        borderWidth: 1,
        borderColor: theme.accent,
      }}
    >
      <Ionicons name="star" size={iconSize} color={theme.accent} />
      <Text
        style={{
          fontSize: fs,
          fontWeight: '900',
          letterSpacing: 1.4,
          color: theme.accent,
          lineHeight: fs + 2,
        }}
      >
        DILLY
      </Text>
    </View>
  );
}

export default TierBadge;
