/**
 * Choose Path -- unified login screen.
 *
 * Two email sections:
 * 1. General (top, primary) -- any email
 * 2. Student (below) -- .edu email
 */

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import FadeInView from '../../components/FadeInView';
import AnimatedPressable from '../../components/AnimatedPressable';

export default function ChoosePathScreen() {
  const insets = useSafeAreaInsets();
  const { needsEdu, situationId } = useLocalSearchParams<{ needsEdu?: string; situationId?: string }>();
  const showStudentFirst = needsEdu === '1';
  const eduInputRef = useRef<TextInput>(null);
  const generalInputRef = useRef<TextInput>(null);

  // Auto-focus the right input based on the situation they picked
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showStudentFirst) {
        eduInputRef.current?.focus();
      } else {
        generalInputRef.current?.focus();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [showStudentFirst]);

  // General email state
  const [generalEmail, setGeneralEmail] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [generalLoading, setGeneralLoading] = useState(false);

  // Student email state
  const [studentEmail, setStudentEmail] = useState('');
  const [studentError, setStudentError] = useState('');
  const [studentLoading, setStudentLoading] = useState(false);

  async function handleGeneralSubmit() {
    setGeneralError('');
    const trimmed = generalEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setGeneralError('Enter a valid email address.');
      return;
    }
    setGeneralLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, user_type: 'general' }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Something went wrong.');
      }
      router.push({ pathname: '/onboarding/verify', params: { email: trimmed, userType: 'general' } });
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setGeneralLoading(false);
    }
  }

  async function handleStudentSubmit() {
    setStudentError('');
    const trimmed = studentEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setStudentError('Enter a valid email address.');
      return;
    }
    if (!/\.edu\s*$/.test(trimmed)) {
      setStudentError('Use your .edu email to sign up as a student.');
      return;
    }
    setStudentLoading(true);
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
      router.push({ pathname: '/onboarding/verify', params: { email: trimmed, userType: 'student' } });
    } catch (err: unknown) {
      setStudentError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setStudentLoading(false);
    }
  }

  const generalActive = generalEmail.trim().length > 0 && !generalLoading;
  const studentActive = studentEmail.trim().length > 0 && !studentLoading;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Back button. lets users who tapped the wrong situation go back. */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.xl }}>
        <AnimatedPressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/onboarding/choose-situation');
          }}
          scaleDown={0.9}
          hitSlop={14}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.t2} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.t2 }}>Back</Text>
        </AnimatedPressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: 20, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <FadeInView delay={0}>
          <Text style={s.headline}>Your career.{'\n'}Your guide.{'\n'}Your move.</Text>
          <Text style={s.sub}>
            Dilly builds a deep profile of who you are, then guides you through the AI-driven job market.
          </Text>
        </FadeInView>

        {/* Email sections. order flips based on whether the user's
            situation needs a .edu email. Student paths see .edu first,
            non-student paths see regular first. */}

        {/* Primary section (shows first) */}
        <FadeInView delay={100}>
          {showStudentFirst ? (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Enter your .edu email</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  ref={eduInputRef}
                  style={[s.input, studentEmail.length > 0 && s.inputActive]}
                  placeholder="you@school.edu"
                  placeholderTextColor={colors.t3}
                  value={studentEmail}
                  onChangeText={v => { setStudentEmail(v); setStudentError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!studentLoading}
                  returnKeyType="go"
                  onSubmitEditing={handleStudentSubmit}
                />
                {studentError ? <Text style={s.errorText}>{studentError}</Text> : null}
              </View>
              <TouchableOpacity
                style={[s.button, studentActive ? s.buttonActive : s.buttonDisabled]}
                onPress={handleStudentSubmit}
                disabled={!studentActive}
                activeOpacity={0.9}
              >
                {studentLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Enter your email</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  ref={generalInputRef}
                  style={[s.input, generalEmail.length > 0 && s.inputActive]}
                  placeholder="you@email.com"
                  placeholderTextColor={colors.t3}
                  value={generalEmail}
                  onChangeText={v => { setGeneralEmail(v); setGeneralError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!generalLoading}
                  returnKeyType="go"
                  onSubmitEditing={handleGeneralSubmit}
                />
                {generalError ? <Text style={s.errorText}>{generalError}</Text> : null}
              </View>
              <TouchableOpacity
                style={[s.button, generalActive ? s.buttonActive : s.buttonDisabled]}
                onPress={handleGeneralSubmit}
                disabled={!generalActive}
                activeOpacity={0.9}
              >
                {generalLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </FadeInView>

        {/*
          Secondary login section: only rendered when the user's
          situation is ambiguous. If they already told us they're a
          student (needsEdu=1) we don't show the generic email, and
          vice versa. Gating on `gateSingleLogin` = true so it's easy
          to revert if conversion drops.
        */}
        {false /* gateSingleLogin */ ? (
          <>
        {/* Divider */}
        <FadeInView delay={150}>
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>
        </FadeInView>

        {/* Secondary section (shows second) */}
        <FadeInView delay={200}>
          {showStudentFirst ? (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Not a student? Use any email</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  ref={generalInputRef}
                  style={[s.input, generalEmail.length > 0 && s.inputActive]}
                  placeholder="you@email.com"
                  placeholderTextColor={colors.t3}
                  value={generalEmail}
                  onChangeText={v => { setGeneralEmail(v); setGeneralError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!generalLoading}
                  returnKeyType="go"
                  onSubmitEditing={handleGeneralSubmit}
                />
                {generalError ? <Text style={s.errorText}>{generalError}</Text> : null}
              </View>
              <TouchableOpacity
                style={[s.button, generalActive ? s.buttonActive : s.buttonDisabled]}
                onPress={handleGeneralSubmit}
                disabled={!generalActive}
                activeOpacity={0.9}
              >
                {generalLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.sectionLabel}>College student? Use your .edu email</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  ref={eduInputRef}
                  style={[s.input, studentEmail.length > 0 && s.inputActive]}
                  placeholder="you@school.edu"
                  placeholderTextColor={colors.t3}
                  value={studentEmail}
                  onChangeText={v => { setStudentEmail(v); setStudentError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!studentLoading}
                  returnKeyType="go"
                  onSubmitEditing={handleStudentSubmit}
                />
                {studentError ? <Text style={s.errorText}>{studentError}</Text> : null}
              </View>
              <TouchableOpacity
                style={[s.button, studentActive ? s.buttonActive : s.buttonDisabled]}
                onPress={handleStudentSubmit}
                disabled={!studentActive}
                activeOpacity={0.9}
              >
                {studentLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </FadeInView>
          </>
        ) : null}

        {/* Footer */}
        <FadeInView delay={400}>
          <Text style={s.footer}>
            AI is reshaping the job market. Dilly shows you where you stand and what to do next.
          </Text>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: 0 },

  headline: { fontSize: 32, fontWeight: '900', color: colors.t1, lineHeight: 38, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: colors.t2, lineHeight: 22, marginTop: 12, marginBottom: 28 },

  section: { gap: 12 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.t1 },
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

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.b1 },
  dividerText: { fontSize: 13, color: colors.t3, fontWeight: '500' },

  footer: { fontSize: 12, color: colors.t3, textAlign: 'center', lineHeight: 17, paddingHorizontal: 20, marginTop: 28 },
});
