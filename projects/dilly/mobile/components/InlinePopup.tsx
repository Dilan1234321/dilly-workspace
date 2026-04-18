/**
 * InlinePopup. small floating action panel that appears near where the user tapped.
 * Replaces traditional Alert.alert with an in-app panel styled to match Dilly.
 *
 * Usage:
 *   <InlinePopup
 *     visible={showPopup}
 *     anchor={popupAnchor}  // { x, y } from the press event
 *     title="Skill name"
 *     message="Current value"
 *     actions={[
 *       { label: 'Edit', onPress: handleEdit },
 *       { label: 'Delete', destructive: true, onPress: handleDelete },
 *     ]}
 *     onClose={() => setShowPopup(false)}
 *   />
 */

import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  useWindowDimensions,
} from 'react-native';
import { colors, spacing, radius } from '../lib/tokens';
import { useResolvedTheme } from '../hooks/useTheme';

const PANEL_WIDTH = 200;
const PANEL_PADDING = 14;

export interface PopupAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  /** Screen coordinates of the tap that triggered the popup */
  anchor?: { x: number; y: number };
  title?: string;
  message?: string;
  actions: PopupAction[];
  onClose: () => void;
}

export default function InlinePopup({ visible, anchor, title, message, actions, onClose }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const { width: screenW, height: screenH } = useWindowDimensions();
  const theme = useResolvedTheme();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  // Position the panel near the anchor point, keeping it on screen
  let top = (anchor?.y ?? screenH / 2) - 20;
  let left = (anchor?.x ?? screenW / 2) - PANEL_WIDTH / 2;

  // Clamp to screen edges with padding
  const margin = 16;
  if (left < margin) left = margin;
  if (left + PANEL_WIDTH > screenW - margin) left = screenW - margin - PANEL_WIDTH;
  // If panel would go below screen, show above the anchor
  const estimatedHeight = 60 + actions.length * 44 + (title ? 24 : 0) + (message ? 20 : 0);
  if (top + estimatedHeight > screenH - 100) {
    top = (anchor?.y ?? screenH / 2) - estimatedHeight - 10;
  }
  if (top < 60) top = 60;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop. tapping dismisses */}
      <Pressable style={s.backdrop} onPress={onClose} />

      {/* Panel. Dynamic colors come from theme so Midnight gets a dark
          popover; Mint/Blush get pastel ones. Layout stays in StyleSheet. */}
      <Animated.View
        style={[
          s.panel,
          {
            top,
            left,
            opacity,
            backgroundColor: theme.surface.s1,
            borderColor: theme.surface.border,
            transform: [{ scale }],
          },
        ]}
      >
        {title && <Text style={[s.title, { color: theme.surface.t1 }]} numberOfLines={1}>{title}</Text>}
        {message && <Text style={[s.message, { color: theme.surface.t3 }]} numberOfLines={2}>{message}</Text>}

        <View style={[s.actions, { borderTopColor: theme.surface.border }]}>
          {actions.map((action, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                s.actionBtn,
                pressed && { backgroundColor: theme.surface.s2 },
                i < actions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.surface.border },
              ]}
              onPress={() => {
                onClose();
                // Small delay so the panel closes before the action runs
                setTimeout(action.onPress, 80);
              }}
            >
              <Text style={[s.actionLabel, { color: theme.surface.t1 }, action.destructive && { color: '#FF453A' }]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  panel: {
    position: 'absolute',
    width: PANEL_WIDTH,
    borderRadius: 14,
    paddingTop: PANEL_PADDING,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: PANEL_PADDING,
    marginBottom: 2,
  },
  message: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: PANEL_PADDING,
    marginBottom: 8,
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: PANEL_PADDING,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
});
