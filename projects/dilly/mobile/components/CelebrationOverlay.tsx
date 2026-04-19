import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, Easing, Dimensions,
} from 'react-native';
import { DillyFace } from './DillyFace';
import { colors } from '../lib/tokens';
import { useResolvedTheme } from '../hooks/useTheme';

// ── Types ──────────────────────────────────────────────────────────────────────

export type MilestoneType =
  | 'first-audit'
  | 'cleared-bar'
  | 'top-25'
  | 'top-10'
  | 'score-jump'
  | 'applied-job'
  | 'unlocked-dilly'
  | 'unlocked-pro';

interface MilestoneConfig {
  eyebrow: string;
  headline: string;
  sub: string;
  accentColor: string;
  ctaLabel: string;
}

// ── Milestone definitions ──────────────────────────────────────────────────────

const MILESTONE_CONFIGS: Record<MilestoneType, MilestoneConfig> = {
  'first-audit': {
    eyebrow: 'YOUR FIRST SCORE',
    headline: "You're on\nthe board.",
    sub: 'Your career baseline is set. Now you know exactly what to improve.',
    accentColor: colors.gold,
    ctaLabel: 'See my score',
  },
  'cleared-bar': {
    eyebrow: 'RECRUITER READY',
    headline: "You cleared\nthe bar.",
    sub: "Your score crossed the recruiter threshold. You're now visible to hiring teams.",
    accentColor: colors.green,
    ctaLabel: "See what's next",
  },
  'top-25': {
    eyebrow: 'TOP 25%',
    headline: "You're in the\ntop quarter.",
    sub: "You've outpaced 75% of your cohort. Recruiters are starting to notice.",
    accentColor: colors.gold,
    ctaLabel: 'Keep climbing',
  },
  'top-10': {
    eyebrow: 'ELITE TIER',
    headline: "Top 10.\nYou're the ones.",
    sub: "You've broken into the top 10 of your cohort. This is where offers come from.",
    accentColor: '#A78BFA',
    ctaLabel: 'Own it',
  },
  'score-jump': {
    eyebrow: 'LEVEL UP',
    headline: "+10 points.\nReal progress.",
    sub: "That's a meaningful jump. One more push like that and you're above the bar.",
    accentColor: colors.amber,
    ctaLabel: 'Keep going',
  },
  'applied-job': {
    eyebrow: 'SHOT TAKEN',
    headline: "Application\nout the door.",
    sub: "You applied. Most students never do. That's the whole game.",
    accentColor: colors.green,
    ctaLabel: 'Find more jobs',
  },
  // Subscription unlocks. These are the moments the user becomes a paying
  // customer (or jumps tiers). Tone here is earned-pride, not celebration
  // for the sake of it. Copy says: "most people stay free — you didn't,
  // that was the right move, here's what's yours now." No "🎉 Yay!!"
  // shouting; this is supposed to feel like the quiet pride of someone
  // who just made a decisive career move.
  'unlocked-dilly': {
    eyebrow: "YOU'RE IN",
    headline: "Welcome to\nDilly.",
    sub: "Most people stay on the free side their whole career. You chose differently, and you'll feel the difference on the next job you touch.",
    accentColor: colors.gold,
    ctaLabel: "Let's go",
  },
  'unlocked-pro': {
    eyebrow: "PRO UNLOCKED",
    headline: "You just gave\nyourself an edge.",
    sub: "Unlimited fit reads. Tailored resumes on demand. A coach that never caps out. This is the version of Dilly most people never see.",
    accentColor: '#A78BFA',
    ctaLabel: "Let's get to work",
  },
};

// ── Confetti constants ─────────────────────────────────────────────────────────

const CONFETTI_COLORS = [colors.gold, colors.green, colors.amber, '#FFFFFF', '#A78BFA'];
const PARTICLE_COUNT = 40; // 20 per cannon
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Source cannons: both at 80% screen height, left and right edges
const SOURCE_Y   = SCREEN_H * 0.8;
const SOURCE_L   = 0;          // left cannon x
const SOURCE_R   = SCREEN_W;   // right cannon x

interface ParticleConfig {
  color: string;
  w: number;
  h: number;
  sourceX: number;  // cannon origin x (left=0, right=SCREEN_W)
  targetX: number;  // final resting x
  targetY: number;  // final resting y (10%-70% of SCREEN_H)
  duration: number; // 800-1400ms
  delay: number;    // 0-400ms
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  milestone: MilestoneType | null;
  onDismiss: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

// DillyFace ring size: face(100) + 12px padding each side
const FACE_SIZE      = 100;
const RING_PADDING   = 12;
const RING_CONTAINER = FACE_SIZE + RING_PADDING * 2; // 124

export function CelebrationOverlay({ milestone, onDismiss }: Props) {
  const [ctaVisible, setCtaVisible] = useState(false);
  const [particles,  setParticles]  = useState<ParticleConfig[]>([]);
  // Theme-aware container + text. Previously the overlay was hard-
  // white with dark text, so on Midnight it looked jarring and out
  // of place. Now it paints into the user's active surface.
  const theme = useResolvedTheme();

  // Content fade
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Confetti: x, y, opacity per particle slot (fixed refs  -  values reset per show)
  const xAnims       = useRef(Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0))).current;
  const yAnims       = useRef(Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0))).current;
  const opacityAnims = useRef(Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(1))).current;

  // Face pulse + ring pulse
  const faceScale   = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  const faceLoop    = useRef<Animated.CompositeAnimation | null>(null);
  const ringLoop    = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!milestone) return;

    const cfg      = MILESTONE_CONFIGS[milestone];
    const accent   = cfg.accentColor;
    const nonAccent = CONFETTI_COLORS.filter(c => c !== accent);

    // ── Build particle configs ────────────────────────────────────────────────
    // First 20 = left cannon, last 20 = right cannon
    const newParticles: ParticleConfig[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const isLeft   = i < PARTICLE_COUNT / 2;
      const sourceX  = isLeft ? SOURCE_L : SOURCE_R;
      const isAccent = Math.random() < 0.6;
      const color    = isAccent
        ? accent
        : nonAccent[Math.floor(Math.random() * nonAccent.length)];
      // Square 5-9px or thin rectangle 3×10px
      const isThin = Math.random() < 0.3;
      const w      = isThin ? 3 : 5 + Math.random() * 4;
      const h      = isThin ? 10 : w;
      // Left bursts rightward (0-70% width), right bursts leftward (30-100% width)
      const targetX = isLeft
        ? Math.random() * SCREEN_W * 0.7
        : SCREEN_W * 0.3 + Math.random() * SCREEN_W * 0.7;
      const targetY  = SCREEN_H * (0.1 + Math.random() * 0.6);
      const duration = 800 + Math.random() * 600;
      const delay    = Math.random() * 400;
      return { color, w, h, sourceX, targetX, targetY, duration, delay };
    });

    // ── Reset all animated values ─────────────────────────────────────────────
    contentOpacity.setValue(0);
    faceScale.setValue(1);
    ringOpacity.setValue(0.6);
    newParticles.forEach((p, i) => {
      xAnims[i].setValue(p.sourceX);
      yAnims[i].setValue(SOURCE_Y);
      opacityAnims[i].setValue(1);
    });
    setCtaVisible(false);
    setParticles(newParticles);

    // ── Confetti burst  -  start immediately ────────────────────────────────────
    newParticles.forEach((p, i) => {
      Animated.sequence([
        // Phase 1: burst to final position
        Animated.parallel([
          Animated.timing(xAnims[i], {
            toValue: p.targetX,
            duration: p.duration,
            delay: p.delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(yAnims[i], {
            toValue: p.targetY,
            duration: p.duration,
            delay: p.delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Phase 2: fade out after landing
        Animated.timing(opacityAnims[i], {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    });

    // ── Content fade in after 300ms ───────────────────────────────────────────
    const contentTimer = setTimeout(() => {
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 300);

    // ── CTA after 3s ─────────────────────────────────────────────────────────
    const ctaTimer = setTimeout(() => setCtaVisible(true), 3000);

    // ── Face scale pulse (excitement) ─────────────────────────────────────────
    // Container scale pulse for celebration effect
    faceLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(faceScale, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(faceScale, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
      ])
    );
    faceLoop.current.start();

    // ── Ring border opacity pulse ─────────────────────────────────────────────
    ringLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ringOpacity, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 0.6, duration: 400, useNativeDriver: true }),
      ])
    );
    ringLoop.current.start();

    return () => {
      clearTimeout(contentTimer);
      clearTimeout(ctaTimer);
      faceLoop.current?.stop();
      ringLoop.current?.stop();
    };
  }, [milestone]);

  if (!milestone) return null;

  const cfg = MILESTONE_CONFIGS[milestone];

  return (
    <Modal transparent animationType="fade" visible>
      <View style={[s.container, { backgroundColor: theme.surface.bg }]}>

        {/* ── Confetti layer ─────────────────────────────────────────────── */}
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              s.particle,
              {
                width:           p.w,
                height:          p.h,
                backgroundColor: p.color,
                opacity:         opacityAnims[i],
                transform: [
                  { translateX: xAnims[i] },
                  { translateY: yAnims[i] },
                ],
              },
            ]}
          />
        ))}

        {/* ── Content layer (fades in after 300ms) ──────────────────────── */}
        <Animated.View style={[s.content, { opacity: contentOpacity }]}>

          {/* Face with pulsing accent ring. Ring + tint now follow
              the user's accent so the whole celebration feels like
              an extension of their chosen theme rather than stock
              indigo. */}
          <Animated.View style={[s.faceContainer, { transform: [{ scale: faceScale }], backgroundColor: theme.accentSoft }]}>
            <Animated.View style={[s.ring, { opacity: ringOpacity, borderColor: theme.accent }]} />
            <DillyFace size={FACE_SIZE} />
          </Animated.View>

          <Text style={[s.eyebrow, { color: theme.accent }]}>{cfg.eyebrow}</Text>
          <Text style={[s.headline, { color: theme.surface.t1 }]}>{cfg.headline}</Text>
          <Text style={[s.sub, { color: theme.surface.t2 }]}>{cfg.sub}</Text>

          {/* Reserve exact height so layout never shifts during 3s wait */}
          <View style={s.ctaPlaceholder}>
            {ctaVisible && (
              <TouchableOpacity style={[s.cta, { backgroundColor: theme.accent }]} onPress={onDismiss} activeOpacity={0.85}>
                <Text style={s.ctaText}>{cfg.ctaLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Confetti particles  -  base position (0,0), moved entirely via transform
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 2,
  },

  // Content
  content: {
    alignItems: 'center',
    zIndex: 10,
  },

  // DillyFace wrapper: gold ring + subtle gold tint bg
  faceContainer: {
    width: RING_CONTAINER,
    height: RING_CONTAINER,
    borderRadius: RING_CONTAINER / 2,
    backgroundColor: 'rgba(43,58,142,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Ring border sits as absolute overlay  -  animated opacity for pulse
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RING_CONTAINER / 2,
    borderWidth: 2,
    borderColor: '#2B3A8E',
  },

  eyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 20,
  },
  headline: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 42,
    lineHeight: 50,
    color: '#1A1A2E',
    textAlign: 'center',
    marginTop: 8,
  },
  sub: {
    fontSize: 15,
    color: 'rgba(26,26,46,0.55)',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 32,
    lineHeight: 24,
  },

  // CTA placeholder  -  fixed size so no layout jump
  ctaPlaceholder: {
    marginTop: 40,
    width: SCREEN_W - 48,
    height: 52,
  },
  cta: {
    width: '100%',
    height: 52,
    backgroundColor: '#2B3A8E',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
    letterSpacing: 2,
    color: '#FFFFFF',
  },
});
