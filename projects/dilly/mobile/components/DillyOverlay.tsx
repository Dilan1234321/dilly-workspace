import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DillyFace } from './DillyFace';
import { colors } from '../lib/tokens';
import { useDillyOverlayState } from '../hooks/useDillyOverlay';

// ── Constants ─────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');

// Legacy overlay — DillyAIOverlay.tsx is the active chat component
const MOCK_COACHING_RESPONSE =
  'Your Grit score is holding you back the most right now. ' +
  'A 61 tells me your resume shows effort — but not sustained, quantified impact. ' +
  "Goldman Sachs recruiters scan for three things: leadership, results with numbers, and proof you didn't quit when something got hard. " +
  "Right now your resume signals \"I did the work\" — not \"I drove the outcome.\"\n\n" +
  'Three fixes you can make tonight:\n\n' +
  '1. Add a results line to every bullet. "Led project" becomes "Led 4-person team, shipped 2 weeks ahead of schedule." Even small numbers matter.\n\n' +
  '2. Your Build score is 78 — that is your strength. Pull your strongest technical bullet to the top.\n\n' +
  '3. Add one leadership sentence. "Took initiative on X" or "Proposed and implemented Y" reads 3x stronger than passive voice.\n\n' +
  'Want me to rewrite your top bullet right now? Paste it here and I will give you the Goldman-ready version.';

// ── Types ─────────────────────────────────────────────────────────────────────

type GlowState = 'idle' | 'thinking' | 'responding';
type ChatMode  = 'coaching' | 'practice';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DillyOverlay() {
  const { visible: shouldShow, studentContext, close } = useDillyOverlayState();
  const insets = useSafeAreaInsets();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [show,      setShow]      = useState(false);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [mode,      setMode]      = useState<ChatMode>('coaching');
  const [glowState, setGlowState] = useState<GlowState>('idle');

  const isPaid = studentContext?.isPaid ?? false;

  // ── Animated values ─────────────────────────────────────────────────────────
  const slideAnim   = useRef(new Animated.Value(SCREEN_H)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const faceScale   = useRef(new Animated.Value(1)).current;
  // Ring pulse: 0.6 → 1.0 borderColor opacity (useNativeDriver: false — borderColor not native)
  const ringAnim    = useRef(new Animated.Value(0.6)).current;
  const dotAnims    = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  // ── Animation refs ──────────────────────────────────────────────────────────
  const glowLoopRef    = useRef<Animated.CompositeAnimation | null>(null);
  const faceLoopRef    = useRef<Animated.CompositeAnimation | null>(null);
  const ringLoopRef    = useRef<Animated.CompositeAnimation | null>(null);
  const dotLoopsRef    = useRef<(Animated.CompositeAnimation | null)[]>([]);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef      = useRef<ScrollView>(null);
  const isDismissing   = useRef(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const glowThick = glowState === 'thinking' ? 5 : 3;

  const ringBorderColor = ringAnim.interpolate({
    inputRange:  [0.6, 1.0],
    outputRange: ['rgba(201,168,76,0.6)', 'rgba(201,168,76,1.0)'],
  });

  // ── Glow loop ───────────────────────────────────────────────────────────────
  function startGlowLoop(duration: number, minV: number, maxV: number) {
    glowLoopRef.current?.stop();
    glowOpacity.setValue(minV);
    glowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: maxV, duration: duration / 2, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: minV, duration: duration / 2, useNativeDriver: true }),
      ])
    );
    glowLoopRef.current.start();
  }

  // ── Ring pulse ──────────────────────────────────────────────────────────────
  function startRingPulse() {
    ringLoopRef.current?.stop();
    ringLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1.0, duration: 800, useNativeDriver: false }),
        Animated.timing(ringAnim, { toValue: 0.6, duration: 800, useNativeDriver: false }),
      ])
    );
    ringLoopRef.current.start();
  }

  // ── Typing dots ─────────────────────────────────────────────────────────────
  function startTypingDots() {
    dotLoopsRef.current.forEach(l => l?.stop());
    dotAnims.forEach(a => a.setValue(0));
    dotLoopsRef.current = dotAnims.map((a, i) => {
      const up   = 260;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(a, { toValue: -6, duration: up,  useNativeDriver: true }),
          Animated.timing(a, { toValue: 0,  duration: up,  useNativeDriver: true }),
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

  // ── Dismiss ─────────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;

    glowLoopRef.current?.stop();
    faceLoopRef.current?.stop();
    ringLoopRef.current?.stop();
    stopTypingDots();
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    Animated.timing(slideAnim, {
      toValue:  SCREEN_H,
      duration: 280,
      easing:   Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShow(false);
      isDismissing.current = false;
      close();
    });
  }, [close]);

  // ── PanResponder ────────────────────────────────────────────────────────────
  const dismissRef = useRef(dismiss);
  useEffect(() => { dismissRef.current = dismiss; }, [dismiss]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gs) => gs.dy > 0,
      onMoveShouldSetPanResponder:  (_, gs) => gs.dy > 0,
      onPanResponderGrant: () => { slideAnim.stopAnimation(); },
      onPanResponderMove:  (_, gs) => { if (gs.dy > 0) slideAnim.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          dismissRef.current();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0, tension: 65, friction: 11, useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // ── Open ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (shouldShow && !show) {
      setMessages([]);
      setInput('');
      setMode('coaching');
      setGlowState('idle');
      slideAnim.setValue(SCREEN_H);
      glowOpacity.setValue(0);
      faceScale.setValue(1);
      ringAnim.setValue(0.6);

      setShow(true);

      Animated.spring(slideAnim, {
        toValue: 0, tension: 65, friction: 11, useNativeDriver: true,
      }).start();

      startGlowLoop(2200, 0.4, 0.85);
      startRingPulse();
    }
  }, [shouldShow]);

  // ── External close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldShow && show && !isDismissing.current) {
      dismiss();
    }
  }, [shouldShow]);

  // ── Glow by glowState ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!show) return;
    switch (glowState) {
      case 'idle':       startGlowLoop(2200, 0.4, 0.85); break;
      case 'thinking':   startGlowLoop(600,  0.5, 1.0);  break;
      case 'responding': startGlowLoop(300,  0.6, 1.0);  break;
    }
  }, [glowState, show]);

  // ── Face scale by glowState ─────────────────────────────────────────────────
  useEffect(() => {
    faceLoopRef.current?.stop();
    if (!show || glowState === 'idle') {
      faceScale.setValue(1);
      return;
    }
    const [toVal, dur] = glowState === 'thinking' ? [1.04, 500] : [1.06, 350];
    faceLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(faceScale, { toValue: toVal, duration: dur, useNativeDriver: true }),
        Animated.timing(faceScale, { toValue: 1.0,   duration: dur, useNativeDriver: true }),
      ])
    );
    faceLoopRef.current.start();
  }, [glowState, show]);

  // ── Typing dots by glowState ────────────────────────────────────────────────
  useEffect(() => {
    if (glowState === 'thinking' && show) {
      startTypingDots();
    } else {
      stopTypingDots();
    }
  }, [glowState, show]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    const history: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setGlowState('thinking');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    // Legacy mock response — DillyAIOverlay handles real chat
    await new Promise(r => setTimeout(r, 800));

    const withAssistant: Message[] = [...history, { role: 'assistant', content: '' }];
    setMessages(withAssistant);
    setGlowState('responding');

    const words = MOCK_COACHING_RESPONSE.split(' ');
    let wordIdx = 0;

    const interval = setInterval(() => {
      wordIdx++;
      if (wordIdx > words.length) {
        clearInterval(interval);
        streamTimerRef.current = null;
        setGlowState('idle');
        return;
      }
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: words.slice(0, wordIdx).join(' '),
        };
        return updated;
      });
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 65);

    streamTimerRef.current = interval;
  }, [input, messages]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!show) return null;

  return (
    <Modal transparent visible={show} statusBarTranslucent animationType="none">
      <Animated.View style={[s.overlay, { transform: [{ translateY: slideAnim }] }]}>

        {/* ── Siri-style edge glow (no expo-linear-gradient; fallback colored Views) ── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Top */}
          <Animated.View style={[s.edgeH, { top: 0, height: glowThick, opacity: glowOpacity }]}>
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
            <View style={{ flex: 1, backgroundColor: '#2B3A8E' }} />
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
          </Animated.View>
          {/* Bottom */}
          <Animated.View style={[s.edgeH, { bottom: 0, height: glowThick, opacity: glowOpacity }]}>
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
            <View style={{ flex: 1, backgroundColor: '#2B3A8E' }} />
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
          </Animated.View>
          {/* Left */}
          <Animated.View style={[s.edgeV, { left: 0, width: glowThick, opacity: glowOpacity }]}>
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
            <View style={{ flex: 1, backgroundColor: '#2B3A8E' }} />
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
          </Animated.View>
          {/* Right */}
          <Animated.View style={[s.edgeV, { right: 0, width: glowThick, opacity: glowOpacity }]}>
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
            <View style={{ flex: 1, backgroundColor: '#2B3A8E' }} />
            <View style={{ flex: 1, backgroundColor: '#0A84FF' }} />
          </Animated.View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Drag handle ─────────────────────────────────────────────────── */}
          <View style={s.dragZone} {...panResponder.panHandlers}>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 14, bottom: 14, left: 60, right: 60 }}
            >
              <View style={s.handle} />
            </TouchableOpacity>
          </View>

          {/* ── Face ────────────────────────────────────────────────────────── */}
          <View style={s.faceSection}>
            <Animated.View style={{ transform: [{ scale: faceScale }] }}>
              {/* Container holds face + absolutely positioned ring border */}
              <View style={s.faceRingContainer}>
                <DillyFace size={88} />
                {/* Ring border as absolute overlay so it doesn't clip the face */}
                <Animated.View
                  pointerEvents="none"
                  style={[s.faceRingBorder, { borderColor: ringBorderColor }]}
                />
              </View>
            </Animated.View>
          </View>

          {/* ── Body ────────────────────────────────────────────────────────── */}
          {isPaid ? (
            <>
              {/* Messages */}
              <ScrollView
                ref={scrollRef}
                style={s.messageList}
                contentContainerStyle={s.messageListContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.length === 0 && (
                  <View style={s.welcomeWrap}>
                    <Text style={s.welcomeText}>
                      Ask me anything about your career — your score, what to fix, where to apply.
                    </Text>
                  </View>
                )}

                {messages.map((msg, i) =>
                  msg.role === 'user' ? (
                    <View key={i} style={[s.msgRow, { justifyContent: 'flex-end' }]}>
                      <View style={s.userBubble}>
                        <Text style={s.msgText}>{msg.content}</Text>
                      </View>
                    </View>
                  ) : (
                    <View key={i} style={[s.msgRow, { justifyContent: 'flex-start' }]}>
                      <View style={s.goldDot} />
                      <View style={s.dillyBubble}>
                        <Text style={s.msgText}>{msg.content}</Text>
                      </View>
                    </View>
                  )
                )}

                {/* Typing indicator */}
                {glowState === 'thinking' && (
                  <View style={[s.msgRow, { justifyContent: 'flex-start' }]}>
                    <View style={s.goldDot} />
                    <View style={s.typingBubble}>
                      {dotAnims.map((a, i) => (
                        <Animated.View
                          key={i}
                          style={[s.typingDot, { transform: [{ translateY: a }] }]}
                        />
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Mode toggle */}
              <View style={s.modeWrap}>
                <Text style={s.modeEyebrow}>MODE</Text>
                <View style={s.modePills}>
                  {(['coaching', 'practice'] as ChatMode[]).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[s.modePill, mode === m && s.modePillActive]}
                      onPress={() => setMode(m)}
                    >
                      <Text style={[s.modePillText, mode === m && s.modePillTextActive]}>
                        {m.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Input bar */}
              <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
                <TextInput
                  style={s.input}
                  placeholder="Ask Dilly anything..."
                  placeholderTextColor={colors.t2}
                  value={input}
                  onChangeText={setInput}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                />
                <TouchableOpacity
                  style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]}
                  onPress={sendMessage}
                  disabled={!input.trim()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* ── Locked state ───────────────────────────────────────────────── */
            <View style={s.lockedWrap}>
              {/* Ghost preview bubbles */}
              <View style={s.ghostBubbles}>
                <View style={[s.msgRow, { justifyContent: 'flex-start', opacity: 0.35 }]}>
                  <View style={s.goldDot} />
                  <View style={s.dillyBubble}>
                    <Text style={s.msgText}>
                      Your Grit score is a 61. Here's exactly what's holding it back and what to fix first.
                    </Text>
                  </View>
                </View>
                <View style={[s.msgRow, { justifyContent: 'flex-end', opacity: 0.35 }]}>
                  <View style={s.userBubble}>
                    <Text style={s.msgText}>
                      What should I work on before my Goldman interview?
                    </Text>
                  </View>
                </View>
                <View style={[s.msgRow, { justifyContent: 'flex-start', opacity: 0.35 }]}>
                  <View style={s.goldDot} />
                  <View style={s.dillyBubble}>
                    <Text style={s.msgText}>
                      Three things. Let's start with the most important one...
                    </Text>
                  </View>
                </View>
                {/* Dark gradient overlay covering bottom 60% of ghost area */}
                <View style={s.ghostOverlay} pointerEvents="none" />
              </View>

              {/* Unlock CTA */}
              <TouchableOpacity
                style={s.unlockBtn}
                onPress={() => {}}
                activeOpacity={0.85}
              >
                <Text style={s.unlockBtnText}>Unlock Dilly — $9.99/mo</Text>
              </TouchableOpacity>
              <Text style={s.unlockSub}>Cancel anytime. One fix pays for 500 months.</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    flex: 1,
  },

  // ── Glow edges ───────────────────────────────────────────────────────────
  edgeH: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row',
  },
  edgeV: {
    position: 'absolute',
    top: 0, bottom: 0,
    flexDirection: 'column',
  },

  // ── Drag handle ──────────────────────────────────────────────────────────
  dragZone: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // ── Face ─────────────────────────────────────────────────────────────────
  faceSection: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
  },
  faceRingContainer: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,168,76,0.06)',
    borderRadius: 999,
  },
  faceRingBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 999,
    borderWidth: 1.5,
  },

  // ── Messages ─────────────────────────────────────────────────────────────
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: 20, paddingBottom: 12 },

  welcomeWrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 32 },
  welcomeText: { color: colors.t2, fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: 'Inter' },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },

  userBubble: {
    backgroundColor: colors.s3,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 12,
    paddingHorizontal: 16,
    maxWidth: '78%',
  },
  dillyBubble: {
    backgroundColor: colors.s2,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
    paddingHorizontal: 16,
    maxWidth: '78%',
    flexShrink: 1,
  },
  msgText: { color: colors.t1, fontSize: 15, lineHeight: 22 },

  goldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
    marginBottom: 6,
    flexShrink: 0,
  },

  typingBubble: {
    backgroundColor: colors.s2,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },

  // ── Mode toggle ──────────────────────────────────────────────────────────
  modeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  modeEyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    color: colors.t3,
  },
  modePills: { flexDirection: 'row', gap: 6 },
  modePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  modePillActive: { backgroundColor: colors.gold },
  modePillText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    color: colors.t3,
  },
  modePillTextActive: { color: '#FFFFFF' },

  // ── Input bar ────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  input: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.t1,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },

  // ── Locked state ─────────────────────────────────────────────────────────
  lockedWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  ghostBubbles: {
    flex: 1,
    paddingTop: 8,
    overflow: 'hidden',
  },
  ghostOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  unlockBtn: {
    height: 52,
    backgroundColor: colors.gold,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  unlockBtnText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  unlockSub: {
    color: colors.t3,
    fontSize: 12,
    textAlign: 'center',
  },
});
