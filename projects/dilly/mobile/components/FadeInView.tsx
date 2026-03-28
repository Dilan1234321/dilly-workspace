/**
 * FadeInView — wraps children in a fade + slide-up entrance animation.
 *
 * Usage:
 *   <FadeInView delay={100}>
 *     <ScoreCard />
 *   </FadeInView>
 *
 * Props:
 *   delay     — ms before animation starts (default 0)
 *   duration  — ms for the animation (default 450)
 *   distance  — pixels to slide up from (default 16)
 *   style     — additional styles
 */

import { ReactNode, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

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
  duration = 450,
  distance = 16,
  style,
}: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(distance);

  useEffect(() => {
    const config = {
      duration,
      easing: Easing.out(Easing.cubic),
    };
    opacity.value = withDelay(delay, withTiming(1, config));
    translateY.value = withDelay(delay, withTiming(0, config));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
