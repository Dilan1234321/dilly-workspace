/**
 * Chapter — between-sessions recap + notes pad (build 356).
 *
 * Landing page for the Chapter tab when there is NO new session ready
 * yet. Two jobs:
 *
 *   1. Read-only recap of what was discussed in the last session —
 *      every slot rendered as a clean card so the user can remember
 *      and sit with it. Tap any card to open the Dilly chat overlay
 *      seeded with that topic (same seed prompts as the journey map).
 *
 *   2. A notes pad for things the user wants to raise in the NEXT
 *      session. Persisted locally in AsyncStorage (key scoped to the
 *      last chapter id) and best-effort synced to the backend via
 *      POST /chapters/notes-for-next so the next chapter can pick
 *      them up as context. If the backend endpoint doesn't exist
 *      (yet), the local save is still the source of truth.
 *
 * When the next session becomes ready (generation_eligible on
 * /chapters/current), the parent chapter/index.tsx redirects away
 * from this page into the session flow — this screen does not need
 * to handle the generation path itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import DillyLoadingState from '../../../components/DillyLoadingState';
import { openDillyOverlay } from '../../../hooks/useDillyOverlay';
import { DillyFace } from '../../../components/DillyFace';

interface Screen { slot: string; body: string; }
interface Chapter {
  id?: string;
  title: string;
  screens: Screen[];
  count?: number;
  generated_at?: string;
}

const SLOT_LABEL: Record<string, string> = {
  cold_open: 'Opening',
  noticed:   'What Dilly noticed',
  working:   "What's working",
  push_on:   "What to push on",
  one_move:  'Your one move',
  question:  'A question to sit with',
  close:     'Closing thought',
};

const SLOT_ICON: Record<string, any> = {
  cold_open: 'ellipse-outline',
  noticed:   'eye-outline',
  working:   'sparkles-outline',
  push_on:   'flash-outline',
  one_move:  'footsteps-outline',
  question:  'help-circle-outline',
  close:     'checkmark-circle-outline',
};

/** Seed prompt used when a recap card is tapped. Mirrors the journey
 *  map so the in-between conversation stays one thread. */
function seedFor(slot: string, body: string): string {
  const snippet = body.length > 140 ? body.slice(0, 137) + '...' : body;
  switch (slot) {
    case 'noticed':   return `Dilly, can we keep talking about what you noticed? You said: "${snippet}"`;
    case 'working':   return `Walk me through "what's working" again: "${snippet}". Where do I go from here?`;
    case 'push_on':   return `About the thing I should push on: "${snippet}". Help me make that real this week.`;
    case 'one_move':  return `Let's work on my one move: "${snippet}". What's the next 30 minutes look like?`;
    case 'question':  return `Let's sit with the question you asked me: "${snippet}". Here's what came up.`;
    case 'cold_open': return `I want to start where you started me: "${snippet}". Can we unpack that?`;
    case 'close':     return `I keep coming back to your closing thought: "${snippet}".`;
    default:          return `Let's keep going on this: "${snippet}"`;
  }
}

export default function ChapterRecapScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = useMemo(() => {
    // Scope notes to the chapter the user is recapping. If a new
    // chapter lands later and is marked completed, we switch to a
    // new key automatically so notes written for session 5 don't
    // bleed into the recap after session 6 lands.
    return chapter?.id ? `chapter_notes_next:${chapter.id}` : 'chapter_notes_next:latest';
  }, [chapter?.id]);

  // Load the last chapter + any saved notes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = await dilly.get('/chapters/current').catch(() => null);
        const latest: Chapter | null = cur?.latest || null;
        if (cancelled) return;
        setChapter(latest);
        const key = latest?.id ? `chapter_notes_next:${latest.id}` : 'chapter_notes_next:latest';
        const raw = await AsyncStorage.getItem(key).catch(() => null);
        if (!cancelled && typeof raw === 'string') setNotes(raw);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced autosave. Local write is the source of truth (instant
  // feedback). Backend sync is attempted 1.2 s after the user stops
  // typing, but we do NOT surface a failure to the user — local
  // persistence is enough for the feature to work.
  const onNotesChange = useCallback((text: string) => {
    setNotes(text);
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(storageKey, text);
      } catch {
        // ignore — next write will retry
      }
      setSaveState('saved');
    }, 400);

    if (backendSyncTimer.current) clearTimeout(backendSyncTimer.current);
    backendSyncTimer.current = setTimeout(() => {
      dilly.fetch('/chapters/notes-for-next', {
        method: 'POST',
        body: JSON.stringify({ chapter_id: chapter?.id || null, notes: text }),
      }).catch(() => {});
    }, 1200);
  }, [storageKey, chapter?.id]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (backendSyncTimer.current) clearTimeout(backendSyncTimer.current);
  }, []);

  const onCardTap = useCallback((slot: string, body: string) => {
    openDillyOverlay({ initialMessage: seedFor(slot, body) });
  }, []);

  const recapCards = useMemo(() => {
    if (!chapter) return [];
    const WANT = new Set(['noticed', 'working', 'push_on', 'one_move', 'question']);
    return chapter.screens.filter(s => WANT.has(s.slot));
  }, [chapter]);

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        messages={['Opening your last Chapter…', 'Pulling what you talked about…']}
      />
    );
  }

  if (!chapter || recapCards.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40 }]}>
        <DillyFace size={110} />
        <Text style={[styles.emptyTitle, { color: theme.surface.t1 }]}>No Chapter yet</Text>
        <Text style={[styles.emptyBody, { color: theme.surface.t2 }]}>
          Dilly writes your first Chapter after it learns enough about you. Check
          back at your scheduled time.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header — no back button (this is a tab destination). */}
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>LAST CHAPTER</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]} numberOfLines={2}>
            {chapter.title}
          </Text>
          <Text style={[styles.sub, { color: theme.surface.t3 }]}>
            A recap to sit with between sessions.
          </Text>
        </View>

        {/* Recap cards */}
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>WHAT WE TALKED ABOUT</Text>
        {recapCards.map(s => (
          <TouchableOpacity
            key={s.slot}
            activeOpacity={0.85}
            onPress={() => onCardTap(s.slot, s.body)}
            style={[
              styles.card,
              { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconBg, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name={SLOT_ICON[s.slot] || 'ellipse-outline'} size={14} color={theme.accent} />
              </View>
              <Text style={[styles.cardLabel, { color: theme.surface.t2 }]}>
                {SLOT_LABEL[s.slot] || s.slot}
              </Text>
            </View>
            <Text style={[styles.cardBody, { color: theme.surface.t1 }]} numberOfLines={6}>
              {s.body}
            </Text>
            <View style={styles.cardCta}>
              <Text style={[styles.cardCtaText, { color: theme.accent }]}>Keep talking</Text>
              <Ionicons name="arrow-forward" size={12} color={theme.accent} />
            </View>
          </TouchableOpacity>
        ))}

        {/* Notes pad */}
        <View style={styles.notesBlock}>
          <View style={styles.notesHead}>
            <Text style={[styles.sectionTitle, { color: theme.accent, paddingHorizontal: 0 }]}>
              NOTES FOR NEXT CHAPTER
            </Text>
            {saveState === 'saving' ? (
              <Text style={[styles.saveHint, { color: theme.surface.t3 }]}>saving…</Text>
            ) : saveState === 'saved' ? (
              <Text style={[styles.saveHint, { color: theme.surface.t3 }]}>saved</Text>
            ) : null}
          </View>
          <Text style={[styles.notesHint, { color: theme.surface.t2 }]}>
            Jot what you want to raise next time. Dilly reads these before writing
            your next Chapter so they shape the session.
          </Text>
          <TextInput
            value={notes}
            onChangeText={onNotesChange}
            multiline
            placeholder="e.g. I want to talk about whether I should stay at my internship next summer…"
            placeholderTextColor={theme.surface.t3}
            style={[
              styles.notesInput,
              {
                backgroundColor: theme.surface.s1,
                borderColor: theme.accentBorder,
                color: theme.surface.t1,
              },
            ]}
            textAlignVertical="top"
          />
        </View>

        {/* When next session is ready, the index router redirects out
            of this screen automatically. Still, give the user a hint
            about what comes next. */}
        <View style={[styles.nextHint, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Ionicons name="hourglass-outline" size={15} color={theme.accent} />
          <Text style={[styles.nextHintText, { color: theme.surface.t2 }]}>
            Dilly writes the next Chapter at your scheduled time. You'll see it here
            when it's ready.
          </Text>
        </View>

        {/* Quick escape to chat Dilly freely */}
        <AnimatedPressable
          scaleDown={0.97}
          onPress={() => openDillyOverlay({ initialMessage: 'I want to talk to you between Chapters.' })}
          style={[styles.chatCta, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="chatbubble-ellipses" size={15} color="#FFF" />
          <Text style={styles.chatCtaText}>Talk to Dilly now</Text>
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1, alignItems: 'center', paddingHorizontal: 30,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  emptyBody:  { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },

  header: { paddingHorizontal: 20, marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, lineHeight: 32, marginTop: 4 },
  sub:     { fontSize: 13, fontWeight: '600', marginTop: 6 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginBottom: 10, marginTop: 4,
  },

  card: {
    marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderRadius: 14,
    padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardIconBg: {
    width: 24, height: 24, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  cardBody:  { fontSize: 14, lineHeight: 21 },
  cardCta:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  cardCtaText: { fontSize: 11, fontWeight: '800' },

  notesBlock: { paddingHorizontal: 20, marginTop: 20 },
  notesHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  saveHint:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  notesHint:  { fontSize: 12, fontWeight: '600', lineHeight: 17, marginBottom: 10 },
  notesInput: {
    minHeight: 140, maxHeight: 280,
    borderWidth: 1, borderRadius: 12,
    padding: 14,
    fontSize: 14, lineHeight: 20,
    fontWeight: '500',
  },

  nextHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 20,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: 12,
  },
  nextHintText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  chatCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    marginTop: 20,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 12,
  },
  chatCtaText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});
