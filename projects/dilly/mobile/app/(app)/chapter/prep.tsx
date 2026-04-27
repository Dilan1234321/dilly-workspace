/**
 * Chapter Prep - shown while the user waits for their next session.
 *
 * Covers two states:
 *   - Waiting for first-ever Chapter (scheduled, never had a session)
 *   - Waiting for next Chapter (completed at least one session)
 *
 * Three jobs:
 *   1. Countdown chip showing when the next session arrives.
 *   2. Notes the user wants Dilly to bring up - feeds /chapters/notes,
 *      which /chapters/generate reads at generation time so topics
 *      surface naturally in the session without prompting.
 *   3. "Ideas from Dilly" - profile-signal topic starters, tap to
 *      pre-fill the notes input. Zero LLM calls; generated client-side
 *      from the locally-cached profile slim.
 *
 * Also surfaces a "See last Chapter recap" row when sessionCount > 0.
 *
 * Focus effect: re-checks /chapters/current whenever the user returns
 * to this tab. If generation_eligible flips true (session time arrived),
 * replaces to chapter/index which generates and plays the session.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, Alert,
  Animated, Easing, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import FadeInView from '../../../components/FadeInView';
import { readProfileSlim } from '../../../lib/profileCache';
import { DillyFace } from '../../../components/DillyFace';
import { showToast } from '../../../lib/globalToast';
import { showConfirm } from '../../../lib/globalConfirm';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ChapterNote { id: string; text: string; added_at: string; }
interface NotesResponse {
  notes: ChapterNote[];
  count: number;
  cap: number;
  cooldown_remaining_seconds: number;
}
interface Schedule { day_of_week: number; hour: number; }

// Backend: 0=Mon → 6=Sun. JS Date: 0=Sun → 6=Sat.
const BACKEND_TO_JS: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function labelForHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return 'noon';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function computeCountdown(sched: Schedule): string {
  const jsDayTarget = BACKEND_TO_JS[sched.day_of_week] ?? 0;
  const now = new Date();
  const target = new Date(now);
  const daysUntil = (jsDayTarget - now.getDay() + 7) % 7;
  target.setDate(now.getDate() + daysUntil);
  target.setHours(sched.hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 7);

  const msUntil = target.getTime() - now.getTime();
  const totalHours = Math.floor(msUntil / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const dayName = DAY_NAMES[jsDayTarget];
  const hourLabel = labelForHour(sched.hour);

  if (days === 0 && hours === 0) return `${dayName} at ${hourLabel} · arriving soon`;
  if (days === 0) return `${dayName} at ${hourLabel} · ${hours}h away`;
  if (days === 1) return `Tomorrow at ${hourLabel}`;
  return `${dayName} at ${hourLabel} · ${days} days`;
}

function buildIdeas(profile: Awaited<ReturnType<typeof readProfileSlim>>): string[] {
  const out: string[] = [];
  if (profile) {
    if (!profile.experience_count)
      out.push('How to land my first internship or research role');
    else if (profile.experience_count < 3)
      out.push('How to talk about my experience more powerfully');
    if (profile.major)
      out.push(`Best roles coming out of ${profile.major}`);
    if (!profile.skills_count || profile.skills_count < 4)
      out.push('Which skills are worth building right now');
    if (!profile.activities_count)
      out.push('How to build my resume before I have a lot of experience');
  }
  const always = [
    "What to prioritize for recruiting this semester",
    "My biggest career concern right now",
    "Whether my goals actually make sense",
    "What I should be doing that I'm not doing",
  ];
  for (const a of always) {
    if (out.length >= 4) break;
    out.push(a);
  }
  return out.slice(0, 4);
}

function relative(iso: string): string {
  try {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}

/** Curated state-of-mind chips. Tapping logs the user's pre-session
 *  mood as a profile fact so Dilly can condition the session tone on
 *  whether the user is fired up, drained, or stuck walking in. The
 *  fact reads as 'Walking in: <mood>' in their memory. */
const PREP_MOODS = [
  { id: 'fired_up', label: 'Fired up',  emoji: '🔥' },
  { id: 'clear',    label: 'Clear',     emoji: '🪞' },
  { id: 'scattered',label: 'Scattered', emoji: '🌪' },
  { id: 'drained',  label: 'Drained',   emoji: '🥱' },
  { id: 'stuck',    label: 'Stuck',     emoji: '🪨' },
];

const PREP_MOOD_KEY = 'dilly_prep_mood_v1';

export default function ChapterPrepScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [notesData, setNotesData] = useState<NotesResponse | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [ack, setAck] = useState<string | null>(null);
  const ackAnim = useState(new Animated.Value(0))[0];
  /** Briefing fields - what Dilly remembers about you walking into
   *  this Chapter. Pulled from /chapters/current's latest recap +
   *  /memory + /profile slim so the user sees concrete proof Dilly
   *  retained the state, not just "we'll see you Sunday". */
  const [briefing, setBriefing] = useState<{
    lastMove?: string;
    lastQuestion?: string;
    factsCount?: number;
    appsCount?: number;
    daysSinceLast?: number | null;
  } | null>(null);
  /** State-of-mind chip selection. Locally persisted so re-opening
   *  prep shows the user their last selection until session start. */
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const notes: NotesResponse = await dilly.get('/chapters/notes');
      if (notes) setNotesData(notes);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cur, notes, profile, mem, savedMood] = await Promise.all([
          dilly.get('/chapters/current').catch(() => null),
          dilly.get('/chapters/notes').catch(() => null),
          readProfileSlim().catch(() => null),
          dilly.get('/memory').catch(() => null),
          AsyncStorage.getItem(PREP_MOOD_KEY).catch(() => null),
        ]);
        if (cur?.schedule) setSchedule(cur.schedule);
        setSessionCount(cur?.count || 0);
        if (notes) setNotesData(notes);
        setIdeas(buildIdeas(profile));
        if (savedMood) setSelectedMood(savedMood);

        // Build the briefing - what Dilly is bringing into this
        // Chapter. Pulls last session's One Move + Question to sit
        // with, plus rough activity counters so the card has weight.
        const screens: any[] = (cur as any)?.latest?.screens || [];
        const lastMoveScreen = screens.find((sc: any) => sc?.slot === 'one_move');
        const lastQuestionScreen = screens.find((sc: any) => sc?.slot === 'question');
        const factArr: any[] = Array.isArray((mem as any)?.items)
          ? (mem as any).items
          : Array.isArray(mem) ? (mem as any) : [];
        let daysSinceLast: number | null = null;
        try {
          const fetchedAt = (cur as any)?.latest?.fetched_at || (cur as any)?.latest?.generated_at;
          if (fetchedAt) {
            const d = new Date(fetchedAt);
            if (!isNaN(d.getTime())) {
              daysSinceLast = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
            }
          }
        } catch {}
        setBriefing({
          lastMove: lastMoveScreen?.body
            ? String(lastMoveScreen.body).split(/(?<=[.!?])\s+/)[0].slice(0, 160)
            : undefined,
          lastQuestion: lastQuestionScreen?.body
            ? String(lastQuestionScreen.body).split(/(?<=[.!?])\s+/)[0].slice(0, 160)
            : undefined,
          factsCount: factArr.length,
          appsCount: Array.isArray((profile as any)?.applications)
            ? (profile as any).applications.length
            : undefined,
          daysSinceLast,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Tap-to-log mood. Optimistic: highlight the chip immediately, then
   *  persist locally + write a 'walking in: <mood>' fact to memory so
   *  the chapter generator can condition on it. */
  const onPickMood = useCallback(async (moodId: string, label: string) => {
    setSelectedMood(moodId);
    try { await AsyncStorage.setItem(PREP_MOOD_KEY, moodId); } catch {}
    try {
      await dilly.fetch('/memory/items', {
        method: 'POST',
        body: JSON.stringify({
          category: 'state',
          label: 'Walking into Chapter',
          value: `Mood: ${label} (logged ${new Date().toISOString().slice(0,10)})`,
        }),
      });
    } catch {}
  }, []);

  /** Three short questions Dilly is likely to ask, derived client-side
   *  from profile signals so the user can pre-think before the session.
   *  Pure heuristics; no LLM call. The point is to make the user feel
   *  like Dilly already knows what's coming, not to be 100% accurate. */
  const askPreview = useMemo<string[]>(() => {
    const facts = briefing?.factsCount ?? 0;
    const days = briefing?.daysSinceLast;
    const out: string[] = [];
    if (briefing?.lastMove) {
      out.push(`Did you actually do "${briefing.lastMove.slice(0, 60).replace(/[.!?]+$/, '')}"?`);
    }
    if (typeof days === 'number' && days >= 7) {
      out.push(`A week passed. What changed in your career this week?`);
    }
    if (facts < 12) {
      out.push(`What's something I don't know about you yet that matters?`);
    } else {
      out.push(`What's the version of your career you're avoiding looking at?`);
    }
    if (briefing?.appsCount && briefing.appsCount > 0) {
      out.push(`What's the one application you've been deferring?`);
    }
    return out.slice(0, 3);
  }, [briefing]);

  // Re-check session readiness whenever the user returns to this tab.
  // If generation_eligible flips true, route to chapter/index which
  // will generate and play the session.
  useFocusEffect(useCallback(() => {
    if (loading) return;
    dilly.get('/chapters/current').catch(() => null).then((cur: any) => {
      if (cur?.generation_eligible) {
        router.replace('/(app)/chapter/' as any);
      }
    });
  }, [loading]));

  const flashAck = useCallback((msg: string) => {
    setAck(msg);
    ackAnim.setValue(0);
    Animated.sequence([
      Animated.timing(ackAnim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(ackAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setAck(null); });
  }, [ackAnim]);

  async function submit() {
    const text = input.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await dilly.fetch('/chapters/notes', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const body = await res.json();
        setInput('');
        flashAck(body?.ack || 'Noted.');
        fetchNotes();
      } else {
        const err = await res.json().catch(() => null);
        const detail = err?.detail;
        const message = typeof detail === 'string'
          ? detail
          : (detail?.message || 'Could not add that note.');
        showToast({ message, type: 'info' });
      }
    } catch {
      showToast({ message: 'Could not reach Dilly right now.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function removeNote(id: string) {
    const ok = await showConfirm({
      title: 'Remove this note?',
      message: "Dilly won't bring it up in your next Chapter.",
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    if (notesData) {
      setNotesData({
        ...notesData,
        notes: notesData.notes.filter(n => n.id !== id),
        count: Math.max(0, notesData.count - 1),
      });
    }
    try { await dilly.fetch(`/chapters/notes/${id}`, { method: 'DELETE' }); } catch {}
    fetchNotes();
  }

  const atCap = !!notesData && notesData.count >= notesData.cap;
  const cooldownRemaining = notesData?.cooldown_remaining_seconds || 0;
  const cooldownActive = cooldownRemaining > 0;
  const disabled = atCap || cooldownActive || !input.trim() || submitting;

  const cooldownText = (() => {
    if (!cooldownActive) return '';
    const h = Math.floor(cooldownRemaining / 3600);
    const m = Math.ceil((cooldownRemaining % 3600) / 60);
    return h >= 1 ? `${h}h ${m}m until next` : `${Math.max(1, m)}m until next`;
  })();

  const countdown = useMemo(() => schedule ? computeCountdown(schedule) : null, [schedule]);
  const hasRecap = sessionCount > 0;

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg }]}>
        <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 20 }}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>NEXT CHAPTER</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <DillyFace size={80} mood="idle" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.surface.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 160 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>NEXT CHAPTER</Text>
          {countdown && (
            <View style={[s.countdownBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
              <Ionicons name="time-outline" size={13} color={theme.accent} />
              <Text style={[s.countdownText, { color: theme.accent }]}>{countdown}</Text>
            </View>
          )}
          <Text style={[s.headerSub, { color: theme.surface.t2 }]}>
            Walk in prepared. Dilly does her best work when you give her something to chew on.
          </Text>
        </View>

        {/* Briefing - what Dilly is bringing into this Chapter. Visible
            proof that she remembers; the carryover from last session. */}
        {briefing && (briefing.lastMove || briefing.lastQuestion || (briefing.factsCount ?? 0) > 0) ? (
          <View style={[s.briefingCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            <View style={s.briefingHeader}>
              <Ionicons name="bookmark" size={13} color={theme.accent} />
              <Text style={[s.briefingEyebrow, { color: theme.accent }]}>WHAT I'M BRINGING IN</Text>
            </View>
            {briefing.lastMove ? (
              <View style={s.briefingRow}>
                <Text style={[s.briefingLabel, { color: theme.surface.t3 }]}>YOUR LAST MOVE</Text>
                <Text style={[s.briefingValue, { color: theme.surface.t1 }]} numberOfLines={3}>
                  {briefing.lastMove}
                </Text>
              </View>
            ) : null}
            {briefing.lastQuestion ? (
              <View style={s.briefingRow}>
                <Text style={[s.briefingLabel, { color: theme.surface.t3 }]}>THE QUESTION I LEFT YOU WITH</Text>
                <Text style={[s.briefingValue, { color: theme.surface.t1, fontStyle: 'italic' }]} numberOfLines={3}>
                  {briefing.lastQuestion}
                </Text>
              </View>
            ) : null}
            <View style={s.briefingStatsRow}>
              {(briefing.factsCount ?? 0) > 0 ? (
                <View style={[s.briefingStat, { borderColor: theme.surface.border }]}>
                  <Text style={[s.briefingStatNum, { color: theme.surface.t1 }]}>{briefing.factsCount}</Text>
                  <Text style={[s.briefingStatLabel, { color: theme.surface.t3 }]}>facts on you</Text>
                </View>
              ) : null}
              {typeof briefing.daysSinceLast === 'number' && briefing.daysSinceLast > 0 ? (
                <View style={[s.briefingStat, { borderColor: theme.surface.border }]}>
                  <Text style={[s.briefingStatNum, { color: theme.surface.t1 }]}>{briefing.daysSinceLast}d</Text>
                  <Text style={[s.briefingStatLabel, { color: theme.surface.t3 }]}>since last</Text>
                </View>
              ) : null}
              {(briefing.appsCount ?? 0) > 0 ? (
                <View style={[s.briefingStat, { borderColor: theme.surface.border }]}>
                  <Text style={[s.briefingStatNum, { color: theme.surface.t1 }]}>{briefing.appsCount}</Text>
                  <Text style={[s.briefingStatLabel, { color: theme.surface.t3 }]}>tracked apps</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* State of mind - tap-to-log mood. Dilly conditions session
            tone on the answer, so picking 'drained' lands a softer
            opening than 'fired up'. The chip persists locally + writes
            a fact to memory so the chapter generator can read it. */}
        <Text style={[s.sectionTitle, { color: theme.accent, marginTop: 22 }]}>HOW ARE YOU WALKING IN?</Text>
        <View style={s.moodRow}>
          {PREP_MOODS.map(m => {
            const active = selectedMood === m.id;
            return (
              <AnimatedPressable
                key={m.id}
                onPress={() => onPickMood(m.id, m.label)}
                scaleDown={0.94}
                style={[
                  s.moodChip,
                  { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                  active && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                ]}
              >
                <Text style={s.moodEmoji}>{m.emoji}</Text>
                <Text style={[s.moodLabel, { color: active ? theme.accent : theme.surface.t2 }]}>{m.label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* Likely asks - 3 questions Dilly is probably going to lead
            with, derived from profile signals. Lets the user pre-think
            so they walk in with substance instead of getting stuck on
            a cold open. */}
        {askPreview.length > 0 ? (
          <>
            <Text style={[s.sectionTitle, { color: theme.accent, marginTop: 22 }]}>WHAT I'LL PROBABLY ASK</Text>
            <View style={s.asksList}>
              {askPreview.map((q, i) => (
                <View
                  key={i}
                  style={[s.askRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                >
                  <View style={[s.askNum, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[s.askNumText, { color: theme.accent }]}>{i + 1}</Text>
                  </View>
                  <Text style={[s.askText, { color: theme.surface.t1 }]}>{q}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Notes */}
        <Text style={[s.sectionTitle, { color: theme.accent, marginTop: 22 }]}>YOUR NOTES</Text>

        {(!notesData || notesData.notes.length === 0) && (
          <FadeInView delay={0}>
            <View style={[s.emptyNotes, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <Ionicons name="journal-outline" size={20} color={theme.surface.t3} />
              <Text style={[s.emptyText, { color: theme.surface.t3 }]}>
                No notes yet. Jot something below.
              </Text>
            </View>
          </FadeInView>
        )}

        {notesData?.notes.map((n, i) => (
          <FadeInView key={n.id} delay={i * 25}>
            <View style={[s.noteRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <View style={[s.noteDot, { backgroundColor: theme.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.noteText, { color: theme.surface.t1 }]}>{n.text}</Text>
                <Text style={[s.noteTime, { color: theme.surface.t3 }]}>{relative(n.added_at)}</Text>
              </View>
              <AnimatedPressable onPress={() => removeNote(n.id)} hitSlop={10} scaleDown={0.85} style={{ padding: 4 }}>
                <Ionicons name="close" size={16} color={theme.surface.t3} />
              </AnimatedPressable>
            </View>
          </FadeInView>
        ))}

        {/* Ideas from Dilly */}
        {ideas.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: theme.accent, marginTop: 22 }]}>IDEAS FROM DILLY</Text>
            <View style={s.ideasGrid}>
              {ideas.map((idea, i) => (
                <AnimatedPressable
                  key={i}
                  onPress={() => setInput(idea)}
                  scaleDown={0.96}
                  style={[s.ideaChip, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                >
                  <Ionicons name="add" size={14} color={theme.accent} />
                  <Text style={[s.ideaText, { color: theme.surface.t1 }]}>{idea}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </>
        )}

        {/* See last recap */}
        {hasRecap && (
          <AnimatedPressable
            scaleDown={0.97}
            onPress={() => router.push('/(app)/chapter/recap' as any)}
            style={[s.recapBtn, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, marginTop: 20 }]}
          >
            <Ionicons name="archive-outline" size={16} color={theme.surface.t2} />
            <Text style={[s.recapBtnText, { color: theme.surface.t2 }]}>See last Chapter recap</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
          </AnimatedPressable>
        )}
      </ScrollView>

      {/* Pinned notes input bar */}
      <View style={[
        s.inputBar,
        {
          backgroundColor: theme.surface.s1,
          borderTopColor: theme.surface.border,
          paddingBottom: Math.max(12, insets.bottom),
        },
      ]}>
        {notesData && (
          <Text style={[s.counter, { color: theme.surface.t3 }]}>
            {notesData.count} of {notesData.cap} notes this week
            {cooldownText ? ' · ' + cooldownText : ''}
          </Text>
        )}
        <View style={[s.inputWrap, { backgroundColor: theme.surface.bg, borderColor: theme.surface.border }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={input}
            onChangeText={setInput}
            placeholder={
              atCap ? 'Queue is full until next Chapter'
              : cooldownActive ? 'Cooling down...'
              : 'Something to bring up...'
            }
            placeholderTextColor={theme.surface.t3}
            editable={!atCap && !cooldownActive}
            returnKeyType="send"
            onSubmitEditing={submit}
            multiline
            maxLength={500}
          />
          <AnimatedPressable
            onPress={submit}
            disabled={disabled}
            scaleDown={0.9}
            style={[s.sendBtn, { backgroundColor: disabled ? theme.surface.s2 : theme.accent }]}
            hitSlop={6}
          >
            <Ionicons name="arrow-up" size={16} color={disabled ? theme.surface.t3 : '#fff'} />
          </AnimatedPressable>
        </View>
        {ack ? (
          <Animated.Text style={[s.ack, { color: theme.accent, opacity: ackAnim }]}>
            {ack}
          </Animated.Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  countdownBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  countdownText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { fontSize: 13, lineHeight: 19 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginBottom: 10,
  },

  emptyNotes: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: 1,
  },
  emptyText: { fontSize: 13 },

  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  noteDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  noteText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  noteTime: { fontSize: 11, marginTop: 3, letterSpacing: 0.2 },

  ideasGrid: { paddingHorizontal: 16, gap: 8 },
  ideaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  ideaText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  recapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, padding: 14, borderRadius: 14, borderWidth: 1,
  },
  recapBtnText: { flex: 1, fontSize: 13, fontWeight: '700' },

  inputBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, gap: 6,
  },
  counter: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1,
  },
  input: { flex: 1, minHeight: 36, maxHeight: 100, fontSize: 14, paddingVertical: 6 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ack: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // ── Briefing card (what Dilly remembers walking in) ──────────────
  briefingCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  briefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  briefingEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  briefingRow: { gap: 4 },
  briefingLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  briefingValue: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  briefingStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  briefingStat: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  briefingStatNum: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  briefingStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // ── Mood chips (state of mind walking into the session) ──────────
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  moodEmoji: { fontSize: 13 },
  moodLabel: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },

  // ── Likely-asks list (what Dilly will probably ask) ──────────────
  asksList: {
    paddingHorizontal: 16,
    gap: 6,
  },
  askRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  askNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  askNumText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: -0.1,
  },
  askText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
