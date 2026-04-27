/**
 * ChapterV2Screen - The V2 Chapter advisor 5-screen arc.
 *
 * Session flow (standard, 5 screens):
 *   Screen 1 - Welcome back      (warm / attentive)
 *   Screen 2 - What's on your mind (thoughtful / concerned)
 *   Screen 3 - Here's what I'm seeing (focused / confident)
 *   Screen 4 - Let's pick one thing  (direct)
 *   Screen 5 - Recap & commit        (settled / proud)
 *
 * First-session flow inserts Screen 0 (Intake) before Screen 1 - 6 total.
 *
 * Mobile renders what the API returns. No persona logic client-side.
 * DillyFace mood comes from the `dilly_mood` field in every API response.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../lib/dilly';
import { useResolvedTheme } from '../hooks/useTheme';
import { DillyFace } from './DillyFace';
import type { DillyMood } from './DillyFace';
import AnimatedPressable from './AnimatedPressable';

// ─── Types ────────────────────────────────────────────────────────────

interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface RecapData {
  recapId: string;
  headline: string;
  observations: string[];
  commitment: string;
  commitmentDeadline: string | null;
  betweenSessionsPrompt: string;
  nextChapterAt: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────

const CHARS_PER_SEC = 38;
const PUNCT_PAUSE: Record<string, number> = {
  '.': 260, '!': 300, '?': 300, ',': 120,
  ';': 160, ':': 160, '-': 200, '\n': 320,
};

const SCREEN_LABEL: Record<number, string> = {
  0: 'Getting to know you',
  1: 'Welcome back',
  2: "What's on your mind",
  3: "Here's what I'm seeing",
  4: "Let's pick one thing",
  5: 'Closing thoughts',
  6: 'Recap',
};

// Fallback DillyFace mood per screen if the API doesn't send one.
const SCREEN_MOOD: Record<number, DillyMood> = {
  0: 'open',
  1: 'warm',
  2: 'thoughtful',
  3: 'focused',
  4: 'direct',
  5: 'settled',
  6: 'settled',
};

const VALID_MOODS = new Set<string>([
  'idle', 'happy', 'thinking', 'curious', 'celebrating', 'concerned',
  'sleeping', 'proud', 'writing',
  'warm', 'attentive', 'thoughtful', 'focused', 'confident', 'direct', 'settled', 'open',
]);

function parseMood(raw?: string, fallback: DillyMood = 'curious'): DillyMood {
  return raw && VALID_MOODS.has(raw) ? (raw as DillyMood) : fallback;
}

let _msgCounter = 0;
const nextMsgId = () => ++_msgCounter;

// LLM responses sometimes include markdown emphasis (**bold**, *italic*,
// _underscore_) and stray heading hashes that read as literal characters
// in <Text>. Strip them at the API boundary so neither the typewriter
// nor the recap card ever surfaces formatting marks. Backticks are
// stripped too since chapter copy is conversational, not code.
function stripFormatting(s: string): string {
  if (!s) return '';
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')   // ***bold-italic***
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold**
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?;:]|$)/g, '$1$2') // *italic*
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?;:]|$)/g, '$1$2')   // _italic_
    .replace(/`([^`]+)`/g, '$1')           // `code`
    .replace(/^#{1,6}\s+/gm, '')           // ### heading
    .replace(/^[ \t]*[-*+]\s+/gm, '')      // - bullets
    .trim();
}

// ─── RecapCard ────────────────────────────────────────────────────────

function RecapCard({
  recap,
  theme,
}: {
  recap: RecapData;
  theme: ReturnType<typeof useResolvedTheme>;
}) {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const nextAt = recap.nextChapterAt ? new Date(recap.nextChapterAt) : null;
  const nextStr = nextAt
    ? nextAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' · ' +
      nextAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  const deadlineDate = recap.commitmentDeadline
    ? new Date(recap.commitmentDeadline)
    : null;
  const deadlineStr = deadlineDate
    ? deadlineDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : null;

  return (
    <View style={[rc.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      <Text style={[rc.date, { color: theme.surface.t3 }]}>
        CHAPTER RECAP - {today.toUpperCase()}
      </Text>
      <View style={[rc.rule, { backgroundColor: theme.surface.border }]} />

      <Text style={[rc.label, { color: theme.accent }]}>WHERE YOU ARE</Text>
      <Text style={[rc.body, { color: theme.surface.t1 }]}>{recap.headline}</Text>

      <Text style={[rc.label, { color: theme.accent }]}>DILLY NOTICED</Text>
      {recap.observations.map((obs, i) => (
        <View key={i} style={rc.bulletRow}>
          <Text style={[rc.bullet, { color: theme.accent }]}>•</Text>
          <Text style={[rc.body, { color: theme.surface.t2, flex: 1 }]}>{obs}</Text>
        </View>
      ))}

      <Text style={[rc.label, { color: theme.accent }]}>THIS WEEK</Text>
      <Text style={[rc.commitment, { color: theme.surface.t1 }]}>{recap.commitment}</Text>
      {deadlineStr && (
        <View style={rc.deadlineRow}>
          <Ionicons name="calendar-outline" size={12} color={theme.surface.t3} />
          <Text style={[rc.deadlineText, { color: theme.surface.t3 }]}>Due {deadlineStr}</Text>
        </View>
      )}

      <Text style={[rc.label, { color: theme.accent }]}>BETWEEN SESSIONS</Text>
      <Text style={[rc.body, { color: theme.surface.t2 }]}>{recap.betweenSessionsPrompt}</Text>

      {nextStr && (
        <>
          <Text style={[rc.label, { color: theme.accent }]}>NEXT CHAPTER</Text>
          <View style={rc.nextRow}>
            <Ionicons name="time-outline" size={13} color={theme.surface.t3} />
            <Text style={[rc.body, { color: theme.surface.t2 }]}>{nextStr}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const rc = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 8 },
  date: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  rule: { height: 1, marginVertical: 2 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 1.8, marginTop: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  bullet: { fontSize: 14, fontWeight: '900', marginTop: 0 },
  commitment: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  deadlineRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 },
  deadlineText: { fontSize: 12, fontWeight: '600' },
  nextRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 },
});

// ─── ChapterV2Screen ──────────────────────────────────────────────────

export default function ChapterV2Screen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const scrollRef = useRef<ScrollView>(null);

  // Typing animation state
  const typeRafRef = useRef<number>(0);
  const typingFullRef = useRef<string>('');

  // Phase
  type Phase = 'loading' | 'error' | 'session';
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // Session
  const sessionIdRef = useRef<string | null>(null);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [screensTotal, setScreensTotal] = useState(5);

  // Current screen
  const [screenIndex, setScreenIndex] = useState(1);
  const [screenMood, setScreenMood] = useState<DillyMood>('warm');
  const [turnCount, setTurnCount] = useState(0);
  const [turnMax, setTurnMax] = useState(5);
  const [canAdvance, setCanAdvance] = useState(false);

  // Messages + typing
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [typingText, setTypingText] = useState<string | null>(null); // null = not typing
  const isTyping = typingText !== null;

  // Input
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [chatBlocked, setChatBlocked] = useState<string | null>(null);

  // Screen 4 commitment
  const [commitment, setCommitment] = useState<string | null>(null);

  // Screen 5 recap
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const recapCalledRef = useRef(false);

  // Fade-in animation per screen
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ─── Typing helpers ─────────────────────────────────────────────

  function stopTyping() {
    if (typeRafRef.current) {
      cancelAnimationFrame(typeRafRef.current);
      typeRafRef.current = 0;
    }
  }

  function finishTypingNow() {
    stopTyping();
    const full = typingFullRef.current;
    // Commit the full text to the last assistant message
    setMessages(prev => {
      const lastAssistantIdx = prev.reduce(
        (acc, m, i) => (m.role === 'assistant' ? i : acc), -1,
      );
      if (lastAssistantIdx < 0) return prev;
      const updated = [...prev];
      updated[lastAssistantIdx] = { ...updated[lastAssistantIdx], content: full };
      return updated;
    });
    setTypingText(null);
  }

  function typeMessage(text: string, msgId: number, onDone?: () => void) {
    stopTyping();
    typingFullRef.current = text;
    setTypingText('');

    const startMs = Date.now();
    let cursor = 0;
    let pausedUntilMs = 0;
    let totalPauseMs = 0;

    const tick = () => {
      const now = Date.now();
      if (now < pausedUntilMs) {
        typeRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const activeMs = now - startMs - totalPauseMs;
      const desired = Math.min(
        text.length,
        Math.floor((activeMs * CHARS_PER_SEC) / 1000),
      );
      if (desired > cursor) {
        let next = cursor;
        while (next < desired) {
          next++;
          const ch = text[next - 1];
          const pause = PUNCT_PAUSE[ch];
          const nc = text[next];
          const isBoundary = !nc || nc === ' ' || nc === '\n';
          if (pause && isBoundary && next < text.length) {
            cursor = next;
            pausedUntilMs = now + pause;
            totalPauseMs += pause;
            break;
          }
        }
        if (next >= desired) cursor = desired;
        setTypingText(text.slice(0, cursor));
      }
      if (cursor >= text.length) {
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: text } : m)),
        );
        setTypingText(null);
        onDone?.();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
        return;
      }
      typeRafRef.current = requestAnimationFrame(tick);
    };
    typeRafRef.current = requestAnimationFrame(tick);
  }

  // Add a new assistant message and start typing it.
  function addAndTypeAssistant(text: string, onDone?: () => void) {
    const id = nextMsgId();
    setMessages(prev => [...prev, { id, role: 'assistant', content: '' }]);
    setTimeout(() => typeMessage(text, id, onDone), 16);
  }

  // Transition to a new screen: clear messages, update screen state, fade in.
  function transitionToScreen(
    idx: number,
    mood: DillyMood,
    openingText: string,
    newTurnMax = 5,
  ) {
    stopTyping();
    setMessages([]);
    setTypingText(null);
    setTurnCount(0);
    setTurnMax(newTurnMax);
    setCanAdvance(false);
    setChatBlocked(null);
    setScreenIndex(idx);
    setScreenMood(mood);

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const id = nextMsgId();
    setMessages([{ id, role: 'assistant', content: '' }]);
    setTimeout(() => typeMessage(openingText, id), 32);
  }

  // ─── Session start ──────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const res = await dilly.fetch('/chapter/start', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error('start failed');
        const d = await res.json();

        sessionIdRef.current = d.session_id;
        setIsFirstSession(!!d.is_first_session);
        setScreensTotal(d.screens_total ?? 6);

        const si: number = d.current_screen ?? 1;
        const mood = parseMood(d.dilly_mood, SCREEN_MOOD[si] ?? 'warm');
        setTurnMax(si === 6 ? 0 : si === 5 ? 3 : 5);
        setPhase('session');
        transitionToScreen(si, mood, stripFormatting(d.opening_message || ''));
      } catch {
        setErrorMsg('Could not start your Chapter session. Please try again.');
        setPhase('error');
      }
    })();

    return () => stopTyping();
    // Intentionally runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-complete when Screen 5 loads ─────────────────────────

  useEffect(() => {
    if (
      phase !== 'session' ||
      screenIndex !== 6 ||
      !commitment ||
      recapCalledRef.current
    ) return;

    recapCalledRef.current = true;
    setRecapLoading(true);
    const sid = sessionIdRef.current;
    if (!sid) { setRecapLoading(false); return; }

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    const deadlineStr = deadline.toISOString().slice(0, 10);

    (async () => {
      try {
        const res = await dilly.fetch(`/chapter/${sid}/complete`, {
          method: 'POST',
          body: JSON.stringify({
            commitment,
            commitment_deadline: deadlineStr,
          }),
        });
        if (!res.ok) throw new Error('complete failed');
        const d = await res.json();
        setRecap({
          recapId: d.recap_id || '',
          headline: stripFormatting(d.recap?.headline || ''),
          observations: Array.isArray(d.recap?.observations)
            ? d.recap.observations.map((o: any) => stripFormatting(String(o || '')))
            : [],
          commitment: stripFormatting(d.recap?.commitment || commitment),
          commitmentDeadline: d.recap?.commitment_deadline || null,
          betweenSessionsPrompt: stripFormatting(d.recap?.between_sessions_prompt || ''),
          nextChapterAt: d.next_chapter_at || null,
        });
      } catch {
        // Non-fatal - recap card just won't render.
      } finally {
        setRecapLoading(false);
      }
    })();
  }, [phase, screenIndex, commitment]);

  // ─── Send message ────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending || isTyping || !sessionIdRef.current) return;

    setInput('');
    const userMsgId = nextMsgId();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setIsSending(true);

    try {
      const res = await dilly.fetch(
        `/chapter/${sessionIdRef.current}/screen/${screenIndex}/message`,
        { method: 'POST', body: JSON.stringify({ content: text }) },
      );
      if (!res.ok) {
        const blocked =
          res.status === 402 || res.status === 429
            ? "You've reached the turn limit - tap Continue to move on."
            : 'Dilly stepped away. Tap Continue when ready.';
        setChatBlocked(blocked);
        return;
      }
      const d = await res.json();
      setTurnCount(d.screen_turn_count ?? turnCount + 1);
      setTurnMax(d.screen_turn_max ?? turnMax);
      setCanAdvance(!!d.can_advance);
      setScreenMood(parseMood(d.dilly_mood, screenMood));
      addAndTypeAssistant(stripFormatting(d.content || ''));
    } catch {
      setChatBlocked('Dilly stepped away. Tap Continue when ready.');
    } finally {
      setIsSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isSending, isTyping, screenIndex, turnCount, turnMax, screenMood]);

  // ─── Advance to next screen ─────────────────────────────────────

  const advance = useCallback(async () => {
    // If still typing, skip animation on first tap; second tap will advance.
    if (isTyping) {
      finishTypingNow();
      return;
    }

    // Screen 6: close back to recap surface.
    if (screenIndex === 6) {
      router.replace('/(app)/chapter/recap' as any);
      return;
    }

    // Screen 4: require canAdvance or atTurnLimit; capture commitment.
    const atLimit = turnCount >= turnMax;
    if (screenIndex === 4 && !canAdvance && !atLimit) return;

    if (screenIndex === 4) {
      const lastDilly = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastDilly?.content) setCommitment(stripFormatting(lastDilly.content));
    }

    if (!sessionIdRef.current) return;
    setIsAdvancing(true);
    try {
      const res = await dilly.fetch(
        `/chapter/${sessionIdRef.current}/screen/${screenIndex}/advance`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (!res.ok) throw new Error('advance failed');
      const d = await res.json();

      const nextIdx: number = d.next_screen ?? screenIndex + 1;
      const mood = parseMood(d.dilly_mood, SCREEN_MOOD[nextIdx] ?? 'warm');
      const nextTurnMax = nextIdx === 6 ? 0 : nextIdx === 5 ? 3 : 5;
      transitionToScreen(nextIdx, mood, stripFormatting(d.opening_message || ''), nextTurnMax);
    } catch {
      setChatBlocked('Could not continue. Please try again.');
    } finally {
      setIsAdvancing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, screenIndex, canAdvance, turnCount, turnMax, messages]);

  // ─── Derived ────────────────────────────────────────────────────

  const isScreen4 = screenIndex === 4;
  const isScreen5 = screenIndex === 5;
  const isScreen6 = screenIndex === 6;
  const atTurnLimit = turnCount >= turnMax;
  const canSend = !!input.trim() && !isSending && !isTyping && !chatBlocked && !isAdvancing;

  // The last assistant message ID drives typingText display.
  const lastAssistantId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return -1;
  })();

  // Advance button visibility + label
  const needsAdvance =
    isScreen6 || isTyping || canAdvance || atTurnLimit ||
    (screenIndex <= 3 || isScreen5) || // screens 0-3 and closing screen always show continue
    isAdvancing;

  const advanceLabel = (() => {
    if (isTyping || isAdvancing) return isAdvancing ? 'One moment…' : 'Skip typing';
    if (isScreen6) return 'Close session';
    if (isScreen4 && canAdvance) return "Yes, I'll do this";
    if (screenIndex === 1) return "Let's get into it →";
    return 'Continue →';
  })();

  const faceSize = screenIndex === 0 || isScreen6 ? 110 : 90;
  const faceMood: DillyMood =
    isTyping || isAdvancing ? 'writing' : screenMood;
  const faceAccessory =
    isTyping || isAdvancing ? 'pencil' : 'none';

  // ─── Loading ──────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View
        style={[
          s.fill,
          {
            backgroundColor: theme.surface.bg,
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: insets.top,
          },
        ]}
      >
        <DillyFace size={120} mood="writing" accessory="pencil" />
        <Text style={[s.loadingText, { color: theme.surface.t2, marginTop: 28 }]}>
          Dilly is getting ready…
        </Text>
      </View>
    );
  }

  // ─── Error ───────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <View
        style={[
          s.fill,
          {
            backgroundColor: theme.surface.bg,
            paddingTop: insets.top + 40,
            paddingHorizontal: 32,
            alignItems: 'center',
          },
        ]}
      >
        <Ionicons name="moon" size={32} color={theme.surface.t3} />
        <Text style={[s.errorText, { color: theme.surface.t1 }]}>{errorMsg}</Text>
        <AnimatedPressable
          style={[s.closeBtn, { backgroundColor: theme.accent, marginTop: 24 }]}
          onPress={() => router.back()}
          scaleDown={0.97}
        >
          <Text style={s.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  // ─── Session ─────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        s.fill,
        { backgroundColor: theme.surface.bg, paddingTop: insets.top + 10 },
      ]}
    >
      {/* Top bar */}
      <View style={s.topBar}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="close" size={22} color={theme.surface.t3} />
        </AnimatedPressable>
        <Text style={[s.topLabel, { color: theme.surface.t2 }]}>CHAPTER</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress dots */}
      <View style={s.dotsRow}>
        {Array.from({ length: screensTotal }, (_, dotI) => {
          // For first session the dots are 0-based; for regular, 1-based.
          const dotScreenIdx = isFirstSession ? dotI : dotI + 1;
          const filled = dotScreenIdx <= screenIndex;
          const active = dotScreenIdx === screenIndex;
          return (
            <View
              key={dotI}
              style={[
                s.dot,
                { backgroundColor: filled ? theme.accent : theme.surface.s2 },
                active && { width: 14 },
              ]}
            />
          );
        })}
      </View>

      {/* Screen label */}
      <Text style={[s.screenLabel, { color: theme.accent }]} numberOfLines={1}>
        {(SCREEN_LABEL[screenIndex] || '').toUpperCase()}
      </Text>

      {/* Body scroll */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* DillyFace - fades in on each screen transition */}
        <Animated.View style={[s.faceWrap, { opacity: fadeAnim }]}>
          <DillyFace size={faceSize} mood={faceMood} accessory={faceAccessory} />
        </Animated.View>

        {/* Screen 0 intake progress bar */}
        {screenIndex === 0 && (
          <View style={s.intakeWrap}>
            <View style={[s.intakeTrack, { backgroundColor: theme.surface.s2 }]}>
              <View
                style={[
                  s.intakeFill,
                  {
                    backgroundColor: theme.accent,
                    width: `${Math.min(100, Math.round(((turnCount + 1) / 5) * 100))}%` as any,
                  },
                ]}
              />
            </View>
            <Text style={[s.intakeCaption, { color: theme.surface.t3 }]}>
              Question {Math.min(5, turnCount + 1)} of 5
            </Text>
          </View>
        )}

        {/* Messages */}
        <View style={s.messagesCol}>
          {messages.map(msg => {
            const showTypingCursor = isTyping && msg.id === lastAssistantId;
            const content = showTypingCursor ? (typingText ?? '') : msg.content;

            if (msg.role === 'assistant') {
              return (
                <View key={msg.id} style={s.assistantBubble}>
                  <Text
                    style={[
                      s.assistantText,
                      {
                        color: theme.surface.t1,
                        fontSize: screenIndex <= 1 ? 22 : 17,
                        fontWeight: screenIndex <= 1 ? '700' : '500',
                        lineHeight: screenIndex <= 1 ? 30 : 25,
                      },
                    ]}
                  >
                    {content}
                    {showTypingCursor ? (
                      <Text style={{ color: theme.accent }}>▍</Text>
                    ) : null}
                  </Text>
                </View>
              );
            }

            return (
              <View
                key={msg.id}
                style={[s.userBubble, { backgroundColor: theme.accent }]}
              >
                <Text style={s.userText}>{content}</Text>
              </View>
            );
          })}

          {chatBlocked ? (
            <Text style={[s.blocked, { color: theme.surface.t3 }]}>{chatBlocked}</Text>
          ) : null}

          {/* Screen 4: commitment preview card when Dilly has proposed an action */}
          {isScreen4 && canAdvance && !isTyping && messages.length > 0 && (
            <View
              style={[
                s.commitCard,
                { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
              ]}
            >
              <View style={s.commitHeader}>
                <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
                <Text style={[s.commitLabel, { color: theme.accent }]}>
                  PROPOSED ACTION
                </Text>
              </View>
              <Text style={[s.commitBody, { color: theme.surface.t1 }]}>
                {messages.filter(m => m.role === 'assistant').at(-1)?.content ?? ''}
              </Text>
            </View>
          )}

          {/* Screen 6: recap card */}
          {isScreen6 && (
            <View style={{ marginTop: 20 }}>
              {recapLoading && !recap ? (
                <View
                  style={[
                    s.recapLoadingBox,
                    { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 },
                  ]}
                >
                  <DillyFace size={48} mood="writing" accessory="pencil" />
                  <Text style={[s.loadingText, { color: theme.surface.t2, marginTop: 12 }]}>
                    Writing your recap…
                  </Text>
                </View>
              ) : recap ? (
                <RecapCard recap={recap} theme={theme} />
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Chat input - hidden on Screen 6 (recap) and when blocked/at limit */}
      {!isScreen6 && !chatBlocked && !atTurnLimit && (
        <View
          style={[
            s.inputBar,
            {
              backgroundColor: theme.surface.s1,
              borderTopColor: theme.surface.border,
              paddingBottom: Math.max(8, insets.bottom),
            },
          ]}
        >
          <View
            style={[
              s.inputWrap,
              {
                backgroundColor: theme.surface.bg,
                borderColor: canSend ? theme.accent : theme.surface.border,
              },
            ]}
          >
            <TextInput
              style={[s.inputField, { color: theme.surface.t1 }]}
              value={input}
              onChangeText={setInput}
              placeholder={isSending ? 'Dilly is thinking…' : 'Your message…'}
              placeholderTextColor={theme.surface.t3}
              editable={!isSending && !isTyping && !isAdvancing}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              multiline
              maxLength={400}
            />
            <AnimatedPressable
              onPress={sendMessage}
              disabled={!canSend}
              scaleDown={0.9}
              style={[s.sendBtn, { backgroundColor: canSend ? theme.accent : theme.surface.s2 }]}
              hitSlop={6}
            >
              <Ionicons
                name="arrow-up"
                size={16}
                color={canSend ? '#fff' : theme.surface.t3}
              />
            </AnimatedPressable>
          </View>
          {turnMax > 0 && (
            <Text style={[s.turnCounter, { color: theme.surface.t3 }]}>
              {Math.max(0, turnMax - turnCount)}{' '}
              {turnMax - turnCount === 1 ? 'turn' : 'turns'} left on this screen
            </Text>
          )}
        </View>
      )}

      {/* Bottom bar: advance + optional "Let's adjust" on Screen 4 */}
      {needsAdvance && (
        <View style={[s.bottomBar, { paddingBottom: Math.max(16, insets.bottom) }]}>
          {isScreen4 && canAdvance && !isTyping && !isAdvancing && (
            <AnimatedPressable
              style={[s.adjustBtn, { borderColor: theme.surface.border }]}
              onPress={() => {
                setCanAdvance(false);
                setChatBlocked(null);
              }}
              scaleDown={0.97}
            >
              <Text style={[s.adjustText, { color: theme.surface.t2 }]}>
                Let's adjust
              </Text>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            style={[
              s.advanceBtn,
              {
                backgroundColor: isScreen6 ? theme.accent : theme.accentSoft,
                borderColor: isScreen6 ? theme.accent : theme.accentBorder,
                flex: 1,
                opacity: isAdvancing ? 0.65 : 1,
              },
            ]}
            onPress={advance}
            disabled={isAdvancing && !isTyping}
            scaleDown={0.98}
          >
            <Text style={[s.advanceText, { color: isScreen6 ? '#fff' : theme.accent }]}>
              {advanceLabel}
            </Text>
            {!isScreen6 && !isAdvancing && (
              <Ionicons name="arrow-forward" size={15} color={theme.accent} />
            )}
          </AnimatedPressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fill: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  topLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginBottom: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },

  screenLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.2,
    alignSelf: 'center',
    marginBottom: 16,
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  faceWrap: { alignItems: 'center', marginBottom: 24 },

  intakeWrap: { alignItems: 'center', marginBottom: 20, gap: 6 },
  intakeTrack: { width: 160, height: 4, borderRadius: 2, overflow: 'hidden' },
  intakeFill: { height: '100%', borderRadius: 2 },
  intakeCaption: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },

  messagesCol: { gap: 14 },

  assistantBubble: { alignSelf: 'stretch' },
  assistantText: { textAlign: 'center' },

  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userText: { fontSize: 15, lineHeight: 21, color: '#fff', fontWeight: '500' },

  blocked: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  commitCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  commitHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commitLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  commitBody: { fontSize: 14, lineHeight: 20, fontWeight: '600' },

  recapLoadingBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },

  inputBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  inputField: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    fontSize: 14,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnCounter: { fontSize: 11, fontWeight: '600', textAlign: 'right' },

  bottomBar: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  adjustBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustText: { fontSize: 13, fontWeight: '700' },
  advanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  advanceText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },

  loadingText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorText: { marginTop: 20, fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  closeBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
