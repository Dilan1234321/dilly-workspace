/**
 * ErrorBoundary - catches render errors and shows a branded error screen
 * with a red expressionless Dilly face (like the mock interviewer face
 * on hellodilly.com). Styled to match the app launch splash but with
 * error context instead of the welcome message.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, spacing } from '../lib/tokens';
import { useResolvedTheme } from '../hooks/useTheme';

const GOLD = '#2B3A8E';
const CORAL = '#FF453A';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  surface?: string;
  /** When this changes, the boundary auto-clears its error state.
   * Pass the current route name to clear when the user navigates away
   * from a crashed screen. */
  resetKey?: string | number;
  /** When true, a caught error renders nothing at all — no sad face,
   * no error text. Use for optional surface pieces (intel strips,
   * band dividers) where failure should degrade silently without
   * blocking the rest of the page. */
  silent?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Expressionless Dilly face - red tint, flat mouth, no animation
function SadDillyFace({ size }: { size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const faceRadius = (size * 0.44) / 2;
  const s = faceRadius / 19;

  // Eye positions
  const eyeL = { x: cx - 6 * s, y: cy - 3 * s };
  const eyeR = { x: cx + 6 * s, y: cy - 3 * s };
  const eyeR_rad = 2.2 * s;

  // Flat mouth (expressionless - no curve)
  const mW = 8 * s;
  const mouthY = cy + 5 * s;
  const mouthPath = `M ${cx - mW} ${mouthY} L ${cx + mW} ${mouthY}`;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Red-tinted background circle */}
      <Circle cx={cx} cy={cy} r={faceRadius} fill="#FFF0EF" stroke="#FFCCC7" strokeWidth={2} />
      {/* Eyes */}
      <Circle cx={eyeL.x} cy={eyeL.y} r={eyeR_rad} fill={CORAL} />
      <Circle cx={eyeR.x} cy={eyeR.y} r={eyeR_rad} fill={CORAL} />
      {/* Flat mouth */}
      <Path d={mouthPath} stroke={CORAL} strokeWidth={2 * s} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Auto-reset when the resetKey changes (e.g. user navigates to a
    // different route). This stops a crash on one screen from
    // permanently nuking the rest of the app behind a white-or-error
    // screen until the user kills and reopens the app.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Silent mode: render nothing at all. Used for optional surface
    // pieces where a crash should not block the rest of the page.
    if (this.props.silent) return null;

    return (
      <ErrorView
        surface={this.props.surface || 'this screen'}
        message={this.state.error?.message || 'An unexpected error happened.'}
        onReset={this.handleReset}
      />
    );
  }
}

/** Functional wrapper so we can use the theme hook. Class components
 * can't consume hooks directly. Theme-aware error screen: container
 * bg follows surface, body/heading text colors swap for dark mode,
 * try-again button picks up the user's accent. */
function ErrorView({ surface, message, onReset }: { surface: string; message: string; onReset: () => void }) {
  const theme = useResolvedTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.surface.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <SadDillyFace size={120} />
        <Text style={[styles.heading, { color: theme.surface.t1 }]}>
          Something's off with {surface}.
        </Text>
        <Text style={[styles.sub, { color: theme.surface.t2 }]}>
          Dilly hit an unexpected hiccup. Nothing you did caused this. Tap below to try again.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.accent }]}
          onPress={onReset}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
        <Text style={[styles.devDetails, { color: theme.surface.t3 }]} numberOfLines={6}>
          {message}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 60,
  },
  heading: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 18,
    color: colors.t1,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  sub: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  buttonText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 13,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  devDetails: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    lineHeight: 14,
  },
});
