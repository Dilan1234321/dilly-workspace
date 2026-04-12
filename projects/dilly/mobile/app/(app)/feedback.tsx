/**
 * WHAT WE THINK - Dilly's personal letter to the user.
 *
 * A living letter, not a dashboard. No scores, no bars, no report card.
 * Just Dilly telling you what it sees, connecting dots, and giving
 * you concrete next moves.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
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

// ── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonLine({ width, style }: { width: string | number; style?: any }) {
  return (
    <View
      style={[
        {
          height: 14,
          borderRadius: 7,
          backgroundColor: colors.s2,
          width,
        },
        style,
      ]}
    />
  );
}

function LetterSkeleton() {
  return (
    <View style={{ gap: 20, paddingTop: 8 }}>
      {/* Paragraph 1 */}
      <View style={{ gap: 8 }}>
        <SkeletonLine width="100%" />
        <SkeletonLine width="92%" />
        <SkeletonLine width="85%" />
        <SkeletonLine width="60%" />
      </View>
      {/* Paragraph 2 */}
      <View style={{ gap: 8 }}>
        <SkeletonLine width="95%" />
        <SkeletonLine width="88%" />
        <SkeletonLine width="78%" />
      </View>
      {/* Paragraph 3 */}
      <View style={{ gap: 8 }}>
        <SkeletonLine width="100%" />
        <SkeletonLine width="90%" />
        <SkeletonLine width="70%" />
        <SkeletonLine width="45%" />
      </View>
      {/* Connections skeleton */}
      <View style={{ gap: 8, marginTop: 16 }}>
        <SkeletonLine width={140} style={{ height: 10 }} />
        <View style={[s.connectionCard, { minHeight: 80 }]}>
          <SkeletonLine width="80%" />
          <SkeletonLine width="75%" style={{ marginTop: 6 }} />
          <SkeletonLine width="90%" style={{ marginTop: 10 }} />
        </View>
      </View>
    </View>
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
      const res = await dilly.post('/insights/letter', {});
      const letter: InsightsLetter = res;
      setData(letter);
      cachedRef.current = letter;
    } catch (e: any) {
      const msg = e?.detail || e?.message || 'Something went wrong.';
      setError(msg);
    }
  }, []);

  useEffect(() => {
    // Use cached data if navigating back
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

  // Split letter into paragraphs
  const paragraphs = (data?.letter || '').split('\n').filter(p => p.trim().length > 0);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>What We Think</Text>
          <AnimatedPressable
            style={s.headerIcon}
            onPress={() => openDillyOverlay({ isPaid: true })}
            scaleDown={0.9}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.gold} />
          </AnimatedPressable>
        </View>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Loading state */}
          {loading && <LetterSkeleton />}

          {/* Error state */}
          {!loading && error && (
            <FadeInView delay={0}>
              <View style={s.errorBox}>
                <Ionicons name="cloud-offline-outline" size={32} color={colors.t3} />
                <Text style={s.errorText}>{error}</Text>
                <AnimatedPressable
                  style={s.retryBtn}
                  onPress={async () => {
                    setLoading(true);
                    await fetchLetter();
                    setLoading(false);
                  }}
                  scaleDown={0.97}
                >
                  <Text style={s.retryBtnText}>Try again</Text>
                </AnimatedPressable>
              </View>
            </FadeInView>
          )}

          {/* Letter content */}
          {!loading && data && !error && (
            <>
              {/* The Letter */}
              <FadeInView delay={0}>
                <View style={s.letterSection}>
                  {paragraphs.map((p, i) => (
                    <Text key={i} style={s.letterParagraph}>{p.trim()}</Text>
                  ))}
                </View>
              </FadeInView>

              {/* Connections */}
              {data.connections.length > 0 && (
                <FadeInView delay={120}>
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>DOTS WE CONNECTED</Text>
                    {data.connections.map((conn, i) => (
                      <View key={i} style={s.connectionCard}>
                        <Text style={s.connectionQuote}>"{conn.from}"</Text>
                        <View style={s.connectionBridge}>
                          <View style={s.connectionLine} />
                          <Ionicons name="add-circle" size={16} color={colors.gold} />
                          <View style={s.connectionLine} />
                        </View>
                        <Text style={s.connectionQuote}>"{conn.to}"</Text>
                        <Text style={s.connectionInsight}>{conn.insight}</Text>
                      </View>
                    ))}
                  </View>
                </FadeInView>
              )}

              {/* Next Moves */}
              {data.next_moves.length > 0 && (
                <FadeInView delay={200}>
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>YOUR NEXT MOVES</Text>
                    {data.next_moves.map((move, i) => (
                      <AnimatedPressable
                        key={i}
                        style={s.moveCard}
                        onPress={() =>
                          openDillyOverlay({
                            isPaid: true,
                            initialMessage: move.prompt,
                          })
                        }
                        scaleDown={0.98}
                      >
                        <View style={s.moveContent}>
                          <Text style={s.moveAction}>{move.action}</Text>
                          <Text style={s.moveWhy}>{move.why}</Text>
                        </View>
                        <Ionicons
                          name="chatbubble-outline"
                          size={14}
                          color={colors.gold}
                          style={{ opacity: 0.5, marginTop: 2 }}
                        />
                      </AnimatedPressable>
                    ))}
                  </View>
                </FadeInView>
              )}

              {/* Tell Dilly More */}
              <FadeInView delay={280}>
                <View style={s.bottomCta}>
                  <AnimatedPressable
                    style={s.tellMoreBtn}
                    onPress={() =>
                      openDillyOverlay({
                        isPaid: true,
                        initialMessage:
                          "I want to tell you more about myself so you can give me better insights.",
                      })
                    }
                    scaleDown={0.97}
                  >
                    <Ionicons name="sparkles" size={15} color="#fff" />
                    <Text style={s.tellMoreText}>Tell Dilly more</Text>
                  </AnimatedPressable>
                  <Text style={s.bottomHint}>
                    The more Dilly knows, the better these insights get.
                  </Text>
                </View>
              </FadeInView>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.t1,
    letterSpacing: -0.3,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.s2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { paddingHorizontal: spacing.lg },

  // Error
  errorBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  errorText: { fontSize: 14, color: colors.t2, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    marginTop: 8,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Letter section
  letterSection: {
    gap: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  letterParagraph: {
    fontSize: 15,
    color: colors.t1,
    lineHeight: 22,
    fontWeight: '400',
  },

  // Section headers
  section: { gap: 10, marginTop: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.t3,
    marginBottom: 2,
  },

  // Connection cards
  connectionCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: spacing.md,
    gap: 8,
  },
  connectionQuote: {
    fontSize: 13,
    color: colors.t2,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  connectionBridge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  connectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.b2,
  },
  connectionInsight: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.t1,
    lineHeight: 20,
    marginTop: 2,
  },

  // Move cards
  moveCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.s1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: spacing.md,
  },
  moveContent: { flex: 1, gap: 4 },
  moveAction: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.t1,
    lineHeight: 20,
  },
  moveWhy: {
    fontSize: 13,
    color: colors.t2,
    lineHeight: 18,
  },

  // Bottom CTA
  bottomCta: {
    alignItems: 'center',
    marginTop: 32,
    gap: 10,
  },
  tellMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
  },
  tellMoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  bottomHint: {
    fontSize: 12,
    color: colors.t3,
    textAlign: 'center',
  },
});
