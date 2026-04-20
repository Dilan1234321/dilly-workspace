import { Tabs, usePathname, router } from 'expo-router';
import { View, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DillyAIOverlay from '../../components/DillyAIOverlay';
import { useDillyOverlayState } from '../../hooks/useDillyOverlay';
import { SubscriptionProvider, useSubscription } from '../../hooks/useSubscription';
import { useAppMode } from '../../hooks/useAppMode';
import { useResolvedTheme } from '../../hooks/useTheme';
import DillyGate from '../../components/DillyGate';
import DillyPaywallFullScreen from '../../components/DillyPaywallFullScreen';
import { usePaywallState } from '../../hooks/usePaywall';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import useCelebration from '../../hooks/useCelebration';

function DillyAIOverlayWrapper() {
  const { visible, studentContext, close } = useDillyOverlayState();
  return <DillyAIOverlay visible={visible} onClose={close} studentContext={studentContext} />;
}

function DillyGateWrapper() {
  const { gateVisible, gateMessage, gateRequiredPlan, dismissGate } = useSubscription();
  return (
    <DillyGate
      visible={gateVisible}
      message={gateMessage}
      requiredPlan={gateRequiredPlan}
      onDismiss={dismissGate}
    />
  );
}

/** Global paywall. Triggered by any 402 response via lib/dilly.ts.
 *
 *  On dismiss: return the user to the page they were on when the
 *  paywall opened. Previously we force-routed to /(app) which felt
 *  like the app ate their session. Now we just close the overlay —
 *  the screen they were on is still underneath, and if it was in a
 *  402'd state (e.g. Forge mid-generation) the screen's own paywall
 *  bail logic has already reset it to a safe state. */
function DillyPaywallWrapper() {
  const { visible, context, close } = usePaywallState();
  return <DillyPaywallFullScreen visible={visible} onDismiss={close} context={context} />;
}

/** Mounts useCelebration at the app root so triggerCelebration() fired
 * from any screen (promo code redeem, Stripe success callback, plan
 * transition detector) actually shows the overlay on top of the tabs. */
function CelebrationWrapper() {
  const { CelebrationPortal } = useCelebration();
  return <CelebrationPortal />;
}

function DillyTabIcon({ focused }: { focused: boolean }) {
  // Reads the user's current theme accent so if they pick teal/rose/
  // etc., the Dilly tab chip matches — previously this was hard-coded
  // indigo regardless of the user's customization.
  const theme = useResolvedTheme();
  return (
    <View style={{
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: focused ? theme.accentBorder : theme.accentSoft,
      borderWidth: 1,
      borderColor: focused ? theme.accent : theme.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Ionicons name="school" size={12} color={theme.accent} />
    </View>
  );
}

function AppLayoutInner() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const mode = useAppMode();
  const isHolder = mode === 'holder';
  // Tab bar adopts the user's surface + accent. On Midnight the bar
  // goes dark; on Mint/Blush the tab bar picks up the pastel so the
  // seam between content and chrome disappears.
  const theme = useResolvedTheme();

  // Icon-only nav (Duolingo / Instagram pattern). Labels removed
  // because they were training wheels that added visual clutter
  // after the first 10 minutes. Active state is conveyed by:
  //   1. filled vs outline icon
  //   2. accent-colored soft pill behind the active icon
  //   3. icon size bump from 22 to 24 (space we gained by
  //      dropping labels)
  // The pill makes the active tab unambiguous at a glance
  // without needing text.
  // AI Arena now honors the theme surface too, so we can drop the
  // old dark-navy override for its route. Navbar just mirrors the
  // user's Customize Dilly surface on every tab.
  const navBarBg = theme.surface.bg;
  const navBarBorder = theme.surface.border;
  const navInactiveIcon = theme.surface.t3;
  const navActiveIcon = theme.accent;

  // Icon component with a subtle pop animation when focused changes
  // to true. Scale bounces 1 -> 1.2 -> 1 over ~260ms using a cubic
  // ease, which reads as "something just happened" without being
  // cartoony. Focused state changes on tab press, so this fires
  // every time the user navigates.
  //
  // No pill background — the user asked for the transparent outside
  // bg to go. Active state is conveyed by filled vs outline icon +
  // color change alone.
  const TabIcon = ({
    focused,
    iconActive,
    iconInactive,
  }: {
    focused: boolean;
    iconActive: keyof typeof Ionicons.glyphMap;
    iconInactive: keyof typeof Ionicons.glyphMap;
  }) => {
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
      if (!focused) return;
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 130, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 130, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, [focused, scale]);

    return (
      <Animated.View
        style={{
          width: 60,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          // Nudge down a touch so the icon centers inside the tab
          // bar's padding. iOS gives ~6-8px top padding to tab icons.
          marginTop: -2,
          transform: [{ scale }],
        }}
      >
        <Ionicons
          name={focused ? iconActive : iconInactive}
          size={32}
          color={focused ? navActiveIcon : navInactiveIcon}
        />
      </Animated.View>
    );
  };

  const renderTabIcon = (
    iconActive: keyof typeof Ionicons.glyphMap,
    iconInactive: keyof typeof Ionicons.glyphMap,
  ) => ({ focused }: { focused: boolean; color: string }) => (
    <TabIcon focused={focused} iconActive={iconActive} iconInactive={iconInactive} />
  );

  // Chapter session is a full-screen ritual; hide the tab bar on
  // any /chapter route so users don't see app chrome while they're
  // reading through the session.
  const onChapter = !!pathname && pathname.includes('/chapter');

  return (
    <Tabs
      // Per-mode landing tab: holders land on Arena (their hero),
      // seekers/students land on Career Center (the journey).
      initialRouteName={isHolder ? 'ai-arena' : 'index'}
      screenOptions={{
        headerShown: false,
        tabBarStyle: onChapter
          ? { display: 'none' }
          : {
              backgroundColor: navBarBg,
              borderTopWidth: 1,
              borderTopColor: navBarBorder,
              paddingBottom: insets.bottom,
              paddingTop: 8,
              height: 56 + insets.bottom,
            },
        // Labels are hidden everywhere. Icons + active-pill
        // communicate which tab you're on.
        tabBarShowLabel: false,
        // Disable the slide transition between tabs. The animation
        // was what made the navbar background appear to "lag" when
        // switching between a light-surface page and AI Arena (the
        // old color stayed painted during the slide). Swapping to
        // no animation makes the color change instant.
        animation: 'none',
      }}
    >
      {/* Tab 1: Home / Career Center. Filled home for the
          universal "I am here" feel; newspaper for holders
          because their tab IS a weekly-brief surface, not a
          journey center. */}
      <Tabs.Screen
        name="index"
        options={{
          title: isHolder ? 'Weekly' : 'Career Center',
          tabBarIcon: renderTabIcon(
            isHolder ? 'newspaper' : 'home',
            isHolder ? 'newspaper-outline' : 'home-outline',
          ),
        }}
      />

      {/* Tab 2: AI Arena / Field. Shield carries "defend your
          career / know the threats" meaning — both modes. */}
      <Tabs.Screen
        name="ai-arena"
        options={{
          title: isHolder ? 'Field' : 'AI Arena',
          tabBarIcon: renderTabIcon('shield', 'shield-outline'),
        }}
      />

      {/* Tab 3: Profile. Person for seekers/students (identity
          focus), analytics chart for holders (trajectory focus). */}
      <Tabs.Screen
        name="my-dilly-profile"
        options={{
          title: isHolder ? 'My Career' : 'My Dilly',
          tabBarIcon: renderTabIcon(
            isHolder ? 'analytics' : 'person-circle',
            isHolder ? 'analytics-outline' : 'person-circle-outline',
          ),
        }}
      />

      {/* Tab 4: Jobs / Market. Briefcase for apply-mode seekers;
          trending-up for holders benchmarking their field. */}
      <Tabs.Screen
        name="jobs"
        options={{
          title: isHolder ? 'The Market' : 'Jobs',
          tabBarIcon: renderTabIcon(
            isHolder ? 'trending-up' : 'briefcase',
            isHolder ? 'trending-up-outline' : 'briefcase-outline',
          ),
        }}
      />

      {/* -- Hidden screens (accessible via navigation) ----- */}
<Tabs.Screen name="score-detail" options={{ href: null, animation: 'fade' }} />
      <Tabs.Screen
        name="profile"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="voice"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="internship-tracker"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="new-audit"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="ats"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="resume-generate"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="interview-practice"
        options={{ href: null, animation: 'fade' }}
      />
      {/* Chapter (weekly scheduled session) lives entirely off the
          navbar. Accessed from the ChapterCard on Home, with notes
          and schedule reachable from within that flow. */}
      <Tabs.Screen
        name="chapter"
        options={{ href: null, animation: 'fade' }}
      />
      {/* Collection detail page. Reached by tapping a collection in
          the bookmark sheet on Jobs. Not a top-level tab. */}
      <Tabs.Screen
        name="collection"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="raise-brief"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="escape-hatch"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="customize"
        options={{ href: null, animation: 'fade' }}
      />
    </Tabs>
  );
}

export default function AppLayout() {
  // useResolvedTheme subscribes to AsyncStorage-hydrated state —
  // keep it inside a child (AppLayoutInner) so the SubscriptionProvider
  // and ErrorBoundary wrap it cleanly. The other wrappers (overlay,
  // gate, paywall) live here so they stay mounted across tab switches.
  const pathname = usePathname();
  return (
    <SubscriptionProvider>
      <ErrorBoundary surface="this page" resetKey={pathname}>
        <>
          <AppLayoutInner />
          <DillyAIOverlayWrapper />
          <DillyGateWrapper />
          <DillyPaywallWrapper />
          <CelebrationWrapper />
        </>
      </ErrorBoundary>
    </SubscriptionProvider>
  );
}
