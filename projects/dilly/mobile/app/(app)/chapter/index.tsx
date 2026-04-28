/**
 * Chapter session entry point.
 *
 * CHAPTER_V2_ENABLED = false (default for build 405)
 *   → renders ChapterV1: the existing slot-based advisor
 *     (cold_open → noticed → working → push_on → one_move → question → close)
 *
 * CHAPTER_V2_ENABLED = true
 *   → renders ChapterV2Screen: the new 5-screen live-session arc backed
 *     by /chapter/* endpoints. Also requires FEATURE_CHAPTER_API=true on
 *     Railway before the endpoints are live.
 */

import { CHAPTER_V2_ENABLED } from '../../../lib/featureFlags';
import ChapterV2Screen from '../../../components/ChapterV2Screen';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Share, Image, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import { DillyFace } from '../../../components/DillyFace';
import AnimatedPressable from '../../../components/AnimatedPressable';
import { cancelMissReminder, scheduleChapterNotifications } from '../../../hooks/useChapterNotifications';
import { scheduleOutcomePushes } from '../../../hooks/useOutcomePushes';
import { triggerCelebration } from '../../../hooks/useCelebration';
import * as DillyActivity from 'dilly-activity';
import { showToast } from '../../../lib/globalToast';

// ─── Default export: gates on CHAPTER_V2_ENABLED ──────────────────────

export default function ChapterSessionScreen() {
  if (CHAPTER_V2_ENABLED) return <ChapterV2Screen />;
  return <ChapterV1 />;
}

// ─── V1 (original slot-based Chapter - preserved verbatim from build 404) ──

interface Screen { slot: string; body: string; }
interface Chapter {
  id?: string;
  title: string;
  screens: Screen[];
  generated_at?: string;
  fetched_at?: string;
  count?: number;
}

const SLOT_LABELS: Record<string, string> = {
  cold_open: '',
  noticed: 'What I noticed',
  working: "What's working",
  push_on: "What I'd push on",
  one_move: 'Your one move',
  question: 'A question to sit with',
  close: '',
};

const TYPE_CHARS_PER_SEC = 38;
const CHAPTER_COMPLETED_KEY = 'chapter_completed_ids_v1';

async function markChapterCompleted(chapterId: string | undefined) {
  if (!chapterId) return;
  try {
    const raw = await AsyncStorage.getItem(CHAPTER_COMPLETED_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(chapterId)) {
      list.push(chapterId);
      await AsyncStorage.setItem(CHAPTER_COMPLETED_KEY, JSON.stringify(list.slice(-50)));
    }
  } catch { /* ignore */ }
}

function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/^[-*•]\s+/gm, '')
    .trim();
}

const PUNCT_PAUSE_MS: Record<string, number> = {
  '.': 260, '!': 300, '?': 300, ',': 120,
  ';': 160, ':': 160, '-': 200, '\n': 320,
};

interface _PushOnVid {
  id: string; title?: string; description?: string;
  thumbnail_url?: string; channel_title?: string; duration_sec?: number;
}

const _PUSHON_STOP = new Set([
  'the', 'and', 'for', 'but', 'that', 'with', 'your', 'you', 'are',
  'this', 'into', 'more', 'have', 'from', 'what', 'when', 'will',
  'push', 'build', 'work', 'keep', 'just', 'also', 'need', 'like',
  'some', 'make', 'them', 'their',
]);

function _tokenizePushOn(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of (body || '').toLowerCase().match(/[a-z0-9+#./-]+/g) || []) {
    if (tok.length < 3 || _PUSHON_STOP.has(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

function PushOnPlaylist({ body, theme }: { body: string; theme: ReturnType<typeof useResolvedTheme> }) {
  const [videos, setVideos] = useState<_PushOnVid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dilly.get('/skill-lab/trending?limit=60').catch(() => null);
        const pool: _PushOnVid[] = Array.isArray(res?.videos) ? res.videos : Array.isArray(res) ? res : [];
        const tokens = _tokenizePushOn(body);
        const scored = pool
          .map(v => {
            const title = (v.title || '').toLowerCase();
            const desc = (v.description || '').toLowerCase();
            let score = 0;
            for (const t of tokens) {
              if (title.includes(t)) score += 3;
              if (desc.includes(t)) score += 1;
            }
            return { v, score };
          })
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(x => x.v);
        if (!cancelled) { setVideos(scored); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [body]);

  if (loading || !videos.length) return null;

  return (
    <View style={{ marginTop: 24, gap: 10 }}>
      <Text style={[s.label, { color: theme.accent }]}>WATCH + PRACTICE</Text>
      <Text style={{ color: theme.surface.t2, fontSize: 13, lineHeight: 18 }}>
        Three short videos Dilly picked for exactly this edge.
      </Text>
      <View style={{ gap: 8, marginTop: 4 }}>
        {videos.map(v => (
          <TouchableOpacity
            key={v.id}
            activeOpacity={0.85}
            onPress={() => router.push(`/skills/video/${v.id}`)}
            style={{ flexDirection: 'row', gap: 10, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }}
          >
            <Image
              source={{ uri: v.thumbnail_url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` }}
              style={{ width: 96, height: 54, borderRadius: 6, backgroundColor: theme.surface.s2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.surface.t1, fontSize: 13, fontWeight: '700', lineHeight: 17 }} numberOfLines={2}>
                {v.title || 'Untitled'}
              </Text>
              {v.channel_title ? (
                <Text style={{ color: theme.surface.t3, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{v.channel_title}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ChapterV1() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [index, setIndex] = useState(0);
  const [typedBody, setTypedBody] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typeRef = useRef<(() => void) | null>(null);
  const typedScreens = useRef<Set<number>>(new Set());
  const fade = useRef(new Animated.Value(0)).current;

  interface ChatMsg { id: number; role: 'user' | 'assistant'; content: string; }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatBlocked, setChatBlocked] = useState<string | null>(null);
  const chatMsgId = useRef(0);
  const chatMessagesRef = useRef<ChatMsg[]>([]);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  const scrollRef = useRef<ScrollView>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const onQuestionScreen = chapter?.screens[index]?.slot === 'question';
    if (!onQuestionScreen || !atBottomRef.current) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [chatMessages.length, chapter, index]);

  useEffect(() => {
    const onQuestionScreen = chapter?.screens[index]?.slot === 'question';
    if (!onQuestionScreen || !isTyping || !atBottomRef.current) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [isTyping, chapter, index]);

  // Flush extraction on Chapter unmount. The AI overlay wraps its
  // own close handler to call /ai/chat/flush, but the Chapter screen
  // uses its own inline chat with a private conv_id. Without this
  // cleanup, anything the user typed on the question screen never
  // extracted - they'd talk to Dilly and see no new facts on the
  // profile after the Chapter closed. Fires only if the user sent
  // at least one message AND the chapter has an id.
  useEffect(() => {
    return () => {
      const msgs = chatMessagesRef.current;
      const chapterId = chapter?.id;
      if (!chapterId || msgs.filter(m => m.role === 'user').length < 1) return;
      dilly.fetch('/ai/chat/flush', {
        method: 'POST',
        body: JSON.stringify({
          conv_id: `chapter-${chapterId}-q`,
          messages: msgs.filter(m => (m.content || '').trim()).slice(-30).map(m => ({ role: m.role, content: m.content })),
        }),
      }).catch(() => {});
    };
  }, [chapter?.id]);

  useEffect(() => {
    try {
      const { donateActivity, ACTIVITY_CHAPTER } = require('../../../lib/siriDonations');
      donateActivity?.(ACTIVITY_CHAPTER);
    } catch {}
    (async () => {
      try {
        const cur = await dilly.get('/chapters/current');
        if (!cur?.schedule) { router.replace('/(app)/chapter/schedule' as any); return; }
        if (cur?.generation_eligible) {
          const res = await dilly.fetch('/chapters/generate', { method: 'POST', body: JSON.stringify({}) });
          if (res.ok) {
            const body = await res.json();
            setChapter({ ...body, count: cur?.count || 1 });
            cancelMissReminder().catch(() => {});
            scheduleChapterNotifications({ ...cur.schedule, next_override_at: null }).catch(() => {});
          } else if (cur?.latest) {
            setChapter({ ...cur.latest, count: cur?.count || 1 });
          } else {
            setError('Could not open this Chapter right now. Try again soon.');
          }
          return;
        }
        if (cur?.latest) {
          const completedRaw = await AsyncStorage.getItem(CHAPTER_COMPLETED_KEY).catch(() => null);
          const completed: string[] = (() => { try { return completedRaw ? JSON.parse(completedRaw) : []; } catch { return []; } })();
          if (cur.latest.id && !completed.includes(cur.latest.id)) {
            setChapter({ ...cur.latest, count: cur?.count || 1 });
            cancelMissReminder().catch(() => {});
            return;
          }
        }
        router.replace('/(app)/chapter/prep' as any);
      } catch {
        setError('Could not reach Dilly right now.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!chapter) return;
    const currentScreen = chapter.screens[index];
    if (!currentScreen) return;
    const fullText = currentScreen.body || '';

    if (typeRef.current) { typeRef.current(); typeRef.current = null; }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    if (typedScreens.current.has(index)) {
      if (currentScreen.slot === 'question') {
        setChatMessages([{ id: ++chatMsgId.current, role: 'assistant', content: fullText }]);
      } else { setTypedBody(fullText); }
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    const isQuestionSlot = currentScreen.slot === 'question';
    if (isQuestionSlot) { setChatMessages([{ id: ++chatMsgId.current, role: 'assistant', content: '' }]); }
    else { setTypedBody(''); }

    const startMs = Date.now();
    let rafId = 0;
    let cursor = 0;
    let pausedUntilMs = 0;
    let totalPauseMs = 0;
    const applyChunk = (chunk: string) => {
      if (isQuestionSlot) {
        setChatMessages(prev => {
          if (!prev.length) return prev;
          const updated = [...prev]; updated[0] = { ...updated[0], content: chunk }; return updated;
        });
      } else { setTypedBody(chunk); }
    };
    const tick = () => {
      const now = Date.now();
      if (now < pausedUntilMs) { rafId = requestAnimationFrame(tick); return; }
      const activeMs = now - startMs - totalPauseMs;
      const desiredCursor = Math.min(fullText.length, Math.floor((activeMs * TYPE_CHARS_PER_SEC) / 1000));
      if (desiredCursor > cursor) {
        let next = cursor;
        while (next < desiredCursor) {
          next++;
          const justTyped = fullText[next - 1];
          const pauseMs = PUNCT_PAUSE_MS[justTyped];
          const nextChar = fullText[next];
          const isBoundary = !nextChar || nextChar === ' ' || nextChar === '\n';
          if (pauseMs && isBoundary && next < fullText.length) {
            cursor = next; pausedUntilMs = now + pauseMs; totalPauseMs += pauseMs; break;
          }
        }
        if (next >= desiredCursor) cursor = desiredCursor;
        applyChunk(fullText.slice(0, cursor));
      }
      if (cursor >= fullText.length) { typedScreens.current.add(index); setIsTyping(false); return; }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    typeRef.current = () => { if (rafId) cancelAnimationFrame(rafId); };
    return () => { if (typeRef.current) { typeRef.current(); typeRef.current = null; } };
  }, [chapter, index, fade]);

  const currentScreen = chapter?.screens[index];
  const isQuestion = currentScreen?.slot === 'question';
  const isFirst = index === 0;
  const isLast = chapter ? index === chapter.screens.length - 1 : false;
  const chapterCount = chapter?.count || 1;

  // Live Activity wiring — start when the chapter loads, update when
  // the user advances screens, end when they finish or leave. The
  // activity shows in the Dynamic Island + lock-screen banner so
  // users see Chapter progress without keeping the app foregrounded.
  // No-op on iOS < 16.2 / non-iOS / when the user has disabled
  // Live Activities in Settings.
  const liveActivityIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chapter?.id) return;
    let cancelled = false;
    (async () => {
      const id = await DillyActivity.startChapter(
        chapter.id,
        `Chapter ${chapter.count || 1}`,
        chapter.screens.length,
      );
      if (!cancelled) liveActivityIdRef.current = id ? chapter.id : null;
    })();
    return () => {
      cancelled = true;
      // End the activity when the chapter screen unmounts or chapter
      // changes. Activity will fade gracefully via the .after dismissal
      // policy declared in the native module.
      if (liveActivityIdRef.current) {
        DillyActivity.endChapter(liveActivityIdRef.current).catch(() => {});
        liveActivityIdRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  // Update the activity whenever the screen index changes — keeps the
  // Dynamic Island progress count + screen label in sync.
  useEffect(() => {
    if (!chapter?.id || !liveActivityIdRef.current) return;
    const scr = chapter.screens[index];
    const label = SLOT_LABELS[scr?.slot || ''] || (scr?.slot || '').replace(/_/g, ' ');
    DillyActivity.updateChapter(chapter.id, index + 1, label).catch(() => {});
  }, [index, chapter?.id, chapter?.screens]);

  function advance() {
    if (!chapter) return;
    if (isTyping) {
      if (typeRef.current) { typeRef.current(); typeRef.current = null; }
      const fullText = chapter.screens[index]?.body || '';
      if (isQuestion) {
        setChatMessages(prev => { if (!prev.length) return prev; const u = [...prev]; u[0] = { ...u[0], content: fullText }; return u; });
      } else { setTypedBody(fullText); }
      typedScreens.current.add(index);
      setIsTyping(false);
      return;
    }
    if (index < chapter.screens.length - 1) {
      setIndex(i => i + 1);
      if (chapter.screens[index]?.slot === 'question') { setChatMessages([]); setChatInput(''); setChatBlocked(null); }
    } else {
      const hit = ({ 4: 'chapter-4', 12: 'chapter-12', 26: 'chapter-26', 52: 'chapter-52' } as Record<number, string>)[chapterCount];
      if (hit) setTimeout(() => triggerCelebration(hit as any), 420);
      markChapterCompleted(chapter?.id).catch(() => {});
      router.replace('/(app)/chapter/recap' as any);
    }
  }

  const endSession = useCallback(() => {
    if (typeRef.current) { typeRef.current(); typeRef.current = null; }
    markChapterCompleted(chapter?.id).catch(() => {});
    router.replace('/(app)/chapter/recap' as any);
  }, [chapter?.id]);

  function goBack() {
    if (isFirst) return;
    if (typeRef.current) { typeRef.current(); typeRef.current = null; }
    setIndex(i => Math.max(0, i - 1));
    setChatMessages([]); setChatInput(''); setChatBlocked(null);
  }

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
          messages: nextHistory.map(m => ({ role: m.role, content: m.content })),
          mode: 'chapter',
          conv_id: `chapter-${chapter?.id || 'session'}-q`,
        }),
      });
      if (!res.ok) {
        setChatBlocked(res.status === 402 || res.status === 429
          ? "Let's wrap here and save the rest for next week."
          : 'Dilly stepped away. Tap Continue when you are ready.');
        return;
      }
      const data = await res.json();
      const reply = String(data?.content || '').trim();
      if (!reply) { setChatBlocked('Dilly stepped away. Tap Continue when you are ready.'); return; }

      const assistantMsg: ChatMsg = { id: ++chatMsgId.current, role: 'assistant', content: '' };
      setChatMessages(prev => [...prev, assistantMsg]);
      setIsTyping(true);
      if (typeRef.current) { typeRef.current(); typeRef.current = null; }

      const startMs = Date.now();
      let rafId = 0; let cursor = 0; let pausedUntilMs = 0; let totalPauseMs = 0;
      const applyChunk = (chunk: string) => {
        setChatMessages(prev => {
          if (!prev.length) return prev;
          const updated = [...prev]; const last = updated[updated.length - 1];
          if (last?.role === 'assistant') updated[updated.length - 1] = { ...last, content: chunk };
          return updated;
        });
      };
      const tick = () => {
        const now = Date.now();
        if (now < pausedUntilMs) { rafId = requestAnimationFrame(tick); return; }
        const activeMs = now - startMs - totalPauseMs;
        const desiredCursor = Math.min(reply.length, Math.floor((activeMs * TYPE_CHARS_PER_SEC) / 1000));
        if (desiredCursor > cursor) {
          let next = cursor;
          while (next < desiredCursor) {
            next++;
            const justTyped = reply[next - 1]; const pauseMs = PUNCT_PAUSE_MS[justTyped];
            const nextChar = reply[next]; const isBoundary = !nextChar || nextChar === ' ' || nextChar === '\n';
            if (pauseMs && isBoundary && next < reply.length) { cursor = next; pausedUntilMs = now + pauseMs; totalPauseMs += pauseMs; break; }
          }
          if (next >= desiredCursor) cursor = desiredCursor;
          applyChunk(reply.slice(0, cursor));
        }
        if (cursor >= reply.length) { setIsTyping(false); return; }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      typeRef.current = () => { if (rafId) cancelAnimationFrame(rafId); };
    } catch {
      setChatBlocked('Dilly stepped away. Tap Continue when you are ready.');
    } finally {
      setChatSending(false);
    }
  }, [chatInput, chatMessages, chatSending, chapter]);

  async function sharePdf() {
    if (!chapter) return;
    const lines: string[] = [`Chapter: ${chapter.title}`, ''];
    chapter.screens.forEach(scr => {
      const label = SLOT_LABELS[scr.slot] || '';
      if (label) lines.push(label.toUpperCase());
      lines.push(scr.body); lines.push('');
    });
    if (chatMessages.length) {
      lines.push('YOUR CHAT WITH DILLY');
      chatMessages.forEach(m => lines.push(`${m.role === 'user' ? 'You' : 'Dilly'}: ${m.content}`));
    }
    try { await Share.share({ title: `Chapter · ${chapter.title}`, message: lines.join('\n') }); } catch {}
  }

  async function addOneMoveToCalendar() {
    if (!chapter) return;
    const oneMove = chapter.screens.find(sc => sc.slot === 'one_move');
    if (!oneMove) return;
    try {
      const date = new Date(); date.setDate(date.getDate() + 7); date.setHours(9, 0, 0, 0);
      const title = `One move: ${oneMove.body.slice(0, 60)}`;
      await dilly.fetch('/calendar/events', { method: 'POST', body: JSON.stringify({ title, notes: oneMove.body, type: 'deadline', date_iso: date.toISOString() }) }).catch(() => {});
      scheduleOutcomePushes({ id: `chapter-move-${chapter.id || 'session'}-${date.toISOString().slice(0, 10)}`, title, at: date, prepPrompt: `My Chapter move is due tomorrow: "${oneMove.body}". Help me prep - what should I actually do in the next hour to make sure I do this?` }).catch(() => {});
      showToast({ message: "I've put this on your calendar for next week.", type: 'success' });
    } catch { showToast({ message: 'Could not add that right now. Try again.', type: 'error' }); }
  }

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <DillyFace size={140} mood="writing" accessory="pencil" />
          <Text style={[s.loadingText, { color: theme.surface.t2, marginTop: 32 }]}>Dilly is writing your Chapter…</Text>
        </View>
      </View>
    );
  }

  if (error || !chapter || !currentScreen) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 40, paddingHorizontal: 32 }]}>
        <Ionicons name="moon" size={36} color={theme.surface.t3} />
        <Text style={[s.errorText, { color: theme.surface.t1 }]}>{error || 'No Chapter yet.'}</Text>
        <AnimatedPressable style={[s.closeBtn, { backgroundColor: theme.accent, marginTop: 28 }]} onPress={() => router.back()} scaleDown={0.97}>
          <Text style={s.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const label = SLOT_LABELS[currentScreen.slot || ''] || '';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 12 }]}
    >
      <View style={s.topBar}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="close" size={22} color={theme.surface.t3} />
        </AnimatedPressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.chapterTitle, { color: theme.surface.t2 }]} numberOfLines={1}>Chapter · {chapter.title}</Text>
          {chapterCount > 1 ? <Text style={[s.chapterStreak, { color: theme.surface.t3 }]}>Chapter {chapterCount} · {chapterCount} weeks together</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {!isFirst ? <AnimatedPressable onPress={endSession} hitSlop={12} scaleDown={0.9}><Text style={[s.endSessionTxt, { color: theme.accent }]}>End</Text></AnimatedPressable> : null}
          <AnimatedPressable onPress={sharePdf} hitSlop={12} scaleDown={0.9}><Ionicons name="share-outline" size={20} color={theme.surface.t3} /></AnimatedPressable>
        </View>
      </View>

      <View style={s.dotRow}>
        {chapter.screens.map((_, i) => (
          <View key={i} style={[s.dot, { backgroundColor: i <= index ? theme.accent : theme.surface.s2 }, i === index && { width: 14 }]} />
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.bodyScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          atBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <DillyFace size={isFirst || isLast ? 120 : 84} mood={isTyping ? 'writing' : (isFirst ? 'happy' : isLast ? 'proud' : 'idle')} accessory={isTyping ? 'pencil' : 'none'} />
        </View>
        {label ? <Text style={[s.label, { color: theme.accent }]}>{label.toUpperCase()}</Text> : null}
        {!isQuestion && (
          <Animated.View style={{ opacity: fade }}>
            <Text
              style={[
                s.body,
                {
                  color: theme.surface.t1,
                  fontWeight: isFirst ? '800' : '700',
                  fontSize: isFirst ? 28 : 22,
                  lineHeight: isFirst ? 36 : 30,
                },
              ]}
            >
              {stripMd(typedBody)}
              {isTyping ? <Text style={{ color: theme.accent }}>▍</Text> : null}
            </Text>
          </Animated.View>
        )}
        {isQuestion && (
          <View style={{ gap: 10, marginTop: 8, alignSelf: 'stretch' }}>
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
                  {stripMd(m.content)}
                  {isTyping && m === chatMessages[chatMessages.length - 1] && m.role === 'assistant'
                    ? <Text style={{ color: theme.accent }}>▍</Text>
                    : null}
                </Text>
              </View>
            ))}
            {chatBlocked ? <Text style={[s.chatBlocked, { color: theme.surface.t3 }]}>{chatBlocked}</Text> : null}
          </View>
        )}
        {currentScreen.slot === 'push_on' && !isTyping && !isQuestion && <PushOnPlaylist body={currentScreen.body || ''} theme={theme} />}
        {currentScreen.slot === 'one_move' && !isTyping && (
          <AnimatedPressable style={[s.calBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]} onPress={addOneMoveToCalendar} scaleDown={0.97}>
            <Ionicons name="calendar-outline" size={15} color={theme.accent} />
            <Text style={[s.calBtnText, { color: theme.accent }]}>Put this on my calendar</Text>
          </AnimatedPressable>
        )}
      </ScrollView>

      {isQuestion && !chatBlocked && (
        <View style={[s.chatInputBar, { backgroundColor: theme.surface.s1, borderTopColor: theme.surface.border, paddingBottom: Math.max(12, insets.bottom) }]}>
          <View style={[s.chatInputWrap, { backgroundColor: theme.surface.bg, borderColor: theme.surface.border }]}>
            <TextInput style={[s.chatInput, { color: theme.surface.t1 }]} value={chatInput} onChangeText={setChatInput} placeholder="Talk it through…" placeholderTextColor={theme.surface.t3} editable={!chatSending && !isTyping} returnKeyType="send" onSubmitEditing={sendChat} multiline maxLength={500} />
            <AnimatedPressable onPress={sendChat} disabled={!chatInput.trim() || chatSending || isTyping} scaleDown={0.9} style={[s.chatSendBtn, { backgroundColor: !chatInput.trim() || chatSending || isTyping ? theme.surface.s2 : theme.accent }]} hitSlop={6}>
              <Ionicons name="arrow-up" size={16} color={!chatInput.trim() || chatSending || isTyping ? theme.surface.t3 : '#fff'} />
            </AnimatedPressable>
          </View>
        </View>
      )}

      <View style={[s.bottomBar, { paddingBottom: Math.max(16, insets.bottom) }]}>
        {!isFirst && (
          <AnimatedPressable style={[s.backBtn, { borderColor: theme.surface.border }]} onPress={goBack} scaleDown={0.97}>
            <Ionicons name="arrow-back" size={15} color={theme.surface.t2} />
            <Text style={[s.backBtnText, { color: theme.surface.t2 }]}>Back</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable style={[s.continueBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, flex: 1 }]} onPress={advance} scaleDown={0.98}>
          <Text style={[s.continueBtnText, { color: theme.accent }]}>{isLast ? 'Close' : isTyping ? 'Skip typing' : 'Continue'}</Text>
          <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color={theme.accent} />
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, alignSelf: 'stretch', gap: 12 },
  chapterTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  chapterStreak: { fontSize: 9, fontWeight: '600', letterSpacing: 0.8, marginTop: 2 },
  endSessionTxt: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 20, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bodyScroll: { paddingHorizontal: 28, paddingBottom: 12, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 14, textAlign: 'center' },
  body: { textAlign: 'center' },
  chatBubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  chatBlocked: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  calBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1, alignSelf: 'center', marginTop: 20 },
  calBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: -0.1 },
  chatInputBar: { paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1 },
  chatInputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  chatInput: { flex: 1, minHeight: 36, maxHeight: 100, fontSize: 14, paddingVertical: 6 },
  chatSendBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { alignSelf: 'stretch', paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', gap: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  backBtnText: { fontSize: 13, fontWeight: '700' },
  continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  continueBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },
  loadingText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorText: { marginTop: 20, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  closeBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
