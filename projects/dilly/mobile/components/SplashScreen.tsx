import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DillyFace } from './DillyFace';
import { colors, API_BASE } from '../lib/tokens';
import { getToken } from '../lib/auth';

const { height: H } = Dimensions.get('window');
const GOLD  = '#C9A84C';
const CORAL = '#FF453A';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const ORB_SIZE = 96;

interface SplashState {
  state: string;
  eyebrow: string;
  eyebrow_color: 'gold' | 'green' | 'coral' | 'amber' | 'muted';
  eyebrow_pulse: boolean;
  headline: string;
  headline_gold: string;
  sub: string;
  cta_primary: string;
  cta_route: string;
  cta_context: string;
  glow_color: string;
  voice_prompt: string | null;
}

interface Props {
  onDismiss: (route?: string) => void;
}

function eyebrowColor(c: SplashState['eyebrow_color']): string {
  if (c === 'gold')  return GOLD;
  if (c === 'green') return GREEN;
  if (c === 'coral') return CORAL;
  if (c === 'amber') return AMBER;
  return colors.t3;
}

function Headline({ text, goldPortion }: { text: string; goldPortion: string }) {
  if (!goldPortion || !text.includes(goldPortion)) {
    return <Text style={ss.headline}>{text}</Text>;
  }
  const idx    = text.lastIndexOf(goldPortion);
  const before = text.slice(0, idx);
  const after  = text.slice(idx + goldPortion.length);
  return (
    <Text style={ss.headline}>
      {before}
      <Text style={[ss.headline, { color: GOLD }]}>{goldPortion}</Text>
      {after}
    </Text>
  );
}

function RippleRing({ delay }: { delay: number }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 140 / 96, duration: 2000, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,        duration: 2000, easing: Easing.linear, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.15, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[ss.ripple, { opacity, transform: [{ scale }] }]}
    />
  );
}

function Skeleton() {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={{ width: 80,  height: 10, borderRadius: 5, backgroundColor: colors.b2, opacity: pulse }} />
      <Animated.View style={{ width: 220, height: 10, borderRadius: 5, backgroundColor: colors.b2, opacity: pulse, marginTop: 10 }} />
      <Animated.View style={{ width: 180, height: 10, borderRadius: 5, backgroundColor: colors.b2, opacity: pulse, marginTop: 6  }} />
      <Animated.View style={{ width: 240, height: 1,  borderRadius: 5, backgroundColor: colors.b2, opacity: pulse, marginTop: 16 }} />
    </View>
  );
}

export default function SplashScreen({ onDismiss }: Props) {
  const insets = useSafeAreaInsets();

  const [splashData, setSplashData] = useState<SplashState | null>(null);
  const [fetchDone,  setFetchDone]  = useState(false);
  const [dismissed,  setDismissed]  = useState(false);

  const orbScale         = useRef(new Animated.Value(0.6)).current;
  const contentOpacity   = useRef(new Animated.Value(0)).current;
  const primaryOpacity   = useRef(new Animated.Value(0)).current;
  const secondaryOpacity = useRef(new Animated.Value(0)).current;
  const exitOpacity      = useRef(new Animated.Value(1)).current;
  const exitTranslateY   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/profile/splash-state`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!res.ok) throw new Error('failed');
        const data: SplashState = await res.json();
        if (!cancelled) { setSplashData(data); setFetchDone(true); }
      } catch {
        if (!cancelled) {
          setSplashData({
            state: 'fallback',
            eyebrow: 'WELCOME BACK',
            eyebrow_color: 'gold',
            eyebrow_pulse: false,
            headline: 'Your career center is ready.',
            headline_gold: 'career center is ready.',
            sub: 'Pick up where you left off.',
            cta_primary: 'Go to career center →',
            cta_route: '/(app)',
            cta_context: '',
            glow_color: 'gold',
            voice_prompt: null,
          });
          setFetchDone(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(180),
      Animated.spring(orbScale, { toValue: 1, stiffness: 180, damping: 14, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(780),
      Animated.timing(contentOpacity, { toValue: 1, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(1130),
      Animated.timing(primaryOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(1280),
      Animated.timing(secondaryOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = useCallback((route?: string) => {
    if (dismissed) return;
    setDismissed(true);
    Animated.timing(exitOpacity, {
      toValue: 0, duration: 250,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => onDismiss(route));
  }, [dismissed, onDismiss]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_e, gs) => Math.abs(gs.dy) > 5,
      onMoveShouldSetPanResponder:  (_e, gs) => gs.dy < -5,
      onPanResponderGrant: () => { exitTranslateY.stopAnimation(); },
      onPanResponderMove:  (_e, gs) => { if (gs.dy < 0) exitTranslateY.setValue(gs.dy); },
      onPanResponderRelease: (_e, gs) => {
        if (-gs.dy >= H * 0.4 || gs.vy < -0.5) {
          Animated.parallel([
            Animated.timing(exitTranslateY, { toValue: -H, duration: 280, easing: Easing.in(Easing.ease), useNativeDriver: true }),
            Animated.timing(exitOpacity,    { toValue: 0,  duration: 280, useNativeDriver: true }),
          ]).start(() => onDismiss());
        } else {
          Animated.spring(exitTranslateY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[ss.root, { opacity: exitOpacity, transform: [{ translateY: exitTranslateY }] }]}
      {...panResponder.panHandlers}
    >
      <View style={ss.bg} />

      <Animated.View style={[ss.orbWrap, { transform: [{ scale: orbScale }] }]}>
        <RippleRing delay={0} />
        <RippleRing delay={1000} />
        <View style={ss.orbOuter}>
          <View style={ss.orbInner}>
            <DillyFace size={156} />
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[ss.contentBlock, { opacity: contentOpacity }]}>
        {!fetchDone ? (
          <Skeleton />
        ) : splashData ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={[ss.eyebrow, { color: eyebrowColor(splashData.eyebrow_color) }]}>
              {splashData.eyebrow.toUpperCase()}
            </Text>
            <Headline text={splashData.headline} goldPortion={splashData.headline_gold} />
            <Text style={ss.sub}>{splashData.sub}</Text>
          </View>
        ) : null}
      </Animated.View>

      <View style={[ss.buttonsWrap, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View style={{ opacity: primaryOpacity, width: '100%' }}>
          <Pressable
            style={({ pressed }) => [ss.primaryBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => dismiss(splashData?.cta_route)}
          >
            <Text style={ss.primaryBtnText}>
              {splashData?.cta_primary ?? 'Go to your career center'}
            </Text>
          </Pressable>
        </Animated.View>
        <Animated.View style={{ opacity: secondaryOpacity, width: '100%' }}>
          <Pressable
            style={({ pressed }) => [ss.secondaryBtn, pressed && { opacity: 0.6 }]}
            onPress={() => dismiss()}
          >
            <Text style={ss.secondaryBtnText}>Go to your career center</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const ss = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'flex-start',
  },
  bg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000',
  },
  orbWrap: {
    marginTop: H * 0.38 - ORB_SIZE / 2 - 70,
    width: ORB_SIZE + 140, height: ORB_SIZE + 140,
    alignItems: 'center', justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)',
    backgroundColor: 'transparent',
  },
  orbOuter: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.20)',
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  orbInner: {
    width: 152, height: 152, borderRadius: 76,
    backgroundColor: '#0d0900',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,1)',
  },
  contentBlock: {
    paddingHorizontal: 28, alignItems: 'center',
    marginTop: 28, maxWidth: 340,
  },
  eyebrow: {
    fontFamily: 'Cinzel_700Bold', fontSize: 16,
    letterSpacing: 1.2, textAlign: 'center', marginBottom: 10,
  },
  headline: {
    fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26,
    color: colors.t1, lineHeight: 34,
    textAlign: 'center', marginBottom: 12,
  },
  sub: {
    fontSize: 13, color: colors.t2,
    textAlign: 'center', lineHeight: 20,
  },
  buttonsWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 22, gap: 10, alignItems: 'center',
  },
  primaryBtn: {
    width: '100%', height: 52, backgroundColor: GOLD,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Cinzel_700Bold', fontSize: 14,
    letterSpacing: 1.12, color: '#1a1400',
  },
  secondaryBtn: {
    width: '100%', height: 52, backgroundColor: 'transparent',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13, fontWeight: '500',
    color: 'rgba(244,244,250,0.70)',
  },
});