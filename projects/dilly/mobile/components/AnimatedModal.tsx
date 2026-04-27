/**
 * AnimatedModal - a drop-in wrapper around RN's <Modal> that adds
 * smooth custom fade+scale in/out animation instead of RN's built-in
 * animationType (which is either jarringly "slide" or rough "fade").
 *
 * Why:
 *   - User reported: "every single popup should have a smooth
 *     animation coming in and coming out."
 *   - RN's built-in animationType is frame-locked and stutters on
 *     some screens (Add-Fact, Cancel-Goodbye, etc.).
 *   - Using Animated.timing with easing curves produces a noticeably
 *     softer in/out that reads as "considered" instead of "popup."
 *
 * Behavior:
 *   - Fade-in: 220ms, cubic-out. Starts at opacity 0 + scale 0.96 →
 *     opacity 1 + scale 1. The slight scale-up gives it weight.
 *   - Fade-out: 180ms, cubic-in. Slightly faster than in so dismiss
 *     feels responsive, not sluggish.
 *   - Backdrop fades in sync with the card.
 *   - Taps on backdrop call onDismiss (caller controls whether this
 *     is blocked - pass backdropDismissable={false} to disable).
 *
 * Usage:
 *   <AnimatedModal visible={x} onDismiss={close}>
 *     <YourCardHere />
 *   </AnimatedModal>
 *
 * The child is rendered at the center of the screen with horizontal
 * padding. If you need a full-screen layout (top-to-bottom takeover),
 * use RN's Modal directly - this component is for cards/sheets.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Animated, Easing, Pressable, StyleSheet,
} from 'react-native';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Default true: tapping the backdrop calls onDismiss. Pass false
   *  for modals that require a deliberate action (like destructive
   *  confirmations) so a stray tap can't dismiss. */
  backdropDismissable?: boolean;
  /** Darkness of the backdrop when dark-mode-aware callers want to
   *  override. Default 0.45 - firm enough to focus the card, not
   *  so dark it reads as a blocking dialog. */
  backdropOpacity?: number;
}

export function AnimatedModal({
  visible,
  onDismiss,
  children,
  backdropDismissable = true,
  backdropOpacity = 0.45,
}: Props) {
  // We render our own Modal under the hood, but mount/unmount is
  // driven by a local `mounted` flag that stays true through the
  // exit animation so the card can fade OUT instead of being yanked
  // from the tree the instant `visible` goes false.
  const [mounted, setMounted] = useState(visible);

  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={mounted}
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          s.backdrop,
          {
            opacity: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, backdropOpacity],
            }),
            backgroundColor: '#000',
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={backdropDismissable ? onDismiss : undefined}
        />
      </Animated.View>

      <View style={s.centerWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            s.cardWrap,
            {
              opacity: anim,
              transform: [
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    // 0.96 → 1.0 gives a subtle weight-gain. More
                    // than that reads as "poppy" which is the wrong
                    // vibe for a premium app.
                    outputRange: [0.96, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 440,
  },
});

export default AnimatedModal;
