/**
 * Welcome (Professional) — onboarding for non-students.
 * Accepts any email address. No .edu restriction.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import FadeInView from '../../components/FadeInView';

export default function WelcomeProScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, user_type: 'professional' }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Something went wrong.');
      }
      router.push({ pathname: '/onboarding/verify', params: { email: trimmed, userType: 'professional' } });
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
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeInView delay={0}>
          <View style={s.top}>
            <Text style={s.eyebrow}>AI is replacing 50% of entry-level tasks</Text>
            <Text style={s.headline}>Your personal career{'\n'}guide through the{'\n'}AI takeover.</Text>
            <Text style={s.sub}>
              Dilly builds a deep profile of who you are, then shows you where you stand in the AI-driven job market.
            </Text>
          </View>
        </FadeInView>

        <FadeInView delay={100}>
          <View style={s.bottom}>
            <View style={s.inputWrapper}>
              <TextInput
                style={[s.input, email.length > 0 && s.inputActive]}
                placeholder="you@email.com"
                placeholderTextColor={colors.t3}
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
              {error ? <Text style={s.errorText}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={[s.button, buttonActive ? s.buttonActive : s.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!buttonActive}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={s.buttonText}>Get started</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12 }}>
              <Text style={s.backText}>I'm a student</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  top: { gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: '600', color: '#FF453A', letterSpacing: 0.5 },
  headline: { fontSize: 30, fontWeight: '900', color: colors.t1, lineHeight: 36, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: colors.t2, lineHeight: 22 },
  bottom: { gap: 14, marginTop: 32 },
  inputWrapper: { gap: 6 },
  input: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: colors.t1,
  },
  inputActive: { borderColor: colors.gold },
  errorText: { fontSize: 12, color: '#FF453A', paddingHorizontal: 4 },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  buttonActive: { backgroundColor: colors.gold },
  buttonDisabled: { backgroundColor: colors.s3 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  backText: { fontSize: 13, color: colors.gold, textAlign: 'center', fontWeight: '600' },
});
