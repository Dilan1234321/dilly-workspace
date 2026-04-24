/**
 * ProfileGrowthToast — global listener that surfaces Dilly's auto-add
 * to the My Dilly profile.
 *
 * The chat overlay already POSTs /ai/chat/flush on close, which
 * extracts durable facts and writes them to the profile. MyDilly shows
 * a "writing down" overlay when mounted, but if the user finishes a
 * chat and jumps to a different tab, the growth was invisible.
 *
 * This component mounts at the app shell and listens to the global
 * extraction signal. When a new batch of facts lands, it briefly
 * surfaces a soft pill at the top of the screen: "Added to your
 * profile: X" so the user sees the product learning in real time.
 *
 * Tapping the pill opens a bottom-sheet modal listing the specific
 * facts that were just written — category, label, and value for each.
 * Swipe-to-dismiss still works; a tap is detected as very low movement
 * (< 10 px) in the PanResponder release handler.
 *
 * It is intentionally ephemeral (3.2 s) and non-blocking. Consumes the
 * added batch on display so the Profile page doesn't also replay them.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, PanResponder, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolvedTheme } from '../hooks/useTheme';
import {
  consumeAdded,
  useExtractionState,
  type ExtractionAddedFact,
} from '../hooks/useExtractionPending';

const SHOW_MS = 3200;

function summarize(added: ExtractionAddedFact[]): string {
  if (added.length === 0) return '';
  if (added.length === 1) return added[0].label || added[0].value || 'a new detail';
  return `${added.length} new details`;
}

export default function ProfileGrowthToast() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const state = useExtractionState();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');
  // Local copy of facts — captured before consumeAdded() clears global
  // state, so the detail modal has real content even after the toast
  // reports the batch consumed.
  const [facts, setFacts] = useState<ExtractionAddedFact[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(-12)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const lastSeq = useRef<number>(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.parallel([
      Animated.timing(opacity,   { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translate, { toValue: -16, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) { setVisible(false); panX.setValue(0); } });
  }

  function openDetail() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setDetailVisible(true);
  }

  function closeDetail() {
    setDetailVisible(false);
    dismiss();
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dx) > 6 || gs.dy < -6,
      onPanResponderMove: (_e, gs) => {
        panX.setValue(gs.dx);
        if (gs.dy < 0) translate.setValue(gs.dy * 0.5 - 12 + 12);
      },
      onPanResponderRelease: (_e, gs) => {
        // Tap: very low movement on all axes → open detail modal.
        const isTap = Math.abs(gs.dx) < 10 && Math.abs(gs.dy) < 10
          && Math.abs(gs.vx) < 0.3 && Math.abs(gs.vy) < 0.3;
        const swipedFarEnough = Math.abs(gs.dx) > 80 || gs.dy < -40;
        const fastEnough = Math.abs(gs.vx) > 0.8 || gs.vy < -0.6;
        if (isTap) {
          openDetail();
          return;
        }
        if (swipedFarEnough || fastEnough) {
          dismiss();
        } else {
          Animated.spring(panX,      { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
          Animated.spring(translate, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (state.seq === lastSeq.current) return;
    lastSeq.current = state.seq;
    if (!state.added || state.added.length === 0) return;

    const captured = [...state.added]; // snapshot before consumeAdded clears global
    setFacts(captured);
    setLabel(summarize(captured));
    setVisible(true);
    consumeAdded();

    Animated.parallel([
      Animated.timing(opacity,   { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(translate, { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(dismiss, SHOW_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [state.seq, state.added, opacity, translate]);

  // Keep rendering while detail modal is open even after toast fades.
  if (!visible && !detailVisible) return null;

  return (
    <>
      {visible && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.wrap,
            {
              top: insets.top + 8,
              opacity,
              transform: [{ translateY: translate }, { translateX: panX }],
              backgroundColor: theme.surface.s1,
              borderColor: theme.accentBorder,
            },
          ]}
        >
          <Ionicons name="sparkles" size={14} color={theme.accent} />
          <Text style={[styles.eyebrow, { color: theme.accent }]}>ADDED TO YOUR PROFILE</Text>
          <Text style={[styles.label, { color: theme.surface.t1 }]} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={theme.surface.t3} style={{ marginLeft: 'auto' }} />
        </Animated.View>
      )}

      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeDetail}
      >
        <Pressable style={styles.backdropPress} onPress={closeDetail}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface.bg, paddingBottom: insets.bottom + 20 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: theme.surface.s3 }]} />

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.accent }]}>WHAT DILLY LEARNED</Text>
              <Pressable onPress={closeDetail} hitSlop={12}>
                <Ionicons name="close" size={20} color={theme.surface.t2} />
              </Pressable>
            </View>
            <Text style={[styles.sheetSub, { color: theme.surface.t3 }]}>
              Dilly wrote these to your profile from your last conversation.
            </Text>

            {facts.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.surface.t3 }]}>
                Nothing to show.
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
                {facts.map((f, i) => (
                  <View
                    key={f.id || String(i)}
                    style={[styles.factRow, { borderColor: theme.surface.border }]}
                  >
                    <Text style={[styles.factCategory, { color: theme.accent }]}>
                      {(f.category || 'fact').toUpperCase()}
                    </Text>
                    <Text style={[styles.factLabel, { color: theme.surface.t1 }]}>
                      {f.label || f.value || '—'}
                    </Text>
                    {f.value && f.label && f.value !== f.label ? (
                      <Text style={[styles.factValue, { color: theme.surface.t2 }]}>
                        {f.value}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  label: { fontSize: 12, fontWeight: '700', flexShrink: 1 },

  backdropPress: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  sheetSub: { fontSize: 12, lineHeight: 17 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 32 },
  factRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factCategory: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  factLabel: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  factValue: { fontSize: 12, marginTop: 3, lineHeight: 17 },
});
