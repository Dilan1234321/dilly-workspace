/**
 * CancelGoodbyeModal — a premium "here's what's going back to Dilly"
 * moment shown AFTER a successful subscription cancel.
 *
 * Design intent:
 *   - Not a guilt trip. Not a "wait are you sure" retention prompt.
 *   - Honest inventory of what the user is losing, shown as a calm
 *     goodbye. Some users will reconsider. The ones who don't will
 *     remember that Dilly treated the end with the same care as the
 *     start — which matters when they decide whether to resubscribe
 *     or recommend you.
 *
 * Treatment:
 *   - Full-screen modal with a fade-in.
 *   - Dilly avatar at top, slightly dimmed (the "Dilly is stepping
 *     back" visual cue).
 *   - Three lines of concrete losses — not features, actual things
 *     the user has built inside the product.
 *   - Two actions: "Come back anytime" (primary, closes modal) and
 *     "Actually, keep my subscription" (secondary, reverses the
 *     cancel — only shown for the first 60 seconds after cancel to
 *     avoid being a retention-trap pattern).
 *
 * Called from settings.tsx after /subscription/cancel returns 200.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Animated, TouchableOpacity, StyleSheet,
  Dimensions, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DillyFace } from './DillyFace';
import { useResolvedTheme } from '../hooks/useTheme';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  visible: boolean;
  // The tier the user was on before cancelling. Used to tailor the
  // losses copy — Pro users had more, so they see slightly more.
  previousPlan: 'dilly' | 'pro';
  // Number of extracted facts in their Dilly Profile. If >0, we name
  // the actual count — "Dilly will stop learning from your 47 facts"
  // hits different than "Dilly will stop learning." Concrete is
  // more honest AND more impactful.
  factCount?: number;
  // If the user taps "keep my subscription", this restarts the
  // checkout. settings.tsx handles the actual Stripe call.
  onUncancel?: () => void;
  // Closes the modal. Always available.
  onDismiss: () => void;
}

const UNCANCEL_WINDOW_SEC = 60;

export function CancelGoodbyeModal({
  visible, previousPlan, factCount, onUncancel, onDismiss,
}: Props) {
  const theme = useResolvedTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const faceOpacity = useRef(new Animated.Value(0)).current;
  const [secondsLeft, setSecondsLeft] = useState(UNCANCEL_WINDOW_SEC);

  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      faceOpacity.setValue(0);
      setSecondsLeft(UNCANCEL_WINDOW_SEC);
      return;
    }
    // Soft fade-in. The 600ms duration + delayed face fade-in reads
    // as "considered", not an alert popup.
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Face fades in slightly after the container so the user sees
    // the modal land, THEN Dilly appears — makes her feel present
    // rather than painted on.
    Animated.timing(faceOpacity, {
      toValue: 0.55,  // deliberately dimmed — she's stepping back
      duration: 800,
      delay: 200,
      useNativeDriver: true,
    }).start();
    // Countdown timer for the uncancel window.
    const tick = setInterval(() => {
      setSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [visible, fadeAnim, faceOpacity]);

  // Losses — named concretely. Not marketing copy. Things the user
  // has actually built that will stop working.
  const losses: string[] = [];
  if (factCount && factCount > 0) {
    losses.push(`Dilly will stop learning from your ${factCount} saved facts.`);
  } else {
    losses.push('Dilly will stop learning new things about you.');
  }
  losses.push('Fit narratives on jobs will pause. You can still browse them.');
  losses.push('Resume tailoring goes back to the generic template.');
  if (previousPlan === 'pro') {
    losses.push('AI Arena and interview practice lock to the free preview.');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Animated.View
        style={[
          s.backdrop,
          {
            backgroundColor:
              theme.surface.dark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)',
            opacity: fadeAnim,
          },
        ]}
      >
        <Animated.View
          style={[
            s.card,
            {
              backgroundColor: theme.surface.bg,
              borderColor: theme.surface.border,
              opacity: fadeAnim,
              transform: [{
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              }],
            },
          ]}
        >
          {/* Dilly, dimmed. Reads as "stepping back" — the same face
              you saw celebrating your upgrade is now quieter. */}
          <Animated.View style={{ opacity: faceOpacity, alignItems: 'center', marginTop: 8 }}>
            <DillyFace size={72} mood="calm" />
          </Animated.View>

          <Text style={[s.eyebrow, { color: theme.surface.t3 }]}>
            UNTIL WE SEE YOU AGAIN
          </Text>
          <Text style={[s.headline, { color: theme.surface.t1 }]}>
            Your subscription ended.
          </Text>
          <Text style={[s.sub, { color: theme.surface.t2 }]}>
            Your profile is safe. Everything Dilly learned about you
            stays. Here's what's paused until you come back:
          </Text>

          <View style={{ marginTop: 16, gap: 10, alignSelf: 'stretch' }}>
            {losses.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{
                  width: 4, height: 4, borderRadius: 2,
                  backgroundColor: theme.surface.t3, marginTop: 8,
                }} />
                <Text style={{
                  flex: 1, fontSize: 13, lineHeight: 19,
                  color: theme.surface.t2,
                }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>

          {/* Primary action: calm close. Reads as a dignified goodbye
              instead of a retention-trap layout. */}
          <TouchableOpacity
            style={[
              s.primaryCta,
              { backgroundColor: theme.accent, marginTop: 24 },
            ]}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <Text style={s.primaryCtaText}>Come back anytime</Text>
          </TouchableOpacity>

          {/* Escape hatch: reverse the cancel. Only shown for 60s so
              this doesn't become a retention-trap pattern. After the
              window it disappears — the user has already processed
              the cancel and shouldn't be pulled back. */}
          {secondsLeft > 0 && onUncancel && (
            <TouchableOpacity
              style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10 }}
              onPress={onUncancel}
              activeOpacity={0.6}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: theme.surface.t3,
              }}>
                Actually, keep my subscription ({secondsLeft}s)
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ position: 'absolute', top: 14, right: 14, padding: 6 }}
            onPress={onDismiss}
            hitSlop={12}
          >
            <Ionicons name="close" size={18} color={theme.surface.t3} />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%', maxWidth: 400,
    borderRadius: 20, borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  eyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 2,
    textAlign: 'center', marginTop: 12,
  },
  headline: {
    fontSize: 24, fontWeight: '900', letterSpacing: -0.5,
    textAlign: 'center', marginTop: 6, lineHeight: 30,
  },
  sub: {
    fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8,
  },
  primaryCta: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  primaryCtaText: {
    color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2,
  },
});

export default CancelGoodbyeModal;
