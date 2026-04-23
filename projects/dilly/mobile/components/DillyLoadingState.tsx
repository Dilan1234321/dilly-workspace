/**
 * DillyLoadingState — the standard loading surface for any page.
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
  /** Face size. Defaults to 120 (matches My Dilly / AI Arena). */
  size?: number;
  /** Face mood. Defaults to 'idle'. Pass 'writing' with a pencil
   *  accessory for surfaces that feel actively working. */
  mood?: 'idle' | 'happy' | 'thinking' | 'writing' | 'curious' | 'proud';
  /** Accessory to render in Dilly's hand (e.g. 'pencil'). */
  accessory?: 'none' | 'pencil';
  /** Optional retry handler. When provided, a "Retry" button appears
   *  after 20s of loading — escape hatch for stuck screens. */
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
  size = 120,
  mood = 'idle',
  accessory = 'none',
  onRetry,
}: Props) {
  const theme = useResolvedTheme();
  const lines = (messages && messages.length > 0) ? messages : DEFAULT_MESSAGES;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [textIdx, setTextIdx] = useState(0);
  // Retry escape hatch — surfaces after 20s of loading when the caller
  // has passed onRetry. Stuck loading screens were the #1 "it looks
  // broken" complaint; a visible retry button reframes the wait as
  // recoverable.
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    if (lines.length <= 1) return;
    const interval = setInterval(
      () => setTextIdx(i => (i + 1) % lines.length),
      2500,
    );
    return () => clearInterval(interval);
  }, [pulseAnim, lines.length]);

  useEffect(() => {
    if (!onRetry) return;
    const id = setTimeout(() => setShowRetry(true), 20000);
    return () => clearTimeout(id);
  }, [onRetry]);

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
    fontSize: 16,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 24,
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
