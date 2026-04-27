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

  const fetchNotes = useCallback(async () => {
    try {
      const notes: NotesResponse = await dilly.get('/chapters/notes');
      if (notes) setNotesData(notes);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cur, notes, profile] = await Promise.all([
          dilly.get('/chapters/current').catch(() => null),
          dilly.get('/chapters/notes').catch(() => null),
          readProfileSlim().catch(() => null),
        ]);
        if (cur?.schedule) setSchedule(cur.schedule);
        setSessionCount(cur?.count || 0);
        if (notes) setNotesData(notes);
        setIdeas(buildIdeas(profile));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        Alert.alert('Not now', message);
      }
    } catch {
      showToast({ message: 'Could not reach Dilly right now.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function removeNote(id: string) {
    Alert.alert("Remove this note?", "Dilly won't bring it up in your next Chapter.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          if (notesData) {
            setNotesData({
              ...notesData,
              notes: notesData.notes.filter(n => n.id !== id),
              count: Math.max(0, notesData.count - 1),
            });
          }
          try { await dilly.fetch(`/chapters/notes/${id}`, { method: 'DELETE' }); } catch {}
          fetchNotes();
        },
      },
    ]);
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
            Write what you want to bring up. Dilly reads these before writing your session.
          </Text>
        </View>

        {/* Notes */}
        <Text style={[s.sectionTitle, { color: theme.accent }]}>YOUR NOTES</Text>

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
});
