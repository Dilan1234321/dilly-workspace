/**
 * Shared animation utilities for Dilly — subtle, professional animations
 * that make every interaction feel polished.
 *
 * Uses React Native Reanimated for performant worklet-based animations.
 */

import {
  withTiming,
  withSpring,
  withDelay,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

// ── Spring configs ──────────────────────────────────────────────────────────

/** Snappy spring for button presses and quick interactions */
export const SPRING_SNAPPY = { damping: 15, stiffness: 200 };

/** Gentle spring for card entrances and page transitions */
export const SPRING_GENTLE = { damping: 20, stiffness: 120 };

/** Bouncy spring for celebratory animations */
export const SPRING_BOUNCY = { damping: 10, stiffness: 180 };

// ── Timing configs ──────────────────────────────────────────────────────────

/** Fast fade for quick show/hide */
export const FADE_FAST = { duration: 150, easing: Easing.out(Easing.ease) };

/** Standard fade for most transitions */
export const FADE_STANDARD = { duration: 250, easing: Easing.out(Easing.cubic) };

/** Slow fade for dramatic entrances */
export const FADE_SLOW = { duration: 400, easing: Easing.out(Easing.cubic) };

// ── Entrance helpers ────────────────────────────────────────────────────────

/** Animate a value from 0→1 with staggered delay */
export function enterFade(sv: SharedValue<number>, delay: number = 0) {
  'worklet';
  sv.value = withDelay(delay, withTiming(1, FADE_STANDARD));
}

/** Animate translateY from offset→0 with staggered delay */
export function enterSlideUp(sv: SharedValue<number>, delay: number = 0, offset: number = 16) {
  'worklet';
  sv.value = offset;
  sv.value = withDelay(delay, withSpring(0, SPRING_GENTLE));
}

/** Scale from 0.95→1 with spring */
export function enterScale(sv: SharedValue<number>, delay: number = 0) {
  'worklet';
  sv.value = 0.95;
  sv.value = withDelay(delay, withSpring(1, SPRING_GENTLE));
}
