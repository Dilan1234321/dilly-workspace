import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Animated, Easing, Dimensions, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, API_BASE } from '../lib/tokens';
import { mediumHaptic } from '../lib/haptics';
import { getToken } from '../lib/auth';
import { dilly } from '../lib/dilly';
import RichText from './RichText';
import { DillyVisual, VisualPayload } from './DillyVisuals';
import { DillyFace } from './DillyFace';
import { useSubscription } from '../hooks/useSubscription';
import { useResolvedTheme } from '../hooks/useTheme';
import { FirstVisitCoach } from './FirstVisitCoach';
import {
  markExtractionPending, resolveExtraction, abortExtraction,
} from '../hooks/useExtractionPending';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const GOLD = '#2B3A8E';
const BLUE = '#0A84FF';

const AnimatedPath   = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ChatMode = 'coaching' | 'practice';

let _msgId = 0;
interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  visual?: VisualPayload;
}

export interface StudentContext {
  name?: string;
  cohort?: string;
  score?: number;
  smart?: number;
  grit?: number;
  build?: number;
  gap?: number;
  cohortBar?: number;
  referenceCompany?: string;
  applicationTarget?: string;
  isPaid?: boolean;
  initialMessage?: string;
  deadlines?: Array<{ id: string; label: string; date: string; createdBy?: string }>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  studentContext?: StudentContext;
}

// Message animation wrapper  -  defined as a const to prevent Metro cache issues
// where standalone function components can lose their reference during hot reload.
const MessageAnimIn = ({ children }: { children: React.ReactNode; index?: number | string }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};

/** 16-char hex conv id. Timestamp-seeded + random suffix so two sessions
 *  opened the same millisecond still get distinct ids. Stable per
 *  session; sent with every /ai/chat + the eventual /ai/chat/flush. */
function _newConvId(): string {
  const t = Date.now().toString(16).padStart(11, '0').slice(-11);
  const r = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return (t + r).slice(0, 16);
}

function getInitialSuggestions(ctx?: StudentContext, mode?: ChatMode): string[] {
  if (mode === 'practice') {
    return ['Start the interview', 'Ask me a behavioral question', 'Give me a technical challenge'];
  }
  if (ctx?.applicationTarget) {
    return ['What gaps do I have?', 'How do I stand out?', 'Prep me for the interview'];
  }
  if (ctx?.score && ctx.score > 0) {
    return ["What's my weakest area?", 'Where should I apply?', 'How do I improve my fit?'];
  }
  return ['Review my profile', 'How do I get an internship?', 'What skills should I develop?'];
}

function getPracticeSuggestions(text: string): string[] {
  const t = text.toLowerCase();
  if (t.includes('question') || t.includes('?')) return ['Let me think...', 'Can you rephrase?', 'Next question'];
  if (t.includes('feedback') || t.includes('improve')) return ['Ask me another', 'How was my structure?', 'Give me a harder one'];
  return ['I\'d like to try again', 'Next question please', 'How did I do overall?'];
}

function getResponseSuggestions(text: string): string[] {
  const t = text.toLowerCase();
  const chips: string[] = [];
  if (t.includes('profile') || t.includes('fact')) chips.push('What should I add to my profile?');
  if (t.includes('academic') || t.includes('gpa') || t.includes('coursework') || t.includes('technical')) chips.push('How do I improve my fit?');
  if (t.includes('leadership') || t.includes('club') || t.includes('experience')) chips.push('What experience am I missing?');
  if (t.includes('project') || t.includes('portfolio')) chips.push('What project should I build?');
  if (t.includes('interview')) chips.push('Help me prep for my interview');
  if (t.includes('apply') || t.includes('internship') || t.includes('company')) chips.push('Where should I apply first?');
  if (t.includes('linkedin')) chips.push('How do I optimize my LinkedIn?');
  if (t.includes('network') || t.includes('recruiter') || t.includes('coffee')) chips.push('How do I reach out to recruiters?');
  if (t.includes('skill') || t.includes('learn') || t.includes('gap')) chips.push('What skills should I develop?');
  const fallbacks = ['What should I do first?', 'Give me an example', 'Tell me more'];
  while (chips.length < 2 && fallbacks.length > 0) chips.push(fallbacks.shift()!);
  return chips.slice(0, 3);
}

export default function DillyAIOverlay({ visible, onClose: rawOnClose, studentContext }: Props) {
  const insets = useSafeAreaInsets();
  const { canSendAIMessage, incrementAIMessage, showPaywall } = useSubscription();
  // Theme-aware chat chrome. Bubbles, input, suggestion chips, and
  // send button all pull from the user's theme so the overlay reads
  // as part of Dilly on Midnight instead of flashing white.
  const theme = useResolvedTheme();

  // Device corner radius estimate. Tuned for iPhones:
  //   top inset 59+ (14 Pro / 15 / 16 Pro) → 55px physical radius
  //   top inset 47-55 (Pro / X / 11 / 12 / 13) → 47px
  //   top inset 44 (older notched) → 42px
  //   top inset 20 (SE, iPad) → 0
  const top = insets.top || 44;
  const R =
    top <= 20 ? 0 : top <= 44 ? 42 : top <= 48 ? 47
    : top <= 50 ? 50 : top <= 55 ? 52 : top <= 61 ? 55 : 60;

  // Apple Intelligence-style edge glow: a THIN line hugging the
  // device edge with a narrow soft bloom. Not a thick ring. Total
  // visual width is ~4px + a few pixels of fade — any thicker and
  // it reads as a "border," which isn't the vibe.
  //
  // Path runs ALONG the actual viewport edge (INSET = 0). The Svg
  // clips the outer half of the stroke off-screen, leaving the inner
  // half flush to the device edge. This is the "something stuck to
  // the edge and glowing" look; insetting the path by the stroke
  // radius leaves a visible sliver of background between the glow
  // and the edge, which reads as a gap.
  const STROKE_OUTER = 10;   // soft bloom (low opacity)
  const INSET = 0;
  const cornerR = R;
  const x0 = INSET;
  const y0 = INSET;
  const x1 = SCREEN_W - INSET;
  const y1 = SCREEN_H - INSET;

  const W = SCREEN_W;
  const H = SCREEN_H;
  const HALF_PATH_LEN =
    (x1 - x0) + (y1 - y0) + cornerR * (Math.PI - 2);

  // Each half starts at the bottom-center and walks up one side to the
  // top-center. Inset by INSET on all edges; corners use quadratic bezier
  // with the pre-inset screen corner as the control point so the arc
  // matches the phone's physical curve.
  const LEFT_PATH = [
    `M ${W / 2} ${y1}`, `L ${x0 + cornerR} ${y1}`,
    `Q ${x0} ${y1} ${x0} ${y1 - cornerR}`, `L ${x0} ${y0 + cornerR}`,
    `Q ${x0} ${y0} ${x0 + cornerR} ${y0}`, `L ${W / 2} ${y0}`,
  ].join(' ');

  const RIGHT_PATH = [
    `M ${W / 2} ${y1}`, `L ${x1 - cornerR} ${y1}`,
    `Q ${x1} ${y1} ${x1} ${y1 - cornerR}`, `L ${x1} ${y0 + cornerR}`,
    `Q ${x1} ${y0} ${x1 - cornerR} ${y0}`, `L ${W / 2} ${y0}`,
  ].join(' ');

  const [messages, setMessages] = useState<Message[]>([]);
  const [richContext, setRichContext] = useState<any>(null);
  const [input,    setInput]    = useState(''); // kept for backward compat but not used for display
  const inputRef = useRef('');
  const inputFieldRef = useRef<any>(null);
  // Stable conversation id — created on first send of a fresh session,
  // sent with every /ai/chat so the backend groups turns correctly, and
  // sent with /ai/chat/flush on close so extraction targets this exact
  // session. Cleared when the overlay closes.
  const convIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  // Mirror state into a ref so the (non-re-rendered) onClose callback
  // can read the final message list at dispatch time. Runs synchronously
  // on every render; cheap.
  messagesRef.current = messages;

  /** Wrap the passed-in onClose so we can flush extraction before
   *  handing back to the parent. If the user sent at least 2 messages
   *  this session, POST to /ai/chat/flush (one Haiku per session,
   *  cheaper than the per-turn extraction). Fires a global "pending"
   *  signal so My Dilly can show the writing-down overlay if mounted.
   *  Non-blocking — the overlay closes immediately, flush runs in the
   *  background. */
  const onClose = useCallback(() => {
    const convId = convIdRef.current;
    const msgs = messagesRef.current;
    const userMsgCount = msgs.filter(m => m.role === 'user').length;
    convIdRef.current = null;
    rawOnClose();
    if (!convId || userMsgCount < 1) return;
    markExtractionPending();
    (async () => {
      try {
        const res = await dilly.fetch('/ai/chat/flush', {
          method: 'POST',
          body: JSON.stringify({
            conv_id: convId,
            messages: msgs
              .filter(m => (m.content || '').trim().length > 0)
              .slice(-30)
              .map(m => ({ role: m.role, content: m.content })),
          }),
        });
        if (!res?.ok) { abortExtraction(); return; }
        const data = await res.json();
        resolveExtraction(Array.isArray(data?.added) ? data.added : []);
      } catch {
        abortExtraction();
      }
    })();
  }, [rawOnClose]);
  const [mode,     setMode]     = useState<ChatMode>('coaching');
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyMounted, setHistoryMounted] = useState(false);
  const historySlide = useRef(new Animated.Value(0)).current; // 0 = offscreen right, 1 = visible
  const [history, setHistory] = useState<any[]>([]);

  // Slide history panel in from the right when showHistory flips
  // true, slide out and unmount when it flips false. Keeps the
  // panel mounted through the exit animation so the transition
  // isn't a hard cut. 240ms in, 200ms out feels native-like.
  useEffect(() => {
    if (showHistory) {
      setHistoryMounted(true);
      Animated.timing(historySlide, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (historyMounted) {
      Animated.timing(historySlide, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setHistoryMounted(false);
      });
    }
  }, [showHistory, historyMounted, historySlide]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestionsOpacity = useRef(new Animated.Value(0)).current;
  const initialMessageSent = useRef(false);
  const pendingInitialMessage = useRef<string | null>(null);
  const sendFnRef = useRef<(text: string, msgs: Message[]) => Promise<void>>();

  const strokeOffset   = useRef(new Animated.Value(HALF_PATH_LEN)).current;
  const glowOpacity    = useRef(new Animated.Value(1)).current;
  const pulseBase      = useRef(new Animated.Value(0)).current;
  // Cosine-approximated breathe: 5 keyframes with zero velocity at extremes
  const breatheOpacity = useRef(
    pulseBase.interpolate({
      inputRange:  [0, 0.25, 0.5, 0.75, 1],
      outputRange: [1, 0.675, 0.35, 0.675, 1],
    })
  ).current;
  // Combined opacity: glowOpacity handles flash, breatheOpacity handles ongoing pulse
  const combinedOpacity = useRef(Animated.multiply(glowOpacity, breatheOpacity)).current;
  const flashR         = useRef(new Animated.Value(0)).current;
  const flashOp        = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const dotAnims       = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const glowLoopRef    = useRef<Animated.CompositeAnimation | null>(null);
  const dotLoopsRef    = useRef<(Animated.CompositeAnimation | null)[]>([]);
  const scrollRef      = useRef<ScrollView>(null);
  const userScrolledUp = useRef(false);
  const streamRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef    = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Timestamp of when the current send started. Used to enforce a
  // minimum "thinking" delay so fast server responses don't feel
  // like an instant lookup.
  const sendMessageWithTextStartedAt = useRef<number>(0);

  // Auto-scroll to bottom when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    return () => sub.remove();
  }, []);

  function startTypingDots() {
    dotLoopsRef.current.forEach(l => l?.stop());
    dotAnims.forEach(a => a.setValue(0));
    dotLoopsRef.current = dotAnims.map((a, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(a, { toValue: -6, duration: 260, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0,  duration: 260, useNativeDriver: true }),
          Animated.delay(Math.max(0, 480 - i * 160)),
        ])
      );
      loop.start();
      return loop;
    });
  }

  function stopTypingDots() {
    dotLoopsRef.current.forEach(l => l?.stop());
    dotAnims.forEach(a => a.setValue(0));
    dotLoopsRef.current = [];
  }

  useEffect(() => {
    if (isTyping) startTypingDots(); else stopTypingDots();
  }, [isTyping]);

  // ── Send a message (used by both manual input and auto-prompt) ──────────────

  const sendMessageWithText = useCallback(async (text: string, currentMessages: Message[]) => {
    // Paid user  -  no limits
    await incrementAIMessage();
    const userMsg: Message = { id: ++_msgId, role: 'user', content: text };
    const apiHistory = [...currentMessages, userMsg].map(m => ({ role: m.role, content: m.content })).slice(-20);
    // Cap displayed messages to 60 to prevent unbounded memory growth in long sessions
    const newHistory: Message[] = [...currentMessages, userMsg].slice(-60);
    setMessages(newHistory);
    inputRef.current = '';
    if (inputFieldRef.current) inputFieldRef.current.clear();
    setSuggestions([]);
    suggestionsOpacity.setValue(0);
    setIsTyping(true);
    sendMessageWithTextStartedAt.current = Date.now();
    userScrolledUp.current = false;
    timeoutsRef.current.push(setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50));

    try {
      const token = await getToken();
      if (!token) throw new Error('auth');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: apiHistory,
          mode,
          // Seed a stable conv_id on first send. Sticks for the whole
          // session, gets cleared on overlay close.
          conv_id: (convIdRef.current ||= _newConvId()),
          student_context: studentContext ? {
            name:              studentContext.name,
            cohort:            studentContext.cohort,
            score:             studentContext.score,
            smart:             studentContext.smart,
            grit:              studentContext.grit,
            build:             studentContext.build,
            gap:               studentContext.gap,
            cohort_bar:        studentContext.cohortBar,
            reference_company: studentContext.referenceCompany,
            application_target: studentContext.applicationTarget,
            deadlines:         studentContext.deadlines ?? [],
          } : null,
        }),
      });

      clearTimeout(timeout);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('auth');
        const errData = await res.json().catch(() => ({}));
        const detail = errData.detail;

        // 402 — global paywall wrapper (lib/dilly.ts) already
        // surfaced the elegant full-screen paywall. We just stop
        // spinning, remove the pending user message, and bail.
        // Never show "Server error 402" or a duplicate inline
        // upgrade bubble — one paywall, clean exit.
        if (res.status === 402) {
          setIsTyping(false);
          // Roll back the optimistic user message so the next chat
          // doesn't look half-sent.
          setMessages(newHistory.slice(0, -1));
          return;
        }

        // Daily quota hit (paid tier exhausted). Never expose the
        // raw cap number — that reads like a paywall and our paid
        // users reacted badly to it. Soft, in-character message;
        // Dilly "needs a breather" and everything resumes tomorrow.
        if (res.status === 429 && typeof detail === 'object' && detail?.code === 'DAILY_CHAT_CAP') {
          setIsTyping(false);
          const { upgrade_plan } = detail;
          const breather = upgrade_plan === 'pro'
            ? "We've covered a lot today. Let me process everything you've shared. I'll be sharper tomorrow. If you want unlimited runway, Pro removes the daily breather."
            : "We've covered a lot today. Let me process everything you've shared. I'll be sharper tomorrow.";
          setMessages([...newHistory, {
            id: ++_msgId,
            role: 'assistant',
            content: breather,
          }]);
          return;
        }

        // Soft error — never surface raw status codes to the user.
        // They're alarming, look like a bug, and say nothing useful.
        const errMsg = typeof detail === 'string' ? detail
          : typeof detail === 'object' && detail?.message ? detail.message
          : 'Dilly hit a snag. Try again in a moment.';
        throw new Error(errMsg);
      }
      const data = await res.json();

      const visual: VisualPayload | undefined = data.visual || undefined;
      const fullText = data.content as string;

      // Synthetic thinking delay. The server response usually comes
      // back in ~1.5-3s; for short/cached turns it can return in
      // under a second, which makes Dilly feel like a lookup engine
      // rather than an advisor thinking things through. We hold the
      // typing indicator for a minimum floor (~1.4s) so every turn
      // feels considered. Only applies when the response came back
      // faster than the floor — no delay added on already-slow
      // responses.
      // Bumped from 1400ms -> 2200ms per product direction: user
      // wants Dilly to "think" a bit longer to sell the illusion
      // of deliberation. Only applies when the server came back
      // faster than the floor — slow responses pass through
      // unchanged.
      const MIN_THINK_MS = 2200;
      const thinkStart = (sendMessageWithTextStartedAt.current || Date.now());
      const elapsed = Date.now() - thinkStart;
      if (elapsed < MIN_THINK_MS) {
        await new Promise(r => setTimeout(r, MIN_THINK_MS - elapsed));
      }

      setIsTyping(false);
      setMessages([...newHistory, { id: ++_msgId, role: 'assistant', content: '', visual: undefined }]);

      // Typing animation. Previously 8 chars per tick every 45ms
      // (≈180 chars/sec), then 4 chars / 55ms (≈72 c/s). Dropped
      // further to 3 chars per tick every 65ms (≈46 c/s) for a
      // slightly-faster-than-human feel. Human typing ≈ 35-40 c/s,
      // so 46 c/s reads as "quick but considered." Any slower and
      // long replies take too long.
      let i = 0;
      streamRef.current = setInterval(() => {
        i += 3;
        const done = i >= fullText.length;
        const chunk = done ? fullText : fullText.slice(0, i);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: chunk,
            visual: done ? visual : undefined,
          };
          return updated;
        });
        if (done) {
          clearInterval(streamRef.current!);
          streamRef.current = null;
          const newChips = mode === 'practice' ? getPracticeSuggestions(fullText) : getResponseSuggestions(fullText);
          setSuggestions(newChips);
          Animated.timing(suggestionsOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        } else if (!userScrolledUp.current) {
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }, 65);

    } catch (err: any) {
      setIsTyping(false);
      console.warn('[DillyAI] error:', err?.message || err);
      const errMsg = err?.message || '';
      const isAuth = errMsg === 'auth' || errMsg.includes('Sign in') || errMsg.includes('session') || errMsg.includes('401');
      const isTimeout = err?.name === 'AbortError';
      // Never surface "Server error" or a raw status code. Generic
      // friendly message — the kind of thing you'd say to a friend.
      const msg = isAuth
        ? 'Your session expired. Close this and reopen Dilly to reconnect.'
        : isTimeout
        ? 'That took too long. Check your connection and try again.'
        : "Dilly is having a moment. Give it a minute and try again.";
      setMessages([...newHistory, {
        id: ++_msgId,
        role: 'assistant',
        content: msg,
      }]);
    }
  }, [mode, studentContext, canSendAIMessage]);

  // Keep a ref to the latest sendMessageWithText so timeouts always use current version
  sendFnRef.current = sendMessageWithText;

  // ── Open / close ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      mediumHaptic();
      setMessages([]);
      setRichContext(null);
      inputRef.current = '';
      if (inputFieldRef.current) inputFieldRef.current.clear();
      setMode('coaching');
      setIsTyping(false);
      initialMessageSent.current = false;
      pendingInitialMessage.current = studentContext?.initialMessage || null;
      setSuggestions([]);
      suggestionsOpacity.setValue(0);
      timeoutsRef.current.push(setTimeout(() => {
        const chips = getInitialSuggestions(studentContext, mode);
        setSuggestions(chips);
        Animated.timing(suggestionsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }, 1600));

      strokeOffset.setValue(HALF_PATH_LEN);
      glowOpacity.setValue(1);
      pulseBase.setValue(0);
      flashR.setValue(0);
      flashOp.setValue(0);
      contentOpacity.setValue(0);
      glowLoopRef.current?.stop();

      // Fetch rich context and proactive message
      (async () => {
        try {
          const res = await dilly.fetch('/ai/context');
          if (res.ok) {
            const data = await res.json();
            setRichContext(data.context);

            // If no initialMessage, show proactive greeting
            if (!pendingInitialMessage.current && data.proactive_message) {
              timeoutsRef.current.push(setTimeout(() => {
                setMessages(prev => {
                  if (prev.length === 0) {
                    return [{ id: ++_msgId, role: 'assistant', content: data.proactive_message }];
                  }
                  return prev;
                });
                timeoutsRef.current.push(setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100));
              }, 1500));
            }
          }
        } catch {}

        // Auto-send initialMessage regardless of /ai/context success/failure.
        // Uses sendFnRef to avoid stale closure from useCallback.
        if (pendingInitialMessage.current && !initialMessageSent.current) {
          const msg = pendingInitialMessage.current;
          initialMessageSent.current = true;
          timeoutsRef.current.push(setTimeout(() => {
            sendFnRef.current?.(msg, []);
          }, 1200));
        }
      })();

      Animated.timing(contentOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();

      Animated.timing(strokeOffset, {
        toValue: 0, duration: 1100,
        easing: Easing.inOut(Easing.ease), useNativeDriver: false,
      }).start(() => {
        Animated.parallel([
          Animated.timing(flashR,  { toValue: 18, duration: 160, useNativeDriver: false }),
          Animated.timing(flashOp, { toValue: 1,  duration: 80,  useNativeDriver: false }),
        ]).start(() => {
          Animated.parallel([
            Animated.timing(flashR,  { toValue: 0, duration: 360, useNativeDriver: false }),
            Animated.timing(flashOp, { toValue: 0, duration: 360, useNativeDriver: false }),
          ]).start();
        });
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: 0.2, duration: 80,  useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 1.0, duration: 200, useNativeDriver: true }),
        ]).start(() => {
          // Start smooth cosine pulse via pulseBase (single linear 0→1 loop).
          // The interpolation through 5 keyframes approximates cos(2πt),
          // so velocity is zero at both extremes  -  no sudden jumps.
          pulseBase.setValue(0);
          glowLoopRef.current = Animated.loop(
            Animated.timing(pulseBase, {
              toValue: 1,
              duration: 3600,
              easing: Easing.linear,
              useNativeDriver: true,
            })
          );
          glowLoopRef.current.start();
        });
      });
    } else {
      // Cancel all pending timeouts so stale state updates don't fire after close
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      glowLoopRef.current?.stop();
      stopTypingDots();
      if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
      contentOpacity.setValue(0);
      strokeOffset.setValue(HALF_PATH_LEN);
      setSuggestions([]);
      suggestionsOpacity.setValue(0);
    }
  }, [visible]);

  // Cleanup on unmount  -  cancel any lingering stream/timeouts
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
      glowLoopRef.current?.stop();
    };
  }, []);

  // ── Manual send ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = (inputRef.current || '').trim();
    if (!text || isTyping || streamRef.current) return;
    inputRef.current = '';
    if (inputFieldRef.current) inputFieldRef.current.clear();
    sendMessageWithText(text, messages);
  }, [isTyping, messages, sendMessageWithText]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* First-visit coach. Only fires on the user's very first open
          of the Dilly AI overlay. Explains what Dilly actually is
          before they see the input bar and freeze trying to come up
          with something to type. The coach's own Modal sits above
          this one because RN stacks Modals in mount order. */}
      <FirstVisitCoach
        id="dilly-ai-overlay-v1"
        iconName="sparkles"
        headline="This is Dilly. Talk like a friend who knows your career."
        subline="Every conversation feeds your profile. The more you tell Dilly, the sharper your Chapters, fits, and resumes get."
        disabled={!visible}
      />
      <Animated.View style={[s.container, { opacity: contentOpacity, backgroundColor: theme.surface.bg, borderColor: theme.accent }]}>

        {/* Glow border */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: combinedOpacity }]}>
            <Svg width={SCREEN_W} height={SCREEN_H}>
              {/* Apple-Intelligence edge glow: just two strokes per
                  side. An outer 10px soft bloom at ~15% opacity, and
                  a 1.5px crisp accent line at full opacity. That's
                  the entire light. Reads as "edge glow," not a ring. */}
              <AnimatedPath d={LEFT_PATH}  fill="none" stroke={BLUE} strokeWidth={STROKE_OUTER} strokeOpacity={0.15} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={LEFT_PATH}  fill="none" stroke={GOLD} strokeWidth={1.5} strokeOpacity={1} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={RIGHT_PATH} fill="none" stroke={BLUE} strokeWidth={STROKE_OUTER} strokeOpacity={0.15} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={RIGHT_PATH} fill="none" stroke={GOLD} strokeWidth={1.5} strokeOpacity={1} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedCircle cx={W / 2} cy={0} r={flashR} fill="none" stroke={GOLD} strokeWidth={2} opacity={flashOp} />
            </Svg>
          </Animated.View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 10, borderBottomColor: theme.surface.border }]}>
            <View style={s.wordmark}>
              {/* Removed the "AI" wordmark next to the logo — the
                  surface is already clearly the chat overlay (input,
                  mode pills, past conversations icon). The extra
                  "AI" was noise. Just the accent-tinted logo now. */}
              <Image
                source={require('../assets/logo.png')}
                style={[s.wordmarkLogo, { tintColor: theme.accent }]}
                resizeMode="contain"
              />
            </View>
            <View style={s.modePills}>
              {(['coaching', 'practice'] as ChatMode[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[
                    s.modePill,
                    mode === m && { backgroundColor: theme.accent },
                  ]}
                  onPress={() => {
                  if (mode === m) return;
                  setMode(m);
                  setMessages([]);
                  setRichContext(null);
                  setSuggestions(getInitialSuggestions(studentContext, m));
                  suggestionsOpacity.setValue(1);
                }}>
                  <Text style={[
                    s.modePillText,
                    { color: mode === m ? '#FFFFFF' : theme.surface.t3 },
                  ]}>
                    {m === 'coaching' ? 'COACH' : 'PRACTICE'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={async () => {
                // /ai/chat-history returns threads recorded by the
                // chat endpoint itself. Previously we hit
                // /voice/history which only covered Voice-feature
                // outputs, so chat users saw "No past conversations"
                // even after dozens of chats. See
                // api/chat_thread_store.py for the storage format.
                try {
                  // Cap at the 5 most recent. Pro users might have
                  // hundreds of past threads and the list becomes
                  // overwhelming; 5 covers "my last chat or two" which
                  // is the common need.
                  const res = await dilly.fetch('/ai/chat-history?limit=5');
                  if (res.ok) {
                    const data = await res.json();
                    setHistory(data?.items || []);
                  }
                } catch {}
                setShowHistory(true);
              }}
              hitSlop={12}
              style={{ marginRight: 8 }}
            >
              <Ionicons name="time-outline" size={20} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <View style={[s.closeBtnCircle, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}>
                <Ionicons name="close" size={18} color={theme.surface.t1} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView ref={scrollRef} style={s.messageList} contentContainerStyle={s.messageListContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => { userScrolledUp.current = true; }}
            onScrollEndDrag={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const isAtBottom = contentOffset.y >= contentSize.height - layoutMeasurement.height - 40;
              if (isAtBottom) userScrolledUp.current = false;
            }}>
            {messages.length === 0 && !richContext && (
              <View style={s.emptyWrap}>
                {mode === 'practice' ? (
                  <>
                    <Ionicons name="mic" size={32} color={theme.accent} style={{ marginBottom: 12, opacity: 0.6 }} />
                    <Text style={[s.emptyText, { color: theme.surface.t3 }]}>Mock interview mode.</Text>
                    <Text style={[s.emptyText, { color: theme.surface.t3, marginTop: 4, opacity: 0.6, fontSize: 13 }]}>
                      I'll play the interviewer. You answer. I give feedback after each response, then ask the next question.
                    </Text>
                  </>
                ) : (
                  <>
                    {/* No ring — DillyFace is always rendered clean.
                        The face itself carries the personality. */}
                    <View style={{ width: 90, height: 90, alignItems: 'center', justifyContent: 'center' }}>
                      <DillyFace size={70} />
                    </View>
                    <Text style={[s.emptyText, { color: theme.surface.t3, marginTop: 16 }]}>
                      Ask me anything: your strengths, what to fix, where to apply.
                    </Text>
                  </>
                )}
              </View>
            )}

            {messages.map((msg) => {
              const Wrapper = MessageAnimIn || View;
              return (
              <Wrapper key={msg.id} index={msg.id}>
                {msg.role === 'user' ? (
                  <View style={[s.msgRow, { justifyContent: 'flex-end' }]}>
                    <View style={[s.userBubble, { backgroundColor: theme.accentSoft }]}>
                      <Text style={[s.msgText, { color: theme.surface.t1 }]}>{msg.content}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.assistantBlock}>
                    <View style={s.msgRow}>
                      <View style={[s.assistantDot, { backgroundColor: theme.accent }]} />
                      <View style={[s.assistantBubble, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
                        <RichText text={msg.content} baseStyle={[s.msgText, { color: theme.surface.t1 }]} />
                      </View>
                    </View>
                    {msg.visual && (
                      <View style={s.visualWrap}>
                        <DillyVisual payload={msg.visual} />
                      </View>
                    )}
                  </View>
                )}
              </Wrapper>
              );
            })}

            {isTyping && (
              // Writing Dilly replaces the three dots. Same
              // "something is happening" affordance, way more
              // personality. The pencil scribbles while the
              // response streams.
              <View style={[s.msgRow, { justifyContent: 'flex-start', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4, paddingLeft: 8 }]}>
                {/* DillyFace sizes itself: the outer wrapper expands
                    to fit the external pencil. No fixed width/height
                    container around it, or the pencil (which lives
                    in the bottom-right padding) gets clipped by the
                    parent. Left padding keeps the ring off the
                    screen edge. */}
                <DillyFace size={52} mood="writing" accessory="pencil" />
                {/* Label height matches the smaller DillyFace ring
                    (52) — user asked for a more compact typing
                    indicator. Centered vertically so the baseline
                    sits at the middle of the ring. */}
                <View style={{ height: 52, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, color: theme.surface.t3, fontStyle: 'italic' }}>
                    Dilly is writing…
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Memory progress pill — shows user how close they are to
              the threshold where Dilly actually saves things to their
              profile on chat close. Matches LLM_EXTRACTION_MIN_USER_MSGS
              on the backend (currently 5). Framed as Dilly "listening"
              so the bar feels like a product feature, not a cost gate.
              Disappears once threshold is hit. Never shown when typing
              or when suggestion chips are visible (reduces bottom-bar
              clutter). */}
          {(() => {
            // Memory progress pill. Mirrors the backend gate
            // (LLM_EXTRACTION_MIN_USER_MSGS = 5) so the user knows
            // how close they are to having this conversation
            // actually written to their profile. Under the bar:
            // shows a countdown so the ask feels finite. Above the
            // bar: swaps to a "she's writing" reassurance. Hides
            // while Dilly is typing so the bar doesn't flicker.
            const THRESHOLD = 5;
            const userMsgs = messages.filter(m => m.role === 'user').length;
            if (userMsgs === 0 || isTyping) return null;
            const remaining = THRESHOLD - userMsgs;
            const atBar = remaining <= 0;
            return (
              <View style={[s.memoryPill, { borderTopColor: theme.surface.border }]}>
                <Ionicons
                  name={atBar ? 'bookmark' : 'ear-outline'}
                  size={13}
                  color={atBar ? theme.accent : theme.surface.t3}
                />
                <Text style={[s.memoryPillText, { color: atBar ? theme.accent : theme.surface.t3 }]}>
                  {atBar
                    ? "Dilly will save what she's learning when you close this chat."
                    : `Dilly saves what she learns after ${remaining} more message${remaining === 1 ? '' : 's'}.`}
                </Text>
              </View>
            );
          })()}

          {/* Suggestion chips */}
          {suggestions.length > 0 && (
            <Animated.View style={{ opacity: suggestionsOpacity }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.suggestionRow}
                style={s.suggestionWrap}
                keyboardShouldPersistTaps="handled"
              >
                {suggestions.map((chip, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.suggestionChip, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}
                    onPress={() => {
                      setSuggestions([]);
                      suggestionsOpacity.setValue(0);
                      sendMessageWithText(chip, messages);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.suggestionChipText, { color: theme.surface.t1 }]}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Input */}
          <View style={[s.inputBar, { paddingBottom: insets.bottom + 10, borderTopColor: theme.surface.border }]}>
            <TextInput
              style={[s.input, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, color: theme.surface.t1 }]}
              placeholder={mode === 'practice' ? "Type your answer..." : "Ask Dilly anything..."}
              placeholderTextColor={theme.surface.t3}
              defaultValue=""
              onChangeText={t => { inputRef.current = t; }}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              editable={!isTyping && !streamRef.current}
              ref={inputFieldRef}
            />
            <TouchableOpacity style={[s.sendBtn, { backgroundColor: theme.accent }, isTyping && s.sendBtnDisabled]} onPress={sendMessage} disabled={isTyping} activeOpacity={0.8}>
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* History overlay. Animated slide-in from the right. Kept
          mounted through the exit animation so the transition is
          smooth in both directions. */}
      {historyMounted && (
        <Animated.View
          style={[
            s.historyOverlay,
            {
              backgroundColor: theme.surface.bg,
              transform: [{
                translateX: historySlide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [SCREEN_W, 0],
                }),
              }],
            },
          ]}
        >
          {/* First-visit coach inside the history panel. Explains the
              5-cap and the Keep button before the user wonders where
              their old chats went. Fires once, uniquely for this
              panel. */}
          <FirstVisitCoach
            id="dilly-history-v1"
            iconName="journal-outline"
            headline="Dilly keeps your 5 most recent chats."
            subline="Tap the pin on any chat to keep it forever. Anything unpinned rolls off as new chats come in."
          />
          <View style={[s.historyHeader, { paddingTop: insets.top + 10, borderBottomColor: theme.surface.border }]}>
            <Text style={[s.historyTitle, { color: theme.surface.t1 }]}>Past Conversations</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)} hitSlop={12}>
              <Ionicons name="close" size={20} color={theme.surface.t2} />
            </TouchableOpacity>
          </View>
          {/* Explainer strip. The 5-cap is real product policy — saves
              disk and keeps the list scannable. The Keep button exists
              so users don't lose the one chat that mattered. */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.accentSoft, borderBottomWidth: 1, borderBottomColor: theme.accentBorder }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent, letterSpacing: 0.3 }}>
              Dilly saves your 5 most recent chats. Tap the pin on one you want to keep.
            </Text>
          </View>
          <ScrollView style={s.historyList}>
            {history.length === 0 ? (
              <Text style={[s.historyEmpty, { color: theme.surface.t3 }]}>No past conversations yet.</Text>
            ) : (
              history.map((item: any, i: number) => {
                // Shape from /ai/chat-history:
                //   first_user_message, last_assistant_message,
                //   last_turn_at, turn_count, conv_id
                // Fall back to older voice-history shape so we
                // don't blank out any users with leftover cached data.
                //
                // Chapter threads use conv_id 'chapter-<id>-q' and
                // their first_user_message is whatever the user
                // typed in the Chapter question screen — which on
                // its own reads identical to a normal chat. Tag
                // them explicitly so users can find their Chapter
                // follow-up conversations in the history list.
                const isChapterThread = typeof item.conv_id === 'string' && item.conv_id.startsWith('chapter-');
                const rawTitle =
                  item.first_user_message ||
                  item.session_title ||
                  item.topic ||
                  'Conversation';
                const title = isChapterThread
                  ? `Chapter · ${rawTitle}`
                  : rawTitle;
                const whenIso = item.last_turn_at || item.captured_at;
                const whenLabel = whenIso
                  ? new Date(whenIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                const turns = Number(item.turn_count) || 0;
                return (
                  <TouchableOpacity
                    key={item.conv_id || i}
                    style={[s.historyItem, { borderBottomColor: theme.surface.border }]}
                    onPress={async () => {
                      // Load the full transcript and replace the
                      // current message list so the user can actually
                      // read what was said. Threads stored before the
                      // full-transcript field was added will come back
                      // empty — fall back to just closing in that case.
                      if (!item.conv_id) { setShowHistory(false); return; }
                      // If Dilly is mid-reply when the user opens
                      // another thread, kill the in-flight stream
                      // and the typing indicator immediately. Without
                      // this, the streaming characters of the OLD
                      // reply would keep appending to the NEW thread
                      // the user just loaded.
                      if (streamRef.current) {
                        clearInterval(streamRef.current);
                        streamRef.current = null;
                      }
                      setIsTyping(false);
                      try {
                        const res = await dilly.fetch(`/ai/chat-history/${item.conv_id}/messages`);
                        if (res.ok) {
                          const data = await res.json();
                          const msgs: any[] = Array.isArray(data?.messages) ? data.messages : [];
                          if (msgs.length > 0) {
                            setMessages(msgs.map((m) => ({
                              id: ++_msgId,
                              role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
                              content: String(m.content || ''),
                            })));
                            convIdRef.current = item.conv_id;
                            setSuggestions([]);
                          }
                        }
                      } catch {}
                      setShowHistory(false);
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.historyItemTitle, { color: theme.surface.t1 }]} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={[s.historyItemDate, { color: theme.surface.t3 }]}>
                        {whenLabel}{turns ? `  ·  ${turns} turn${turns === 1 ? '' : 's'}` : ''}{item.kept ? '  ·  Kept' : ''}
                      </Text>
                    </View>
                    {/* Pin/Keep button. Toggles the kept flag on the
                        thread. Kept threads never roll off the 5-cap.
                        Optimistic update so the pin fills instantly. */}
                    <TouchableOpacity
                      hitSlop={10}
                      style={{ marginLeft: 10, padding: 4 }}
                      onPress={async (e: any) => {
                        e?.stopPropagation?.();
                        if (!item.conv_id) return;
                        const newKept = !item.kept;
                        // Optimistic: mutate the local history array so
                        // the icon fills immediately. If the request
                        // fails we'll get the right value on next fetch.
                        setHistory(prev => prev.map((h: any) => h.conv_id === item.conv_id ? { ...h, kept: newKept } : h));
                        try {
                          await dilly.fetch(`/ai/chat-history/${item.conv_id}/keep`, {
                            method: 'POST',
                            body: JSON.stringify({ kept: newKept }),
                          });
                        } catch {}
                      }}
                    >
                      <Ionicons
                        name={item.kept ? 'bookmark' : 'bookmark-outline'}
                        size={18}
                        color={item.kept ? theme.accent : theme.surface.t3}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.indigo, borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.b1, zIndex: 10 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  wordmarkLogo: { height: 24, width: 68 },
  wordmarkAI: { fontFamily: 'Cinzel_900Black', fontSize: 22, color: GOLD, letterSpacing: 1, lineHeight: 24, marginBottom: -1 },
  modePills: { flexDirection: 'row', gap: 4, marginRight: 10 },
  modePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  modePillActive: { backgroundColor: GOLD },
  modePillText: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1, color: colors.t3 },
  modePillTextActive: { color: '#FFFFFF' },
  closeBtn: { zIndex: 20 },
  closeBtnCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b2,
    alignItems: 'center', justifyContent: 'center',
  },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 4 },
  emptyWrap: { paddingTop: 40, alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { color: colors.t3, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  assistantBlock: { marginBottom: 8 },
  visualWrap: { paddingLeft: 14 },
  userBubble: { backgroundColor: colors.golddim, borderRadius: 18, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, maxWidth: '80%' },
  assistantBubble: { backgroundColor: colors.s1, borderRadius: 18, borderBottomLeftRadius: 4, paddingVertical: 10, paddingHorizontal: 14, maxWidth: '80%', flexShrink: 1, borderWidth: 1, borderColor: colors.b1 },
  msgText: { color: colors.t1, fontSize: 15, lineHeight: 22 },
  assistantDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginBottom: 8, flexShrink: 0 },
  typingBubble: { backgroundColor: colors.s1, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, height: 42, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.b1 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.b1 },
  input: { flex: 1, backgroundColor: colors.s1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, color: colors.t1, borderWidth: 1, borderColor: colors.b1 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.35 },
  suggestionWrap: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' },
  memoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  memoryPillText: { fontSize: 11, fontStyle: 'italic', flex: 1 },
  suggestionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  suggestionChip: { backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b2, paddingHorizontal: 14, paddingVertical: 8 },
  suggestionChipText: { color: colors.t1, fontSize: 13, fontWeight: '500' },

  // History overlay
  historyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 30 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  historyTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  historyList: { flex: 1, paddingHorizontal: 16 },
  historyEmpty: { fontSize: 13, color: colors.t3, textAlign: 'center', paddingTop: 40 },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  historyItemTitle: { fontSize: 14, fontWeight: '500', color: colors.t1, flex: 1, marginRight: 10 },
  historyItemDate: { fontSize: 11, color: colors.t3 },
});
