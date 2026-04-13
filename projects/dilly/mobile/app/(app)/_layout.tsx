import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DillyAIOverlay from '../../components/DillyAIOverlay';
import { useDillyOverlayState } from '../../hooks/useDillyOverlay';
import { SubscriptionProvider, useSubscription } from '../../hooks/useSubscription';
import DillyGate from '../../components/DillyGate';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import ScoringMigrationModal from '../../components/ScoringMigrationModal';

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

  return (
    <SubscriptionProvider>
    <ErrorBoundary surface="this page">
    <>
    <Tabs
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
      {/* -- Tab 1: Career Center (Home) -------------------- */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Career Center',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={20} color={color} />
          ),
        }}
      />

      {/* -- Tab 2: AI Arena -------------------------------- */}
      <Tabs.Screen
        name="ai-arena"
        options={{
          title: 'AI Arena',
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

      {/* -- Tab 3: My Dilly (Profile/Identity) ------------- */}
      <Tabs.Screen
        name="my-dilly-profile"
        options={{
          title: 'My Dilly',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* -- Tab 4: Jobs ------------------------------------ */}
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'briefcase' : 'briefcase-outline'}
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
    </Tabs>
    <DillyAIOverlayWrapper />
    <DillyGateWrapper />
    <ScoringMigrationModal />
  </>
  </ErrorBoundary>
  </SubscriptionProvider>
  );
}
