/**
 * Chapter session flow — the weekly one-to-one with Dilly.
 *
 * Seven screens, one at a time, full-bleed, tap to continue.
 * Paces like a letter being read aloud, not a dashboard. Each
 * screen does one thing: a cold open, something noticed, what's
 * working, what to push on, the one move, a question to sit with,
 * and a close.
 *
 * Data flow:
 *   On mount, GET /chapters/current. If a new one is eligible, POST
 *   /chapters/generate (the ONLY LLM call this surface ever makes
 *   in a normal cycle). Otherwise, we render the latest stored
 *   Chapter as a replay. No silent regeneration.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import { openDillyOverlay } from '../../../hooks/useDillyOverlay';
import { DillyFace } from '../../../components/DillyFace';
import AnimatedPressable from '../../../components/AnimatedPressable';
import { cancelMissReminder, scheduleChapterNotifications } from '../../../hooks/useChapterNotifications';

interface Screen { slot: string; body: string; }
interface Chapter { title: string; screens: Screen[]; generated_at?: string; fetched_at?: string; }

const SLOT_LABELS: Record<string, string> = {
  cold_open: '',
  noticed: 'What I noticed',
  working: "What's working",
  push_on: "What I'd push on",
  one_move: 'Your one move',
  question: 'A question to sit with',
  close: '',
};

export default function ChapterSessionScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        // First check what the server knows. If a new Chapter is due,
        // generate it. Otherwise fall back to the latest stored one.
        const cur = await dilly.get('/chapters/current');
        if (cur?.generation_eligible) {
          const res = await dilly.fetch('/chapters/generate', { method: 'POST', body: JSON.stringify({}) });
          if (res.ok) {
            const body = await res.json();
            setChapter(body);
            // Successful generation means this cycle is done. Cancel
            // the nag-24h-later reminder and re-arm notifications for
            // the NEXT cycle based on the schedule (server clears any
            // one-time override on generate so cadence is back to
            // normal). Fire-and-forget.
            cancelMissReminder().catch(() => {});
            if (cur?.schedule) {
              scheduleChapterNotifications({ ...cur.schedule, next_override_at: null }).catch(() => {});
            }
          } else if (cur?.latest) {
            setChapter(cur.latest);
          } else {
            setError('Could not open this Chapter right now. Try again soon.');
          }
        } else if (cur?.latest) {
          setChapter(cur.latest);
          // Replay. The user opened what they already had, which means
          // we should also drop the 24h-miss nag for good measure.
          cancelMissReminder().catch(() => {});
        } else {
          setError("You don't have a Chapter yet. Come back at your scheduled time.");
        }
      } catch {
        setError('Could not reach Dilly right now.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fade in each screen as the index advances.
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, fade]);

  function advance() {
    if (!chapter) return;
    if (index < chapter.screens.length - 1) {
      setIndex(i => i + 1);
    } else {
      // End of Chapter. Close.
      router.back();
    }
  }

  function openQuestionChat(q: string) {
    openDillyOverlay({
      isPaid: true,
      initialMessage: `Dilly asked me this in my Chapter today: "${q}". I want to sit with it and talk it through.`,
    });
  }

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40 }]}>
        <DillyFace size={96} />
        <Text style={[s.loading, { color: theme.surface.t2 }]}>Opening your Chapter...</Text>
        <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (error || !chapter) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40, paddingHorizontal: 32 }]}>
        <Ionicons name="moon" size={36} color={theme.surface.t3} />
        <Text style={[s.errorText, { color: theme.surface.t1 }]}>{error || 'No Chapter yet.'}</Text>
        <AnimatedPressable
          style={[s.closeBtn, { backgroundColor: theme.accent, marginTop: 28 }]}
          onPress={() => router.back()}
          scaleDown={0.97}
        >
          <Text style={s.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const current = chapter.screens[index];
  const isFirst = index === 0;
  const isLast = index === chapter.screens.length - 1;
  const isQuestion = current?.slot === 'question';
  const label = SLOT_LABELS[current?.slot || ''] || '';

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 12 }]}>
      {/* Quiet top bar: only the chapter title + a close X. No
          progress bar, no page numbers, no controls. The point is to
          make it feel like a letter, not a carousel. */}
      <View style={s.topBar}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="close" size={22} color={theme.surface.t3} />
        </AnimatedPressable>
        <Text style={[s.chapterTitle, { color: theme.surface.t2 }]} numberOfLines={1}>
          Chapter · {chapter.title}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Subtle dot row so people know more is coming. Not a progress
          bar because that pressures people to rush. */}
      <View style={s.dotRow}>
        {chapter.screens.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              { backgroundColor: i <= index ? theme.accent : theme.surface.s2 },
              i === index && { width: 14 },
            ]}
          />
        ))}
      </View>

      {/* Screen body. Big generous padding. One sentence at a time.
          Dilly face appears on the cold_open and close for that
          "someone sat down with you" feeling. */}
      <Animated.View style={[s.bodyWrap, { opacity: fade }]}>
        {(isFirst || isLast) && (
          <View style={{ marginBottom: 24 }}>
            <DillyFace size={isFirst ? 112 : 80} />
          </View>
        )}
        {label ? (
          <Text style={[s.label, { color: theme.accent }]}>{label.toUpperCase()}</Text>
        ) : null}
        <Text
          style={[
            s.body,
            {
              color: theme.surface.t1,
              fontFamily: theme.type.display,
              fontWeight: isFirst ? '700' : theme.type.heroWeight,
              fontSize: isFirst ? 28 : 22,
              lineHeight: isFirst ? 36 : 30,
              letterSpacing: theme.type.heroTracking,
            },
          ]}
        >
          {current?.body || ''}
        </Text>

        {/* On the question screen, add a "talk it through" CTA that
            opens a chat pre-seeded with the question. */}
        {isQuestion && (
          <AnimatedPressable
            style={[s.talkBtn, { backgroundColor: theme.accent }]}
            onPress={() => openQuestionChat(current.body)}
            scaleDown={0.97}
          >
            <Ionicons name="chatbubbles" size={14} color="#fff" />
            <Text style={s.talkBtnText}>Talk it through with Dilly</Text>
          </AnimatedPressable>
        )}
      </Animated.View>

      {/* Bottom "tap to continue" CTA. Full-width strip so the tap
          target is always obvious. On the last screen this closes. */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <AnimatedPressable
          style={[s.continueBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
          onPress={advance}
          scaleDown={0.98}
        >
          <Text style={[s.continueBtnText, { color: theme.accent }]}>
            {isLast ? 'Close' : 'Continue'}
          </Text>
          <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color={theme.accent} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
    alignSelf: 'stretch',
  },
  chapterTitle: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  bodyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
  body: { textAlign: 'center' },

  talkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 28, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12,
  },
  talkBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: -0.1 },

  bottomBar: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  continueBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },

  loading: { marginTop: 20, fontSize: 14, fontWeight: '600' },
  errorText: { marginTop: 20, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  closeBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
