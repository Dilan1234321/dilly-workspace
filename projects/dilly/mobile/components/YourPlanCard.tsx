/**
 * YourPlanCard — the anchor card for the "Dilly turns your career
 * confusion into a plan" product promise.
 *
 * Renders at the top of every home screen (HolderHome, SeekerHome,
 * Senior-reset variant, student variants). The SAME card across all
 * modes — copy varies by mode/path, shape stays constant. That
 * visual consistency is the clickable-ness of the app: a user
 * flipping between tabs sees "oh, the plan card is here too" and
 * understands the mental model without any tutorial.
 *
 * Design decisions:
 *   - Single eyebrow: "YOUR PLAN".
 *   - Big headline: the action.
 *   - Small subline: the follow-up or context.
 *   - One CTA: always opens Dilly chat with a pre-seeded message.
 *     Tapping the card IS the plan editor. Testers won't need to
 *     guess what to do next because there's literally one button.
 *   - Tier-feel aware: Pro gets a thicker border + accent top bar.
 *   - Day-stamp line: "Today · [date]" — reinforces that the plan
 *     is fresh-today, not stale.
 *
 * What the card does NOT do:
 *   - No progress bars. No checklists. No streak counters. The
 *     plan is about focus, not gamification.
 *   - No branching. ONE action per day. If the user wants more,
 *     they tap the CTA and Dilly can expand.
 *   - No "dismiss" button. The plan is always there.
 */
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from './AnimatedPressable';
import { useResolvedTheme } from '../hooks/useTheme';
import { useTierFeel } from '../hooks/useTierFeel';
import { openDillyOverlay } from '../hooks/useDillyOverlay';
import type { YourPlan } from '../hooks/useYourPlan';

interface Props {
  plan: YourPlan | null;
  // Optional firstName so the chat seed can personalize.
  firstName?: string;
}

export function YourPlanCard({ plan, firstName }: Props) {
  const theme = useResolvedTheme();
  const feel = useTierFeel();

  if (!plan) return null;

  return (
    <AnimatedPressable
      scaleDown={feel.pressScaleDown}
      haptic={feel.pressHaptic ? 'medium' : 'light'}
      onPress={() => openDillyOverlay({
        name: firstName,
        isPaid: false,
        initialMessage: plan.initialMessage,
      })}
      style={{
        backgroundColor: theme.surface.s1,
        borderColor: theme.accent + '33',
        borderWidth: feel.cardBorder,
        borderRadius: 16,
        padding: 18,
        gap: 10,
        shadowColor: theme.accent,
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
        overflow: 'hidden',
      }}
    >
      {/* Pro accent bar across the top — same pattern as the Plan
          card in settings. Reads as "this card was made for you". */}
      {feel.proAccentBar && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: theme.accent,
          }}
        />
      )}

      {/* Eyebrow row: YOUR PLAN · Today */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: theme.accent,
        }} />
        <Text style={{
          fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
          color: theme.accent,
        }}>
          YOUR PLAN · TODAY
        </Text>
      </View>

      {/* Headline — the action. */}
      <Text
        style={{
          fontSize: 20,
          fontWeight: feel.headingWeight,
          letterSpacing: -0.3 + feel.headingTracking,
          color: theme.surface.t1,
          lineHeight: 26,
        }}
        numberOfLines={3}
      >
        {plan.headline}
      </Text>

      {/* Followup line — context / the "why". */}
      <Text style={{
        fontSize: 13,
        color: theme.surface.t2,
        lineHeight: 19,
      }}>
        {plan.followup}
      </Text>

      {/* CTA row. One button. Always opens Dilly chat. */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 4,
      }}>
        <Ionicons name="chatbubble" size={13} color={theme.accent} />
        <Text style={{
          fontSize: 13, fontWeight: '800',
          color: theme.accent, letterSpacing: 0.2,
        }}>
          {plan.cta}
        </Text>
        <Ionicons name="arrow-forward" size={13} color={theme.accent} />
      </View>
    </AnimatedPressable>
  );
}

export default YourPlanCard;
