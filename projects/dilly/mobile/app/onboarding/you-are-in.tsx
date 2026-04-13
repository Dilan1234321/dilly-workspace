/**
 * you-are-in.tsx - deprecated screen.
 * Redirects to upload if anyone navigates here.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { colors } from '../../lib/tokens';

export default function YouAreInScreen() {
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({
      pathname: '/onboarding/upload',
      params,
    });
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
