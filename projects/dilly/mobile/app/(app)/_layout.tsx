import { Tabs, usePathname, router } from 'expo-router';
import { View } from 'react-native';
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
  return (
    <View style={{
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: focused
        ? 'rgba(94,92,230,0.25)'
        : colors.idim,
      borderWidth: 1,
      borderColor: focused
        ? 'rgba(94,92,230,0.5)'
        : colors.ibdr,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Ionicons name="school" size={12} color={colors.indigo} />
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

  return (
    <Tabs
      // Per-mode landing tab: holders land on Arena (their hero),
      // seekers/students land on Career Center (the journey).
      initialRouteName={isHolder ? 'ai-arena' : 'index'}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface.bg,
          borderTopWidth: 1,
          borderTopColor: theme.surface.border,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          height: 49 + insets.bottom,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.surface.t3,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '500',
          marginTop: 2,
        },
        animation: 'shift',
      }}
    >
      {/* -- Tab 1: Career Center / Home -- renamed for holders.
           Holder mode treats this tab as the Weekly Brief surface;
           seekers/students see it as the full Career Center. */}
      <Tabs.Screen
        name="index"
        options={{
          title: isHolder ? 'Weekly' : 'Career Center',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={isHolder
                ? (focused ? 'newspaper' : 'newspaper-outline')
                : (focused ? 'home' : 'home-outline')}
              size={20}
              color={color}
            />
          ),
        }}
      />

      {/* -- Tab 2: AI Arena (renamed to 'Arena' for holders since it's
           their home; 'AI Arena' for seekers/students as a feature). */}
      <Tabs.Screen
        name="ai-arena"
        options={{
          title: isHolder ? 'Field' : 'AI Arena',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'shield' : 'shield-outline'}
              size={20}
              color={color}
            />
          ),
          tabBarActiveTintColor: '#F0F0F0',
          tabBarInactiveTintColor: '#6B7280',
          tabBarStyle: {
            backgroundColor: '#111827',
            borderTopWidth: 1,
            borderTopColor: '#374151',
            paddingBottom: insets.bottom,
            paddingTop: 6,
            height: 49 + insets.bottom,
          },
          tabBarLabelStyle: {
            fontSize: 9,
            fontWeight: '500',
            marginTop: 2,
          },
        }}
      />

      {/* -- Tab 3: Profile -- "My Career" for holders (trajectory
           tracking), "My Dilly" for seekers/students (identity). */}
      <Tabs.Screen
        name="my-dilly-profile"
        options={{
          title: isHolder ? 'My Career' : 'My Dilly',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={isHolder
                ? (focused ? 'analytics' : 'analytics-outline')
                : (focused ? 'person-circle' : 'person-circle-outline')}
              size={isHolder ? 20 : 22}
              color={color}
            />
          ),
        }}
      />

      {/* -- Tab 4: Jobs / The Market -- reframed for holders. Same
           feed, different label + mental model (benchmark vs. apply). */}
      <Tabs.Screen
        name="jobs"
        options={{
          title: isHolder ? 'The Market' : 'Jobs',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={isHolder
                ? (focused ? 'trending-up' : 'trending-up-outline')
                : (focused ? 'briefcase' : 'briefcase-outline')}
              size={20}
              color={color}
            />
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
        name="feedback"
        options={{ href: null, animation: 'fade' }}
      />
      <Tabs.Screen
        name="interview-practice"
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
