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

import { lightHaptic, mediumHaptic } from '../lib/haptics';

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
  /** Haptic intensity on press. Defaults to 'light'. Pro tier passes
   *  'medium' for a more tactile, premium-feeling press. Pass false to
   *  disable haptics entirely (rare). */
  haptic?: boolean | 'light' | 'medium';
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
  haptic,
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      scale.value = withSpring(scaleDown, { stiffness: 350, damping: 20 });
      opacity.value = withSpring(0.7, { stiffness: 350, damping: 20 });
    })
    .onFinalize(() => {
      'worklet';
      scale.value = withSpring(1, { stiffness, damping });
      opacity.value = withSpring(1, { stiffness, damping });
    })
    .onEnd(() => {
      'worklet';
      // Haptic feedback by tier:
      //   haptic === 'medium' (or true from Pro tier via useTierFeel)
      //     fires the stronger impact — reads as "deliberate / premium"
      //   haptic === 'light' / unset / false → default light impact
      // We always fire SOMETHING so the press still feels responsive,
      // but Pro gets the meatier version. Cost to add: one extra API
      // call, zero ongoing.
      if (haptic === 'medium' || haptic === true) {
        runOnJS(mediumHaptic)();
      } else {
        runOnJS(lightHaptic)();
      }
      if (onPress) {
        runOnJS(onPress)();
      }
    });

  // Only compose with LongPress if onLongPress is provided.
  // Using Gesture.Exclusive unconditionally was crashing the app.
  const gesture = onLongPress
    ? Gesture.Exclusive(
        Gesture.LongPress()
          .enabled(!disabled)
          .minDuration(500)
          .onStart(() => {
            'worklet';
            scale.value = withSpring(1, { stiffness, damping });
            opacity.value = withSpring(1, { stiffness, damping });
            if (onLongPress) runOnJS(onLongPress)();
          }),
        tap,
      )
    : tap;

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
