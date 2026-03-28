import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../lib/tokens';

export default function Index() {
  useEffect(() => {
    async function checkAuth() {
      const token = await SecureStore.getItemAsync('dilly_auth_token').catch(() => null)
        ?? await AsyncStorage.getItem('dilly_auth_token');

      if (token) {
        router.replace('/(app)');
        return;
      }

      const hasOnboarded = await AsyncStorage.getItem('dilly_has_onboarded');

      if (hasOnboarded === 'true') {
        router.replace('/onboarding/verify?returning=true');
      } else {
        router.replace('/onboarding/welcome');
      }
    }
    checkAuth();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}
