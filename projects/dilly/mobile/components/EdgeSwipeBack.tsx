/**
 * EdgeSwipeBack - left-edge swipe = back, app-wide.
 *
 * Native iOS only enables back-swipe inside Stack navigators. Most of
 * Dilly's "hidden" screens (settings, calendar, customize, etc.) are
 * registered as Tabs.Screen with href:null, which means they don't get
 * the system gesture. This component lays a thin invisible strip down
 * the left edge of the screen and treats any horizontal swipe (>=64dp,
 * mostly horizontal) as router.back() - or the home tab if there's no
 * back stack.
 *
 * Mounted at the app shell so it works everywhere. The strip is only
 * 18dp wide, so it doesn't eat taps on left-aligned UI - users have to
 * actually start their drag from the bezel.
 */
import { useRef } from 'react';
import { View, PanResponder, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EDGE_WIDTH = 18;          // dp from left edge that arms the gesture
const TRIGGER_DX = 60;          // horizontal distance needed to fire back
const MAX_VERT   = 80;          // vertical drift cap so vertical scrolls don't fire

export default function EdgeSwipeBack() {
  const insets = useSafeAreaInsets();
  const fired = useRef(false);

  const responder = useRef(
    PanResponder.create({
      // Only claim the gesture when the touch began near the edge AND
      // the user is dragging mostly rightward. Returning false on the
      // first event lets vertical scrolls / button taps win.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, gs) => {
        const startX = e.nativeEvent.pageX - gs.dx;
        if (startX > EDGE_WIDTH) return false;
        if (Math.abs(gs.dx) < 8) return false;
        if (Math.abs(gs.dy) > Math.abs(gs.dx)) return false;
        return gs.dx > 0;
      },
      onPanResponderGrant: () => { fired.current = false; },
      onPanResponderMove: (_e, gs) => {
        if (fired.current) return;
        if (gs.dx >= TRIGGER_DX && Math.abs(gs.dy) <= MAX_VERT) {
          fired.current = true;
          if (router.canGoBack()) {
            router.back();
          }
        }
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  // Only iOS feels native with this gesture. Android has its own
  // system-level back; doubling up would be confusing.
  if (Platform.OS !== 'ios') return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        top: insets.top,
        bottom: 0,
        width: EDGE_WIDTH,
        zIndex: 9999,
      }}
      {...responder.panHandlers}
    />
  );
}
