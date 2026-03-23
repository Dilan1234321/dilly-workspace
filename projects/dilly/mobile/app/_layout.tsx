import { useRef, useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
} from '@expo-google-fonts/playfair-display';
import {
  Cinzel_400Regular,
  Cinzel_700Bold,
  Cinzel_900Black,
} from '@expo-google-fonts/cinzel';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../lib/tokens';
import SplashScreen from '../components/SplashScreen';

const GOLD = '#C9A84C';

function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const wordmarkOpacity    = useRef(new Animated.Value(0)).current;
  const wordmarkTranslateY = useRef(new Animated.Value(6)).current;
  const taglineOpacity     = useRef(new Animated.Value(0)).current;
  const taglineTranslateY  = useRef(new Animated.Value(3)).current;
  const barTrackOpacity    = useRef(new Animated.Value(0)).current;
  const barFillWidth       = useRef(new Animated.Value(0)).current;
  const glowOpacity        = useRef(new Animated.Value(0)).current;
  const exitOpacity        = useRef(new Animated.Value(1)).current;
  const exitTranslateY     = useRef(new Animated.Value(0)).current;

  const EASE_OUT = Easing.bezier(0.25, 0.46, 0.45, 0.94);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(wordmarkOpacity,    { toValue: 1, duration: 500, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(wordmarkTranslateY, { toValue: 0, duration: 500, easing: EASE_OUT, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(700),
      Animated.parallel([
        Animated.timing(taglineOpacity,    { toValue: 1, duration: 400, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(taglineTranslateY, { toValue: 0, duration: 400, easing: EASE_OUT, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(900),
      Animated.timing(barTrackOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(900),
      Animated.timing(barFillWidth, {
        toValue: 1, duration: 1800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(1800),
      Animated.timing(glowOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(2700),
      Animated.parallel([
        Animated.timing(exitOpacity,    { toValue: 0,   duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(exitTranslateY, { toValue: -12, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    ]).start(() => onComplete());
  }, []);

  const barWidthPct = barFillWidth.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <View style={ls.root}>
      <Animated.View style={[
        ls.content,
        { opacity: exitOpacity, transform: [{ translateY: exitTranslateY }] },
      ]}>
        <Animated.Text style={[
          ls.wordmark,
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkTranslateY }] },
        ]}>
          Dilly
        </Animated.Text>
        <Animated.Text style={[
          ls.tagline,
          { opacity: taglineOpacity, transform: [{ translateY: taglineTranslateY }] },
        ]}>
          Career readiness, measured.
        </Animated.Text>
        <Animated.View style={[ls.barWrap, { opacity: barTrackOpacity }]}>
          <Animated.View style={[ls.barGlow, { opacity: glowOpacity }]} />
          <View style={ls.barTrack}>
            <Animated.View style={[ls.barFill, { width: barWidthPct }]} />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

type Phase = 'loading' | 'splash' | 'app';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    Cinzel_400Regular,
    Cinzel_700Bold,
    Cinzel_900Black,
  });

  const [phase,       setPhase]       = useState<Phase>('loading');
  const [isReturning, setIsReturning] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const secure = await SecureStore.getItemAsync('dilly_auth_token').catch(() => null);
        const token  = secure ?? await AsyncStorage.getItem('dilly_auth_token');
        setIsReturning(!!token);
      } catch {
        setIsReturning(false);
      } finally {
        setCheckedAuth(true);
      }
    })();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }

  if (phase === 'loading') {
    return (
      <LoadingScreen
        onComplete={() => {
          setPhase('splash');
        }}
      />
    );
  }

  if (phase === 'splash') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(app)" />
        </Stack>
        <SplashScreen
          onDismiss={(route?: string) => {
            setPhase('app');
            if (route && route !== '/(app)' && route !== '/' && route !== '') {
              setTimeout(() => {
                try { router.push(route as any); } catch (_e) {}
              }, 100);
            }
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
      </Stack>
    </SafeAreaProvider>
  );
}

const ls = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center' },
  wordmark: {
    fontFamily:    'Cinzel_900Black',
    fontSize:      34,
    letterSpacing: 5.1,
    color:         GOLD,
    textAlign:     'center',
    shadowColor:   GOLD,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius:  16,
    marginBottom:  10,
  },
  tagline: {
    fontSize:      13,
    fontWeight:    '300',
    letterSpacing: 1.04,
    color:         'rgba(244,244,250,0.45)',
    textAlign:     'center',
    marginBottom:  36,
  },
  barWrap:  { width: 120, alignItems: 'center', justifyContent: 'center' },
  barGlow:  {
    position:        'absolute',
    width:           120,
    height:          4,
    borderRadius:    2,
    backgroundColor: 'transparent',
    shadowColor:     GOLD,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.6,
    shadowRadius:    12,
  },
  barTrack: {
    width:           120,
    height:          1.5,
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderRadius:    999,
    overflow:        'hidden',
  },
  barFill: {
    height:          '100%',
    backgroundColor: GOLD,
    borderRadius:    999,
    shadowColor:     GOLD,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.9,
    shadowRadius:    4,
  },
});