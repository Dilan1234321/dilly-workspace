/**
 * DillyLoadingState - the standard loading surface for any page.
 *
 * Large centered DillyFace with a rotating pulse-fade line of text.
 * Matches the loading experience already used on My Dilly, AI Arena,
 * onboarding results, and Chapter. Any new page that needs a loading
 * state should mount this rather than an ActivityIndicator so the
 * product reads as one voice.
 *
 * Pass `messages` to customize the rotating lines for the specific
 * surface ("Pulling fresh matches…" for Jobs, "Opening your library…"
 * for Skills). Default to a generic sequence.
 */

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, TouchableOpacity, Text } from 'react-native';
import { DillyFace } from './DillyFace';
import { useResolvedTheme } from '../hooks/useTheme';

interface Props {
  /** Extra top padding, usually the safe-area inset top. */
  insetTop?: number;
  /** Rotating pulse-fade lines. Must be non-empty; falls back to the
   *  built-in generic sequence if empty. */
  messages?: string[];
  /** Face size. Defaults to 88 (matches the Skills loading state). */
  size?: number;
  /** Face mood. Defaults to 'curious'. */
  mood?: 'idle' | 'happy' | 'thinking' | 'writing' | 'curious' | 'proud' | 'attentive' | 'thoughtful' | 'focused';
  /** Accessory to render in Dilly's hand (e.g. 'pencil', 'glasses'). */
  accessory?: 'none' | 'pencil' | 'glasses' | 'briefcase' | 'compass';
  /** Quiet supporting line below the rotating message. Static. Use
   *  this to explain WHAT Dilly is doing for the user (Skills loading
   *  uses "Dilly is reading your profile and matching skills…"). */
  description?: string;
  /** Optional retry handler. When provided, a "Retry" button appears
   *  after 20s of loading - escape hatch for stuck screens. */
  onRetry?: () => void;
}

const DEFAULT_MESSAGES = [
  'One sec…',
  'Dilly is pulling this together…',
  'Almost ready…',
];

export default function DillyLoadingState({
  insetTop = 0,
  messages,
  size = 88,
  mood = 'curious',
  accessory = 'none',
  description,
  onRetry,
}: Props) {
  const theme = useResolvedTheme();
  const lines = (messages && messages.length > 0) ? messages : DEFAULT_MESSAGES;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const barAnim = useRef(new Animated.Value(0)).current;
  const [textIdx, setTextIdx] = useState(0);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    // Indeterminate progress bar: a small bright segment slides
    // continuously across a dim track. Reads as "actively working"
    // even when the underlying fetch hasn't returned yet — fixes the
    // "the loading screen feels frozen" complaint on Jobs.
    Animated.loop(
      Animated.timing(barAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ).start();
    if (lines.length <= 1) return;
    const interval = setInterval(
      () => setTextIdx(i => (i + 1) % lines.length),
      2500,
    );
    return () => clearInterval(interval);
  }, [pulseAnim, barAnim, lines.length]);

  useEffect(() => {
    if (!onRetry) return;
    const id = setTimeout(() => setShowRetry(true), 20000);
    return () => clearTimeout(id);
  }, [onRetry]);

  // Indeterminate-bar: bright segment slides L → R, then resets.
  const trackW = 140;
  const segW = 38;
  const barTranslate = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-segW, trackW],
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.surface.bg, paddingTop: insetTop }]}>
      <View style={styles.inner}>
        <DillyFace size={size} mood={mood} accessory={accessory} />
        <Animated.Text
          style={[
            styles.text,
            { color: theme.surface.t2, opacity: pulseAnim },
          ]}
        >
          {lines[textIdx]}
        </Animated.Text>
        {description ? (
          <Text style={[styles.description, { color: theme.surface.t3 }]}>
            {description}
          </Text>
        ) : null}
        {/* Indeterminate progress bar — visual reassurance that
            something is actively happening. Sits below the copy
            with subtle accent color. */}
        <View style={[styles.barTrack, { backgroundColor: theme.surface.t3 + '22' }]}>
          <Animated.View
            style={[
              styles.barSegment,
              { backgroundColor: theme.accent, width: segW, transform: [{ translateX: barTranslate as any }] },
            ]}
          />
        </View>
        {showRetry && onRetry ? (
          <TouchableOpacity
            onPress={() => { setShowRetry(false); onRetry(); }}
            style={[styles.retryBtn, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.retryText, { color: theme.accent }]}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  description: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 16,
    paddingHorizontal: 24,
  },
  barTrack: {
    width: 140,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 18,
  },
  barSegment: {
    height: 3,
    borderRadius: 2,
  },
  retryBtn: {
    marginTop: 22,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
