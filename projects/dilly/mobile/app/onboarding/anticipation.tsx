/**
 * anticipation.tsx - deprecated screen.
 * Redirects to upload if anyone navigates here.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../lib/tokens';

export default function AnticipationScreen() {
  useEffect(() => {
    router.replace('/onboarding/upload');
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
