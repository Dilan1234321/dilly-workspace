/**
 * TierBadge — small visible member mark for paid tiers.
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

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: h,
        paddingHorizontal: 8,
        borderRadius: h / 2,
        // Pro gets a thicker border — reads as "heavier" visually
        // without needing extra color. Dilly gets the soft-fill chip
        // treatment that matches the Plan card's member-pride panel.
        backgroundColor: isPro ? 'transparent' : theme.accentSoft,
        borderWidth: isPro ? 2 : 1,
        borderColor: theme.accent,
      }}
    >
      <Ionicons
        name={isPro ? 'diamond' : 'star'}
        size={iconSize}
        color={theme.accent}
      />
      <Text
        style={{
          fontSize: fs,
          fontWeight: '900',
          // Pro gets tighter letter-spacing and the PRO suffix to
          // read as the heavier tier. Dilly gets a single-word
          // mark that feels clean rather than ornate.
          letterSpacing: isPro ? 2.0 : 1.4,
          color: theme.accent,
          // Match the icon's vertical alignment — the Cinzel-style
          // caps need a tiny nudge to sit true on the baseline.
          lineHeight: fs + 2,
        }}
      >
        {isPro ? 'DILLY PRO' : 'DILLY'}
      </Text>
    </View>
  );
}

export default TierBadge;
