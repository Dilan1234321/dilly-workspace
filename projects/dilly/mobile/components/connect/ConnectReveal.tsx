/**
 * ConnectReveal — one-time full-screen takeover.
 *
 * Shown exactly once per account, on app open, when:
 *   a) CONNECT_FEATURE_ENABLED is true
 *   b) account_type is 'student' (or undefined — students first)
 *   c) the reveal has not been shown before (AsyncStorage flag)
 *
 * On "Turn on Recruiter Discovery" → sends user into Connect settings
 * with the master toggle ready to flip.
 * On "Maybe later" → dismisses, marks shown, does NOT open settings.
 *
 * Shown-state key: 'dilly_connect_reveal_shown'
 * Phase 3: no changes needed here — this is purely a one-time onboarding
 * moment. The flag never resets (unless the user reinstalls or clears storage).
 */

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Animated, Easing,
  TouchableOpacity, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DillyFace } from '../DillyFace';
import { useResolvedTheme } from '../../hooks/useTheme';
import { openConnectOverlay } from '../../hooks/useConnectOverlay';
import { CONNECT_FEATURE_ENABLED } from '../../lib/connectConfig';

const SHOWN_KEY = 'dilly_connect_reveal_shown';
const W = Dimensions.get('window').width;

export default function ConnectReveal() {
  const [visible, setVisible] = useState(false);
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const faceAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!CONNECT_FEATURE_ENABLED) return;
    // Holder guard is in ConnectRevealWrapper in _layout.tsx
    AsyncStorage.getItem(SHOWN_KEY).then(shown => {
      if (!shown) {
        // Small delay so the app shell loads behind the reveal
        setTimeout(() => {
          setMounted(true);
          setVisible(true);
        }, 800);
      }
    });
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(faceAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]).start();
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
  }, [visible, anim, faceAnim]);

  async function markShown() {
    await AsyncStorage.setItem(SHOWN_KEY, '1');
  }

  async function handleTurnOn() {
    await markShown();
    setVisible(false);
    // Brief pause so dismiss animation plays before Connect opens
    setTimeout(() => openConnectOverlay({ section: 'settings' }), 260);
  }

  async function handleLater() {
    await markShown();
    setVisible(false);
  }

  if (!mounted) return null;

  const faceScale = faceAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const contentY = anim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] });

  return (
    <Modal transparent animationType="none" visible={mounted} statusBarTranslucent onRequestClose={handleLater}>
      <Animated.View style={[r.backdrop, { opacity: anim, backgroundColor: theme.surface.bg }]}>
        <Animated.View style={[r.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32, opacity: anim, transform: [{ translateY: contentY }] }]}>

          {/* DillyFace with binoculars accessory (magnifier = closest to "watching") */}
          <Animated.View style={[r.faceWrap, { transform: [{ scale: faceScale }] }]}>
            <DillyFace size={120} mood="curious" accessory="magnifier" ring />
          </Animated.View>

          <Text style={[r.headline, { color: theme.surface.t1, fontFamily: theme.type.display }]}>
            Recruiters are{'\n'}watching Dilly now.
          </Text>

          <Text style={[r.body, { color: theme.surface.t2, fontFamily: theme.type.body }]}>
            Companies hiring in your field are discovering students through Dilly. Turn on Recruiter Discovery to let them find you — on your terms.
          </Text>

          {/* Feature highlights */}
          <View style={[r.highlights, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderRadius: theme.shape.md }]}>
            {[
              { icon: 'eye-outline', text: 'See which companies viewed your profile' },
              { icon: 'person-add-outline', text: 'Accept or decline connection requests' },
              { icon: 'settings-outline', text: 'Control exactly what recruiters see' },
            ].map((item, i) => (
              <View
                key={i}
                style={[r.highlightRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.surface.border }]}
              >
                <View style={[r.iconDot, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                  <Ionicons name={item.icon as any} size={14} color={theme.accent} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, color: theme.surface.t1, lineHeight: 20 }}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Primary CTA */}
          <TouchableOpacity
            style={[r.primaryBtn, { backgroundColor: theme.accent, borderRadius: theme.shape.md }]}
            onPress={handleTurnOn}
            activeOpacity={0.85}
          >
            <Text style={[r.primaryLabel, { fontFamily: theme.type.body }]}>Turn on Recruiter Discovery</Text>
          </TouchableOpacity>

          {/* Secondary CTA */}
          <TouchableOpacity onPress={handleLater} hitSlop={12} style={{ marginTop: 14 }}>
            <Text style={[r.laterLabel, { color: theme.surface.t3, fontFamily: theme.type.body }]}>
              Maybe later
            </Text>
          </TouchableOpacity>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const r = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 0,
  },
  faceWrap: {
    marginBottom: 28,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  highlights: {
    width: '100%',
    borderWidth: 1,
    marginBottom: 28,
    overflow: 'hidden',
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  iconDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.1,
  },
  laterLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
});
