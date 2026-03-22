import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, spacing, radius } from '../../lib/tokens';

// ── Constants ─────────────────────────────────────────────────────────────────

const BAR_HEIGHTS_PCT = [18, 30, 50, 72, 100, 85, 60, 38, 20, 10];
const BAR_COLORS = [
  colors.s3, colors.s3,
  'rgba(201,168,76,0.25)',
  'rgba(201,168,76,0.35)',
  colors.gold,
  'rgba(201,168,76,0.35)',
  'rgba(201,168,76,0.25)',
  colors.s3, colors.s3, colors.s3,
];
const CHART_HEIGHT = 48;

const PRE_PROF_LABELS: Record<string, string> = {
  'Pre-Health': 'Pre-Health track',
  'Pre-Law':    'Pre-Law track',
};

// ── Main screen ───────────────────────────────────────────────────────────────

export default function YouAreInScreen() {
  const insets = useSafeAreaInsets();
  const { cohort = '', name = '', industryTarget = '' } = useLocalSearchParams<{
    cohort: string;
    name: string;
    industryTarget?: string;
  }>();

  const firstName   = (name || '').trim().split(/\s+/)[0] ?? '';
  const cohortLabel = PRE_PROF_LABELS[cohort] ?? `${cohort} cohort`;

  // ── Entrance animations ───────────────────────────────────────────────────

  const badgeScale   = useRef(new Animated.Value(0.7)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY       = useRef(new Animated.Value(8)).current;
  const barAnims     = useRef(BAR_HEIGHTS_PCT.map(() => new Animated.Value(0))).current;

  // Pulsing dot
  const pulseScale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Badge pop-in
    Animated.parallel([
      Animated.spring(badgeScale,   { toValue: 1, damping: 8, stiffness: 120, useNativeDriver: true }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Title fade-up (150ms delay)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(titleY,       { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 150);

    // Bars stagger (80ms delay before starting)
    setTimeout(() => {
      barAnims.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: 1,
          duration: 600,
          delay: i * 40,
          useNativeDriver: false, // height is not supported by native driver
        }).start();
      });
    }, 80);

    // Pulsing dot loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Green radial glow */}
      <View style={s.glow} pointerEvents="none" />

      {/* Content — vertically centered */}
      <View style={s.content}>
        {/* Badge tile */}
        <Animated.View style={[s.badge, { opacity: badgeOpacity, transform: [{ scale: badgeScale }] }]}>
          <Ionicons name="star" size={26} color={colors.green} />
        </Animated.View>

        {/* Eyebrow */}
        <Text style={s.eyebrow}>Dilly for UTampa</Text>

        {/* Hero title */}
        <Animated.Text
          style={[s.title, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}
        >
          {firstName ? `${firstName},\nyou're in.` : "You're in."}
        </Animated.Text>

        {/* Pills */}
        <View style={s.pillsRow}>
          {cohortLabel ? (
            <View style={s.pillGreen}>
              <Text style={s.pillGreenText}>{cohortLabel}</Text>
            </View>
          ) : null}
          <View style={s.pillGold}>
            <Text style={s.pillGoldText}>Internship · Summer 2026</Text>
          </View>
        </View>

        {/* Sub text */}
        <Text style={s.sub}>
          {`Here's where ${cohort || 'your'} students at UTampa land.\nYour score goes here next.`}
        </Text>

        {/* Benchmark chart */}
        <View style={s.chart}>
          <Text style={s.chartLabel}>
            {`DILLY SCORE DISTRIBUTION · UTAMPA ${cohortLabel.toUpperCase()} PEERS`}
          </Text>

          {/* Bars */}
          <View style={[s.barsRow, { height: CHART_HEIGHT }]}>
            {BAR_HEIGHTS_PCT.map((pct, i) => (
              <Animated.View
                key={i}
                style={[
                  s.bar,
                  {
                    backgroundColor: BAR_COLORS[i],
                    height: barAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', `${pct}%`],
                    }),
                  },
                ]}
              />
            ))}
          </View>

          {/* Scale */}
          <View style={s.scaleRow}>
            <Text style={s.scaleNum}>0</Text>
            <Text style={s.scaleTop}>Top 25% ←</Text>
            <Text style={s.scaleNum}>100</Text>
          </View>

          {/* Pulsing dot row */}
          <View style={s.pulseRow}>
            <Animated.View style={[s.pulseDot, { transform: [{ scale: pulseScale }] }]} />
            <Text style={s.pulseText}>Your score lands here in 2 steps</Text>
          </View>
        </View>
      </View>

      {/* CTA pinned to bottom */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          style={s.button}
          onPress={() => router.push({ pathname: '/onboarding/anticipation', params: { cohort, industryTarget } })}
          activeOpacity={0.85}
        >
          <Text style={s.buttonText}>Show me where I stand →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  glow: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    marginLeft: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(52,199,89,0.05)',
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 80,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.gdim,
    borderWidth: 1,
    borderColor: colors.gbdr,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: colors.green,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'PlayfairDisplay_900Black',
    fontSize: 36,
    color: colors.t1,
    textAlign: 'center',
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 10,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 10,
  },
  pillGreen: {
    backgroundColor: colors.gdim,
    borderWidth: 1,
    borderColor: colors.gbdr,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillGreenText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.green,
  },
  pillGold: {
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillGoldText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gold,
  },
  sub: {
    fontSize: 12,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  chart: {
    width: '100%',
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: radius.lg,
    padding: 12,
  },
  chartLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.t3,
    marginBottom: 8,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  scaleNum: {
    fontSize: 8,
    color: colors.t3,
  },
  scaleTop: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.gold,
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.gold,
    flexShrink: 0,
  },
  pulseText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gold,
  },
  ctaWrap: {
    paddingHorizontal: spacing.xl,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#051A0B',
    letterSpacing: -0.1,
  },
});
