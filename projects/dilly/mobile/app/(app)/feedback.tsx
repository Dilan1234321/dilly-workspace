/**
 * WHAT WE THINK - Dilly's personal insights about the user.
 *
 * Not a word dump. Visually appealing, exciting to read.
 * Dilly face at top, personalized header, bite-sized insight cards.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Animated, Easing,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { mediumHaptic } from '../../lib/haptics';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { DillyFace } from '../../components/DillyFace';

const INDIGO = colors.indigo;
const GREEN = '#34C759';
const AMBER = '#FF9F0A';

// ── Types ───────────────────────────────────────────────────────────────────

interface Connection {
  from: string;
  to: string;
  insight: string;
}

interface NextMove {
  action: string;
  why: string;
  prompt: string;
}

interface InsightsLetter {
  letter: string;
  connections: Connection[];
  next_moves: NextMove[];
  cached: boolean;
  thin_profile?: boolean;
}

// ── Loading State ──────────────────────────────────────────────────────────

const LOADING_TEXTS = [
  'Taking a closer look at you...',
  'Reading your profile...',
  'Connecting the dots...',
  'Finding patterns...',
  'Almost there...',
];

function LoadingState() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [textIdx, setTextIdx] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    const interval = setInterval(() => setTextIdx(i => (i + 1) % LOADING_TEXTS.length), 2500);
    return () => clearInterval(interval);
  }, [pulseAnim]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }}>
      <DillyFace size={120} />
      <Animated.Text style={{ fontSize: 16, fontWeight: '600', color: colors.t2, marginTop: 24, opacity: pulseAnim }}>
        {LOADING_TEXTS[textIdx]}
      </Animated.Text>
    </View>
  );
}

// ── Highlight Card ─────────────────────────────────────────────────────────

function HighlightCard({ icon, iconColor, bgColor, title, body, delay }: {
  icon: string; iconColor: string; bgColor: string; title: string; body: string; delay: number;
}) {
  return (
    <FadeInView delay={delay}>
      <View style={[s.highlightCard, { borderLeftColor: iconColor }]}>
        <View style={[s.highlightIcon, { backgroundColor: bgColor }]}>
          <Ionicons name={icon as any} size={16} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.highlightTitle}>{title}</Text>
          <Text style={s.highlightBody}>{body}</Text>
        </View>
      </View>
    </FadeInView>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function WhatWeThinkScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<InsightsLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cachedRef = useRef<InsightsLetter | null>(null);

  const fetchLetter = useCallback(async () => {
    try {
      setError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await dilly.fetch('/insights/letter', { method: 'POST', body: JSON.stringify({}), signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('Could not load this letter right now. Try again in a moment.');
      const letter: InsightsLetter = await res.json();
      setData(letter);
      cachedRef.current = letter;
    } catch (e: any) {
      setError(e?.message || 'Could not load insights.');
    }
  }, []);

  useEffect(() => {
    if (cachedRef.current) {
      setData(cachedRef.current);
      setLoading(false);
      return;
    }
    (async () => {
      await fetchLetter();
      setLoading(false);
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    mediumHaptic();
    setRefreshing(true);
    cachedRef.current = null;
    await fetchLetter();
    setRefreshing(false);
  }, [fetchLetter]);

  // Split letter into paragraphs, take first as the "headline" insight
  const paragraphs = (data?.letter || '').split('\n').filter(p => p.trim().length > 0);
  const headline = paragraphs[0] || '';
  const restParagraphs = paragraphs.slice(1);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.container, { paddingTop: insets.top }]}>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.t3} />
            <Text style={{ fontSize: 14, color: colors.t2, textAlign: 'center', marginTop: 16 }}>{error}</Text>
            <AnimatedPressable
              style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: INDIGO }}
              onPress={async () => { setLoading(true); await fetchLetter(); setLoading(false); }}
              scaleDown={0.97}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Try again</Text>
            </AnimatedPressable>
          </View>
        ) : data ? (
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            {/* Header: Dilly face + personalized headline */}
            <FadeInView delay={0}>
              <View style={s.heroSection}>
                <DillyFace size={60} />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={s.heroLabel}>WHAT WE THINK</Text>
                  <Text style={s.heroHeadline}>{headline}</Text>
                </View>
              </View>
            </FadeInView>

            {/* Rest of the letter as bite-sized cards */}
            {restParagraphs.map((p, i) => {
              // Alternate card styles for visual variety
              const isEven = i % 2 === 0;
              return (
                <FadeInView key={i} delay={100 + i * 80}>
                  <View style={[s.insightCard, isEven ? s.insightCardAccent : null]}>
                    <Text style={s.insightText}>{p}</Text>
                  </View>
                </FadeInView>
              );
            })}

            {/* Connections */}
            {data.connections && data.connections.length > 0 && (
              <FadeInView delay={300}>
                <Text style={s.sectionLabel}>DOTS WE CONNECTED</Text>
                {data.connections.map((c, i) => (
                  <FadeInView key={i} delay={350 + i * 80}>
                    <View style={s.connectionCard}>
                      <View style={s.connectionQuotes}>
                        <Text style={s.connectionQuote}>"{c.from}"</Text>
                        <View style={s.connectionBridge}>
                          <Ionicons name="add-circle" size={16} color={INDIGO} />
                        </View>
                        <Text style={s.connectionQuote}>"{c.to}"</Text>
                      </View>
                      <Text style={s.connectionInsight}>{c.insight}</Text>
                    </View>
                  </FadeInView>
                ))}
              </FadeInView>
            )}

            {/* Next Moves */}
            {data.next_moves && data.next_moves.length > 0 && (
              <FadeInView delay={500}>
                <Text style={s.sectionLabel}>YOUR NEXT MOVES</Text>
                {data.next_moves.map((m, i) => (
                  <FadeInView key={i} delay={550 + i * 80}>
                    <AnimatedPressable
                      style={s.moveCard}
                      onPress={() => openDillyOverlay({ isPaid: true, initialMessage: m.prompt })}
                      scaleDown={0.98}
                    >
                      <View style={s.moveNumber}>
                        <Text style={s.moveNumberText}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.moveAction}>{m.action}</Text>
                        <Text style={s.moveWhy}>{m.why}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.t3} />
                    </AnimatedPressable>
                  </FadeInView>
                ))}
              </FadeInView>
            )}

            {/* Tell Dilly more */}
            <FadeInView delay={700}>
              <AnimatedPressable
                style={s.tellMoreBtn}
                onPress={() => openDillyOverlay({ isPaid: true })}
                scaleDown={0.97}
              >
                <Ionicons name="chatbubble" size={16} color="#fff" />
                <Text style={s.tellMoreText}>Tell Dilly more</Text>
              </AnimatedPressable>
              <Text style={s.hintText}>The more Dilly knows, the better these insights get.</Text>
            </FadeInView>
          </ScrollView>
        ) : null}
      </View>
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: 16 },

  // Hero
  heroSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.t3,
    marginBottom: 6,
  },
  heroHeadline: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.t1,
    lineHeight: 22,
  },

  // Insight cards (letter paragraphs)
  insightCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  insightCardAccent: {
    borderLeftWidth: 3,
    borderLeftColor: INDIGO,
  },
  insightText: {
    fontSize: 14,
    color: colors.t1,
    lineHeight: 21,
  },

  // Highlight cards
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.b1,
    borderLeftWidth: 3,
  },
  highlightIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightTitle: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  highlightBody: { fontSize: 13, color: colors.t2, lineHeight: 19, marginTop: 2 },

  // Section labels
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.t3,
    marginTop: 24,
    marginBottom: 12,
  },

  // Connection cards
  connectionCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  connectionQuotes: { gap: 8 },
  connectionQuote: {
    fontSize: 13,
    color: colors.t2,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  connectionBridge: {
    alignSelf: 'center',
    marginVertical: 2,
  },
  connectionInsight: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.t1,
    lineHeight: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },

  // Next move cards
  moveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  moveNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: INDIGO + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: INDIGO,
  },
  moveAction: { fontSize: 14, fontWeight: '600', color: colors.t1 },
  moveWhy: { fontSize: 12, color: colors.t2, lineHeight: 17, marginTop: 2 },

  // Tell Dilly more
  tellMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: INDIGO,
    paddingVertical: 14,
    borderRadius: radius.xl,
    marginTop: 24,
  },
  tellMoreText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  hintText: {
    fontSize: 11,
    color: colors.t3,
    textAlign: 'center',
    marginTop: 10,
  },
});
