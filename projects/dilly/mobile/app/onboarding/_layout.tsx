import { Stack } from 'expo-router';
import { colors } from '../../lib/tokens';
import { ErrorBoundary } from '../../components/ErrorBoundary';

export default function OnboardingLayout() {
  return (
    <ErrorBoundary surface="onboarding">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      />
    </ErrorBoundary>
  );
}
