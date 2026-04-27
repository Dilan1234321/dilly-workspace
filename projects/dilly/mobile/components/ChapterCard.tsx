/**
 * ChapterCard - Home surface for the weekly Chapter.
 *
 * Renders one of several states depending on what the server knows:
 *   locked      Starter tier, no access. Paywall CTA.
 *   gated       Has access but less than 20 facts. "Keep building."
 *   pre-first   Has access + facts, never scheduled. "Book your first."
 *   waiting     Scheduled, days out. Shows countdown + notes link.
 *   close       Within ~4 hours of scheduled time. Gentle pulse.
 *   ready       New Chapter eligible right now. Pulsing, unmissable.
 *   past        No new Chapter due. Shows last Chapter title + next-in.
 *
 * State comes from GET /chapters/current. Card never fetches during
 * render; parent passes the state in, which is cheap.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';
import { openPaywall } from '../hooks/usePaywall';
import { openDillyOverlay } from '../hooks/useDillyOverlay';
import { dilly } from '../lib/dilly';
import { useAccessibilityPrefs, boldenWeight } from '../hooks/useAccessibilityPrefs';

const SCHED_LATER_KEY = 'dilly_chapter_schedule_later_v1';

export interface ChapterCardState {
  plan: string;
  has_access: boolean;
  facts_in_profile: number;
  first_session_gate: number;
  schedule: { day_of_week: number; hour: number; next_override_at: string | null };
  latest: { title?: string; fetched_at?: string; screens?: any[] } | null;
  generation_eligible: boolean;
}

interface Props {
  state: ChapterCardState | null;
  theme: ResolvedTheme;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ChapterCard({ state, theme }: Props) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  // Honor iOS Bold Text - bumps every headline weight by one notch so
  // users with the accessibility pref on see chunkier titles, like
  // every system app does.
  const a11y = useAccessibilityPrefs();
  const heroWeight = boldenWeight(theme.type.heroWeight, a11y.boldText);

  // "I'll schedule later" deferred-state flag, set from the recap
  // screen when the user taps the third option in the reschedule
  // prompt. We re-read on focus so the home tile picks up the new
  // state immediately after the user backs out of recap.
  const [scheduleLater, setScheduleLater] = useState(false);
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(SCHED_LATER_KEY).then(v => setScheduleLater(v === '1'));
  }, []));

  // Figure out the next scheduled datetime from the weekly cadence
  // plus any one-time override. All math client-side.
  const nextAt = useMemo(() => nextScheduledAt(state), [state]);
  const msUntil = nextAt ? nextAt.getTime() - Date.now() : 0;
  const minutesUntil = Math.max(0, Math.round(msUntil / 60000));
  const hoursUntil = minutesUntil / 60;
  const daysUntil = Math.floor(hoursUntil / 24);

  // Pulse when close (< 4 hours) or ready.
  const ready = !!state?.generation_eligible;
  const close = !ready && nextAt !== null && hoursUntil > 0 && hoursUntil <= 4;
  const shouldPulse = ready || close;

  useEffect(() => {
    if (!shouldPulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldPulse, pulseAnim]);

  // Loading shimmer while state is null.
  if (!state) {
    return (
      <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, height: 132 }]} />
    );
  }

  // ── 1. Starter / no access → paywall tile. ──────────────────────
  if (!state.has_access) {
    return (
      <AnimatedPressable
        style={[s.card, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
        onPress={() => openPaywall({
          surface: 'Chapters',
          promise: 'A weekly one-to-one with Dilly, your advisor. One Chapter a week, written just for you.',
        })}
        scaleDown={0.98}
      >
        <View style={s.topRow}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>CHAPTERS</Text>
          <View style={[s.lockChip, { backgroundColor: theme.accent + '22' }]}>
            <Ionicons name="lock-closed" size={10} color={theme.accent} />
            <Text style={[s.lockChipText, { color: theme.accent }]}>DILLY</Text>
          </View>
        </View>
        <Text style={[s.headline, {
          color: theme.surface.t1,
          fontFamily: theme.type.display,
          fontWeight: heroWeight,
          letterSpacing: theme.type.heroTracking,
        }]}>
          A weekly session with Dilly.
        </Text>
        <Text style={[s.body, { color: theme.surface.t2 }]}>
          Chapters are part of Dilly. One a week, written just for you.
        </Text>
      </AnimatedPressable>
    );
  }

  // ── 2. Has access but below fact gate → keep-building. ──────────
  if (state.facts_in_profile < state.first_session_gate) {
    const remaining = state.first_session_gate - state.facts_in_profile;
    return (
      <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <Text style={[s.eyebrow, { color: theme.accent }]}>YOUR FIRST CHAPTER</Text>
        <Text style={[s.headline, {
          color: theme.surface.t1,
          fontFamily: theme.type.display,
          fontWeight: heroWeight,
          letterSpacing: theme.type.heroTracking,
        }]}>
          Tell Dilly {remaining} more {remaining === 1 ? 'thing' : 'things'}.
        </Text>
        <Text style={[s.body, { color: theme.surface.t2 }]}>
          Before your first Chapter, Dilly needs to know you a bit. Add {remaining} more {remaining === 1 ? 'fact' : 'facts'} to your profile to unlock it.
        </Text>
        <AnimatedPressable
          style={[s.ghostBtn, { borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]}
          onPress={() => openDillyOverlay({
            isPaid: false,
            initialMessage: `I want to unlock my first Chapter with Dilly. Help me add ${remaining} more ${remaining === 1 ? 'fact' : 'facts'} to my profile. Ask me one good question at a time about my background, skills, or goals, and write the answers to my Dilly Profile.`,
          })}
          scaleDown={0.97}
        >
          <Ionicons name="chatbubbles" size={13} color={theme.accent} />
          <Text style={[s.ghostBtnText, { color: theme.accent }]}>Build your profile with Dilly</Text>
        </AnimatedPressable>

        {/* Note input - works even before the first Chapter unlocks.
            Users who are still building their profile can still queue
            thoughts to be read when their first Chapter arrives, which
            makes this screen feel less like a hard gate. */}
        <View style={{ marginTop: 14, marginBottom: 2 }}>
          <Text style={{
            fontSize: 10, fontWeight: '900', letterSpacing: 1.4,
            color: theme.surface.t3, marginBottom: 4,
          }}>
            PREP FOR YOUR FIRST CHAPTER
          </Text>
          <Text style={{ fontSize: 12, color: theme.surface.t2, lineHeight: 17 }}>
            Anything you want Dilly to think through in your first session? Jot it down - she'll read it before she writes.
          </Text>
        </View>
        <InlineNoteAdd theme={theme} />
      </View>
    );
  }

  // ── 3. Ready now → pulsing unmissable CTA. ──────────────────────
  if (ready) {
    const haloWidth = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2] });
    const haloOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
    return (
      <AnimatedPressable
        onPress={() => router.push('/(app)/chapter')}
        scaleDown={0.98}
      >
        <Animated.View style={[
          s.card,
          { backgroundColor: theme.accentSoft, borderColor: theme.accent, borderWidth: haloWidth, shadowColor: theme.accent, shadowOpacity: haloOpacity, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
        ]}>
          <View style={s.topRow}>
            <Text style={[s.eyebrow, { color: theme.accent }]}>YOUR CHAPTER IS READY</Text>
            <View style={[s.dotPulse, { backgroundColor: theme.accent }]} />
          </View>
          <Text style={[s.headline, {
            color: theme.surface.t1,
            fontFamily: theme.type.display,
            fontWeight: heroWeight,
            letterSpacing: theme.type.heroTracking,
          }]}>
            Open the next Chapter.
          </Text>
          <Text style={[s.body, { color: theme.surface.t2 }]}>
            Dilly sat down and wrote it for you. Tap to begin.
          </Text>
        </Animated.View>
      </AnimatedPressable>
    );
  }

  // ── 4. Pre-first or upcoming → countdown + notes link. ──────────
  const hasHadChapter = !!state.latest;
  const countdownText = (() => {
    if (!nextAt) return '';
    if (daysUntil >= 2) return `in ${daysUntil} days`;
    if (daysUntil === 1) return 'tomorrow';
    const h = Math.floor(hoursUntil);
    const m = Math.max(1, Math.round(minutesUntil - h * 60));
    if (h >= 1) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  })();

  const dayLabel = DAY_NAMES[state.schedule.day_of_week] || 'Sunday';
  const hourLabel = formatHour(state.schedule.hour);

  // ── 4a. User said "I'll schedule later" after their last Chapter
  //        recap. Surface a calmer, deferred-state CTA so the home
  //        tile reflects their choice rather than reverting silently
  //        to the weekly cadence. Tap → schedule screen. ──────────
  if (scheduleLater && hasHadChapter) {
    return (
      <AnimatedPressable
        style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
        onPress={() => router.push('/(app)/chapter/schedule')}
        scaleDown={0.98}
      >
        <View style={s.topRow}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>WHEN YOU'RE READY</Text>
          <Ionicons name="time-outline" size={14} color={theme.surface.t3} />
        </View>
        <Text style={[s.headline, {
          color: theme.surface.t1,
          fontFamily: theme.type.display,
          fontWeight: heroWeight,
          letterSpacing: theme.type.heroTracking,
        }]}>
          Schedule your next Chapter.
        </Text>
        <Text style={[s.body, { color: theme.surface.t2 }]}>
          You said you'd pick a time later. Tap here when that time is now - takes 10 seconds.
        </Text>
        <View style={[s.ghostBtn, { borderColor: theme.accentBorder, backgroundColor: theme.accentSoft, marginTop: 12, alignSelf: 'flex-start' }]}>
          <Ionicons name="calendar" size={13} color={theme.accent} />
          <Text style={[s.ghostBtnText, { color: theme.accent }]}>Pick a day</Text>
        </View>
      </AnimatedPressable>
    );
  }

  // ── 4b. First-ever Chapter not yet scheduled. Sell hard, not
  //        polite. Founder direction: this card has to make people
  //        WANT it - not a polite scheduler tile. The headline reads
  //        as something honest the user is avoiding; the body lands
  //        the promise in plain prose; the imperative CTA closes the
  //        loop. Dark frame on the headline pulls the eye. ─────────
  if (!hasHadChapter) {
    return (
      <AnimatedPressable
        style={[s.card, { backgroundColor: theme.accent, borderColor: theme.accent, padding: 22 }]}
        onPress={() => router.push('/(app)/chapter/schedule')}
        scaleDown={0.98}
      >
        <View style={s.topRow}>
          <Text style={[s.eyebrow, { color: '#FFFFFF', opacity: 0.85 }]}>WHAT NOBODY IS TELLING YOU</Text>
          <View style={[s.lockChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="bookmark" size={9} color="#FFF" />
            <Text style={[s.lockChipText, { color: '#FFF' }]}>WEEKLY · 1:1</Text>
          </View>
        </View>
        <Text style={[s.headline, {
          color: '#FFFFFF',
          fontFamily: theme.type.display,
          fontWeight: heroWeight,
          letterSpacing: theme.type.heroTracking,
          fontSize: 24,
          lineHeight: 30,
          marginTop: 6,
        }]}>
          The version of your career you've been avoiding looking at.
        </Text>
        <Text style={[s.body, {
          color: '#FFFFFF',
          opacity: 0.92,
          fontSize: 14,
          lineHeight: 21,
          marginTop: 10,
        }]}>
          Once a week, Dilly sits down and reads it back to you. What's actually working. What you keep deferring. The one move to make next. No fluff, no pep talk. The conversation you've been avoiding having with yourself.
        </Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginTop: 18, paddingHorizontal: 16, paddingVertical: 12,
          borderRadius: 12, alignSelf: 'flex-start',
          backgroundColor: '#FFFFFF',
        }}>
          <Ionicons name="calendar" size={14} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '900', letterSpacing: -0.1 }}>
            Pick your time. Then keep it.
          </Text>
          <Ionicons name="arrow-forward" size={13} color={theme.accent} />
        </View>
        <View style={[s.ghostBtn, {
          borderColor: 'transparent', backgroundColor: 'transparent',
          marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 0,
        }]}>
          <Ionicons name="time" size={11} color="#FFFFFF" style={{ opacity: 0.7 }} />
          <Text style={{ color: '#FFFFFF', opacity: 0.7, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
            One Chapter a week. ~10 minutes. Stays with you longer.
          </Text>
        </View>
        {/* Hide the legacy ghost button below the new CTA. The
            original component has more JSX after this so we leave the
            structure intact and just suppress the trailing button. */}
        <View style={{ height: 0, overflow: 'hidden' }}>
          <Ionicons name="calendar" size={13} color="#FFF" />
          <Text style={[s.ghostBtnText, { color: '#FFF' }]}>Schedule my first Chapter</Text>
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <View style={[s.card, { backgroundColor: close ? theme.accentSoft : theme.surface.s1, borderColor: close ? theme.accent : theme.surface.border }]}>
      <View style={s.topRow}>
        <Text style={[s.eyebrow, { color: theme.accent }]}>
          YOUR NEXT CHAPTER
        </Text>
        <AnimatedPressable onPress={() => router.push('/(app)/chapter/schedule')} hitSlop={8} scaleDown={0.9}>
          <Ionicons name="time-outline" size={14} color={theme.surface.t3} />
        </AnimatedPressable>
      </View>
      <Text style={[s.headline, {
        color: theme.surface.t1,
        fontFamily: theme.type.display,
        fontWeight: heroWeight,
        letterSpacing: theme.type.heroTracking,
      }]}>
        {state.latest?.title
          ? `Next · ${countdownText}`
          : `${dayLabel} at ${hourLabel}`}
      </Text>
      <Text style={[s.body, { color: theme.surface.t2 }]}>
        {`Tap to prep for your next session. Add notes for Dilly to pick up - she reads them before she writes.`}
      </Text>
      {/* Inline quick-add for chapter notes. A small labeled heading
          above the input so users clearly understand this is where
          they queue things they want Dilly to bring up - not a search
          bar, not a chat. Prior version had just the input with a
          placeholder, which was easy to miss. */}
      <View style={{ marginTop: 14, marginBottom: 2 }}>
        <Text style={{
          fontSize: 10, fontWeight: '900', letterSpacing: 1.4,
          color: theme.surface.t3, marginBottom: 4,
        }}>
          PREP FOR YOUR CHAPTER
        </Text>
        <Text style={{ fontSize: 12, color: theme.surface.t2, lineHeight: 17 }}>
          Jot anything you want Dilly to think through before she writes your next session.
        </Text>
      </View>
      <InlineNoteAdd theme={theme} />

      <View style={s.ctaRow}>
        <AnimatedPressable
          style={[s.ghostBtn, { borderColor: theme.accent, backgroundColor: theme.accent }]}
          onPress={() => router.push('/(app)/chapter/prep' as any)}
          scaleDown={0.97}
        >
          <Ionicons name="sparkles" size={13} color="#FFF" />
          <Text style={[s.ghostBtnText, { color: '#FFF' }]}>Prep for next session</Text>
        </AnimatedPressable>
        {hasHadChapter ? (
          <AnimatedPressable
            style={[s.ghostBtn, { borderColor: theme.surface.border }]}
            onPress={() => router.push('/(app)/chapter/recap' as any)}
            scaleDown={0.97}
          >
            <Ionicons name="book-outline" size={13} color={theme.surface.t2} />
            <Text style={[s.ghostBtnText, { color: theme.surface.t2 }]}>Read last</Text>
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * InlineNoteAdd - one-line input that queues a Chapter note.
 *
 * Shown inside ChapterCard in the waiting / pre-first state so users
 * can drop notes without leaving Home. Submits to POST /chapters/notes
 * directly, falls back gracefully on cap / cooldown errors by showing
 * a brief hint. On success, clears the input and shows a quiet
 * 'Noted.' ack.
 */
function InlineNoteAdd({ theme }: { theme: ResolvedTheme }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const ackAnim = useRef(new Animated.Value(0)).current;

  const flash = useCallback((msg: string) => {
    setAck(msg);
    ackAnim.setValue(0);
    Animated.sequence([
      Animated.timing(ackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(ackAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setAck(null); });
  }, [ackAnim]);

  const submit = useCallback(async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await dilly.fetch('/chapters/notes', {
        method: 'POST',
        body: JSON.stringify({ text: t }),
      });
      if (res.ok) {
        setText('');
        flash('Noted for your next Chapter.');
      } else {
        const err = await res.json().catch(() => null);
        const detail = err?.detail;
        const msg = typeof detail === 'string'
          ? detail
          : (detail?.message || 'Full. Try again later.');
        flash(msg.slice(0, 80));
      }
    } catch {
      flash('Could not reach Dilly.');
    } finally {
      setBusy(false);
    }
  }, [text, busy, flash]);

  const canSend = !!text.trim() && !busy;

  return (
    <View style={{ marginTop: 10, marginBottom: 10 }}>
      <View style={[s.noteInputWrap, {
        backgroundColor: theme.surface.bg,
        borderColor: canSend ? theme.accent : theme.surface.border,
      }]}>
        <Ionicons name="journal-outline" size={14} color={theme.surface.t3} style={{ marginTop: 8 }} />
        <TextInput
          style={[s.noteInput, { color: theme.surface.t1 }]}
          value={text}
          onChangeText={setText}
          placeholder="Bring this up in my next Chapter..."
          placeholderTextColor={theme.surface.t3}
          returnKeyType="send"
          onSubmitEditing={submit}
          multiline
          maxLength={300}
        />
        <AnimatedPressable
          onPress={submit}
          disabled={!canSend}
          scaleDown={0.9}
          hitSlop={6}
          style={[s.noteSendBtn, {
            backgroundColor: canSend ? theme.accent : theme.surface.s2,
          }]}
        >
          <Ionicons name="arrow-up" size={14} color={canSend ? '#fff' : theme.surface.t3} />
        </AnimatedPressable>
      </View>
      {ack ? (
        <Animated.Text style={[s.noteAck, { color: theme.accent, opacity: ackAnim }]}>
          {ack}
        </Animated.Text>
      ) : null}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return 'noon';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

/**
 * Compute the next session datetime from the user's weekly cadence plus
 * any one-time override. Matches the server's eligibility logic.
 */
function nextScheduledAt(state: ChapterCardState | null): Date | null {
  if (!state) return null;
  const override = state.schedule?.next_override_at;
  if (override) {
    try {
      const o = new Date(override);
      if (!isNaN(o.getTime())) return o;
    } catch {}
  }
  const day = state.schedule?.day_of_week ?? 6;
  const hour = state.schedule?.hour ?? 19;
  const now = new Date();
  // JS getDay: 0=Sun..6=Sat. Backend: 0=Mon..6=Sun. Normalize.
  const jsDay = (day + 1) % 7;
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  const diff = (jsDay - now.getDay() + 7) % 7;
  if (diff === 0 && target.getTime() <= now.getTime()) {
    // Today's slot already passed; next one is a week away.
    target.setDate(target.getDate() + 7);
  } else {
    target.setDate(target.getDate() + diff);
  }
  return target;
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 8,
    marginBottom: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  lockChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
  },
  lockChipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  dotPulse: { width: 8, height: 8, borderRadius: 4 },
  headline: { fontSize: 20, lineHeight: 26, marginTop: 2 },
  body: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  ghostBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: -0.1 },

  // Inline chapter-note input. Sits on ChapterCard so users can
  // queue a note without navigating anywhere.
  noteInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  noteInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 80,
    fontSize: 13,
    paddingVertical: 8,
    lineHeight: 18,
  },
  noteSendBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  noteAck: {
    fontSize: 11, fontWeight: '700', marginTop: 6, letterSpacing: 0,
  },
});
