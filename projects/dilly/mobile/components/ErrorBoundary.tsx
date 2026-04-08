/**
 * ErrorBoundary — catches render errors in any wrapped subtree and shows a
 * friendly retry UI instead of a white screen or a red-box Expo crash.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <Stack ... />
 *   </ErrorBoundary>
 *
 * Wrapped at the root layout, the onboarding layout, and the (app) layout so
 * every screen in the app gets a graceful fallback if it throws during render.
 *
 * The fallback UI uses brand colors (white + Dilly blue), never red. The
 * student sees a calm, friendly "something's off, tap to try again" instead
 * of a broken screen. Tapping "Try again" resets the error state and
 * re-mounts the subtree.
 *
 * We deliberately do NOT integrate with Sentry/Crashlytics here — error
 * monitoring is a separate concern to be added later (see WHATS_NEXT.md).
 * For now we log to console so crashes show up in Metro / TestFlight console
 * during development and beta testing.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../lib/tokens';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Optional label shown under the heading so different surfaces can give
   * slightly different context (e.g. "coach", "onboarding", "this screen").
   * Defaults to "this screen".
   */
  surface?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for Metro / TestFlight visibility. If/when Sentry is
    // wired in, forward here.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const surface = this.props.surface || 'this screen';
    const message = this.state.error?.message || 'An unexpected error happened.';

    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>·</Text>
          </View>
          <Text style={styles.heading}>Something's off with {surface}.</Text>
          <Text style={styles.sub}>
            Dilly hit an unexpected hiccup. Nothing you did caused this — tap
            below to try again.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReset}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
          {__DEV__ && (
            <Text style={styles.devDetails} numberOfLines={6}>
              {message}
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconText: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.gold,
    lineHeight: 32,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: colors.t1,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: spacing.sm,
  },
  sub: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.xl,
    maxWidth: 280,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  devDetails: {
    fontSize: 10,
    color: colors.t3,
    marginTop: spacing.xl,
    textAlign: 'center',
    fontFamily: 'Menlo',
    maxWidth: 300,
  },
});
