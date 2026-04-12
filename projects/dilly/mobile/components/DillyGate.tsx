import { useEffect, useRef } from 'react';
import { View, Text, Modal, Animated, StyleSheet } from 'react-native';
import { colors } from '../lib/tokens';
import { DillyFace } from './DillyFace';
import AnimatedPressable from './AnimatedPressable';

interface DillyGateProps {
  visible: boolean;
  message: string;
  requiredPlan: 'dilly' | 'pro';
  onDismiss: () => void;
}

export default function DillyGate({ visible, message, requiredPlan, onDismiss }: DillyGateProps) {
  const faceScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      faceScale.setValue(0);
      textOpacity.setValue(0);
      buttonsOpacity.setValue(0);

      // Staggered entrance
      Animated.sequence([
        // Face springs in
        Animated.spring(faceScale, {
          toValue: 1,
          tension: 60,
          friction: 7,
          useNativeDriver: true,
        }),
        // Text fades in after face
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 280,
          delay: 0,
          useNativeDriver: true,
        }),
        // Buttons fade in after text
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 280,
          delay: 0,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, faceScale, textOpacity, buttonsOpacity]);

  const planLabel = requiredPlan === 'pro' ? 'Dilly Pro' : 'Dilly';
  const suffix = requiredPlan === 'pro' ? "That's on Dilly Pro." : "That's on Dilly.";
  const displayMessage = message.endsWith(suffix) ? message : `${message} ${suffix}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={s.container}>
        {/* Centered content */}
        <View style={s.center}>
          {/* Animated DillyFace */}
          <Animated.View style={{ transform: [{ scale: faceScale }] }}>
            <DillyFace size={120} />
          </Animated.View>

          {/* Message text */}
          <Animated.View style={[s.messageWrap, { opacity: textOpacity }]}>
            <Text style={s.messageText}>{displayMessage}</Text>
          </Animated.View>
        </View>

        {/* Buttons at bottom */}
        <Animated.View style={[s.buttonsWrap, { opacity: buttonsOpacity }]}>
          {/* See plans - filled */}
          <AnimatedPressable
            style={s.seePlansBtn}
            onPress={onDismiss}
            scaleDown={0.97}
          >
            <Text style={s.seePlansBtnText}>See plans</Text>
          </AnimatedPressable>

          {/* Not now - outlined */}
          <AnimatedPressable
            style={s.notNowBtn}
            onPress={onDismiss}
            scaleDown={0.97}
          >
            <Text style={s.notNowBtnText}>Not now</Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageWrap: {
    marginTop: 32,
    paddingHorizontal: 16,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.t1,
    textAlign: 'center',
    fontWeight: '400',
  },
  buttonsWrap: {
    gap: 12,
    paddingBottom: 16,
  },
  seePlansBtn: {
    backgroundColor: colors.indigo,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  seePlansBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  notNowBtn: {
    borderWidth: 1.5,
    borderColor: colors.b2,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  notNowBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.t2,
  },
});
