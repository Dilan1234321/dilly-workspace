/**
 * FirstVisitCoach — full-screen "here's what this screen is" flash.
 *
 * Fires the FIRST time a user opens a given screen. One large
 * sentence centered on a dimmed backdrop + one small visual cue.
 * User taps anywhere to dismiss; stamps AsyncStorage so it never
 * returns on that device for that screen.
 *
 * Design rules:
 *  - ONE sentence. 15-25 words. Large type. Everything else gets cut.
 *  - ONE visual (an Ionicon glyph, 56pt, accent-colored). No screenshots.
 *  - Tap anywhere to dismiss — no Next button, no progress dots.
 *  - Versioned IDs. If copy changes meaningfully later, bump the id
 *    to v2 and the coach re-shows once per user.
 *
 * Why full-screen dim (vs. inline pill):
 *  - Founder picked this pattern: "it should feel like 'oh, aha!'
 *    for every screen the user presses".
 *  - An inline pill can be missed. A full-screen flash cannot.
 *  - 400ms delay after mount so the screen renders underneath first
 *    — the user sees the real UI, then the coach lands on top.
 *    Instant-fire would feel like a loading screen.
 *
 * Usage in a screen:
 *   <FirstVisitCoach
 *     id="ai-arena-v1"
 *     iconName="shield-checkmark"
 *     headline="The real threats to your job, and what to do about them."
 *     subline="Dilly reads your role and flags what AI is coming for first."
 *   />
 *
 * That's it. Mount-and-forget. Component handles its own visibility.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, Pressable, StyleSheet, Dimensions, Modal, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useResolvedTheme } from '../hooks/useTheme';

const { width: SCREEN_W } = Dimensions.get('window');
const STORAGE_PREFIX = 'dilly_coach_shown_';
const MOUNT_DELAY_MS = 400;

interface Props {
  /** Unique id for this screen's coach mark. Versioned: bump to v2
   *  when you want the same screen to re-show its coach once per user. */
  id: string;
  /** Single sentence. Keep to 15-25 words. Appears in 22-26pt type. */
  headline: string;
  /** Optional supporting line. Smaller type, below headline. */
  subline?: string;
  /** Ionicons glyph name. Rendered 56pt in accent color. */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** If true, never fire. Lets callers pass a gating condition
   *  (e.g. only show for paid users) without conditionally
   *  mounting the component. */
  disabled?: boolean;
}

export function FirstVisitCoach({
  id,
  headline,
  subline,
  iconName = 'sparkles',
  disabled = false,
}: Props) {
  const theme = useResolvedTheme();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  // Decide whether to fire. Runs once on mount.
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(STORAGE_PREFIX + id);
        if (seen === '1') return;
        // Delay so the real screen paints first. User sees the
        // actual UI, then the coach mark lands on top — not a
        // blank "what is loading" flash.
        setTimeout(() => {
          if (cancelled) return;
          setMounted(true);
          setVisible(true);
        }, MOUNT_DELAY_MS);
      } catch {
        // Storage failure — better to skip than to show on every
        // open. The user gets the real screen, which is fine.
      }
    })();
    return () => { cancelled = true; };
  }, [id, disabled]);

  // Drive the fade-in/out animation.
  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      Animated.timing(anim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, anim]);

  const dismiss = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(STORAGE_PREFIX + id, '1');
    } catch {
      // Best-effort. If the write fails the user sees it again on
      // next open — minor cost, no correctness issue.
    }
  };

  if (!mounted) return null;

  // Backdrop now adapts to the user's Customize Dilly surface. On
  // dark themes (Midnight) we stay almost-black. On light themes
  // (Cloud, Cream, Blush, Slate) we use a theme-matched tint with
  // heavy alpha so the coach card feels like "your app, dimmed"
  // instead of an unrelated dark intrusion. Text color flips with
  // the surface so it's always readable against whichever backdrop
  // lands under it.
  const isDark = !!theme.surface.dark;
  const backdropColor = isDark
    ? 'rgba(0,0,0,0.78)'
    // Light themes — use a darkened surface tint at high alpha. This
    // keeps the overlay feeling like the app rather than a generic
    // black scrim, and preserves enough contrast for white+accent text.
    : 'rgba(18,22,38,0.86)';
  const titleColor = '#ffffff';            // readable on both dims
  const sublineColor = 'rgba(255,255,255,0.78)';
  const hintColor = 'rgba(255,255,255,0.6)';

  // Wrap in a native Modal so the coach overlays EVERYTHING — the
  // tab bar, any floating FABs, etc. Without this, the tab bar sits
  // on top and users see the navbar peeking through the dim, which
  // breaks the "pause, read this one sentence" intent.
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFillObject, { opacity: anim }]}
      >
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropColor }]}
          onPress={dismiss}
        >
        <View style={s.centerWrap}>
          <Animated.View
            style={{
              alignItems: 'center',
              transform: [{
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              }],
            }}
          >
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: theme.accent + '22',
                borderWidth: 2,
                borderColor: theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 28,
              }}
            >
              <Ionicons name={iconName} size={44} color={theme.accent} />
            </View>

            <Text
              style={{
                fontSize: 24,
                fontWeight: '900',
                letterSpacing: -0.4,
                color: titleColor,
                textAlign: 'center',
                lineHeight: 32,
                paddingHorizontal: 32,
              }}
            >
              {headline}
            </Text>

            {subline ? (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: sublineColor,
                  textAlign: 'center',
                  lineHeight: 20,
                  paddingHorizontal: 40,
                  marginTop: 14,
                }}
              >
                {subline}
              </Text>
            ) : null}

            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.8,
                color: hintColor,
                marginTop: 36,
              }}
            >
              TAP ANYWHERE TO CONTINUE
            </Text>
          </Animated.View>
        </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: SCREEN_W,
  },
});

export default FirstVisitCoach;
