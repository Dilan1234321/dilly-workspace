import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, spacing, radius } from '../../lib/tokens';

// ── Cohort config ──────────────────────────────────────────────────────────────

const COHORT_COLORS: Record<string, string> = {
  Tech:             '#2B3A8E',
  Business:         '#1D4ED8',
  Science:          '#16A34A',
  Quantitative:     '#7C3AED',
  Health:           '#0284C7',
  'Social Science': '#D97706',
  Humanities:       '#DB2777',
  Sport:            '#EA580C',
  'Pre-Health':     '#0284C7',
  'Pre-Law':        '#1E3A8A',
  General:          '#2B3A8E',
};

const COHORT_COPY: Record<string, { label: string; description: string; emphasis: string }> = {
  Tech:             { label: 'Tech cohort',                        description: 'Dilly scores you against Google, Meta, and Amazon criteria.',                  emphasis: 'Your Build score carries the most weight.'     },
  Business:         { label: 'Business cohort',                    description: 'Dilly scores you against Goldman Sachs, Deloitte, and JP Morgan criteria.',     emphasis: 'Your Grit score carries the most weight.'      },
  Science:          { label: 'Science cohort',                     description: 'Dilly scores you against NIH, top biotech, and research lab criteria.',         emphasis: 'Your Smart score carries the most weight.'     },
  Quantitative:     { label: 'Quantitative cohort',                description: 'Dilly scores you against top quant and analytical employer criteria.',          emphasis: "Your industry track shapes your score."        },
  Health:           { label: 'Health & Movement cohort',           description: 'Dilly scores you against top hospital and healthcare employer criteria.',       emphasis: 'Your Grit score carries the most weight.'      },
  'Social Science': { label: 'Social Science cohort',              description: 'Dilly scores you against top consulting, government, and nonprofit criteria.',  emphasis: 'Your Grit score carries the most weight.'      },
  Humanities:       { label: 'Humanities & Communication cohort',  description: 'Dilly scores you against top media, publishing, and education criteria.',      emphasis: 'Your Build portfolio carries the most weight.' },
  Sport:            { label: 'Sport & Recreation cohort',          description: 'Dilly scores you against ESPN, top sports agencies, and league criteria.',     emphasis: 'Your Grit score carries the most weight.'      },
  'Pre-Health':     { label: 'Pre-Health track',                   description: 'Dilly scores you against Mayo Clinic, top med school, and clinical criteria.', emphasis: 'Your Smart score carries the most weight.'     },
  'Pre-Law':        { label: 'Pre-Law track',                      description: 'Dilly scores you against Skadden, top law school, and legal criteria.',        emphasis: 'Your Smart score carries the most weight.'     },
  General:          { label: 'General cohort',                     description: 'Dilly scores you against top employer criteria across industries.',             emphasis: 'All three dimensions are equally weighted.'    },
};

// ── Particle positions (precomputed so they're stable across renders) ──────────

const { width: SW, height: SH } = Dimensions.get('window');

const PARTICLES: { x: number; y: number; size: number; delay: number; dur: number }[] = [
  { x: 0.08, y: 0.12, size: 5,  delay: 0,    dur: 3200 },
  { x: 0.88, y: 0.08, size: 4,  delay: 400,  dur: 2800 },
  { x: 0.15, y: 0.55, size: 6,  delay: 800,  dur: 3600 },
  { x: 0.82, y: 0.48, size: 4,  delay: 200,  dur: 2600 },
  { x: 0.45, y: 0.06, size: 5,  delay: 1200, dur: 3000 },
  { x: 0.05, y: 0.78, size: 4,  delay: 600,  dur: 3400 },
  { x: 0.92, y: 0.72, size: 5,  delay: 1000, dur: 2900 },
  { x: 0.35, y: 0.88, size: 6,  delay: 300,  dur: 3300 },
  { x: 0.70, y: 0.82, size: 4,  delay: 900,  dur: 2700 },
  { x: 0.72, y: 0.20, size: 5,  delay: 500,  dur: 3100 },
  { x: 0.22, y: 0.30, size: 4,  delay: 1400, dur: 2500 },
  { x: 0.58, y: 0.68, size: 5,  delay: 700,  dur: 3500 },
  { x: 0.48, y: 0.42, size: 3,  delay: 1100, dur: 2800 },
  { x: 0.92, y: 0.28, size: 4,  delay: 1600, dur: 3000 },
  { x: 0.18, y: 0.92, size: 5,  delay: 250,  dur: 3200 },
  { x: 0.62, y: 0.14, size: 4,  delay: 1500, dur: 2600 },
];

// ── Particle component ─────────────────────────────────────────────────────────

function Particle({ x, y, size, delay, dur, color }: {
  x: number; y: number; size: number; delay: number; dur: number; color: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: dur, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity    = anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.6, 0.35, 0] });
  const translateY = anim.interpolate({ inputRange: [0, 1],           outputRange: [0, -28]             });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left:   x * SW - size / 2,
        top:    y * SH - size / 2,
        width:  size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function YouAreInScreen() {
  const insets = useSafeAreaInsets();
  const { cohort = '', name = '', industryTarget = '' } = useLocalSearchParams<{
    cohort: string;
    name: string;
    industryTarget?: string;
  }>();

  const firstName  = (name || '').trim().split(/\s+/)[0] ?? '';
  const accentColor = COHORT_COLORS[cohort] ?? '#2B3A8E';
  const copy        = COHORT_COPY[cohort]   ?? COHORT_COPY.General;

  // Entrance animations
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY       = useRef(new Animated.Value(16)).current;
  const btnOpacity     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(contentY,       { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 150);
    setTimeout(() => {
      Animated.timing(btnOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 800);
  }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Ambient glow */}
      <View
        pointerEvents="none"
        style={[s.glow, {
          backgroundColor: `${accentColor}12`,
          shadowColor: accentColor,
        }]}
      />

      {/* Particles */}
      {PARTICLES.map((p, i) => (
        <Particle key={i} {...p} color={accentColor} />
      ))}

      {/* Center content */}
      <Animated.View
        style={[s.content, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}
      >
        {/* Confirmed pill */}
        <View style={[s.pill, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` }]}>
          <View style={[s.pillDot, { backgroundColor: accentColor }]} />
          <Text style={[s.pillText, { color: accentColor }]}>Cohort confirmed</Text>
        </View>

        {/* "You're in, [name]" */}
        <Text style={s.youreIn}>
          {firstName ? `${firstName}, you're in the` : "You're in the"}
        </Text>

        {/* Cohort name */}
        <Text style={[s.cohortName, { color: accentColor, textShadowColor: `${accentColor}30`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 }]}>
          {copy.label}
        </Text>

        {/* Description */}
        <Text style={s.description}>{copy.description}</Text>

        {/* Emphasis */}
        <View style={[s.emphasisBox, { backgroundColor: `${accentColor}0D`, borderColor: `${accentColor}28` }]}>
          <Text style={[s.emphasisText, { color: accentColor }]}>{copy.emphasis}</Text>
        </View>
      </Animated.View>

      {/* CTA pinned to bottom */}
      <Animated.View style={[s.ctaWrap, { opacity: btnOpacity }]}>
        <TouchableOpacity
          style={[s.button, { backgroundColor: accentColor }]}
          onPress={() => router.push({
            pathname: '/onboarding/anticipation',
            params: { cohort, industryTarget },
          })}
          activeOpacity={0.85}
        >
          <Text style={s.buttonText}>Let's see where I stand →</Text>
        </TouchableOpacity>
      </Animated.View>
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
    top: '25%',
    left: '50%',
    marginLeft: -160,
    width: 320,
    height: 320,
    borderRadius: 160,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 100,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  youreIn: {
    fontSize: 14,
    color: colors.t2,
    marginBottom: 6,
    textAlign: 'center',
  },
  cohortName: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 30,
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  description: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  emphasisBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emphasisText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  ctaWrap: {
    paddingHorizontal: spacing.xl,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
});
