import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Animated, Easing, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, API_BASE } from '../lib/tokens';
import { getToken } from '../lib/auth';
import { dilly } from '../lib/dilly';
import RichText from './RichText';
import { DillyVisual, VisualPayload } from './DillyVisuals';
import { useSubscription } from '../hooks/useSubscription';

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

// Message animation wrapper — defined as a const to prevent Metro cache issues
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

function getInitialSuggestions(ctx?: StudentContext): string[] {
  if (ctx?.applicationTarget) {
    return ['What gaps do I have?', 'How do I stand out?', 'Prep me for the interview'];
  }
  if (ctx?.score && ctx.score > 0) {
    return ["What's my weakest area?", 'Where should I apply?', 'How do I improve my score?'];
  }
  return ['Review my resume', 'How do I get an internship?', 'What skills should I build?'];
}

function getResponseSuggestions(text: string): string[] {
  const t = text.toLowerCase();
  const chips: string[] = [];
  if (t.includes('resume') || t.includes('bullet')) chips.push('Show me an example bullet');
  if (t.includes('smart') || t.includes('academic') || t.includes('gpa')) chips.push('How do I raise my Smart score?');
  if (t.includes('grit') || t.includes('leadership') || t.includes('club')) chips.push('What builds Grit fastest?');
  if (t.includes('build') || t.includes('project') || t.includes('portfolio')) chips.push('What project should I build?');
  if (t.includes('interview')) chips.push('Help me prep for my interview');
  if (t.includes('apply') || t.includes('internship') || t.includes('company')) chips.push('Where should I apply first?');
  if (t.includes('linkedin')) chips.push('How do I optimize my LinkedIn?');
  if (t.includes('network') || t.includes('recruiter') || t.includes('coffee')) chips.push('How do I reach out to recruiters?');
  const fallbacks = ['What should I do first?', 'Give me an example', 'Tell me more'];
  while (chips.length < 2 && fallbacks.length > 0) chips.push(fallbacks.shift()!);
  return chips.slice(0, 3);
}

export default function DillyAIOverlay({ visible, onClose, studentContext }: Props) {
  const insets = useSafeAreaInsets();
  const { canSendAIMessage, incrementAIMessage, showPaywall } = useSubscription();

  const top = insets.top || 44;
  const R =
    top <= 20 ? 0 : top <= 44 ? 39 : top <= 48 ? 42
    : top <= 50 ? 44 : top <= 55 ? 47 : top <= 61 ? 55 : 62;

  const W = SCREEN_W;
  const H = SCREEN_H;
  const HALF_PATH_LEN = W + H + R * (Math.PI - 2);

  const LEFT_PATH = [
    `M ${W / 2} ${H}`, `L ${R} ${H}`,
    `Q 0 ${H} 0 ${H - R}`, `L 0 ${R}`,
    `Q 0 0 ${R} 0`, `L ${W / 2} 0`,
  ].join(' ');

  const RIGHT_PATH = [
    `M ${W / 2} ${H}`, `L ${W - R} ${H}`,
    `Q ${W} ${H} ${W} ${H - R}`, `L ${W} ${R}`,
    `Q ${W} 0 ${W - R} 0`, `L ${W / 2} 0`,
  ].join(' ');

  const [messages, setMessages] = useState<Message[]>([]);
  const [richContext, setRichContext] = useState<any>(null);
  const [input,    setInput]    = useState('');
  const [mode,     setMode]     = useState<ChatMode>('coaching');
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
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
  const streamRef      = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // Paid user — no limits
    await incrementAIMessage();
    const userMsg: Message = { id: ++_msgId, role: 'user', content: text };
    const apiHistory = [...currentMessages, userMsg].map(m => ({ role: m.role, content: m.content })).slice(-30);
    const newHistory: Message[] = [...currentMessages, userMsg];
    setMessages(newHistory);
    setInput('');
    setSuggestions([]);
    suggestionsOpacity.setValue(0);
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          messages: apiHistory,
          mode,
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

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed');

      const visual: VisualPayload | undefined = data.visual || undefined;
      const fullText = data.content as string;

      setIsTyping(false);
      setMessages([...newHistory, { id: ++_msgId, role: 'assistant', content: '', visual: undefined }]);

      let i = 0;
      streamRef.current = setInterval(() => {
        i += 8;
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
          const newChips = getResponseSuggestions(fullText);
          setSuggestions(newChips);
          Animated.timing(suggestionsOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        } else {
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }, 45);

    } catch {
      setIsTyping(false);
      setMessages([...newHistory, {
        id: ++_msgId,
        role: 'assistant',
        content: 'Something went wrong. Make sure the API is running and ANTHROPIC_API_KEY is set in .env.',
      }]);
    }
  }, [mode, studentContext, canSendAIMessage]);

  // Keep a ref to the latest sendMessageWithText so timeouts always use current version
  sendFnRef.current = sendMessageWithText;

  // ── Open / close ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      setMessages([]);
      setRichContext(null);
      setInput('');
      setMode('coaching');
      setIsTyping(false);
      initialMessageSent.current = false;
      pendingInitialMessage.current = studentContext?.initialMessage || null;
      setSuggestions([]);
      suggestionsOpacity.setValue(0);
      setTimeout(() => {
        const chips = getInitialSuggestions(studentContext);
        setSuggestions(chips);
        Animated.timing(suggestionsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }, 1600);

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
              setTimeout(() => {
                setMessages(prev => {
                  if (prev.length === 0) {
                    return [{ id: ++_msgId, role: 'assistant', content: data.proactive_message }];
                  }
                  return prev;
                });
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              }, 1500);
            }
          }
        } catch {}

        // Auto-send initialMessage regardless of /ai/context success/failure.
        // Uses sendFnRef to avoid stale closure from useCallback.
        if (pendingInitialMessage.current && !initialMessageSent.current) {
          const msg = pendingInitialMessage.current;
          initialMessageSent.current = true;
          setTimeout(() => {
            sendFnRef.current?.(msg, []);
          }, 1200);
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
          // so velocity is zero at both extremes — no sudden jumps.
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
      glowLoopRef.current?.stop();
      stopTypingDots();
      if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
      contentOpacity.setValue(0);
      strokeOffset.setValue(HALF_PATH_LEN);
      setSuggestions([]);
      suggestionsOpacity.setValue(0);
    }
  }, [visible]);

  // ── Manual send ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping || streamRef.current) return;
    sendMessageWithText(text, messages);
  }, [input, isTyping, messages, sendMessageWithText]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[s.container, { opacity: contentOpacity }]}>

        {/* Glow border */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: combinedOpacity }]}>
            <Svg width={SCREEN_W} height={SCREEN_H}>
              <AnimatedPath d={LEFT_PATH}  fill="none" stroke={BLUE} strokeWidth={22} strokeOpacity={0.12} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={LEFT_PATH}  fill="none" stroke={BLUE} strokeWidth={10} strokeOpacity={0.40} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={LEFT_PATH}  fill="none" stroke={GOLD} strokeWidth={4}  strokeOpacity={1}    strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={RIGHT_PATH} fill="none" stroke={BLUE} strokeWidth={22} strokeOpacity={0.12} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={RIGHT_PATH} fill="none" stroke={BLUE} strokeWidth={10} strokeOpacity={0.40} strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedPath d={RIGHT_PATH} fill="none" stroke={GOLD} strokeWidth={4}  strokeOpacity={1}    strokeLinecap="round" strokeDasharray={`${HALF_PATH_LEN} ${HALF_PATH_LEN}`} strokeDashoffset={strokeOffset} />
              <AnimatedCircle cx={W / 2} cy={0} r={flashR} fill="none" stroke={GOLD} strokeWidth={2} opacity={flashOp} />
            </Svg>
          </Animated.View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 10 }]}>
            <View style={s.wordmark}>
              <Image source={require('../assets/logo.png')} style={s.wordmarkLogo} resizeMode="contain" />
              <Text style={s.wordmarkAI}>AI</Text>
            </View>
            <View style={s.modePills}>
              {(['coaching', 'practice'] as ChatMode[]).map(m => (
                <TouchableOpacity key={m} style={[s.modePill, mode === m && s.modePillActive]} onPress={() => setMode(m)}>
                  <Text style={[s.modePillText, mode === m && s.modePillTextActive]}>
                    {m === 'coaching' ? 'COACH' : 'PRACTICE'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const res = await dilly.fetch('/voice/history?limit=20');
                  if (res.ok) { const data = await res.json(); setHistory(data?.items || []); }
                } catch {}
                setShowHistory(true);
              }}
              hitSlop={12}
              style={{ marginRight: 8 }}
            >
              <Ionicons name="time-outline" size={20} color={colors.t2} />
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <View style={s.closeBtnCircle}>
                <Ionicons name="close" size={18} color={colors.t1} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView ref={scrollRef} style={s.messageList} contentContainerStyle={s.messageListContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {messages.length === 0 && !richContext && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>
                  {mode === 'practice'
                    ? "Ready to practice? I'll run you through a real interview."
                    : 'Ask me anything — your score, what to fix, where to apply.'}
                </Text>
              </View>
            )}

            {messages.map((msg) => {
              const Wrapper = MessageAnimIn || View;
              return (
              <Wrapper key={msg.id} index={msg.id}>
                {msg.role === 'user' ? (
                  <View style={[s.msgRow, { justifyContent: 'flex-end' }]}>
                    <View style={s.userBubble}>
                      <Text style={s.msgText}>{msg.content}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.assistantBlock}>
                    <View style={s.msgRow}>
                      <View style={s.assistantDot} />
                      <View style={s.assistantBubble}>
                        <RichText text={msg.content} baseStyle={s.msgText} />
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
              <View style={[s.msgRow, { justifyContent: 'flex-start' }]}>
                <View style={s.assistantDot} />
                <View style={s.typingBubble}>
                  {dotAnims.map((a, i) => (
                    <Animated.View key={i} style={[s.typingDot, { transform: [{ translateY: a }] }]} />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

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
                    style={s.suggestionChip}
                    onPress={() => {
                      setSuggestions([]);
                      suggestionsOpacity.setValue(0);
                      sendMessageWithText(chip, messages);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.suggestionChipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Input */}
          <View style={[s.inputBar, { paddingBottom: insets.bottom + 10 }]}>
            <TextInput
              style={s.input}
              placeholder="Ask Dilly anything..."
              placeholderTextColor={colors.t3}
              value={input}
              onChangeText={setInput}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              editable={!isTyping && !streamRef.current}
            />
            <TouchableOpacity style={[s.sendBtn, (!input.trim() || isTyping) && s.sendBtnDisabled]} onPress={sendMessage} disabled={!input.trim() || isTyping} activeOpacity={0.8}>
              <Ionicons name="arrow-up" size={18} color={colors.bg} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* History overlay */}
      {showHistory && (
        <View style={s.historyOverlay}>
          <View style={[s.historyHeader, { paddingTop: insets.top + 10 }]}>
            <Text style={s.historyTitle}>Past Conversations</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.t2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.historyList}>
            {history.length === 0 ? (
              <Text style={s.historyEmpty}>No past conversations yet.</Text>
            ) : (
              history.map((item: any, i: number) => (
                <TouchableOpacity
                  key={item.conv_id || i}
                  style={s.historyItem}
                  onPress={() => setShowHistory(false)}
                >
                  <Text style={s.historyItemTitle} numberOfLines={1}>
                    {item.session_title || item.topic || 'Conversation'}
                  </Text>
                  <Text style={s.historyItemDate}>
                    {item.captured_at ? new Date(item.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.b1, zIndex: 10 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  wordmarkLogo: { height: 28, width: 80 },
  wordmarkAI: { fontFamily: 'Cinzel_900Black', fontSize: 28, color: GOLD, letterSpacing: 2, lineHeight: 28 },
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
  suggestionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  suggestionChip: { backgroundColor: colors.s2, borderRadius: 999, borderWidth: 1, borderColor: colors.b2, paddingHorizontal: 14, paddingVertical: 8 },
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