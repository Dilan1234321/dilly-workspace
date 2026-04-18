import { Tabs, usePathname, router } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DillyAIOverlay from '../../components/DillyAIOverlay';
import { useDillyOverlayState } from '../../hooks/useDillyOverlay';
import { SubscriptionProvider, useSubscription } from '../../hooks/useSubscription';
import { useAppMode } from '../../hooks/useAppMode';
import DillyGate from '../../components/DillyGate';
import DillyPaywallFullScreen from '../../components/DillyPaywallFullScreen';
import { usePaywallState } from '../../hooks/usePaywall';
import { ErrorBoundary } from '../../components/ErrorBoundary';

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
 *  On dismiss (either "Not right now" or after the user taps Unlock
 *  and returns from the web checkout), we kick them back to the
 *  Career Center. Reason: the underlying surface that triggered the
 *  402 is half-loaded with an error state. Without this redirect,
 *  users see the paywall → web → and then land back on a broken
 *  "Generating…" spinner or a blank practice card. Career Center
 *  is always safe. */
function DillyPaywallWrapper() {
  const { visible, context, close } = usePaywallState();
  function handleDismiss() {
    close();
    try {
      // Replace (not push) so back-button doesn't return to the 402.
      router.replace('/(app)' as any);
    } catch {}
  }
  return <DillyPaywallFullScreen visible={visible} onDismiss={handleDismiss} context={context} />;
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

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const mode = useAppMode();
  const isHolder = mode === 'holder';

  return (
    <SubscriptionProvider>
    <ErrorBoundary surface="this page" resetKey={pathname}>
    <>
    <Tabs
      // Per-mode landing tab: holders land on Arena (their hero),
      // seekers/students land on Career Center (the journey).
      initialRouteName={isHolder ? 'ai-arena' : 'index'}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderTopWidth: 1,
          borderTopColor: colors.b1,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          height: 49 + insets.bottom,
        },
        tabBarActiveTintColor: colors.t1,
        tabBarInactiveTintColor: colors.t3,
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
    <DillyAIOverlayWrapper />
    <DillyGateWrapper />
    <DillyPaywallWrapper />
  </>
  </ErrorBoundary>
  </SubscriptionProvider>
  );
}
