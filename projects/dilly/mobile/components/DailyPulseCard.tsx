/**
 * DailyPulseCard — Home surface for the daily reflective check-in.
 *
 * Purpose: give users a reason to open the app every day (between
 * weekly Chapters). A single prompt, short response, streak counter.
 * Breaking the streak is the psychological cost that drives return.
 *
 * Three states:
 *   1. loading   — skeleton while /pulse/today resolves
 *   2. unanswered — prompt + input + submit
 *   3. answered  — a calm "done for today" card showing streak + the
 *                  response they wrote (so they can feel the continuity)
 *
 * No LLM call on the frontend. Answers post to /pulse, which advances
 * both the pulse streak and the shared daily-checkin streak.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../lib/dilly';
import { useResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';

interface PulseToday {
  ok: boolean;
  today: string;
  prompt: string;
  answered: boolean;
  response: string | null;
  mood: string | null;
  streak: { current: number; longest: number; last_date: string | null };
}

// Six low-friction mood options. Users can submit without picking one.
const MOODS: Array<{ id: string; label: string }> = [
  { id: 'great',      label: 'Great' },
  { id: 'good',       label: 'Good' },
  { id: 'okay',       label: 'Okay' },
  { id: 'stressed',   label: 'Stressed' },
  { id: 'tired',      label: 'Tired' },
  { id: 'motivated',  label: 'Motivated' },
];

export default function DailyPulseCard() {
  const theme = useResolvedTheme();
  const [today, setToday]   = useState<PulseToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [input, setInput]   = useState('');
  const [mood, setMood]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved]   = useState(false);

  // Subtle fade-in so the card doesn't pop when state resolves.
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const data = (await dilly.get('/pulse/today')) as PulseToday;
      setToday(data);
      if (data.answered) setInput(data.response || '');
      if (data.answered && data.mood) setMood(data.mood);
    } catch (_e) {
      setError('Could not load your pulse.');
    } finally {
      setLoading(false);
      Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [fade]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async () => {
    const response = input.trim();
    if (!response || submitting) return;
    setSubmitting(true);
    try {
      const res = await dilly.fetch('/pulse', {
        method: 'POST',
        body: JSON.stringify({ response, mood: mood || undefined }),
      });
      if (!res.ok) {
        setError('Could not save. Try again.');
        return;
      }
      const data = await res.json();
      setToday(prev => prev ? {
        ...prev,
        answered: true,
        response,
        mood,
        streak: data.streak,
      } : prev);
      setJustSaved(true);
      // Fade the "saved" confirmation out after a beat.
      setTimeout(() => setJustSaved(false), 1600);
    } catch (_e) {
      setError('Could not save. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [input, mood, submitting]);

  if (loading) {
    return (
      <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <View style={{ height: 16, width: 80, backgroundColor: theme.surface.s2, borderRadius: 4 }} />
        <View style={{ height: 18, width: '80%', backgroundColor: theme.surface.s2, borderRadius: 4, marginTop: 10 }} />
        <View style={{ height: 18, width: '60%', backgroundColor: theme.surface.s2, borderRadius: 4, marginTop: 6 }} />
      </View>
    );
  }

  if (error || !today) {
    // Fail quietly — this is a nice-to-have, not a critical surface.
    return null;
  }

  const streakLabel = today.streak.current > 0
    ? `${today.streak.current} day${today.streak.current === 1 ? '' : 's'} in a row`
    : null;

  return (
    <Animated.View style={{ opacity: fade }}>
      <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <View style={s.header}>
          <View style={[s.dot, { backgroundColor: theme.accent }]} />
          <Text style={[s.eyebrow, { color: theme.accent }]}>DAILY PULSE</Text>
          {streakLabel && (
            <Text style={[s.streak, { color: theme.surface.t2 }]}>· {streakLabel}</Text>
          )}
        </View>

        <Text style={[s.prompt, { color: theme.surface.t1 }]}>{today.prompt}</Text>

        {today.answered ? (
          <AnsweredState
            response={today.response || ''}
            mood={today.mood || null}
            justSaved={justSaved}
            onEdit={() => {
              // Allow the user to rewrite today's entry. Reopens the
              // input by flipping answered locally.
              setToday(t => t ? { ...t, answered: false } : t);
            }}
          />
        ) : (
          <>
            <TextInput
              style={[
                s.input,
                { backgroundColor: theme.surface.bg, borderColor: theme.surface.border, color: theme.surface.t1 },
              ]}
              value={input}
              onChangeText={setInput}
              placeholder="Take a breath. Write the first thing that comes."
              placeholderTextColor={theme.surface.t3}
              multiline
              maxLength={1000}
              editable={!submitting}
            />
            <View style={s.moodRow}>
              {MOODS.map(m => {
                const picked = mood === m.id;
                return (
                  <AnimatedPressable
                    key={m.id}
                    onPress={() => setMood(picked ? null : m.id)}
                    scaleDown={0.95}
                    style={[
                      s.moodPill,
                      {
                        backgroundColor: picked ? theme.accentSoft : theme.surface.bg,
                        borderColor: picked ? theme.accent : theme.surface.border,
                      },
                    ]}
                  >
                    <Text style={[
                      s.moodText,
                      { color: picked ? theme.accent : theme.surface.t2 },
                    ]}>{m.label}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
            <AnimatedPressable
              onPress={submit}
              disabled={!input.trim() || submitting}
              scaleDown={0.98}
              style={[
                s.submit,
                {
                  backgroundColor: input.trim() && !submitting ? theme.accent : theme.surface.s2,
                  opacity: input.trim() && !submitting ? 1 : 0.6,
                },
              ]}
            >
              <Text style={s.submitText}>{submitting ? 'Saving…' : 'Save today'}</Text>
            </AnimatedPressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

function AnsweredState({
  response,
  mood,
  justSaved,
  onEdit,
}: {
  response: string;
  mood: string | null;
  justSaved: boolean;
  onEdit: () => void;
}) {
  const theme = useResolvedTheme();
  return (
    <View style={{ marginTop: 8 }}>
      <View style={[
        s.answered,
        { backgroundColor: theme.surface.bg, borderColor: theme.surface.border },
      ]}>
        <Text style={[s.answeredText, { color: theme.surface.t1 }]}>{response}</Text>
        {mood ? (
          <Text style={[s.answeredMood, { color: theme.surface.t3 }]}>
            Felt: {mood}
          </Text>
        ) : null}
      </View>
      <View style={s.answeredFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
          <Text style={[s.savedLabel, { color: theme.surface.t2 }]}>
            {justSaved ? 'Saved. See you tomorrow.' : 'Done for today.'}
          </Text>
        </View>
        <AnimatedPressable onPress={onEdit} scaleDown={0.95} hitSlop={8}>
          <Text style={[s.editLink, { color: theme.accent }]}>Edit</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  streak: { fontSize: 11, fontWeight: '600' },
  prompt: { fontSize: 17, fontWeight: '700', lineHeight: 23, letterSpacing: -0.2 },
  input: {
    marginTop: 12,
    minHeight: 76,
    maxHeight: 160,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  moodPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  moodText: { fontSize: 11, fontWeight: '700' },
  submit: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.1 },
  answered: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  answeredText: { fontSize: 14, lineHeight: 20 },
  answeredMood: { fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'capitalize' },
  answeredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  savedLabel: { fontSize: 11, fontWeight: '600' },
  editLink: { fontSize: 12, fontWeight: '700' },
});
