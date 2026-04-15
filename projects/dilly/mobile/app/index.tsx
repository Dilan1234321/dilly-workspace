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

      // Always go to choose-path when not logged in
      router.replace('/onboarding/choose-path');
    }
    checkAuth();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}
