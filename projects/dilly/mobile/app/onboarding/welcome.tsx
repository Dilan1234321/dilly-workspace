import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith('.edu')) {
      setError('Use your .edu email - Dilly is for students.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Something went wrong.');
      }
      router.push({ pathname: '/onboarding/verify', params: { email: trimmed } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const buttonActive = email.trim().length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top section */}
        <View style={styles.top}>
          {/* Headline */}
          <Text style={styles.headline}>
            Your career{'\n'}starts here.
          </Text>

          {/* Subheadline */}
          <Text style={styles.sub}>
            Dilly learns who you are and helps you land the right opportunities.
          </Text>
        </View>

        {/* Bottom section */}
        <View style={styles.bottom}>
          {/* Email input */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={[
                styles.input,
                email.length > 0 && styles.inputActive,
              ]}
              placeholder="your@school.edu"
              placeholderTextColor={colors.t3}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}
          </View>

          {/* CTA button */}
          <TouchableOpacity
            style={[styles.button, buttonActive ? styles.buttonActive : styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!buttonActive}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={[styles.buttonText, !buttonActive && styles.buttonTextDisabled]}>
                Get started
              </Text>
            )}
          </TouchableOpacity>

          {/* Fine print */}
          <Text style={styles.finePrint}>
            Free to try. No credit card. .edu email required.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  top: {
    paddingTop: 0,
  },
  headline: {
    fontFamily: 'PlayfairDisplay_900Black',
    fontSize: 38,
    lineHeight: 44,
    color: colors.t1,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 16,
    lineHeight: 25,
    color: colors.t2,
  },
  bottom: {
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  inputWrapper: {
    gap: spacing.xs,
  },
  input: {
    backgroundColor: colors.s2,
    borderWidth: 1.5,
    borderColor: colors.b2,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.t1,
  },
  inputActive: {
    borderColor: colors.goldbdr,
  },
  errorText: {
    color: colors.coral,
    fontSize: 13,
    paddingLeft: 4,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: colors.gold,
  },
  buttonDisabled: {
    backgroundColor: colors.s3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  buttonTextDisabled: {
    color: colors.t3,
  },
  finePrint: {
    color: colors.t3,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
