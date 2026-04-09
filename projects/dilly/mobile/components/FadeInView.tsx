/**
 * FadeInView  -  wraps children in a fade + slide-up entrance animation.
 *
 * Usage:
 *   <FadeInView delay={100}>
 *     <ScoreCard />
 *   </FadeInView>
 *
 * Props:
 *   delay      -  ms before animation starts (default 0)
 *   duration   -  ms for the animation (default 450)
 *   distance   -  pixels to slide up from (default 16)
 *   style      -  additional styles
 */

import { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

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
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
