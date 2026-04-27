/**
 * GlobalToast - the single mount point for the in-app toast singleton
 * defined in lib/globalToast.ts. Lives in (app)/_layout so any screen
 * can call showToast() and a non-blocking pill animates in over the
 * top of whatever is on screen. Theme-aware, respects safe-area.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalToastState } from '../lib/globalToast';
import { useResolvedTheme } from '../hooks/useTheme';
import { successHaptic, warningHaptic, mediumHaptic } from '../lib/haptics';

export default function GlobalToast() {
  const state = useGlobalToastState();
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const lastIdRef = useRef(0);

  useEffect(() => {
    if (state.visible) {
      // Fire one haptic per new toast id (not per visibility flip).
      if (state.id !== lastIdRef.current) {
        lastIdRef.current = state.id;
        if (state.type === 'success') successHaptic();
        else if (state.type === 'error') warningHaptic();
        else mediumHaptic();
      }
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1, duration: 180,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0, damping: 16, stiffness: 220,
          mass: 0.8, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0, duration: 220,
          easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -10, duration: 220, useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.visible, state.id, state.type, opacity, translateY]);

  const isError = state.type === 'error';
  const isSuccess = state.type === 'success';
  const accentColor = isError ? '#FF453A' : isSuccess ? '#30D158' : theme.accent;
  const iconName = isError ? 'alert-circle' : isSuccess ? 'checkmark-circle' : 'information-circle';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        {
          top: insets.top + 10,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          s.pill,
          {
            backgroundColor: theme.surface.s1,
            borderColor: accentColor + '55',
          },
        ]}
      >
        <Ionicons name={iconName as any} size={16} color={accentColor} />
        <Text style={[s.text, { color: theme.surface.t1 }]} numberOfLines={3}>
          {state.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10000,
    elevation: 10000,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 420,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
