/**
 * GlobalConfirm - the in-app modal mounted once in (app)/_layout to
 * render confirmations driven by lib/globalConfirm.showConfirm(). All
 * code that used to fire Alert.alert with multiple buttons should
 * await showConfirm instead so the experience stays in the app's
 * design language and respects the active theme.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useResolvedTheme } from '../hooks/useTheme';
import { useGlobalConfirmState, _resolveConfirm } from '../lib/globalConfirm';

export default function GlobalConfirm() {
  const state = useGlobalConfirmState();
  const theme = useResolvedTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (state.visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1, duration: 180,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1, damping: 18, stiffness: 240, mass: 0.7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.96);
    }
  }, [state.visible, state.id, opacity, scale]);

  const destructiveColor = '#FF453A';
  const confirmColor = state.destructive ? destructiveColor : theme.accent;
  const confirmLabel = state.confirmLabel || (state.destructive ? 'Delete' : 'OK');
  const cancelLabel = state.cancelLabel || 'Cancel';

  return (
    <Modal
      transparent
      visible={state.visible}
      onRequestClose={() => _resolveConfirm(false)}
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[s.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => _resolveConfirm(false)} />
        <Animated.View
          style={[
            s.card,
            {
              backgroundColor: theme.surface.s1,
              borderColor: theme.surface.border,
              transform: [{ scale }],
            },
          ]}
        >
          {state.title ? (
            <Text style={[s.title, { color: theme.surface.t1 }]}>{state.title}</Text>
          ) : null}
          <Text style={[s.message, { color: theme.surface.t2 }]}>{state.message}</Text>
          <View style={s.actions}>
            <Pressable
              onPress={() => _resolveConfirm(false)}
              style={({ pressed }) => [
                s.btn,
                { backgroundColor: theme.surface.bg, borderColor: theme.surface.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[s.btnText, { color: theme.surface.t1 }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => _resolveConfirm(true)}
              style={({ pressed }) => [
                s.btn,
                { backgroundColor: confirmColor, borderColor: confirmColor },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[s.btnText, { color: '#fff' }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 22,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
