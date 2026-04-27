/**
 * FadeInView. wraps children in a smooth fade + slide-up + subtle scale entrance.
 *
 * Build 428: respects iOS Reduce Motion. When the user has Reduce
 * Motion enabled in Accessibility settings, we skip the slide and
 * scale entirely and either show the content immediately or do a
 * faster opacity-only crossfade. Animation libraries that ignore this
 * setting are the #1 reason an app feels "third-party" to users with
 * vestibular sensitivity, motion sickness, or just a preference for
 * less movement on screen.
 *
 * Usage:
 *   <FadeInView delay={100}>
 *     <ScoreCard />
 *   </FadeInView>
 */

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, ViewStyle, AccessibilityInfo } from 'react-native';

interface Props {
  children: ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

export default function FadeInView({
  children,
  delay = 0,
  duration = 400,
  distance = 12,
  style,
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  const scale = useRef(new Animated.Value(0.97)).current;

  // Read once - the user toggling Reduce Motion mid-session is rare
  // enough that we don't subscribe to AccessibilityInfo events.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      // Reduce-motion path: immediate appearance, no slide/scale. We
      // still respect `delay` so cascade timing for stacked items
      // (which sighted users use to parse hierarchy) survives - just
      // without the motion. Opacity goes from 0 to 1 in a quick fade.
      opacity.setValue(0);
      translateY.setValue(0);
      scale.setValue(1);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        delay,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: duration + 50,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: duration + 100,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduceMotion, delay, duration, opacity, translateY, scale]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }, { scale }] }]}>
      {children}
    </Animated.View>
  );
}
