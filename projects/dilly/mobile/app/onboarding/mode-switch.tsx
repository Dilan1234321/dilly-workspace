/**
 * Mode switch — the human moment between being a jobholder and being
 * a jobseeker (or vice versa). Reached when the user taps the
 * "I got laid off" / "I got a new job" button in Settings.
 *
 * This is NOT a settings toggle. It's a full-screen beat: DillyFace,
 * warm pre-written message, single CTA. The PATCH happens when the
 * user confirms the CTA, not when they open this screen — so they
 * can back out if they tapped by accident.
 *
 * Query params:
 *   to=seeker    -> user just got laid off, switching to Job Search
 *   to=holder    -> user just landed a new role, switching to Career Watch
 */

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  ActivityIndicator, KeyboardAvoidingView, Platform,
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

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setErr('');
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ app_mode: direction }),
      });
      // Land back in the app. The tab bar will pick up the new mode
      // and reshape on next mount.
      router.replace('/(app)');
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
        {/* Top-right close — lets the user back out without doing the switch */}
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
            disabled={saving}
            style={[s.cta, saving && { opacity: 0.7 }]}
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
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: INDIGO,
    paddingVertical: 16, borderRadius: radius.lg,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
});
