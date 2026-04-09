/**
 * AnimatedPressable  -  drop-in replacement for TouchableOpacity with spring-scale feedback.
 *
 * Usage:
 *   <AnimatedPressable onPress={fn} style={styles.card}>
 *     <Text>Tap me</Text>
 *   </AnimatedPressable>
 *
 * Props:
 *   scaleDown   -  how much to shrink on press (default 0.97)
 *   stiffness   -  spring stiffness (default 300)
 *   damping     -  spring damping (default 20)
 *   disabled    -  disables press and dims opacity
 *
 * Runs entirely on the UI thread via Reanimated  -  60fps guaranteed.
 */

import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleDown?: number;
  stiffness?: number;
  damping?: number;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

export default function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  style,
  scaleDown = 0.97,
  stiffness = 300,
  damping = 20,
  disabled = false,
  hitSlop,
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      scale.value = withSpring(scaleDown, { stiffness: 400, damping: 25 });
      opacity.value = withSpring(0.85, { stiffness: 400, damping: 25 });
    })
    .onFinalize(() => {
      'worklet';
      scale.value = withSpring(1, { stiffness, damping });
      opacity.value = withSpring(1, { stiffness, damping });
    })
    .onEnd(() => {
      'worklet';
      if (onPress) {
        runOnJS(onPress)();
      }
    });

  const longPress = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(500)
    .onStart(() => {
      'worklet';
      scale.value = withSpring(1, { stiffness, damping });
      opacity.value = withSpring(1, { stiffness, damping });
      if (onLongPress) runOnJS(onLongPress)();
    });

  const gesture = Gesture.Exclusive(longPress, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.4 : opacity.value,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, animatedStyle]} hitSlop={hitSlop as any}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
