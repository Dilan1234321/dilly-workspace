import { Stack, usePathname } from 'expo-router';
import { colors } from '../../lib/tokens';
import { ErrorBoundary } from '../../components/ErrorBoundary';

export default function OnboardingLayout() {
  // resetKey tied to pathname: if the boundary trips on one step,
  // navigating away auto-clears it. Without this, a transient crash
  // during the final transition to /(app) traps the user on the
  // "Something's off with onboarding" screen forever.
  const pathname = usePathname();
  return (
    <ErrorBoundary surface="onboarding" resetKey={pathname}>
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
