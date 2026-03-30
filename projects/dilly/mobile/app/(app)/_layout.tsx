import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DillyAIOverlay from '../../components/DillyAIOverlay';
import { useDillyOverlayState } from '../../hooks/useDillyOverlay';
import { SubscriptionProvider } from '../../hooks/useSubscription';
import PaywallModal from '../../components/PaywallModal';

function DillyAIOverlayWrapper() {
  const { visible, studentContext, close } = useDillyOverlayState();
  return <DillyAIOverlay visible={visible} onClose={close} studentContext={studentContext} />;
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
      <Ionicons name="chatbubble" size={12} color={colors.indigo} />
    </View>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();

  return (
    <SubscriptionProvider>
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <DillyTabIcon focused={focused} />,
          tabBarActiveTintColor: colors.gold,
          tabBarInactiveTintColor: colors.gold,
          tabBarLabelStyle: {
            fontSize: 9,
            fontWeight: '600',
            color: colors.gold,
            marginTop: 2,
          },
        }}
      />
      <Tabs.Screen
        name="resume-editor"
        options={{
          title: 'Resume',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={20}
              color={focused ? colors.t1 : colors.t3}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Internships',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'briefcase' : 'briefcase-outline'}
              size={20}
              color={focused ? colors.t1 : colors.t3}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="score-detail"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="my-dilly-profile"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="rank"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="voice"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="internship-tracker"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="new-audit"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
      <Tabs.Screen
        name="ats"
        options={{
          href: null,
          animation: 'fade',
        }}
      />
    </Tabs>
    <DillyAIOverlayWrapper />
    <PaywallModal />
  </>
  </SubscriptionProvider>
  );
}
