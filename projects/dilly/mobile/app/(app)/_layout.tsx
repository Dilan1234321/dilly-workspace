import { Tabs, usePathname, router } from 'expo-router';
import { View, Animated, Easing } from 'react-native';
import { useEffect, useRef, useMemo } from 'react';
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
import ProfileGrowthToast from '../../components/ProfileGrowthToast';

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
 *  like the app ate their session. Now we just close the overlay -
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

/** Animated tab icon - hoisted to module scope so it doesn't get
 *  re-created on every render of AppLayoutInner. Previously this was
 *  an inner function (`TabIcon` below), which meant each tab switch
 *  (pathname change → AppLayoutInner re-render) produced a NEW
 *  component reference for every tab, and Expo Router would remount
 *  icons instead of just re-rendering them. That remount is what
 *  showed up as a delay when pressing a tab. */
const TabIcon = ({
  focused,
  iconActive,
  iconInactive,
  activeColor,
  inactiveColor,
}: {
  focused: boolean;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  activeColor: string;
  inactiveColor: string;
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
        marginTop: -2,
        transform: [{ scale }],
      }}
    >
      <Ionicons
        name={focused ? iconActive : iconInactive}
        size={32}
        color={focused ? activeColor : inactiveColor}
      />
    </Animated.View>
  );
};

function DillyTabIcon({ focused }: { focused: boolean }) {
  // Reads the user's current theme accent so if they pick teal/rose/
  // etc., the Dilly tab chip matches - previously this was hard-coded
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

  // Precompute every tabBarIcon once, memoized on the bits that
  // actually change (mode + theme colors). Previously the icon
  // factory was rebuilt on every render, which meant every
  // pathname change (and usePathname() forces one on each tab
  // press) handed Expo Router a new `tabBarIcon` function and it
  // remounted the icon subtree. That mount is the delay the user
  // sees. These memoized components keep referential stability.
  const tabIcons = useMemo(() => {
    const make = (
      iconActive: keyof typeof Ionicons.glyphMap,
      iconInactive: keyof typeof Ionicons.glyphMap,
    ) => {
      const Cmp = ({ focused }: { focused: boolean; color: string }) => (
        <TabIcon
          focused={focused}
          iconActive={iconActive}
          iconInactive={iconInactive}
          activeColor={navActiveIcon}
          inactiveColor={navInactiveIcon}
        />
      );
      return Cmp;
    };
    return {
      home: make(
        isHolder ? 'newspaper' : 'home',
        isHolder ? 'newspaper-outline' : 'home-outline',
      ),
      arena: make('shield', 'shield-outline'),
      profile: make(
        isHolder ? 'analytics' : 'person-circle',
        isHolder ? 'analytics-outline' : 'person-circle-outline',
      ),
      jobs: make(
        isHolder ? 'trending-up' : 'briefcase',
        isHolder ? 'trending-up-outline' : 'briefcase-outline',
      ),
      // Dilly Skills tab - curated learning library. Play-circle reads
      // as "video content" without being literal about YouTube. Same
      // icon for both modes; Skills is cross-audience.
      skills: make('play-circle', 'play-circle-outline'),
    };
  }, [isHolder, navActiveIcon, navInactiveIcon]);

  // Chapter session is a full-screen ritual; hide the tab bar on
  // any /chapter route so users don't see app chrome while they're
  // reading through the session.
  const onChapter = !!pathname && pathname.includes('/chapter');
  // Skills sub-pages (a specific cohort, video, ask, library, trending)
  // also hide the tab bar so the detail surfaces feel full-screen - the
  // Skills root keeps the tab bar so the navigation is obvious.
  const onSkillsDetail = !!pathname && /\/skills\/(cohort|video|ask|library|trending)/.test(pathname);
  const hideTabBar = onChapter || onSkillsDetail;

  return (
    <Tabs
      // Per-mode landing tab: holders land on Arena (their hero),
      // seekers/students land on Career Center (the journey).
      initialRouteName={isHolder ? 'ai-arena' : 'index'}
      screenOptions={{
        headerShown: false,
        tabBarStyle: hideTabBar
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
        // Smooth cross-fade between tabs. Fade avoids the slide-lag
        // that the previous 'shift' animation had (old surface color
        // dragged across into AI Arena), while still giving the user
        // a feeling of continuity between screens. Every tab change
        // is a clean opacity swap.
        animation: 'fade',
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
          tabBarIcon: tabIcons.home,
        }}
      />

      {/* Tab 2: AI Arena / Field. Shield carries "defend your
          career / know the threats" meaning - both modes. */}
      <Tabs.Screen
        name="ai-arena"
        options={{
          title: isHolder ? 'Field' : 'AI Arena',
          tabBarIcon: tabIcons.arena,
        }}
      />

      {/* Tab 3: Dilly Skills - the curated learning library,
          promoted from hidden to a top-level tab. Dilly and Skills
          are two sides of the same coin; Skills deserves a permanent
          seat in the navbar so Chapter / Jobs prescriptions read
          as first-class pointers. */}
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Skills',
          tabBarIcon: tabIcons.skills,
        }}
      />

      {/* Jobs - application mode. Briefcase for seekers/students,
          trending-up for holders (The Market). */}
      <Tabs.Screen
        name="jobs"
        options={{
          title: isHolder ? 'The Market' : 'Jobs',
          tabBarIcon: tabIcons.jobs,
          animation: 'fade',
        }}
      />
      {/* My Dilly - identity / profile. Person-circle for seekers,
          analytics for holders (My Career). */}
      <Tabs.Screen
        name="my-dilly-profile"
        options={{
          title: isHolder ? 'My Career' : 'My Dilly',
          tabBarIcon: tabIcons.profile,
          animation: 'fade',
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
      {/* Public profile manager - mirrors /skills/profile-settings.
          Reached from Settings > Web Profile > Public profile row.
          Tabs.Screen animation is Tabs-level (fade/none/shift) - the
          slide-in feel comes from expo-router's default push behavior
          when we router.push(). */}
      <Tabs.Screen
        name="public-profile-settings"
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
      {/* Arena sub-pages (value, conviction, future, threat, ghost,
          reputation, next-role, hook, offer, rejections, clock,
          mirror, postmortem, coldemail, recruiter-radar). The
          top-level /ai-arena tab owns the command-deck; these pages
          are pushed from there. Declared as one hidden Tabs.Screen
          so expo-router groups them inside the arena folder and
          does not surface a ghost tab per page. */}
      <Tabs.Screen
        name="arena"
        options={{ href: null, animation: 'fade' }}
      />
      {/* Collection detail page. Reached by tapping a collection in
          the bookmark sheet on Jobs. Not a top-level tab. */}
      <Tabs.Screen
        name="collection"
        options={{ href: null, animation: 'fade' }}
      />
      {/* Skills is registered above as a top-level tab. Kept the
          comment here as a breadcrumb for readers who grep. */}
      <Tabs.Screen
        name="my-dilly-category"
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
      <Tabs.Screen
        name="transcript-review"
        options={{ href: null, animation: 'fade' }}
      />
    </Tabs>
  );
}

export default function AppLayout() {
  // useResolvedTheme subscribes to AsyncStorage-hydrated state -
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
          {/* Global surfacing of Dilly's auto-writes to the user's
              profile. Listens to the extraction signal and shows a
              soft top-of-screen pill whenever new facts arrive.
              Mounted at the app shell so it reads anywhere the user
              happens to be when extraction resolves. */}
          <ProfileGrowthToast />
        </>
      </ErrorBoundary>
    </SubscriptionProvider>
  );
}
