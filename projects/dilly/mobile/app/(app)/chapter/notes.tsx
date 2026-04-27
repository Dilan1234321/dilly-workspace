import { safeBack } from '../../../lib/navigation';
/**
 * Notes for Dilly - things the user wants to bring up in the next Chapter.
 *
 * UX is intentionally paper-thin: a running list of queued notes, a
 * text field at the bottom to add one, and a small counter showing
 * how many they have left and whether the 12-hour cooldown is active.
 *
 * Why the caps:
 *   The whole Chapter feature is cost-disciplined (one LLM call per
 *   cycle). The notes are prompt context for that single call, so
 *   unlimited notes would still not cost more LLM. But from a UX /
 *   ritual standpoint, letting a user dump 30 notes in one Saturday
 *   would turn this into a chat surface and dilute the weekly rhythm.
 *   3 per week / 1 per 12 hours keeps it feeling like a journal, not
 *   a task list.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, Alert, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import FadeInView from '../../../components/FadeInView';

interface ChapterNote {
  id: string;
  text: string;
  added_at: string;
}

interface NotesResponse {
  notes: ChapterNote[];
  count: number;
  cap: number;
  cooldown_remaining_seconds: number;
}

export default function ChapterNotesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [data, setData] = useState<NotesResponse | null>(null);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const ackAnim = useState(new Animated.Value(0))[0];

  const fetchNotes = useCallback(async () => {
    try {
      const body: NotesResponse = await dilly.get('/chapters/notes');
      if (body) setData(body);
    } catch {
      // Silent: screen keeps rendering with whatever we already have.
    }
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // Quiet ack flash below the input after each successful add.
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
      Alert.alert('Not now', 'Could not reach Dilly right now.');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeNote(id: string) {
    Alert.alert(
      'Remove this note?',
      "Dilly won't bring it up in your next Chapter.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            // Optimistic.
            if (data) setData({ ...data, notes: data.notes.filter(n => n.id !== id), count: Math.max(0, data.count - 1) });
            try { await dilly.fetch(`/chapters/notes/${id}`, { method: 'DELETE' }); } catch {}
            fetchNotes();
          },
        },
      ],
    );
  }

  const atCap = !!data && data.count >= data.cap;
  const cooldownRemaining = data?.cooldown_remaining_seconds || 0;
  const cooldownActive = cooldownRemaining > 0;
  const disabled = atCap || cooldownActive || !input.trim() || submitting;

  const cooldownText = (() => {
    if (!cooldownActive) return '';
    const hours = Math.floor(cooldownRemaining / 3600);
    const mins = Math.ceil((cooldownRemaining % 3600) / 60);
    if (hours >= 1) return `${hours}h ${mins}m until you can add another`;
    return `${Math.max(1, mins)}m until you can add another`;
  })();

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => safeBack('/(app)')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t1} />
        </AnimatedPressable>
        <Text style={[s.title, { color: theme.surface.t1 }]}>Notes for Dilly</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FadeInView delay={0}>
          <Text style={[s.intro, { color: theme.surface.t2 }]}>
            Drop a note and Dilly will bring it up in your next Chapter. Keep it short.
          </Text>
        </FadeInView>

        {data && data.notes.length === 0 && (
          <FadeInView delay={40}>
            <View style={[s.empty, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <Ionicons name="journal-outline" size={22} color={theme.surface.t3} />
              <Text style={[s.emptyText, { color: theme.surface.t3 }]}>
                No notes yet. The next Chapter is a blank page.
              </Text>
            </View>
          </FadeInView>
        )}

        {data?.notes.map((n, i) => (
          <FadeInView key={n.id} delay={60 + i * 30}>
            <View style={[s.noteRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <View style={[s.noteDot, { backgroundColor: theme.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.noteText, { color: theme.surface.t1 }]}>{n.text}</Text>
                <Text style={[s.noteAck, { color: theme.surface.t3 }]}>Noted · {relative(n.added_at)}</Text>
              </View>
              <AnimatedPressable onPress={() => removeNote(n.id)} hitSlop={10} scaleDown={0.85} style={{ padding: 4 }}>
                <Ionicons name="close" size={16} color={theme.surface.t3} />
              </AnimatedPressable>
            </View>
          </FadeInView>
        ))}
      </ScrollView>

      {/* Pinned input. Sits above the safe-area inset so it doesn't
          clash with the Home indicator. */}
      <View style={[s.inputBar, { backgroundColor: theme.surface.s1, borderTopColor: theme.surface.border, paddingBottom: Math.max(12, insets.bottom) }]}>
        {data ? (
          <Text style={[s.counter, { color: theme.surface.t3 }]}>
            {data.count} of {data.cap} notes{cooldownText ? ' · ' + cooldownText : ''}
          </Text>
        ) : null}
        <View style={[s.inputWrap, { backgroundColor: theme.surface.bg, borderColor: theme.surface.border }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={input}
            onChangeText={setInput}
            placeholder={atCap ? 'Queue is full until next Chapter' : cooldownActive ? 'Dilly is still writing down your last note' : 'Add a note for Dilly...'}
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
    </View>
  );
}

function relative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch { return ''; }
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  empty: {
    alignItems: 'center', gap: 10, padding: 24, borderRadius: 14, borderWidth: 1,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },
  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  noteDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  noteText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  noteAck: { fontSize: 11, marginTop: 4, letterSpacing: 0.2 },
  inputBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1,
    gap: 6,
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
