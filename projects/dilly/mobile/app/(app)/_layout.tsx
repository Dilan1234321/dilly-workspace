import { Tabs } from 'expo-router';
import { colors } from '../../lib/tokens';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.s1, borderTopColor: colors.b1 },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.t3,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Career Center' }} />
      <Tabs.Screen name="rank" options={{ title: 'Rank' }} />
      <Tabs.Screen name="voice" options={{ title: 'Dilly AI' }} />
      <Tabs.Screen name="jobs" options={{ title: 'Get Hired' }} />
    </Tabs>
  );
}
