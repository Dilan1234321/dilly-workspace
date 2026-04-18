/**
 * DillyPaywallFullScreen — shown when a free-tier user taps a
 * Dilly-AI surface they can't use yet. Full-screen, elegant,
 * quietly persuasive.
 *
 * Tone philosophy:
 *   - Not "UPGRADE NOW!!" Not crossed-out prices and fake urgency.
 *   - It's Dilly remembering its own place. "Here's what we would
 *     do together" rather than "Buy this feature." Respectful of
 *     the user's time and money.
 *   - One primary CTA. No second-click to upsell. No feature matrix.
 *     Persuasion is in the quiet confidence of the page, not the loudness.
 *
 * Surface design:
 *   - Full screen, no toolbar, no distractions.
 *   - Dilly's face at top (familiar presence).
 *   - Single headline speaking TO the user, not at them.
 *   - 3 short lines of what unlock means, as sentences not bullets.
 *   - One price + one button.
 *   - Small dismiss. Respects the user who isn't ready yet.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DillyFace } from './DillyFace';
import AnimatedPressable from './AnimatedPressable';
import { colors, spacing } from '../lib/tokens';
import { useResolvedTheme } from '../hooks/useTheme';

const PRICING_URL = 'https://hellodilly.com/pricing.html';

export interface DillyPaywallContext {
  /** Short surface label shown at the top, optional. e.g. "Raise Brief", "Fit narrative". */
  surface?: string;
  /** What the user would have seen if they had access, written as a statement. */
  promise?: string;
}

interface DillyPaywallFullScreenProps {
  visible: boolean;
  onDismiss: () => void;
  context?: DillyPaywallContext;
}

const DEFAULT_PROMISE = 'Dilly reads who you are and writes back as if you were the only person they know.';

export default function DillyPaywallFullScreen({
  visible,
  onDismiss,
  context,
}: DillyPaywallFullScreenProps) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(30)).current;
  const theme = useResolvedTheme();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fade.setValue(0);
      slide.setValue(30);
    }
  }, [visible, fade, slide]);

  async function handleOpenPricing() {
    try {
      await Linking.openURL(PRICING_URL);
    } catch {
      // If the link fails we don't dismiss — user can try again.
      return;
    }
    onDismiss();
  }

  const promise = context?.promise || DEFAULT_PROMISE;
  const surface = context?.surface;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View
        style={[
          s.container,
          {
            backgroundColor: theme.surface.bg,
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 14,
            opacity: fade,
          },
        ]}
      >
        {/* Dismiss. small, quiet, top-right. Respects users who
            aren't ready yet. We don't want to feel like a trap. */}
        <View style={s.topRow}>
          <Pressable onPress={onDismiss} hitSlop={16} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={theme.surface.t3} />
          </Pressable>
        </View>

        <Animated.View style={[s.content, { transform: [{ translateY: slide }] }]}>
          {/* Dilly presence. familiar face. no brand shouting. */}
          <View style={s.faceWrap}>
            <DillyFace size={96} />
          </View>

          {/* Surface label. "this is where you are" context — optional.
              Eyebrow uses theme accent so the paywall ties into the
              user's customized color on every launch. */}
          {surface ? (
            <Text style={[s.eyebrow, { color: theme.accent }]}>{surface.toUpperCase()}</Text>
          ) : (
            <Text style={[s.eyebrow, { color: theme.accent }]}>A GENTLE REMINDER</Text>
          )}

          {/* Primary headline. spoken to the user, not at them. */}
          <Text style={[s.headline, { color: theme.surface.t1 }]}>
            This is where Dilly{'\n'}goes to work.
          </Text>

          {/* The promise. one paragraph. specific to the surface if provided. */}
          <Text style={[s.promise, { color: theme.surface.t2 }]}>
            {promise}
          </Text>

          {/* Three short lines of what's unlocked. Written as sentences,
              not bullets. Fewer exclamation points, more substance. */}
          <View style={s.linesWrap}>
            <PaywallLine accent={theme.accent} textColor={theme.surface.t1} text="Coaching that learns you over time, not a cold chatbot." />
            <PaywallLine accent={theme.accent} textColor={theme.surface.t1} text="Personalized fit reads on every job, tailored resumes per role." />
            <PaywallLine accent={theme.accent} textColor={theme.surface.t1} text="A career coach that's available the moment you need one." />
          </View>
        </Animated.View>

        {/* Footer. price + CTA + subtle 'continue free' affordance. */}
        <Animated.View style={[s.footer, { transform: [{ translateY: slide }] }]}>
          <View style={s.priceRow}>
            <Text style={[s.priceAmount, { color: theme.surface.t1 }]}>$9.99</Text>
            <Text style={[s.pricePeriod, { color: theme.surface.t3 }]}>/ month</Text>
          </View>
          <Text style={[s.priceNote, { color: theme.surface.t3 }]}>Cancel anytime. No contract.</Text>

          <AnimatedPressable
            style={[s.cta, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
            scaleDown={0.97}
            onPress={handleOpenPricing}
          >
            <Text style={s.ctaText}>Unlock Dilly</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </AnimatedPressable>

          <Pressable onPress={onDismiss} hitSlop={12} style={s.continueFree}>
            <Text style={[s.continueFreeText, { color: theme.surface.t3 }]}>Not right now</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function PaywallLine({ text, accent, textColor }: { text: string; accent: string; textColor: string }) {
  return (
    <View style={s.line}>
      <View style={[s.lineDot, { backgroundColor: accent }]} />
      <Text style={[s.lineText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },

  faceWrap: {
    alignSelf: 'center',
    marginBottom: 6,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    textAlign: 'center',
  },

  headline: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
    textAlign: 'center',
  },

  promise: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },

  linesWrap: {
    marginTop: 14,
    gap: 14,
  },
  line: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  lineDot: {
    width: 6, height: 6, borderRadius: 3,
    marginTop: 8,
  },
  lineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },

  footer: {
    gap: 10,
    alignItems: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceAmount: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pricePeriod: {
    fontSize: 15,
    fontWeight: '600',
  },
  priceNote: {
    fontSize: 12,
    marginBottom: 8,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignSelf: 'stretch',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  continueFree: {
    marginTop: 6,
    paddingVertical: 6,
  },
  continueFreeText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
