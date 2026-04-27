/**
 * useTierFeel - ambient premium treatment that varies by subscription tier.
 *
 * The app can't add new features to the paid tiers (product rule).
 * What it CAN do is make the SAME features feel different to hold.
 * This hook returns small numeric + string values that every card,
 * button, and heading can apply to their styles so that:
 *
 *   starter:  clean, friendly, intentionally lightweight
 *   dilly:    slightly heavier, more considered
 *   pro:      full gravitas - thicker borders, heavier type, more
 *             deliberate press feedback
 *
 * Users cannot name why Pro "feels more expensive" than Dilly. The
 * cumulative effect of 1px extra borders + 100 more weight + subtle
 * spring on press IS the answer. Nothing individually rises above
 * noise; together they read as a different product.
 *
 * Rules of use:
 *   - NEVER gate a feature behind a tierFeel value. Features are
 *     separate; this is aesthetic-only.
 *   - NEVER show this difference in marketing. It's a feel, not a
 *     feature to advertise.
 *   - NEVER let a screen break without this hook (return sane
 *     defaults so a missing SubscriptionProvider doesn't crash).
 *
 * Example:
 *   const feel = useTierFeel();
 *   <View style={{ borderWidth: feel.cardBorder, borderColor: theme.surface.border }}>
 *     <Text style={{ fontWeight: feel.headingWeight, letterSpacing: feel.headingTracking }}>
 *       Welcome back
 *     </Text>
 *   </View>
 */
import { useMemo } from 'react';
import { useSubscription } from './useSubscription';

export interface TierFeel {
  /** Border width to use on cards and containers. starter=1, dilly=1.5, pro=2.5. */
  cardBorder: number;
  /** Heading font-weight. starter=800, dilly=800, pro=900. */
  headingWeight: '700' | '800' | '900';
  /** Additional letter-spacing added to the hero heading. pro gets +0.2px. */
  headingTracking: number;
  /** AnimatedPressable scaleDown - smaller scaleDown = more subtle, more premium. */
  pressScaleDown: number;
  /** Whether to play haptic feedback on button press. */
  pressHaptic: boolean;
  /** Accent line above Pro cards (thin gradient top bar). */
  proAccentBar: boolean;
  /** Convenience flags. */
  isStarter: boolean;
  isDilly: boolean;
  isPro: boolean;
}

// Safe defaults matching the CURRENT app look. If the hook is called
// outside a SubscriptionProvider (e.g. a screen mounted before auth),
// everything falls back to starter values and nothing breaks.
const DEFAULTS: TierFeel = {
  cardBorder: 1,
  headingWeight: '800',
  headingTracking: 0,
  pressScaleDown: 0.95,
  pressHaptic: false,
  proAccentBar: false,
  isStarter: true,
  isDilly: false,
  isPro: false,
};

export function useTierFeel(): TierFeel {
  const { plan, loading } = useSubscription();
  return useMemo(() => {
    if (loading) return DEFAULTS;
    if (plan === 'pro') {
      return {
        cardBorder: 2.5,
        headingWeight: '900',
        headingTracking: 0.2,
        pressScaleDown: 0.98,     // barely shrinks - feels deliberate
        pressHaptic: true,        // Pro presses have tactile feedback
        proAccentBar: true,       // 3px accent bar across the top of hero cards
        isStarter: false,
        isDilly: false,
        isPro: true,
      };
    }
    if (plan === 'dilly') {
      return {
        cardBorder: 1.5,
        headingWeight: '800',
        headingTracking: 0,
        pressScaleDown: 0.97,
        pressHaptic: false,
        proAccentBar: false,
        isStarter: false,
        isDilly: true,
        isPro: false,
      };
    }
    return DEFAULTS;
  }, [plan, loading]);
}
