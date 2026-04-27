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
import { useResolvedTheme } from '../../hooks/useTheme';
import { validateRole, validateCompany } from '../../lib/roleCompanyValidator';

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
  const theme = useResolvedTheme();
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

  // Soft fade-in on mount. The face settles first, then text + CTA
  // come in together so the button is tappable within ~500ms.
  //
  // Bug fix: the earlier version ran a 1.2s SEQUENCED fade (face
  // 500 + text 400 + CTA 300) so the CTA was invisible/untappable
  // for over a second after arriving. Users tapped and nothing
  // happened - looked like the app froze. Starting fadeCta at 1
  // (fully visible) removes the perceived freeze entirely.
  const fadeFace  = useRef(new Animated.Value(0)).current;
  const fadeText  = useRef(new Animated.Value(0)).current;
  const fadeCta   = useRef(new Animated.Value(1)).current;  // instant, no sequence

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeFace, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeText, { toValue: 1, duration: 400, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fadeFace, fadeText]);

  // Holder CTA is disabled until role + company are typed. we need
  // them to populate the comp benchmark + trajectory without a
  // second round-trip. Seeker direction has no gating.
  const canContinue =
    direction === 'seeker'
      ? true
      : newRole.trim().length >= 2 && newCompany.trim().length >= 1;

  async function handleContinue() {
    if (saving || !canContinue) return;
    // Client-side gibberish guard BEFORE the network call. Entirely
    // on-device, zero backend cost no matter how many times someone
    // retries. Catches the obvious garbage ('oeitoighjswogiwsogpih',
    // ')*#&%()*%', 'aaaaaa') without letting it waste server work.
    if (direction === 'holder') {
      const roleCheck = validateRole(newRole);
      if (!roleCheck.ok) {
        setErr(roleCheck.reason);
        return;
      }
      const companyCheck = validateCompany(newCompany);
      if (!companyCheck.ok) {
        setErr(companyCheck.reason);
        return;
      }
    }
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
      } else {
        // Laid-off / job-seeker pivot. Wipe the previous role +
        // company everywhere so Dilly treats this person like any
        // other job seeker and doesn't keep surfacing a role they
        // no longer hold. user_path flips to 'exploring' to match
        // the onboarding situation that says "I'm looking for my
        // next opportunity." No visible trace of the old role.
        patchBody.current_role    = '';
        patchBody.current_company = '';
        patchBody.user_path       = 'exploring';
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

      // PATCH the profile. Wrapped in its own try so a network hiccup
      // gets surfaced as an inline error instead of throwing into the
      // /onboarding ErrorBoundary ("Something's off with onboarding").
      try {
        const res = await dilly.fetch('/profile', {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        });
        if (res && !res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
      } catch (patchErr: any) {
        setErr(patchErr?.message || 'Could not save your update. Try again in a moment.');
        setSaving(false);
        return;
      }
      // Reset the tutorial flag so the mode-specific 5-card intro
      // runs for the new identity. Failures here are non-fatal: the
      // worst outcome is the tutorial doesn't re-show, which is
      // recoverable and not worth blocking the flow.
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.removeItem('dilly_tutorial_shown').catch(() => {});
      } catch {}
      // Prime the in-memory mode cache. Non-fatal if this fails.
      try {
        const { primeAppMode } = await import('../../hooks/useAppMode');
        await primeAppMode(direction);
      } catch {}
      // Route into the mode-specific tutorial with a transition hint.
      // Tutorial uses the `transition` param to play a dedicated
      // 5-card acknowledgement deck (congrats on the new role / sorry
      // you're here) instead of the generic mode tour - a generic
      // product-feature deck in a moment that carries real emotional
      // weight would feel tone-deaf. We cleared `dilly_tutorial_shown`
      // above so tutorial will play.
      const transitionKind = direction === 'holder' ? 'got_job' : 'laid_off';
      try {
        router.replace({
          pathname: '/onboarding/tutorial',
          params: { transition: transitionKind },
        });
      } catch (navErr: any) {
        setErr(navErr?.message || 'Saved, but the app didn\'t open. Pull down to refresh.');
        setSaving(false);
      }
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
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // Offset the KeyboardAvoidingView so the scroll content fully
      // clears the keyboard AND the CTA sits visibly above it. Without
      // this, when the user focuses the Company field and the keyboard
      // comes up, the fixed-position CTA below was stacking on top of
      // the input, hiding the text they were typing.
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <View style={[s.container, { paddingTop: insets.top + 6 }]}>
        {/* Top-right close. lets the user back out without doing the switch */}
        <View style={s.topRow}>
          <TouchableOpacity onPress={handleDismiss} hitSlop={14}>
            <Ionicons name="close" size={22} color={colors.t3} />
          </TouchableOpacity>
        </View>

        {/* Scroll container so the form never collides with the CTA
            when the keyboard is up. contentContainerStyle grows the
            inner content; the outer ScrollView handles scrolling when
            keyboard-pushed content exceeds viewport height. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
              show real data the moment we land in the app. Inputs and
              labels now read theme so Midnight users see readable
              fields instead of white boxes with invisible text. */}
          {direction === 'holder' ? (
            <Animated.View style={{ opacity: fadeText, gap: 10, marginTop: 26 }}>
              <View>
                <Text style={[s.fieldLabel, { color: theme.surface.t3 }]}>What's your new role?</Text>
                <TextInput
                  style={[s.input, { color: theme.surface.t1, backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}
                  value={newRole}
                  onChangeText={setNewRole}
                  placeholder="e.g. Senior Product Manager"
                  placeholderTextColor={theme.surface.t3}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  maxLength={80}
                />
              </View>
              <View>
                <Text style={[s.fieldLabel, { color: theme.surface.t3 }]}>Where?</Text>
                <TextInput
                  style={[s.input, { color: theme.surface.t1, backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}
                  value={newCompany}
                  onChangeText={setNewCompany}
                  placeholder="Company name"
                  placeholderTextColor={theme.surface.t3}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  maxLength={80}
                />
              </View>
            </Animated.View>
          ) : null}

          {err ? <Text style={s.err}>{err}</Text> : null}

          {/* Big bottom padding so the last field scrolls past the
              fixed CTA when the keyboard is up. Was 24 - on iPhone
              with the company field focused, the CTA + keyboard
              together covered the input. 120 gives enough slack so
              the user can always see what they're typing. */}
          <View style={{ height: 120 }} />
        </ScrollView>

        <Animated.View
          style={{
            opacity: fadeCta,
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 14,
            paddingTop: 12,
            backgroundColor: theme.surface.bg,
            borderTopWidth: 1,
            borderTopColor: theme.surface.border,
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
  // ScrollView contentContainerStyle. grows to fit content, starts
  // centered when short, scrolls when keyboard pushes it past viewport.
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 20,
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
