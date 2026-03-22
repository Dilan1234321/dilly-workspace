import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { getToken } from '../lib/auth';
import { colors } from '../lib/tokens';

export default function Index() {
  useEffect(() => {
    async function checkAuth() {
      const token = await getToken();
      if (token) {
        router.replace('/(app)');
      } else {
        router.replace('/onboarding/welcome');
      }
    }
    checkAuth();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.gold} size="small" />
    </View>
  );
}
