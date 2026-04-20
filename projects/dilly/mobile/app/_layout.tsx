import { useRef, useEffect, useState } from 'react';
import { Stack, router, usePathname } from 'expo-router';
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
import { View, StyleSheet, Animated, Easing, Image } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../lib/tokens';
import SplashScreen from '../components/SplashScreen';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useResolvedTheme } from '../hooks/useTheme';

const GOLD = '#2B3A8E';

// Signed-in users see their chosen theme on the loading screen —
// signed-out users still see the brand white/indigo since they have
// no theme yet and we want the first impression to be consistent.
function LoadingScreen({ onComplete, themed }: { onComplete: () => void; themed: boolean }) {
  const theme = useResolvedTheme();
  const bg = themed ? theme.surface.bg : '#FFFFFF';
  const fill = themed ? theme.accent : GOLD;
  const taglineColor = themed ? theme.surface.t2 : colors.t2;
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
    <View style={[ls.root, { backgroundColor: bg }]}>
      <Animated.View style={[
        ls.content,
        { opacity: exitOpacity, transform: [{ translateY: exitTranslateY }] },
      ]}>
        <Animated.View style={[
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkTranslateY }] },
        ]}>
          {/* Tint the logo with the user's accent (falls back to
              GOLD on sign-out per `fill` above). Image's tintColor
              recolors every opaque pixel. */}
          <Image
            source={require('../assets/logo.png')}
            style={[ls.logoImage, themed && { tintColor: fill }]}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.Text style={[
          ls.tagline,
          { color: taglineColor },
          { opacity: taglineOpacity, transform: [{ translateY: taglineTranslateY }] },
        ]}>
          Career readiness, measured.
        </Animated.Text>
        <Animated.View style={[ls.barWrap, { opacity: barTrackOpacity }]}>
          <Animated.View style={[ls.barGlow, { opacity: glowOpacity, backgroundColor: fill }]} />
          <View style={ls.barTrack}>
            <Animated.View style={[ls.barFill, { width: barWidthPct, backgroundColor: fill }]} />
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

  const { expoPushToken } = usePushNotifications();
  // Used as ErrorBoundary resetKey so the boundary auto-clears on
  // route change. Otherwise a single render crash leaves a permanent
  // sad-Dilly screen even after the user navigates elsewhere.
  const pathname = usePathname();
  const [phase,       setPhase]       = useState<Phase>('loading');
  const [isReturning, setIsReturning] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // One-time forced sign-out to clear stale dkochhar session
        const didReset = await AsyncStorage.getItem('dilly_reset_2026_03_29');
        if (!didReset) {
          await Promise.all([
            SecureStore.deleteItemAsync('dilly_auth_token').catch(() => null),
            SecureStore.deleteItemAsync('dilly_user').catch(() => null),
            AsyncStorage.removeItem('dilly_auth_token'),
            AsyncStorage.removeItem('dilly_user'),
            AsyncStorage.removeItem('dilly_has_onboarded'),
            AsyncStorage.removeItem('dilly_audit_result'),
            AsyncStorage.removeItem('dilly_onboarding_name'),
            AsyncStorage.removeItem('dilly_onboarding_cohort'),
            AsyncStorage.removeItem('dilly_onboarding_track'),
            AsyncStorage.removeItem('dilly_onboarding_majors'),
            AsyncStorage.removeItem('dilly_onboarding_pre_prof'),
            AsyncStorage.removeItem('dilly_onboarding_target'),
            AsyncStorage.removeItem('dilly_onboarding_industry_target'),
            AsyncStorage.removeItem('dilly_pending_upload'),
            AsyncStorage.setItem('dilly_reset_2026_03_29', '1'),
          ]);
          setIsReturning(false);
          setCheckedAuth(true);
          return;
        }

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
    // Can't read theme yet (not even in tree) — keep brand white so the
    // font-loading flash is consistent across all users. This is at most
    // ~200ms before fonts resolve.
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('../assets/logo.png')} style={{ width: 100, height: 34 }} resizeMode="contain" />
      </View>
    );
  }

  if (phase === 'loading') {
    // Once we know if the user is signed in, let them see their theme
    // on the loading screen. Fresh/signed-out users see the brand white
    // since they haven't chosen a theme yet.
    return (
      <LoadingScreen
        themed={checkedAuth && isReturning}
        onComplete={() => {
          setPhase('splash');
        }}
      />
    );
  }

  if (phase === 'splash') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade', animationDuration: 250 }}>
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
</GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <ErrorBoundary surface="Dilly" resetKey={pathname}>
        <ThemedAppStack pathname={pathname} />
      </ErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Inner Stack that reads the resolved theme so the screen chrome
 * (content background between animations, status-bar-safe regions)
 * picks up the user's accent/surface. Kept separate from RootLayout
 * because RootLayout also renders in pre-auth phases where reading
 * theme would pull DEFAULT_CONFIG for all users. Also owns the
 * StatusBar so the iPhone time/signal/battery flip to white on
 * Midnight and back to black on light surfaces. */
function ThemedAppStack({ pathname }: { pathname: string }) {
  const theme = useResolvedTheme();
  return (
    <>
      <StatusBar style={theme.surface.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.surface.bg },
        animation: 'fade',
        animationDuration: 250,
      }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

const ls = StyleSheet.create({
  root:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center' },
  logoImage: {
    width: 130,
    height: 45,
    marginBottom: 16,
  },
  wordmark: {
    fontFamily:    'Cinzel_900Black',
    fontSize:      52,
    letterSpacing: 7.8,
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
    color:         'rgba(26,26,46,0.4)',
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
    backgroundColor: 'rgba(43,58,142,0.15)',
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