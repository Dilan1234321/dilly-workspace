/**
 * InlineToast — small floating error/info message near where the user tapped.
 * Auto-dismisses after a few seconds. Replaces Alert.alert for error messages.
 *
 * Usage:
 *   const toast = useInlineToast();
 *   toast.show({ message: 'Could not capture card', anchor: { x, y } });
 *   <InlineToastView {...toast.props} />
 */

import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens';
import { warningHaptic } from '../lib/haptics';

const TOAST_WIDTH = 220;
const AUTO_DISMISS_MS = 3000;

interface ToastState {
  visible: boolean;
  message: string;
  anchor?: { x: number; y: number };
  type: 'error' | 'info' | 'success';
}

export function useInlineToast() {
  const [state, setState] = useState<ToastState>({ visible: false, message: '', type: 'error' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(({ message, anchor, type = 'error' }: { message: string; anchor?: { x: number; y: number }; type?: 'error' | 'info' | 'success' }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    warningHaptic();
    setState({ visible: true, message, anchor, type });
    timerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
    }, AUTO_DISMISS_MS);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(prev => ({ ...prev, visible: false }));
  }, []);

  return { show, hide, props: state };
}

interface Props {
  visible: boolean;
  message: string;
  anchor?: { x: number; y: number };
  type: 'error' | 'info' | 'success';
}

export default function InlineToastView({ visible, message, anchor, type }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Animate in/out
  const prevVisible = useRef(false);
  if (visible !== prevVisible.current) {
    prevVisible.current = visible;
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 14, stiffness: 200, mass: 0.8, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -10, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }

  if (!visible && !prevVisible.current) return null;

  const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'checkmark-circle' : 'information-circle';
  const iconColor = type === 'error' ? '#FF453A' : type === 'success' ? '#30D158' : colors.indigo;
  const bgColor = type === 'error' ? '#FFF5F5' : type === 'success' ? '#F0FFF4' : '#F0F0FF';
  const borderColor = type === 'error' ? '#FFE0E0' : type === 'success' ? '#C6F6D5' : '#E0E0FF';

  // Position: center-top by default, near anchor if provided
  let top = anchor?.y ? anchor.y - 50 : 100;
  let left = (anchor?.x ?? screenW / 2) - TOAST_WIDTH / 2;
  const margin = 16;
  if (left < margin) left = margin;
  if (left + TOAST_WIDTH > screenW - margin) left = screenW - margin - TOAST_WIDTH;
  if (top < 60) top = 60;
  if (top > screenH - 120) top = screenH - 120;

  return (
    <Animated.View
      style={[
        s.toast,
        { top, left, opacity, transform: [{ translateY }], backgroundColor: bgColor, borderColor },
      ]}
      pointerEvents="none"
    >
      <Ionicons name={iconName as any} size={16} color={iconColor} />
      <Text style={s.text}>{message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    zIndex: 99999,
    elevation: 99999,
    width: TOAST_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: colors.t1,
    lineHeight: 16,
  },
});
