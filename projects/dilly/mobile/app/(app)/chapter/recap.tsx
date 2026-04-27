/**
 * Chapter Recap - shown after a session ends, or when the user taps
 * "See last Chapter recap" from the prep screen.
 *
 * Comprehensive visual summary of what was discussed. Every slot is
 * a tappable card that opens the Dilly chat overlay seeded with that
 * topic so the user can keep the conversation going.
 *
 * Zero LLM cost: reads the existing session data already in
 * /chapters/current. No new inference calls.
 *
 * "Schedule next Chapter" CTA at the bottom routes to /chapter/schedule
 * so the user can set their next session without leaving the recap flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import DillyLoadingState from '../../../components/DillyLoadingState';
import { openDillyOverlay } from '../../../hooks/useDillyOverlay';
import { DillyFace } from '../../../components/DillyFace';
import { safeBack } from '../../../lib/navigation';

interface Screen { slot: string; body: string; }
interface Chapter {
  id?: string;
  title: string;
  screens: Screen[];
  count?: number;
  generated_at?: string;
}

// Strip markdown emphasis from LLM-authored body text - bare <Text>
// renders **bold** as literal asterisks, which reads as a glitch.
function stripFormatting(s: string): string {
  if (!s) return '';
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?;:]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?;:]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

const SLOT_LABEL: Record<string, string> = {
  cold_open: 'Opening',
  noticed:   'What Dilly noticed',
  working:   "What's working",
  push_on:   'What to push on',
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
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = await dilly.get('/chapters/current').catch(() => null);
        if (cancelled) return;
        setChapter(cur?.latest || null);
        setSessionCount(cur?.count || 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // On first focus (session just ended, or first open): stay on recap.
  // On every subsequent focus (user re-enters Chapter tab): redirect to
  // prep so pressing Chapter always lands on the waiting/notes screen.
  const hasInitialView = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!hasInitialView.current) {
      hasInitialView.current = true;
      return;
    }
    router.replace('/(app)/chapter/prep' as any);
  }, []));

  const onCardTap = useCallback((slot: string, body: string) => {
    openDillyOverlay({ initialMessage: seedFor(slot, body) });
  }, []);

  const recapCards = useMemo(() => {
    if (!chapter) return [];
    const WANT = new Set(['noticed', 'working', 'push_on', 'one_move', 'question', 'close']);
    return chapter.screens
      .filter(s => WANT.has(s.slot))
      .map(s => ({ ...s, body: stripFormatting(s.body) }));
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
      <View style={[s.emptyContainer, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40 }]}>
        <DillyFace size={110} />
        <Text style={[s.emptyTitle, { color: theme.surface.t1 }]}>No Chapter yet</Text>
        <Text style={[s.emptyBody, { color: theme.surface.t2 }]}>
          Dilly writes your first Chapter at your scheduled time.
        </Text>
        <AnimatedPressable
          style={[s.scheduleBtn, { backgroundColor: theme.accent, marginTop: 28 }]}
          onPress={() => router.push('/(app)/chapter/schedule' as any)}
          scaleDown={0.97}
        >
          <Ionicons name="calendar-outline" size={15} color="#FFF" />
          <Text style={s.scheduleBtnText}>Schedule your Chapter</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 40 }}
    >
      {/* Back / close button - present when pushed from prep screen */}
      <View style={s.topBar}>
        <AnimatedPressable onPress={() => safeBack('/(app)')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </AnimatedPressable>
      </View>

      {/* Header */}
      <View style={s.header}>
        {sessionCount > 0 && (
          <View style={[s.badge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Ionicons name="bookmark" size={10} color={theme.accent} />
            <Text style={[s.badgeText, { color: theme.accent }]}>Chapter {sessionCount}</Text>
          </View>
        )}
        <Text style={[s.eyebrow, { color: theme.accent }]}>YOUR RECAP</Text>
        <Text style={[s.title, { color: theme.surface.t1 }]} numberOfLines={2}>
          {chapter.title}
        </Text>
        <Text style={[s.sub, { color: theme.surface.t3 }]}>
          Tap any card to keep the conversation going with Dilly.
        </Text>
      </View>

      {/* Recap cards */}
      <Text style={[s.sectionTitle, { color: theme.accent }]}>WHAT WE TALKED ABOUT</Text>
      {recapCards.map(scr => (
        <TouchableOpacity
          key={scr.slot}
          activeOpacity={0.85}
          onPress={() => onCardTap(scr.slot, scr.body)}
          style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
        >
          <View style={s.cardHeader}>
            <View style={[s.cardIconBg, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name={SLOT_ICON[scr.slot] || 'ellipse-outline'} size={14} color={theme.accent} />
            </View>
            <Text style={[s.cardLabel, { color: theme.surface.t2 }]}>
              {SLOT_LABEL[scr.slot] || scr.slot}
            </Text>
          </View>
          <Text style={[s.cardBody, { color: theme.surface.t1 }]} numberOfLines={6}>
            {scr.body}
          </Text>
          <View style={s.cardCta}>
            <Text style={[s.cardCtaText, { color: theme.accent }]}>Keep talking</Text>
            <Ionicons name="arrow-forward" size={12} color={theme.accent} />
          </View>
        </TouchableOpacity>
      ))}

      {/* CTAs */}
      <View style={s.ctaBlock}>
        <AnimatedPressable
          scaleDown={0.97}
          onPress={() => router.push('/(app)/chapter/schedule' as any)}
          style={[s.primaryBtn, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="calendar-outline" size={15} color="#FFF" />
          <Text style={s.primaryBtnText}>Schedule next Chapter</Text>
        </AnimatedPressable>

        <AnimatedPressable
          scaleDown={0.97}
          onPress={() => openDillyOverlay({ initialMessage: 'I want to talk to you between Chapters.' })}
          style={[s.secondaryBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
        >
          <Ionicons name="chatbubble-ellipses" size={15} color={theme.accent} />
          <Text style={[s.secondaryBtnText, { color: theme.accent }]}>Talk to Dilly now</Text>
        </AnimatedPressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  emptyContainer: { flex: 1, alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  emptyBody:  { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },

  topBar: { paddingHorizontal: 14, paddingVertical: 6 },

  header: { paddingHorizontal: 20, marginBottom: 18, gap: 5 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
    marginBottom: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, lineHeight: 32 },
  sub:     { fontSize: 13, fontWeight: '600' },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginBottom: 10, marginTop: 4,
  },

  card: {
    marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderRadius: 14, padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardIconBg: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  cardLabel:  { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  cardBody:   { fontSize: 14, lineHeight: 21 },
  cardCta:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  cardCtaText: { fontSize: 11, fontWeight: '800' },

  ctaBlock: { paddingHorizontal: 16, gap: 10, marginTop: 24 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  primaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 14, borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },

  scheduleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12,
  },
  scheduleBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
