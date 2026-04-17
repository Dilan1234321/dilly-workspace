/**
 * Mode switch. the human moment between being a jobholder and being
 * a jobseeker (or vice versa). Reached when the user taps the
 * "I got laid off" / "I got a new job" button in Settings.
 *
 * This is NOT a settings toggle. It's a full-screen beat: DillyFace,
 * warm pre-written message, single CTA. The PATCH happens when the
 * user confirms the CTA, not when they open this screen. so they
 * can back out if they tapped by accident.
 *
 * Query params:
 *   to=seeker    -> user just got laid off, switching to Job Search
 *   to=holder    -> user just landed a new role, switching to Career Watch
 */

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  ActivityIndicator, KeyboardAvoidingView, Platform, TextInput,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { DillyFace } from '../../components/DillyFace';

const INDIGO = colors.indigo;

type Direction = 'seeker' | 'holder';

const COPY: Record<Direction, { eyebrow: string; headline: string; body: string; cta: string; }> = {
  seeker: {
    eyebrow: "DILLY IS HERE WITH YOU",
    headline: "I'm sorry you lost your job.",
    body: "This is exactly why we exist. Losing a job is one of the hardest moments in a career, and I'm going to walk with you through finding the next one. You don't have to figure this out alone. We start when you're ready.",
    cta: "I'm ready. Let's go.",
  },
  holder: {
    eyebrow: "A BIG MOMENT",
    headline: "Congratulations on the new role.",
    body: "This is a real moment. Most people don't think about the next five years until it's too late. You're here early. I'll help you stay ahead of AI in your field, track what's changing, and make sure this job becomes the best one you've ever had.",
    cta: "Let's get to work",
  },
};

export default function ModeSwitchScreen() {
  const insets = useSafeAreaInsets();
  const { to } = useLocalSearchParams<{ to?: string }>();

  const direction: Direction = to === 'holder' ? 'holder' : 'seeker';
  const copy = COPY[direction];

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // When switching TO holder, capture the new role + company up front
  // so the Career Center, My Career comp card, and Market Radar have
  // something to work with on the very first render. Skipped for
  // seeker (layoff) direction. no job to describe.
  const [newRole, setNewRole] = useState('');
  const [newCompany, setNewCompany] = useState('');

  // Soft fade-in on mount. The face settles, text breathes in, CTA
  // appears last. Keeps the moment from feeling like a pop-up.
  const fadeFace  = useRef(new Animated.Value(0)).current;
  const fadeText  = useRef(new Animated.Value(0)).current;
  const fadeCta   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeFace, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeText, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeCta,  { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fadeFace, fadeText, fadeCta]);

  // Holder CTA is disabled until role + company are typed. we need
  // them to populate the comp benchmark + trajectory without a
  // second round-trip. Seeker direction has no gating.
  const canContinue =
    direction === 'seeker'
      ? true
      : newRole.trim().length >= 2 && newCompany.trim().length >= 1;

  async function handleContinue() {
    if (saving || !canContinue) return;
    setSaving(true);
    setErr('');
    try {
      const patchBody: Record<string, unknown> = { app_mode: direction };
      if (direction === 'holder') {
        patchBody.current_role    = newRole.trim();
        patchBody.current_company = newCompany.trim();
        // user_path shift so the rest of the app treats them as a
        // jobholder for downstream prompts / filters. Matches the
        // holder onboarding path setter.
        patchBody.user_path       = 'i_have_a_job';
      }
      // Record the life-event on the profile so Dilly's chat +
      // memory system know this was a pivot, not a random toggle.
      // 'layoff_event' for seeker direction, 'new_job_event' for
      // holder. Stored with an ISO timestamp. Never surfaced on the
      // public web profile. filtered out server-side alongside
      // other private categories. Lives on profile.life_events[].
      const nowIso = new Date().toISOString();
      patchBody.life_events_append = {
        kind: direction === 'holder' ? 'new_job' : 'layoff',
        at:   nowIso,
        role:    direction === 'holder' ? newRole.trim()    : undefined,
        company: direction === 'holder' ? newCompany.trim() : undefined,
      };

      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      // Reset the tutorial flag so the mode-specific 5-card intro
      // runs for the new identity. Layoff users see the seeker
      // onboarding deck; just-got-hired users see the holder deck.
      // Without this, switching mode silently skipped the tutorial
      // because the flag was already "true" from the previous mode.
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.removeItem('dilly_tutorial_shown').catch(() => {});
      } catch {}
      // Push the new mode into useAppMode's in-memory + disk cache
      // so the tab bar / dispatchers flip instantly on the next
      // screen. Without this, they'd start rendering the OLD mode
      // while /profile refetches.
      try {
        const { primeAppMode } = await import('../../hooks/useAppMode');
        await primeAppMode(direction);
      } catch {}
      // Route into the tutorial, not directly to the app. Tutorial
      // picks its own mode-specific deck via profile fetch.
      router.replace('/onboarding/tutorial');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong.');
      setSaving(false);
    }
  }

  function handleDismiss() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[s.container, { paddingTop: insets.top + 6 }]}>
        {/* Top-right close. lets the user back out without doing the switch */}
        <View style={s.topRow}>
          <TouchableOpacity onPress={handleDismiss} hitSlop={14}>
            <Ionicons name="close" size={22} color={colors.t3} />
          </TouchableOpacity>
        </View>

        <View style={s.content}>
          <Animated.View style={{ opacity: fadeFace, alignItems: 'center', marginBottom: 18 }}>
            <DillyFace size={120} />
          </Animated.View>

          <Animated.View style={{ opacity: fadeText, gap: 14 }}>
            <Text style={s.eyebrow}>{copy.eyebrow}</Text>
            <Text style={s.headline}>{copy.headline}</Text>
            <Text style={s.body}>{copy.body}</Text>
          </Animated.View>

          {/* Holder-only form. captures role + company before the
              mode flip so Career Center / My Career / Market Radar
              show real data the moment we land in the app. */}
          {direction === 'holder' ? (
            <Animated.View style={{ opacity: fadeText, gap: 10, marginTop: 26 }}>
              <View>
                <Text style={s.fieldLabel}>What's your new role?</Text>
                <TextInput
                  style={s.input}
                  value={newRole}
                  onChangeText={setNewRole}
                  placeholder="e.g. Senior Product Manager"
                  placeholderTextColor={colors.t3}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  maxLength={80}
                />
              </View>
              <View>
                <Text style={s.fieldLabel}>Where?</Text>
                <TextInput
                  style={s.input}
                  value={newCompany}
                  onChangeText={setNewCompany}
                  placeholder="Company name"
                  placeholderTextColor={colors.t3}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  maxLength={80}
                />
              </View>
            </Animated.View>
          ) : null}

          {err ? <Text style={s.err}>{err}</Text> : null}
        </View>

        <Animated.View
          style={{
            opacity: fadeCta,
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 14,
            paddingTop: 12,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleContinue}
            disabled={saving || !canContinue}
            style={[s.cta, (saving || !canContinue) && { opacity: 0.5 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={s.ctaText}>{copy.cta}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '900', color: INDIGO, letterSpacing: 1.6, textAlign: 'center',
  },
  headline: {
    fontSize: 26, fontWeight: '900', color: colors.t1, letterSpacing: -0.6, lineHeight: 32, textAlign: 'center',
  },
  body: {
    fontSize: 15, color: colors.t2, lineHeight: 23, textAlign: 'center', paddingHorizontal: 4,
  },
  err: {
    fontSize: 13, color: '#DC2626', textAlign: 'center', marginTop: 16,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    color: colors.t3, marginBottom: 6,
  },
  input: {
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.t1,
    backgroundColor: '#fff',
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: INDIGO,
    paddingVertical: 16, borderRadius: radius.lg,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
});
