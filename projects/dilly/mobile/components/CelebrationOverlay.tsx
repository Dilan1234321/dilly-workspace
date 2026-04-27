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
  | 'win-interview'
  | 'win-offer'
  | 'win-milestone'
  | 'unlocked-dilly'
  | 'unlocked-pro'
  | 'pulse-streak-3'
  | 'pulse-streak-7'
  | 'pulse-streak-14'
  | 'pulse-streak-30'
  | 'pulse-streak-60'
  | 'pulse-streak-100'
  | 'chapter-4'
  | 'chapter-12'
  | 'chapter-26'
  | 'chapter-52';

interface MilestoneConfig {
  eyebrow: string;
  headline: string;
  sub: string;
  accentColor: string;
  ctaLabel: string;
  // Optional: small list of concrete unlocks shown below the sub-copy.
  // Exists for upgrade milestones so the user sees, at a glance, what
  // the app can do for them now. Deliberately 3 items max - any more
  // turns into a feature-list ad, which is what we're trying to avoid.
  // Each entry is a one-line phrase, not a tutorial step.
  unlocks?: string[];
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
  // Wins celebrations. Triggered when the user logs a manual win from
  // the Wins card on Home. Tone: quiet earned pride, not confetti. The
  // point is to make the app feel like where good news happens - an
  // emotional reason to open it next time.
  'win-interview': {
    eyebrow: 'INTERVIEW LOCKED',
    headline: "You're in\nthe room.",
    sub: "Getting to the interview is the hard part. Now it's just a conversation between two people.",
    accentColor: colors.green,
    ctaLabel: 'Prep with Dilly',
  },
  'win-offer': {
    eyebrow: 'OFFER',
    headline: "You got\nthe offer.",
    sub: "This is the moment. Whatever you decide next, you earned the right to choose.",
    accentColor: colors.gold,
    ctaLabel: 'Talk it through',
  },
  'win-milestone': {
    eyebrow: 'NOTED',
    headline: "Saved to\nyour timeline.",
    sub: "These stack. One at a time is how it compounds.",
    accentColor: colors.green,
    ctaLabel: 'Keep going',
  },
  // Pulse streak milestones. Celebrate the habit itself, quietly. Tone
  // is 'you did something rare', not a shouty trophy. Each milestone
  // has its own copy so the reward compounds - hitting day 100 doesn't
  // feel like day 3.
  'pulse-streak-3': {
    eyebrow: 'THREE IN A ROW',
    headline: "Three days of\nshowing up.",
    sub: "Most people never make it to day three. You're in the smallest, quietest club that changes careers.",
    accentColor: colors.green,
    ctaLabel: 'Keep going',
  },
  'pulse-streak-7': {
    eyebrow: 'A FULL WEEK',
    headline: "Seven days.\nThat's a pattern.",
    sub: "You built a daily habit in a week. That is how Dilly starts remembering who you actually are.",
    accentColor: colors.green,
    ctaLabel: 'Keep going',
  },
  'pulse-streak-14': {
    eyebrow: 'TWO WEEKS',
    headline: "You earned this\none twice.",
    sub: "Fourteen days of showing up. This is past 'trying it out' and into 'this is what I do now.'",
    accentColor: colors.green,
    ctaLabel: 'Keep going',
  },
  'pulse-streak-30': {
    eyebrow: 'ONE MONTH',
    headline: "A full month\nof you.",
    sub: "Thirty pulses. That's not a streak anymore - that's a practice. This is the window people look back on and say things changed here.",
    accentColor: colors.gold,
    ctaLabel: 'Keep going',
  },
  'pulse-streak-60': {
    eyebrow: 'SIXTY DAYS',
    headline: "Two months.\nThe quiet kind.",
    sub: "You've been doing something nobody sees for sixty days. That is what careers are built on.",
    accentColor: colors.gold,
    ctaLabel: 'Keep going',
  },
  'pulse-streak-100': {
    eyebrow: 'ONE HUNDRED',
    headline: "A hundred days.\nThat's rare air.",
    sub: "A hundred days of showing up for yourself before anyone asked. Remember this number. You'll want it back one day.",
    accentColor: colors.gold,
    ctaLabel: 'Keep going',
  },
  // Chapter streak milestones - weekly ritual completions. Different
  // cadence from Pulse (monthly+) so the copy lands differently: this
  // is about the depth of the relationship, not the habit count.
  'chapter-4': {
    eyebrow: 'FOUR CHAPTERS',
    headline: "A month of\nus working together.",
    sub: "Four weeks in. This is when most people quit coaching arrangements. You didn't. Let's see what the next month looks like.",
    accentColor: colors.green,
    ctaLabel: 'Open Chapter',
  },
  'chapter-12': {
    eyebrow: 'A FULL QUARTER',
    headline: "Twelve Chapters.\nA whole quarter.",
    sub: "You have twelve weeks of Dilly knowing you specifically. The advice is sharper now because she's watched you move through a full arc.",
    accentColor: colors.gold,
    ctaLabel: 'Open Chapter',
  },
  'chapter-26': {
    eyebrow: 'HALF A YEAR',
    headline: "Half a year.\nThat's a career move.",
    sub: "Twenty-six Chapters. Most people don't spend this much time thinking carefully about their career in a decade.",
    accentColor: colors.gold,
    ctaLabel: 'Open Chapter',
  },
  'chapter-52': {
    eyebrow: 'ONE FULL YEAR',
    headline: "A year together.\nLook back.",
    sub: "Fifty-two Chapters. Pull up the first one. The person writing it and the person reading this are not the same person anymore.",
    accentColor: colors.gold,
    ctaLabel: 'Open Chapter',
  },
  // Subscription unlocks. These are the moments the user becomes a paying
  // customer (or jumps tiers). Tone here is earned-pride, not celebration
  // for the sake of it. Copy says: "most people stay free - you didn't,
  // that was the right move, here's what's yours now." No "🎉 Yay!!"
  // shouting; this is supposed to feel like the quiet pride of someone
  // who just made a decisive career move.
  'unlocked-dilly': {
    eyebrow: "YOU'RE IN",
    headline: "Welcome to\nDilly.",
    sub: "Most people stay on the free side their whole career. You chose differently, and you'll feel the difference on the next job you touch.",
    accentColor: colors.gold,
    ctaLabel: "Let's go",
    unlocks: [
      "Fit reads on every job that tell you what you have and what's missing",
      "Resumes tailored per role, written off everything Dilly knows about you",
      "Dilly AI remembers what you said last time and builds on it",
    ],
  },
  'unlocked-pro': {
    eyebrow: "PRO UNLOCKED",
    headline: "You just gave\nyourself an edge.",
    sub: "This is the version of Dilly most people never see. No caps, no ceilings, no gates.",
    accentColor: '#A78BFA',
    ctaLabel: "Let's get to work",
    unlocks: [
      "Unlimited fit reads, resume tailoring, and AI chat",
      "AI Arena: scan any job against your full career context",
      "Interview practice that uses your real roles and target companies",
    ],
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
    <Modal transparent animationType="none" visible>
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

          {/* Unlocks list - only present for upgrade milestones.
              Deliberately quiet styling: no icon flourishes, no "NEW"
              badges, just a clean 3-row list that says "here's what
              this version of Dilly does for you." Functions as a
              reveal, not a tutorial. User's own feedback: apps
              designed well shouldn't need walkthroughs. */}
          {cfg.unlocks && cfg.unlocks.length > 0 && (
            <View style={{ marginTop: 18, alignSelf: 'stretch', paddingHorizontal: 8 }}>
              {cfg.unlocks.map((line, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    paddingVertical: 6,
                  }}
                >
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: theme.accent,
                      marginTop: 8,
                    }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13,
                      lineHeight: 19,
                      color: theme.surface.t2,
                    }}
                  >
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          )}

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
