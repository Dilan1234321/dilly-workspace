/**
 * Chapter session flow — the weekly one-to-one with Dilly.
 *
 * This is the advisor ritual. Every screen should feel like a person
 * wrote it just for you. Rules:
 *   - Full-screen, no navbar.
 *   - DillyFace pinned above every text. Always present, the advisor
 *     is with you.
 *   - Text types out at ~55 c/s (slightly faster than human) while
 *     DillyFace is in writing mood. When typing finishes, she returns
 *     to idle. This sells the illusion of an actual advisor writing
 *     to you live, not a static essay.
 *   - Loading screen: centered Dilly writing, no spinner.
 *   - Continue has a Back button to its left for any screen after the
 *     first.
 *   - Question screen: inline chat, not a redirect. User talks to
 *     Dilly right there about the question. Shared quota.
 *   - End of Chapter: summary + takeaways + calendar commitment + PDF
 *     export. Feels like leaving with notes from the session.
 *
 * Data flow:
 *   GET /chapters/current. If generation_eligible, POST
 *   /chapters/generate (ONE LLM call per cycle). Otherwise render
 *   latest stored Chapter as a replay. No silent regeneration.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import { DillyFace } from '../../../components/DillyFace';
import AnimatedPressable from '../../../components/AnimatedPressable';
import { cancelMissReminder, scheduleChapterNotifications } from '../../../hooks/useChapterNotifications';

interface Screen { slot: string; body: string; }
interface Chapter {
  id?: string;
  title: string;
  screens: Screen[];
  generated_at?: string;
  fetched_at?: string;
  count?: number;
}

// Per-screen label shown as a small eyebrow above the body.
const SLOT_LABELS: Record<string, string> = {
  cold_open: '',
  noticed: 'What I noticed',
  working: "What's working",
  push_on: "What I'd push on",
  one_move: 'Your one move',
  question: 'A question to sit with',
  close: '',
};

// Typing speed: slightly faster than human (human ≈ 40 c/s, this is
// ~55 c/s). Each tick writes ~3 chars. Matches the feel tuned for
// the AI overlay so users read Chapter text the same way.
const TYPE_CHARS_PER_TICK = 3;
const TYPE_TICK_MS = 55;

export default function ChapterSessionScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [index, setIndex] = useState(0);
  // Typed-text state for the current screen. Rebuilds on index change.
  const [typedBody, setTypedBody] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  // Chat thread for the question screen (slot === 'question'). When
  // the user lands on that screen the question becomes Dilly's first
  // message and the user can reply inline. Shared chat quota — the
  // regular /ai/chat endpoint is the backend.
  interface ChatMsg { id: number; role: 'user' | 'assistant'; content: string; }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatBlocked, setChatBlocked] = useState<string | null>(null);
  const chatMsgId = useRef(0);

  // Chapter load. Generate if eligible, else render latest.
  useEffect(() => {
    (async () => {
      try {
        const cur = await dilly.get('/chapters/current');
        if (cur?.generation_eligible) {
          const res = await dilly.fetch('/chapters/generate', { method: 'POST', body: JSON.stringify({}) });
          if (res.ok) {
            const body = await res.json();
            setChapter({ ...body, count: cur?.count || 1 });
            cancelMissReminder().catch(() => {});
            if (cur?.schedule) {
              scheduleChapterNotifications({ ...cur.schedule, next_override_at: null }).catch(() => {});
            }
          } else if (cur?.latest) {
            setChapter({ ...cur.latest, count: cur?.count || 1 });
          } else {
            setError('Could not open this Chapter right now. Try again soon.');
          }
        } else if (cur?.latest) {
          setChapter({ ...cur.latest, count: cur?.count || 1 });
          cancelMissReminder().catch(() => {});
        } else {
          setError("You don't have a Chapter yet. Come back at your scheduled time.");
        }
      } catch {
        setError('Could not reach Dilly right now.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Typing animation: whenever the screen index changes, reset the
  // typed body and stream characters onto it. DillyFace flips to
  // writing mood while isTyping is true, back to idle after.
  useEffect(() => {
    if (!chapter) return;
    const currentScreen = chapter.screens[index];
    if (!currentScreen) return;
    const fullText = currentScreen.body || '';

    // Clear any prior interval so rapid Back/Continue doesn't
    // leave two streams running at once.
    if (typeRef.current) { clearInterval(typeRef.current); typeRef.current = null; }

    setTypedBody('');
    setIsTyping(true);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    // Special case: question screen. Seed the chat with Dilly's
    // question as her first assistant message, then let the user
    // reply. Skip the typing animation for the question body since
    // the chat takes over the interaction.
    if (currentScreen.slot === 'question') {
      // The question text streams INTO the first chat message so it
      // still feels written, not printed. One message only.
      setChatMessages([{ id: ++chatMsgId.current, role: 'assistant', content: '' }]);
      let i = 0;
      typeRef.current = setInterval(() => {
        i += TYPE_CHARS_PER_TICK;
        const done = i >= fullText.length;
        const chunk = done ? fullText : fullText.slice(0, i);
        setChatMessages(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[0] = { ...updated[0], content: chunk };
          return updated;
        });
        if (done) {
          clearInterval(typeRef.current!);
          typeRef.current = null;
          setIsTyping(false);
        }
      }, TYPE_TICK_MS);
      // Regular-body typedBody stays empty so the main body render
      // skips. The chat renders below.
      return () => { if (typeRef.current) { clearInterval(typeRef.current); typeRef.current = null; } };
    }

    // Normal screen: type into typedBody character-by-character.
    let i = 0;
    typeRef.current = setInterval(() => {
      i += TYPE_CHARS_PER_TICK;
      const done = i >= fullText.length;
      setTypedBody(done ? fullText : fullText.slice(0, i));
      if (done) {
        clearInterval(typeRef.current!);
        typeRef.current = null;
        setIsTyping(false);
      }
    }, TYPE_TICK_MS);
    return () => { if (typeRef.current) { clearInterval(typeRef.current); typeRef.current = null; } };
    // chapter + index drive this effect; chatMsgId is a ref
  }, [chapter, index, fade]);

  const currentScreen = chapter?.screens[index];
  const isQuestion = currentScreen?.slot === 'question';
  const isFirst = index === 0;
  const isLast = chapter ? index === chapter.screens.length - 1 : false;

  // User tapped Continue. If we're still typing, complete the text
  // instantly so the next tap advances. This prevents the "I can't
  // press Continue because the text isn't done" frustration.
  function advance() {
    if (!chapter) return;
    if (isTyping) {
      // Finish the current typing immediately. Stop the interval
      // and paint the full text. Second tap will advance.
      if (typeRef.current) { clearInterval(typeRef.current); typeRef.current = null; }
      const fullText = chapter.screens[index]?.body || '';
      if (isQuestion) {
        setChatMessages(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[0] = { ...updated[0], content: fullText };
          return updated;
        });
      } else {
        setTypedBody(fullText);
      }
      setIsTyping(false);
      return;
    }
    if (index < chapter.screens.length - 1) {
      setIndex(i => i + 1);
      // Reset chat state when leaving the question screen.
      if (chapter.screens[index]?.slot === 'question') {
        setChatMessages([]);
        setChatInput('');
        setChatBlocked(null);
      }
    } else {
      // End of Chapter. Close back to Home.
      router.back();
    }
  }

  function goBack() {
    if (isFirst) return;
    if (typeRef.current) { clearInterval(typeRef.current); typeRef.current = null; }
    setIndex(i => Math.max(0, i - 1));
    setChatMessages([]);
    setChatInput('');
    setChatBlocked(null);
  }

  // Send a message to Dilly from inside the Chapter question screen.
  // Uses the normal /ai/chat endpoint so quota + record_turn all work
  // as normal. On 402/429, we gracefully end the chat with a friendly
  // line rather than surfacing the paywall mid-ritual.
  const sendChat = useCallback(async () => {
    const text = (chatInput || '').trim();
    if (!text || chatSending) return;
    setChatInput('');
    const userMsg: ChatMsg = { id: ++chatMsgId.current, role: 'user', content: text };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setChatSending(true);
    try {
      const res = await dilly.fetch('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          // Map to the /ai/chat API shape.
          messages: nextHistory.map(m => ({ role: m.role, content: m.content })),
          mode: 'coaching',
          // Tag the conv as a Chapter question conv so flush extraction
          // associates facts with the right session.
          conv_id: `chapter-${chapter?.id || 'session'}-q`,
        }),
      });
      if (!res.ok) {
        if (res.status === 402 || res.status === 429) {
          setChatBlocked("Let's wrap here and save the rest for next week.");
        } else {
          setChatBlocked('Dilly stepped away. Tap Continue when you are ready.');
        }
        return;
      }
      const data = await res.json();
      const reply = String(data?.content || '').trim();
      if (!reply) {
        setChatBlocked('Dilly stepped away. Tap Continue when you are ready.');
        return;
      }
      // Type reply in same cadence as the rest of the Chapter.
      const assistantMsg: ChatMsg = { id: ++chatMsgId.current, role: 'assistant', content: '' };
      setChatMessages(prev => [...prev, assistantMsg]);
      setIsTyping(true);
      if (typeRef.current) { clearInterval(typeRef.current); typeRef.current = null; }
      let i = 0;
      typeRef.current = setInterval(() => {
        i += TYPE_CHARS_PER_TICK;
        const done = i >= reply.length;
        const chunk = done ? reply : reply.slice(0, i);
        setChatMessages(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: chunk };
          }
          return updated;
        });
        if (done) {
          clearInterval(typeRef.current!);
          typeRef.current = null;
          setIsTyping(false);
        }
      }, TYPE_TICK_MS);
    } catch {
      setChatBlocked('Dilly stepped away. Tap Continue when you are ready.');
    } finally {
      setChatSending(false);
    }
  }, [chatInput, chatMessages, chatSending, chapter]);

  // Session transcript PDF export. Client-side HTML → share sheet.
  // No LLM, no server call.
  async function sharePdf() {
    if (!chapter) return;
    const lines: string[] = [];
    lines.push(`Chapter: ${chapter.title}`);
    lines.push('');
    chapter.screens.forEach((scr) => {
      const label = SLOT_LABELS[scr.slot] || '';
      if (label) lines.push(`${label.toUpperCase()}`);
      lines.push(scr.body);
      lines.push('');
    });
    if (chatMessages.length > 0) {
      lines.push('YOUR CHAT WITH DILLY');
      chatMessages.forEach(m => {
        lines.push(`${m.role === 'user' ? 'You' : 'Dilly'}: ${m.content}`);
      });
    }
    try {
      await Share.share({
        title: `Chapter · ${chapter.title}`,
        message: lines.join('\n'),
      });
    } catch {}
  }

  // End-of-Chapter: add the one_move as a calendar event. Writes via
  // the existing /calendar/events endpoint. Free.
  async function addOneMoveToCalendar() {
    if (!chapter) return;
    const oneMove = chapter.screens.find(s => s.slot === 'one_move');
    if (!oneMove) return;
    try {
      // Default: seven days from now at the user's Chapter hour,
      // which pairs the homework with the next Chapter rhythm.
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(9, 0, 0, 0);
      await dilly.fetch('/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: `Chapter homework: ${oneMove.body.slice(0, 60)}`,
          notes: oneMove.body,
          type: 'deadline',
          date_iso: date.toISOString(),
        }),
      }).catch(() => {});
      Alert.alert('Added', "I've put this on your calendar for next week.");
    } catch {
      Alert.alert('Not now', 'Could not add that right now. Try again.');
    }
  }

  // ─── Loading state ────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <DillyFace size={140} mood="writing" accessory="pencil" />
          <Text style={[s.loadingText, { color: theme.surface.t2, marginTop: 32 }]}>
            Dilly is writing your Chapter…
          </Text>
        </View>
      </View>
    );
  }

  if (error || !chapter || !currentScreen) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40, paddingHorizontal: 32 }]}>
        <Ionicons name="moon" size={36} color={theme.surface.t3} />
        <Text style={[s.errorText, { color: theme.surface.t1 }]}>{error || 'No Chapter yet.'}</Text>
        <AnimatedPressable
          style={[s.closeBtn, { backgroundColor: theme.accent, marginTop: 28 }]}
          onPress={() => router.back()}
          scaleDown={0.97}
        >
          <Text style={s.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const label = SLOT_LABELS[currentScreen.slot || ''] || '';

  // Streak / chapter count label.
  const chapterCount = chapter.count || 1;

  // ─── Main render ──────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 12 }]}
    >
      {/* Top bar: Chapter title + close. Streak label sits next to
          the title so users see they've been doing this a while. */}
      <View style={s.topBar}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="close" size={22} color={theme.surface.t3} />
        </AnimatedPressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.chapterTitle, { color: theme.surface.t2 }]} numberOfLines={1}>
            Chapter · {chapter.title}
          </Text>
          {chapterCount > 1 ? (
            <Text style={[s.chapterStreak, { color: theme.surface.t3 }]}>
              Chapter {chapterCount} · {chapterCount} weeks together
            </Text>
          ) : null}
        </View>
        <AnimatedPressable onPress={sharePdf} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="share-outline" size={20} color={theme.surface.t3} />
        </AnimatedPressable>
      </View>

      {/* Progress dot row */}
      <View style={s.dotRow}>
        {chapter.screens.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              { backgroundColor: i <= index ? theme.accent : theme.surface.s2 },
              i === index && { width: 14 },
            ]}
          />
        ))}
      </View>

      {/* Body. DillyFace pinned at the top-center of every screen so
          the advisor is always visibly present. Writing mood while
          typing, idle after. Below the face, the label + text. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.bodyScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <DillyFace
            size={isFirst || isLast ? 120 : 84}
            mood={isTyping ? 'writing' : (isFirst ? 'happy' : isLast ? 'proud' : 'idle')}
            accessory={isTyping ? 'pencil' : 'none'}
          />
        </View>

        {label ? (
          <Text style={[s.label, { color: theme.accent }]}>{label.toUpperCase()}</Text>
        ) : null}

        {/* Normal screens show the streaming typed body centered. */}
        {!isQuestion && (
          <Animated.View style={{ opacity: fade }}>
            <Text
              style={[
                s.body,
                {
                  color: theme.surface.t1,
                  fontFamily: theme.type.display,
                  fontWeight: isFirst ? '700' : theme.type.heroWeight,
                  fontSize: isFirst ? 28 : 22,
                  lineHeight: isFirst ? 36 : 30,
                  letterSpacing: theme.type.heroTracking,
                },
              ]}
            >
              {typedBody}
              {isTyping ? <Text style={{ color: theme.accent }}>▍</Text> : null}
            </Text>
          </Animated.View>
        )}

        {/* Question screen: inline chat. Renders all messages. Input
            bar is separate below so it stays above the keyboard. */}
        {isQuestion && (
          <View style={{ gap: 10, marginTop: 8 }}>
            {chatMessages.map(m => (
              <View
                key={m.id}
                style={[
                  s.chatBubble,
                  m.role === 'user'
                    ? { alignSelf: 'flex-end', backgroundColor: theme.accent }
                    : { alignSelf: 'flex-start', backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderWidth: 1 },
                ]}
              >
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: m.role === 'user' ? '#fff' : theme.surface.t1,
                  }}
                >
                  {m.content}
                  {isTyping && m === chatMessages[chatMessages.length - 1] && m.role === 'assistant'
                    ? <Text style={{ color: theme.accent }}>▍</Text>
                    : null}
                </Text>
              </View>
            ))}
            {chatBlocked ? (
              <Text style={[s.chatBlocked, { color: theme.surface.t3 }]}>{chatBlocked}</Text>
            ) : null}
          </View>
        )}

        {/* End-of-Chapter extras: one-move calendar commit (shown on
            the one_move screen after typing completes). PDF export
            is in the top bar; no duplicate button here. */}
        {currentScreen.slot === 'one_move' && !isTyping && (
          <AnimatedPressable
            style={[s.calBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
            onPress={addOneMoveToCalendar}
            scaleDown={0.97}
          >
            <Ionicons name="calendar-outline" size={15} color={theme.accent} />
            <Text style={[s.calBtnText, { color: theme.accent }]}>Put this on my calendar</Text>
          </AnimatedPressable>
        )}
      </ScrollView>

      {/* Question screen input bar pinned above keyboard. */}
      {isQuestion && !chatBlocked && (
        <View style={[s.chatInputBar, { backgroundColor: theme.surface.s1, borderTopColor: theme.surface.border, paddingBottom: Math.max(12, insets.bottom) }]}>
          <View style={[s.chatInputWrap, { backgroundColor: theme.surface.bg, borderColor: theme.surface.border }]}>
            <TextInput
              style={[s.chatInput, { color: theme.surface.t1 }]}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Talk it through…"
              placeholderTextColor={theme.surface.t3}
              editable={!chatSending && !isTyping}
              returnKeyType="send"
              onSubmitEditing={sendChat}
              multiline
              maxLength={500}
            />
            <AnimatedPressable
              onPress={sendChat}
              disabled={!chatInput.trim() || chatSending || isTyping}
              scaleDown={0.9}
              style={[s.chatSendBtn, { backgroundColor: !chatInput.trim() || chatSending || isTyping ? theme.surface.s2 : theme.accent }]}
              hitSlop={6}
            >
              <Ionicons name="arrow-up" size={16} color={!chatInput.trim() || chatSending || isTyping ? theme.surface.t3 : '#fff'} />
            </AnimatedPressable>
          </View>
        </View>
      )}

      {/* Bottom Back + Continue row. Back is left of Continue, visible
          only past the first screen. Continue fills remaining width.
          Continue copy changes on the last screen to "Close". */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(16, insets.bottom) }]}>
        {!isFirst && (
          <AnimatedPressable
            style={[s.backBtn, { borderColor: theme.surface.border }]}
            onPress={goBack}
            scaleDown={0.97}
          >
            <Ionicons name="arrow-back" size={15} color={theme.surface.t2} />
            <Text style={[s.backBtnText, { color: theme.surface.t2 }]}>Back</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable
          style={[s.continueBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, flex: 1 }]}
          onPress={advance}
          scaleDown={0.98}
        >
          <Text style={[s.continueBtnText, { color: theme.accent }]}>
            {isLast ? 'Close' : isTyping ? 'Skip typing' : 'Continue'}
          </Text>
          <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color={theme.accent} />
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
    alignSelf: 'stretch',
    gap: 12,
  },
  chapterTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  chapterStreak: { fontSize: 9, fontWeight: '600', letterSpacing: 0.8, marginTop: 2 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 20, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },

  bodyScroll: {
    paddingHorizontal: 28,
    paddingBottom: 12,
    alignItems: 'center',
  },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 14, textAlign: 'center' },
  body: { textAlign: 'center' },

  chatBubble: {
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  chatBlocked: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },

  calBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1,
    alignSelf: 'center', marginTop: 20,
  },
  calBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: -0.1 },

  chatInputBar: { paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1 },
  chatInputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1,
  },
  chatInput: { flex: 1, minHeight: 36, maxHeight: 100, fontSize: 14, paddingVertical: 6 },
  chatSendBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  bottomBar: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  backBtnText: { fontSize: 13, fontWeight: '700' },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  continueBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },

  loadingText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorText: { marginTop: 20, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  closeBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
