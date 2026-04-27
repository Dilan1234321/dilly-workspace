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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showToast } from '../../../lib/globalToast';
import { scheduleChapterNotifications } from '../../../hooks/useChapterNotifications';

interface CalendarEvent {
  id: string; title: string; date: string; type: string;
  notes?: string; reminder_days?: number[]; completedAt?: string;
}

const CAL_EVENTS_KEY = 'dilly_calendar_events_v1';
const SCHED_LATER_KEY = 'dilly_chapter_schedule_later_v1';

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
  const [schedule, setSchedule] = useState<{ day_of_week: number; hour: number } | null>(null);
  // Reschedule prompt state - hidden until the user makes a choice or
  // dismisses. Three outcomes: 'confirmed' (one week from today auto-
  // booked + added to Dilly Calendar), 'later' (flag set so the home
  // tile reflects the deferred state), 'pick' (route to schedule).
  const [rescheduleStatus, setRescheduleStatus] = useState<null | 'confirmed' | 'later'>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [nextChapterDate, setNextChapterDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = await dilly.get('/chapters/current').catch(() => null);
        if (cancelled) return;
        setChapter(cur?.latest || null);
        setSessionCount(cur?.count || 0);
        if (cur?.schedule) setSchedule(cur.schedule);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Reschedule "same time, one week from today" - the path the user
   *  picks 80% of the time. Saves the schedule via existing endpoint,
   *  drops a calendar event into local Dilly Calendar storage so it
   *  shows up in the calendar tab without a round-trip, and clears
   *  any prior "I'll schedule later" deferred-state flag. */
  const confirmOneWeek = useCallback(async () => {
    if (rescheduleBusy) return;
    setRescheduleBusy(true);
    try {
      const day = schedule?.day_of_week ?? 6;
      const hour = schedule?.hour ?? 19;
      // Compute target = today + 7 days at the saved hour.
      const target = new Date();
      target.setDate(target.getDate() + 7);
      target.setHours(hour, 0, 0, 0);
      const dateStr = `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;

      // Persist schedule (so notification scheduler picks it up).
      try {
        await dilly.fetch('/chapters/schedule', {
          method: 'POST',
          body: JSON.stringify({ day_of_week: day, hour }),
        });
      } catch {}
      scheduleChapterNotifications({ day_of_week: day, hour, next_override_at: target.toISOString() }).catch(() => {});

      // Add to local Dilly Calendar so the user sees their next
      // session land in their calendar list.
      try {
        const raw = await AsyncStorage.getItem(CAL_EVENTS_KEY);
        const list: CalendarEvent[] = raw ? JSON.parse(raw) : [];
        const id = 'ch_' + Math.random().toString(36).slice(2, 10);
        list.push({
          id,
          title: 'Chapter with Dilly',
          date: dateStr,
          type: 'custom',
          notes: 'Your weekly Chapter session.',
        });
        await AsyncStorage.setItem(CAL_EVENTS_KEY, JSON.stringify(list));
      } catch {}

      AsyncStorage.removeItem(SCHED_LATER_KEY).catch(() => {});
      setNextChapterDate(dateStr);
      setRescheduleStatus('confirmed');
      showToast({ message: 'Next Chapter is on your calendar.', type: 'success' });
    } finally {
      setRescheduleBusy(false);
    }
  }, [rescheduleBusy, schedule]);

  const deferReschedule = useCallback(async () => {
    try { await AsyncStorage.setItem(SCHED_LATER_KEY, '1'); } catch {}
    setRescheduleStatus('later');
    showToast({ message: 'Saved. The home tile will remind you.', type: 'info' });
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

  /** Pull a slot's body once - the recap maps the LLM's six labelled
   *  beats into specific UI roles, so we look up by slot name instead
   *  of iterating. Returns undefined if the slot is missing or empty. */
  const slot = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of recapCards) m[s.slot] = s.body || '';
    return m;
  }, [recapCards]);

  // Fetch the previous chapter so we can render a "what changed since
  // last time" delta - one of the things that turns a list of slot
  // bodies into a feeling of "Dilly remembers and is tracking me."
  const [previousChapter, setPreviousChapter] = useState<Chapter | null>(null);
  useEffect(() => {
    if (!chapter || sessionCount < 2) return;
    let cancelled = false;
    (async () => {
      try {
        const list: any = await dilly.get('/chapters/list?limit=2').catch(() => null);
        const items: any[] = Array.isArray(list?.items)
          ? list.items
          : Array.isArray(list?.chapters)
          ? list.chapters
          : Array.isArray(list)
          ? list
          : [];
        if (cancelled) return;
        // Find the entry whose id is NOT the current chapter (the
        // previous one). API may return newest-first or oldest-first;
        // either way we filter by !== current id.
        const prev = items.find((c) => c?.id && chapter?.id && c.id !== chapter.id);
        if (prev) setPreviousChapter(prev as Chapter);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [chapter, sessionCount]);

  /** Compare the One Move from this Chapter to last Chapter's commitment
   *  to render a one-line "what changed" beat. Safe-fallback to a generic
   *  cadence line when we don't have a previous Chapter (first session
   *  or fetch failed). Pure prose; the LLM didn't write this - we did,
   *  so it's stable in tone. */
  const whatChanged = useMemo(() => {
    if (!previousChapter || !chapter) return null;
    const prevSlots: Record<string, string> = {};
    for (const s of (previousChapter.screens || [])) {
      if (s?.slot) prevSlots[s.slot] = stripFormatting(s.body || '');
    }
    const prevMove = prevSlots.one_move || '';
    const thisMove = slot.one_move || '';
    if (!prevMove || !thisMove) return null;
    // Truncate both to a clean snippet so the beat reads as one line.
    const trim = (s: string) => {
      const cleaned = s.split(/(?<=[.!?])\s+/)[0] || s;
      return cleaned.length > 90 ? cleaned.slice(0, 87) + '...' : cleaned;
    };
    return { prev: trim(prevMove), now: trim(thisMove) };
  }, [previousChapter, chapter, slot]);

  /** A short, declarative line that opens the recap - pulled from the
   *  'noticed' slot and trimmed to one sentence. Sets the tone before
   *  the user reads anything else. */
  const headlineInsight = useMemo(() => {
    const raw = slot.noticed || '';
    if (!raw) return null;
    const first = raw.split(/(?<=[.!?])\s+/)[0] || raw;
    return first.length > 200 ? first.slice(0, 197) + '...' : first;
  }, [slot]);

  /** The closing line - whatever Dilly wrote in the close slot - styled
   *  as a pulled quote attributed back to the user (or to Dilly if it
   *  reads more like Dilly's voice). Last beat the user reads, designed
   *  to stick. */
  const closingLine = useMemo(() => {
    const raw = slot.close || '';
    if (!raw) return null;
    return raw.length > 220 ? raw.slice(0, 217) + '...' : raw;
  }, [slot]);

  /** Break the One Move body into a 2-3 step micro-plan when the LLM
   *  authored a multi-sentence move. Each step renders as a numbered
   *  row so the user has something concrete to act on, not a paragraph
   *  to re-read. Falls back to rendering the move as a single block
   *  when there isn't natural sentence structure to split on. */
  const oneMoveSteps = useMemo(() => {
    const raw = slot.one_move || '';
    if (!raw) return null;
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 12);
    if (sentences.length < 2) return { headline: raw, steps: [] };
    // First sentence is the headline; the next 2-3 are steps.
    return {
      headline: sentences[0],
      steps: sentences.slice(1, 4),
    };
  }, [slot]);

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
      </View>

      {/* Headline insight - the one sentence Dilly wants you to walk
          away with this week. Pulled from the 'noticed' slot and
          rendered as a pulled quote with a bold accent bar so it
          reads as the thesis of the session, not a list item. */}
      {headlineInsight ? (
        <View style={[s.insightCard, { backgroundColor: theme.surface.s1, borderColor: theme.accent }]}>
          <View style={[s.insightAccent, { backgroundColor: theme.accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.insightEyebrow, { color: theme.accent }]}>WHAT DILLY NOTICED</Text>
            <Text style={[s.insightBody, { color: theme.surface.t1 }]}>{headlineInsight}</Text>
          </View>
        </View>
      ) : null}

      {/* What changed since last time - render only when we found a
          previous Chapter and both have a One Move. The delta is what
          turns "list of slots" into "Dilly is tracking my growth" -
          the user sees their old commitment alongside the new one and
          feels the throughline. */}
      {whatChanged ? (
        <View style={[s.changedCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <View style={s.changedHeader}>
            <Ionicons name="git-compare" size={14} color={theme.accent} />
            <Text style={[s.changedEyebrow, { color: theme.accent }]}>WHAT CHANGED SINCE LAST TIME</Text>
          </View>
          <View style={s.changedRow}>
            <Text style={[s.changedFromLabel, { color: theme.surface.t3 }]}>LAST WEEK</Text>
            <Text style={[s.changedFromBody, { color: theme.surface.t2 }]}>{whatChanged.prev}</Text>
          </View>
          <View style={[s.changedDivider, { backgroundColor: theme.surface.border }]} />
          <View style={s.changedRow}>
            <Text style={[s.changedToLabel, { color: theme.accent }]}>THIS WEEK</Text>
            <Text style={[s.changedToBody, { color: theme.surface.t1 }]}>{whatChanged.now}</Text>
          </View>
        </View>
      ) : null}

      {/* The Move - bold framed card with concrete steps if the LLM
          gave us multi-sentence content to break down. This is THE
          beat the user is supposed to leave with, so it gets the
          biggest visual weight and a tap-to-act primary CTA. */}
      {oneMoveSteps ? (
        <View style={[s.moveCard, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
          <Text style={[s.moveEyebrow, { color: '#FFFFFF', opacity: 0.85 }]}>YOUR ONE MOVE</Text>
          <Text style={[s.moveHeadline, { color: '#FFFFFF' }]}>{oneMoveSteps.headline}</Text>
          {oneMoveSteps.steps.length > 0 ? (
            <View style={s.moveSteps}>
              {oneMoveSteps.steps.map((step, i) => (
                <View key={i} style={s.moveStepRow}>
                  <View style={s.moveStepNum}>
                    <Text style={s.moveStepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={s.moveStepText}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <AnimatedPressable
            style={s.moveCta}
            onPress={() => onCardTap('one_move', slot.one_move || '')}
            scaleDown={0.97}
          >
            <Ionicons name="chatbubbles" size={13} color="#FFFFFF" />
            <Text style={s.moveCtaText}>Plan it with Dilly</Text>
          </AnimatedPressable>
        </View>
      ) : null}

      {/* Strongest signal + biggest exposure - compact two-card block.
          Working = green-tinted "you're doing this right." Push_on =
          coral-tinted "this is where the gap is." Tap to chat. */}
      {(slot.working || slot.push_on) ? (
        <View style={s.signalsRow}>
          {slot.working ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onCardTap('working', slot.working)}
              style={[s.signalCard, { backgroundColor: theme.surface.s1, borderColor: '#10B98155' }]}
            >
              <View style={s.signalHeader}>
                <Ionicons name="trending-up" size={12} color="#10B981" />
                <Text style={[s.signalLabel, { color: '#10B981' }]}>STRONGEST SIGNAL</Text>
              </View>
              <Text style={[s.signalBody, { color: theme.surface.t1 }]} numberOfLines={5}>
                {slot.working}
              </Text>
            </TouchableOpacity>
          ) : null}
          {slot.push_on ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onCardTap('push_on', slot.push_on)}
              style={[s.signalCard, { backgroundColor: theme.surface.s1, borderColor: '#F59E0B55' }]}
            >
              <View style={s.signalHeader}>
                <Ionicons name="alert-circle" size={12} color="#F59E0B" />
                <Text style={[s.signalLabel, { color: '#F59E0B' }]}>WHERE TO PUSH</Text>
              </View>
              <Text style={[s.signalBody, { color: theme.surface.t1 }]} numberOfLines={5}>
                {slot.push_on}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* The line to sit with - rendered as a large quoted question.
          Italic, generous line height, accent quotation marks. This
          is the beat designed to stay with the user during the week. */}
      {slot.question ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onCardTap('question', slot.question)}
          style={[s.questionCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
        >
          <Text style={[s.questionEyebrow, { color: theme.surface.t3 }]}>SIT WITH THIS</Text>
          <View style={s.questionQuoteRow}>
            <Text style={[s.questionMark, { color: theme.accent }]}>{'“'}</Text>
            <Text style={[s.questionBody, { color: theme.surface.t1 }]}>{slot.question}</Text>
            <Text style={[s.questionMarkClose, { color: theme.accent }]}>{'”'}</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Closing line - intimate, smaller, italic. The session's last
          beat. No cta on this one - it's meant to be read once and
          carried, not tapped. */}
      {closingLine ? (
        <View style={[s.closingCard, { backgroundColor: theme.surface.bg, borderColor: theme.surface.border }]}>
          <Text style={[s.closingLabel, { color: theme.surface.t3 }]}>BEFORE YOU GO</Text>
          <Text style={[s.closingBody, { color: theme.surface.t1 }]}>{closingLine}</Text>
        </View>
      ) : null}

      {/* Reschedule prompt - the most important moment after a Chapter
          ends. Three outcomes: book one week from today (the default
          for almost everyone), pick a different day, or "later". The
          one-week path also drops the session into Dilly Calendar so
          the user can see their next sit-down land in their schedule. */}
      <View style={[s.rescheduleCard, {
        backgroundColor: theme.accentSoft,
        borderColor: theme.accent,
      }]}>
        {rescheduleStatus === 'confirmed' ? (
          <>
            <View style={s.rescheduleHeaderRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
              <Text style={[s.rescheduleEyebrow, { color: theme.accent }]}>NEXT CHAPTER LOCKED IN</Text>
            </View>
            <Text style={[s.rescheduleTitle, { color: theme.surface.t1 }]}>
              {nextChapterDate
                ? new Date(nextChapterDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                : 'One week from today'}
            </Text>
            <Text style={[s.rescheduleSub, { color: theme.surface.t2 }]}>
              Added to your Dilly Calendar. We'll write you a fresh Chapter then.
            </Text>
          </>
        ) : rescheduleStatus === 'later' ? (
          <>
            <View style={s.rescheduleHeaderRow}>
              <Ionicons name="time-outline" size={18} color={theme.accent} />
              <Text style={[s.rescheduleEyebrow, { color: theme.accent }]}>WE'LL CHECK BACK</Text>
            </View>
            <Text style={[s.rescheduleTitle, { color: theme.surface.t1 }]}>
              No pressure - we'll remind you on Home.
            </Text>
            <Text style={[s.rescheduleSub, { color: theme.surface.t2 }]}>
              Tap the Chapter card any time you're ready to schedule the next one.
            </Text>
          </>
        ) : (
          <>
            <View style={s.rescheduleHeaderRow}>
              <Ionicons name="calendar" size={18} color={theme.accent} />
              <Text style={[s.rescheduleEyebrow, { color: theme.accent }]}>BOOK YOUR NEXT CHAPTER</Text>
            </View>
            <Text style={[s.rescheduleTitle, { color: theme.surface.t1 }]}>
              Same time next week?
            </Text>
            <Text style={[s.rescheduleSub, { color: theme.surface.t2 }]}>
              Most people keep their cadence. We can put it on your calendar right now so you never have to think about it.
            </Text>
            <View style={s.rescheduleActions}>
              <AnimatedPressable
                onPress={confirmOneWeek}
                disabled={rescheduleBusy}
                scaleDown={0.97}
                style={[s.reschedulePrimary, { backgroundColor: theme.accent }, rescheduleBusy && { opacity: 0.6 }]}
              >
                <Ionicons name="checkmark" size={15} color="#FFF" />
                <Text style={s.reschedulePrimaryText}>Yes - same time next week</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => router.push('/(app)/chapter/schedule' as any)}
                scaleDown={0.97}
                style={[s.rescheduleSecondary, { borderColor: theme.accent }]}
              >
                <Ionicons name="calendar-outline" size={14} color={theme.accent} />
                <Text style={[s.rescheduleSecondaryText, { color: theme.accent }]}>Pick a different day</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={deferReschedule}
                scaleDown={0.97}
                style={s.rescheduleTertiary}
              >
                <Text style={[s.rescheduleTertiaryText, { color: theme.surface.t3 }]}>I'll schedule later</Text>
              </AnimatedPressable>
            </View>
          </>
        )}
      </View>

      <View style={s.ctaBlock}>
        <AnimatedPressable
          scaleDown={0.97}
          onPress={() => openDillyOverlay({ initialMessage: 'I want to keep talking about my last Chapter.' })}
          style={[s.secondaryBtn, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
        >
          <Ionicons name="chatbubble-ellipses" size={15} color={theme.accent} />
          <Text style={[s.secondaryBtnText, { color: theme.accent }]}>Keep talking with Dilly</Text>
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

  // ── Headline insight ─────────────────────────────────────────────
  insightCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  insightAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  insightEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  insightBody: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 26,
    letterSpacing: -0.3,
  },

  // ── What changed ─────────────────────────────────────────────────
  changedCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  changedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  changedEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  changedRow: {
    gap: 4,
  },
  changedFromLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  changedFromBody: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  changedToLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  changedToBody: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  changedDivider: {
    height: 1,
    marginVertical: 10,
  },

  // ── One Move (the big move) ──────────────────────────────────────
  moveCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  moveEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  moveHeadline: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  moveSteps: {
    marginTop: 6,
    gap: 10,
  },
  moveStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  moveStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveStepNumText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  moveStepText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    opacity: 0.95,
  },
  moveCta: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  moveCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  // ── Strongest signal + Where to push (two-card row) ──────────────
  signalsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  signalCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    gap: 8,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  signalLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  signalBody: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },

  // ── Question to sit with ─────────────────────────────────────────
  questionCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  questionEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  questionQuoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  questionMark: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: -6,
  },
  questionMarkClose: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: -6,
    alignSelf: 'flex-end',
  },
  questionBody: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    fontStyle: 'italic',
    letterSpacing: -0.2,
  },

  // ── Closing line ─────────────────────────────────────────────────
  closingCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
  },
  closingLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  closingBody: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    fontStyle: 'italic',
  },

  rescheduleCard: {
    marginHorizontal: 16,
    marginTop: 26,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    gap: 6,
  },
  rescheduleHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  rescheduleEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  rescheduleTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, lineHeight: 24 },
  rescheduleSub: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  rescheduleActions: { gap: 8, marginTop: 14 },
  reschedulePrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 12,
  },
  reschedulePrimaryText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },
  rescheduleSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, borderRadius: 12, borderWidth: 1,
  },
  rescheduleSecondaryText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
  rescheduleTertiary: { paddingVertical: 8, alignItems: 'center' },
  rescheduleTertiaryText: { fontSize: 12, fontWeight: '600' },

  ctaBlock: { paddingHorizontal: 16, gap: 10, marginTop: 18 },
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
