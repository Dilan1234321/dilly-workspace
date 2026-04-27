/**
 * AhaPrompt - one-shot, once-ever prompt that collects the user's
 * "aha moment" during their first session.
 *
 * Product context:
 *   Founder can't yet answer "what's the single moment where a
 *   tester has said 'oh, I GET it'." This component's entire reason
 *   to exist is to collect that answer from actual testers so the
 *   app can be rebuilt around recreating that moment.
 *
 * When it fires:
 *   - AsyncStorage stamps the first-ever app-open time at sign-in.
 *   - This component checks on mount: if (now - first-open) >= 5 min
 *     AND the user hasn't already responded (checked via /aha/status
 *     so switching devices doesn't double-prompt), show the modal.
 *   - After the user answers OR skips, we call /aha/signal and set
 *     a local "shown" flag so we never try again on this device.
 *
 * Design:
 *   - One free-text field. No LLM. No multi-select. No "how likely
 *     are you to recommend" - that's NPS and it'd pollute the signal.
 *   - One question: "What's starting to make sense for you about Dilly?"
 *   - Submit button: "Share" (not "Submit" - less clinical).
 *   - Skip button: small, grey, below the card. A skip is itself
 *     data ("this user bounced before aha landed").
 *   - No branding, no Dilly face, no celebration. This is a quiet
 *     ask for truth, not a marketing moment.
 *
 * Render site:
 *   Mounted at the root of (app)/_layout.tsx so it lives on top of
 *   whichever home screen the user happens to be on at the 5-min
 *   mark. Does its own visibility logic internally - callers just
 *   mount it and forget it.
 */
import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard, Platform, KeyboardAvoidingView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../lib/dilly';
import { getToken } from '../lib/auth';
import { useResolvedTheme } from '../hooks/useTheme';
import { AnimatedModal } from './AnimatedModal';

const FIRST_OPEN_KEY = 'dilly_first_open_at_v1';
const SHOWN_KEY = 'dilly_aha_prompt_shown_v1';
const MIN_MINUTES_BEFORE_PROMPT = 5;

export function AhaPrompt() {
  const theme = useResolvedTheme();
  const [visible, setVisible] = useState(false);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const startTime = useRef<number | null>(null);

  // Decide whether to show. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Must be authed; no-auth users don't get the prompt.
        const token = await getToken();
        if (!token) return;

        // Has this device already shown the prompt?
        const localShown = await AsyncStorage.getItem(SHOWN_KEY);
        if (localShown === '1') return;

        // Stamp first-open time if missing. This is per-device
        // because AsyncStorage is local - a user who reinstalls
        // restarts the 5-minute clock. Acceptable: reinstallers
        // are a different cohort and their "aha" is worth re-asking.
        let firstOpen = await AsyncStorage.getItem(FIRST_OPEN_KEY);
        if (!firstOpen) {
          const now = Date.now();
          await AsyncStorage.setItem(FIRST_OPEN_KEY, String(now));
          firstOpen = String(now);
        }
        startTime.current = parseInt(firstOpen, 10);

        // Check elapsed time vs. threshold.
        const elapsedMs = Date.now() - startTime.current;
        const elapsedMinutes = elapsedMs / 60000;
        if (elapsedMinutes < MIN_MINUTES_BEFORE_PROMPT) {
          // Schedule a timer to check again when the threshold hits.
          const waitMs = (MIN_MINUTES_BEFORE_PROMPT - elapsedMinutes) * 60000;
          const t = setTimeout(async () => {
            if (cancelled) return;
            // Re-check the server - a request from another device
            // could have already logged a response.
            const res = await dilly.fetch('/aha/status').catch(() => null);
            if (res?.ok) {
              const data = await res.json();
              if (data?.has_responded) return;
            }
            setVisible(true);
          }, waitMs);
          return () => clearTimeout(t);
        }

        // Already past threshold - check server before showing.
        const res = await dilly.fetch('/aha/status').catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          if (data?.has_responded) {
            // Sync local flag so we don't re-check the server next
            // time either.
            await AsyncStorage.setItem(SHOWN_KEY, '1');
            return;
          }
        }
        if (!cancelled) setVisible(true);
      } catch {
        // Never block anything on this.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (opts: { skip: boolean }) => {
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      const minutesInApp = startTime.current
        ? Math.floor((Date.now() - startTime.current) / 60000)
        : null;
      await dilly.fetch('/aha/signal', {
        method: 'POST',
        body: JSON.stringify({
          response: opts.skip ? null : response.trim(),
          skipped: opts.skip,
          minutes_in_app: minutesInApp,
        }),
      }).catch(() => null);
      await AsyncStorage.setItem(SHOWN_KEY, '1');
    } finally {
      setSubmitting(false);
      setVisible(false);
    }
  };

  return (
    <AnimatedModal
      visible={visible}
      onDismiss={() => submit({ skip: true })}
      backdropDismissable={false}  // require a deliberate choice
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: '100%' }}
      >
        <View
          style={{
            backgroundColor: theme.surface.bg,
            borderColor: theme.surface.border,
            borderWidth: 1,
            borderRadius: 20,
            padding: 24,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          }}
        >
          <Text style={[s.eyebrow, { color: theme.accent }]}>
            ONE QUICK THING
          </Text>
          <Text style={[s.headline, { color: theme.surface.t1 }]}>
            What's starting to make sense for you about Dilly?
          </Text>
          <Text style={[s.sub, { color: theme.surface.t2 }]}>
            One line is fine. No wrong answer. This helps us make Dilly better for you.
          </Text>

          <TextInput
            style={[s.input, {
              color: theme.surface.t1,
              backgroundColor: theme.surface.s2,
              borderColor: theme.surface.border,
            }]}
            value={response}
            onChangeText={setResponse}
            placeholder="Type here..."
            placeholderTextColor={theme.surface.t3}
            multiline
            autoFocus
            maxLength={500}
            returnKeyType="done"
            blurOnSubmit
          />

          <TouchableOpacity
            style={[
              s.primaryCta,
              { backgroundColor: theme.accent },
              (!response.trim() || submitting) && { opacity: 0.5 },
            ]}
            onPress={() => submit({ skip: false })}
            disabled={!response.trim() || submitting}
            activeOpacity={0.85}
          >
            <Text style={s.primaryCtaText}>
              {submitting ? 'Sharing...' : 'Share'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 10, alignItems: 'center', paddingVertical: 8 }}
            onPress={() => submit({ skip: true })}
            disabled={submitting}
            activeOpacity={0.6}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '600',
              color: theme.surface.t3,
            }}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </AnimatedModal>
  );
}

const s = StyleSheet.create({
  eyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 2, textAlign: 'center',
  },
  headline: {
    fontSize: 19, fontWeight: '900', letterSpacing: -0.3,
    textAlign: 'center', marginTop: 8, lineHeight: 25,
  },
  sub: {
    fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8,
  },
  input: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
    textAlignVertical: 'top',
  },
  primaryCta: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryCtaText: {
    color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2,
  },
});

export default AhaPrompt;
