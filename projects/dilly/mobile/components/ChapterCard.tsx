/**
 * ChapterCard — Home surface for the weekly Chapter.
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

import { useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';
import { openPaywall } from '../hooks/usePaywall';
import { openDillyOverlay } from '../hooks/useDillyOverlay';

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
          fontWeight: theme.type.heroWeight,
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
          fontWeight: theme.type.heroWeight,
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
            fontWeight: theme.type.heroWeight,
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

  return (
    <View style={[s.card, { backgroundColor: close ? theme.accentSoft : theme.surface.s1, borderColor: close ? theme.accent : theme.surface.border }]}>
      <View style={s.topRow}>
        <Text style={[s.eyebrow, { color: theme.accent }]}>
          {hasHadChapter ? 'YOUR NEXT CHAPTER' : 'YOUR FIRST CHAPTER'}
        </Text>
        <AnimatedPressable onPress={() => router.push('/(app)/chapter/schedule')} hitSlop={8} scaleDown={0.9}>
          <Ionicons name="time-outline" size={14} color={theme.surface.t3} />
        </AnimatedPressable>
      </View>
      <Text style={[s.headline, {
        color: theme.surface.t1,
        fontFamily: theme.type.display,
        fontWeight: theme.type.heroWeight,
        letterSpacing: theme.type.heroTracking,
      }]}>
        {hasHadChapter && state.latest?.title
          ? `Next · ${countdownText}`
          : `${dayLabel} at ${hourLabel}`}
      </Text>
      <Text style={[s.body, { color: theme.surface.t2 }]}>
        {hasHadChapter
          ? `Last: ${state.latest?.title || 'your Chapter'}. Next one lands every ${dayLabel}.`
          : `Your Chapter opens ${dayLabel} at ${hourLabel}. Drop notes for Dilly before then.`}
      </Text>
      <View style={s.ctaRow}>
        <AnimatedPressable
          style={[s.ghostBtn, { borderColor: theme.accentBorder }]}
          onPress={() => router.push('/(app)/chapter/notes')}
          scaleDown={0.97}
        >
          <Ionicons name="journal-outline" size={13} color={theme.accent} />
          <Text style={[s.ghostBtnText, { color: theme.accent }]}>Notes for Dilly</Text>
        </AnimatedPressable>
        {hasHadChapter ? (
          <AnimatedPressable
            style={[s.ghostBtn, { borderColor: theme.surface.border }]}
            onPress={() => router.push('/(app)/chapter')}
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
});
