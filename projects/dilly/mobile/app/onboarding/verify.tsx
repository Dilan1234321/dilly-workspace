import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { setToken } from '../../lib/auth';

const RESEND_COOLDOWN = 30;
const TOTAL_STEPS = 6;

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={pb.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            pb.segment,
            i < step - 1
              ? pb.done
              : i === step - 1
              ? pb.active
              : pb.empty,
          ]}
        />
      ))}
    </View>
  );
}

const pb = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xl, marginTop: 14 },
  segment: { flex: 1, height: 2.5, borderRadius: 999 },
  done: { backgroundColor: colors.gold },
  active: { backgroundColor: 'rgba(201,168,76,0.4)' },
  empty: { backgroundColor: 'rgba(255,255,255,0.08)' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VerifyScreen() {
  const insets = useSafeAreaInsets();
  const { email: emailParam, returning, userType } = useLocalSearchParams<{
    email: string;
    returning?: string;
    userType?: string;
  }>();

  const isReturning = returning === 'true';
  const email = emailParam ?? '';
  const [returningEmail, setReturningEmail] = useState('');
  const [returningStep, setReturningStep] = useState<'email' | 'code'>('email');
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const allFilled = digits.length === 6;

  function triggerShake() {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN);
    const iv = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(iv); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  const submitCode = useCallback(
    async (code: string) => {
      if (code.length !== 6 || loading) return;
      setLoading(true);
      setError(null);
      try {
        const emailToVerify = isReturning ? returningEmail.trim() : email;
        const res = await fetch(`${API_BASE}/auth/verify-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailToVerify, code }),
        });
        const data = await res.json();
        if (!res.ok) {
          const detail = data?.detail;
          throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Something went wrong.');
        }
        if (data.token) await setToken(data.token);
        if (isReturning) {
          router.replace('/(app)');
        } else {
          // Check if user already has a profile (returning user who signed out)
          try {
            const profileCheck = await fetch(`${API_BASE}/profile`, {
              headers: { Authorization: `Bearer ${data.token}` },
            });
            if (profileCheck.ok) {
              const profileData = await profileCheck.json();
              if (profileData?.onboarding_complete || profileData?.name) {
                // Existing user, go straight to app
                router.replace('/(app)');
                return;
              }
            }
          } catch {}
          // The user already picked their situation on the very first
          // screen (choose-situation). Read the pending path from
          // AsyncStorage and save it to their freshly-authenticated
          // profile now.
          try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const pendingPath = await AsyncStorage.getItem('dilly_pending_user_path');
            const pendingPlan = await AsyncStorage.getItem('dilly_pending_plan');
            if (pendingPath) {
              const patch: Record<string, string> = { user_path: pendingPath };
              if (pendingPlan) patch.plan = pendingPlan;
              await dilly.fetch('/profile', {
                method: 'PATCH',
                body: JSON.stringify(patch),
              }).catch(() => {});
              await AsyncStorage.removeItem('dilly_pending_user_path');
              await AsyncStorage.removeItem('dilly_pending_plan');
            }
          } catch {}

          // Route to the right profile setup based on email type
          if (userType === 'general' || userType === 'professional') {
            router.replace('/onboarding/profile-pro');
          } else {
            router.replace('/onboarding/profile');
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        let friendly = "That code isn't right. Try again.";
        let type = 'invalid_code';
        if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
          friendly = 'That code expired. Check your email for a new one.';
          type = 'expired_code';
          // Only auto-resend if not already on cooldown
          if (resendCooldown <= 0) {
            try {
              await fetch(`${API_BASE}/auth/send-verification-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: isReturning ? returningEmail.trim() : email, user_type: userType === 'general' ? 'general' : undefined }),
              });
              startResendCooldown();
              friendly = 'New code sent. Check your email for the latest one.';
            } catch { /* ignore */ }
          }
        } else if (msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('attempts')) {
          friendly = 'Too many attempts. Try again in an hour.';
          type = 'too_many';
        }
        setError(friendly);
        setErrorType(type);
        setDigits('');
        triggerShake();
      } finally {
        setLoading(false);
        // Re-focus after loading is false so editable={!loading} allows input
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [email, returningEmail, isReturning, loading]
  );

  function handleChangeText(raw: string) {
    const clean = raw.replace(/\D/g, '').slice(0, 6);
    setDigits(clean);
    setError(null);
    setErrorType(null);
    if (clean.length === 6) submitCode(clean);
  }

  async function handleResend() {
    if (resendCooldown > 0 || errorType === 'too_many') return;
    setError(null);
    setErrorType(null);
    setDigits('');
    const emailToUse = isReturning ? returningEmail : email;
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse, user_type: userType === 'general' ? 'general' : undefined }),
      });
      const data = await res.json();
      startResendCooldown();
      setTimeout(() => inputRef.current?.focus(), 200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't resend. Try again.");
    }
  }

  async function handleReturningEmailSubmit() {
    const trimmed = returningEmail.trim().toLowerCase();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
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
      setReturningStep('code');
      startResendCooldown();
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  // Returning user  -  email entry step
  if (isReturning && returningStep === 'email') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconTile}>
            <Ionicons name="person-outline" size={22} color={colors.gold} />
          </View>
          <Text style={styles.heading}>Welcome back.</Text>
          <Text style={styles.sub}>Enter your .edu email to get back in.</Text>

          <TextInput
            style={[styles.emailInput, error ? { borderColor: colors.coral } : {}]}
            value={returningEmail}
            onChangeText={v => { setReturningEmail(v); setError(null); }}
            placeholder="you@university.edu"
            placeholderTextColor={colors.t3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={handleReturningEmailSubmit}
            editable={!loading}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, returningEmail.trim() && !loading ? styles.buttonActive : styles.buttonDisabled]}
            onPress={handleReturningEmailSubmit}
            disabled={!returningEmail.trim() || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={[styles.buttonText, !returningEmail.trim() && styles.buttonTextDisabled]}>Send code →</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    );
  }

  const activeEmail = isReturning ? returningEmail.trim() : email;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {!isReturning && <ProgressBar step={1} />}

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Email icon tile */}
        <View style={styles.iconTile}>
          <Ionicons name="mail-outline" size={22} color={colors.gold} />
        </View>

        {/* Heading */}
        <Text style={styles.heading}>
          {isReturning ? 'Welcome back.' : 'Check your inbox'}
        </Text>

        {/* Subtitle */}
        <Text style={styles.sub}>6-digit code sent to</Text>
        <Text style={styles.emailLabel}>{activeEmail}</Text>

        {/* 6 boxes + hidden input */}
        <Animated.View
          style={[styles.boxesWrapper, { transform: [{ translateX: shakeAnim }] }]}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.boxesRow}
            onPress={() => inputRef.current?.focus()}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const isFilled = i < digits.length;
              const isActive = i === digits.length && !allFilled;
              const isErr = !!error;
              return (
                <View
                  key={i}
                  style={[
                    styles.box,
                    isErr
                      ? styles.boxError
                      : isActive
                      ? styles.boxActive
                      : isFilled
                      ? styles.boxFilled
                      : styles.boxDefault,
                  ]}
                >
                  <Text style={styles.boxDigit}>{digits[i] ?? ''}</Text>
                </View>
              );
            })}
          </TouchableOpacity>

          {/* Hidden input overlay */}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={digits}
            onChangeText={handleChangeText}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            editable={!loading}
            autoFocus
            caretHidden
          />
        </Animated.View>

        {/* Error text */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.button, allFilled && !loading ? styles.buttonActive : styles.buttonDisabled]}
          onPress={() => submitCode(digits)}
          disabled={!allFilled || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={[styles.buttonText, !allFilled && styles.buttonTextDisabled]}>
              Verify and continue →
            </Text>
          )}
        </TouchableOpacity>

        {/* Bottom links */}
        <View style={styles.links}>
          {errorType !== 'too_many' && (
            <TouchableOpacity onPress={handleResend} disabled={resendCooldown > 0}>
              <Text style={[styles.link, resendCooldown > 0 && styles.linkDim]}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => {
            if (isReturning) {
              setReturningStep('email');
              setDigits('');
              setError(null);
            } else {
              router.replace('/onboarding/choose-path');
            }
          }}>
            <Text style={styles.link}>Different email</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emailInput: {
    width: '100%',
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b2,
    backgroundColor: colors.s3,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.t1,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: colors.t1,
    textAlign: 'center',
    marginBottom: 6,
  },
  sub: {
    fontSize: 11,
    color: colors.t2,
    textAlign: 'center',
    marginBottom: 2,
  },
  emailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  boxesWrapper: {
    width: '100%',
    marginBottom: spacing.md,
  },
  boxesRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  box: {
    flex: 1,
    height: 48,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDefault: {
    backgroundColor: colors.s3,
    borderColor: colors.b2,
  },
  boxFilled: {
    backgroundColor: colors.s3,
    borderColor: colors.b2,
  },
  boxActive: {
    backgroundColor: 'rgba(201,168,76,0.07)',
    borderColor: colors.goldbdr,
  },
  boxError: {
    backgroundColor: colors.s2,
    borderColor: colors.coral,
  },
  boxDigit: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.t1,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontSize: 16,
  },
  errorText: {
    fontSize: 11,
    color: colors.coral,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  button: {
    width: '100%',
    borderRadius: radius.md,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
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
  links: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  link: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
  },
  linkDim: {
    color: colors.t3,
  },
});
