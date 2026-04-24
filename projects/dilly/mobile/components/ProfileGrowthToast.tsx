/**
 * ProfileGrowthToast — global listener that surfaces Dilly's auto-add
 * to the My Dilly profile.
 *
 * The chat overlay already POSTs /ai/chat/flush on close, which
 * extracts durable facts and writes them to the profile. MyDilly shows
 * a "writing down" overlay when mounted, but if the user finishes a
 * chat and jumps to a different tab, the growth was invisible.
 *
 * This component mounts at the app shell and listens to the global
 * extraction signal. When a new batch of facts lands, it briefly
 * surfaces a soft pill at the top of the screen: "Added to your
 * profile: X" so the user sees the product learning in real time.
 *
 * It is intentionally ephemeral (3.2 s) and non-blocking. Consumes the
 * added batch when it shows, so the Profile page doesn't also replay
 * them.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolvedTheme } from '../hooks/useTheme';
import {
  consumeAdded,
  useExtractionState,
  type ExtractionAddedFact,
} from '../hooks/useExtractionPending';

const SHOW_MS = 3200;

function summarize(added: ExtractionAddedFact[]): string {
  if (added.length === 0) return '';
  if (added.length === 1) return added[0].label || added[0].value || 'a new detail';
  return `${added.length} new details`;
}

export default function ProfileGrowthToast() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const state = useExtractionState();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(-12)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const lastSeq = useRef<number>(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.parallel([
      Animated.timing(opacity,   { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translate, { toValue: -16, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) { setVisible(false); panX.setValue(0); } });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dx) > 6 || gs.dy < -6,
      onPanResponderMove: (_e, gs) => {
        panX.setValue(gs.dx);
        if (gs.dy < 0) translate.setValue(gs.dy * 0.5 - 12 + 12); // small upward drag
      },
      onPanResponderRelease: (_e, gs) => {
        const swipedFarEnough = Math.abs(gs.dx) > 80 || gs.dy < -40;
        const fastEnough = Math.abs(gs.vx) > 0.8 || gs.vy < -0.6;
        if (swipedFarEnough || fastEnough) {
          dismiss();
        } else {
          Animated.spring(panX, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
          Animated.spring(translate, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    // Only react when a new batch arrives (seq advances) AND contains
    // facts. seq increments even on empty batches (close with no new
    // facts) and we want to stay silent in that case.
    if (state.seq === lastSeq.current) return;
    lastSeq.current = state.seq;
    if (!state.added || state.added.length === 0) return;

    setLabel(summarize(state.added));
    setVisible(true);
    consumeAdded();

    Animated.parallel([
      Animated.timing(opacity,   { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(translate, { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(dismiss, SHOW_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [state.seq, state.added, opacity, translate]);

  if (!visible) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
          opacity,
          transform: [{ translateY: translate }, { translateX: panX }],
          backgroundColor: theme.surface.s1,
          borderColor: theme.accentBorder,
        },
      ]}
    >
      <Ionicons name="sparkles" size={14} color={theme.accent} />
      <Text style={[styles.eyebrow, { color: theme.accent }]}>ADDED TO YOUR PROFILE</Text>
      <Text style={[styles.label, { color: theme.surface.t1 }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  label: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
