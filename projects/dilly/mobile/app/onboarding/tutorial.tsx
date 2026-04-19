/**
 * Tutorial. a 5-card intro shown once after a new user completes
 * sign-up + profile setup. Content is entirely hand-written (no API
 * calls, no LLM) so this costs nothing to render. Each mode gets its
 * own 5-card script.
 *
 * Shown ONLY to new users. We set a flag in AsyncStorage at the end
 * of the tutorial (or on skip) so a returning user never sees it
 * again. If the flag is already present when the route mounts, we
 * immediately redirect to the app.
 *
 * Skip is always one tap. We trust users to bail when they want to.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Dimensions,
  TouchableOpacity, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius } from '../../lib/tokens';
import { dilly } from '../../lib/dilly';
import { getAppMode, type AppMode } from '../../lib/appMode';

const W = Dimensions.get('window').width;
const INDIGO = colors.indigo;
const VIOLET = '#6C5CE7';
const INK = '#0E0E18';
const TUTORIAL_SEEN_KEY = 'dilly_tutorial_shown';

type CardSpec = {
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
  illustration: 'arena' | 'week' | 'market' | 'profile' | 'ritual' | 'jobs' | 'fit' | 'resume' | 'interview' | 'apply' | 'journey' | 'first_job' | 'internships' | 'resumes_student' | 'wow';
  accent?: string;
};

// ── Content: 5 cards × 3 modes. ─────────────────────────────────────
// Hand-written. Every word has to earn its keep.

const CARDS: Record<AppMode, CardSpec[]> = {
  holder: [
    {
      eyebrow: 'YOU HAVE A JOB',
      headline: "AI is reshaping your field\nwhether you move or not.",
      body: 'Dilly watches your industry for you. What is changing, what is safe, what to learn next. for your exact role.',
      cta: "Show me what's next",
      illustration: 'arena',
    },
    {
      eyebrow: 'EVERY MONDAY',
      headline: "One signal from your field.\nNo spam.",
      body: 'Dilly delivers one real market move each week. A headline, a data point, one thing to do about it.',
      cta: 'Got it',
      illustration: 'week',
    },
    {
      eyebrow: 'THE MARKET TAB',
      headline: 'Know what your role\nis worth right now.',
      body: 'Not a job board. A live read on salary bands, emerging titles, and which skills are suddenly in demand.',
      cta: 'Keep going',
      illustration: 'market',
    },
    {
      eyebrow: 'PRIVATE TO YOU',
      headline: 'Dilly learns you\nwith every chat.',
      body: 'Your wins, your decisions, your thinking. all tracked privately so Dilly gets sharper about you over time.',
      cta: 'Next',
      illustration: 'profile',
    },
    {
      eyebrow: 'THE RITUAL',
      headline: "You'll never open Dilly\nand wonder why.",
      body: 'Every week: one move to make. Every month: a clearer picture of where you are headed.',
      cta: "Let's start",
      illustration: 'ritual',
    },
  ],
  seeker: [
    {
      eyebrow: 'YOUR JOB SEARCH',
      headline: "Jobs ranked by fit,\nnot by keywords.",
      body: 'Dilly reads the full job description against your full profile and tells you honestly how you line up.',
      cta: 'Show me',
      illustration: 'jobs',
    },
    {
      eyebrow: 'FIT NARRATIVES',
      headline: 'What you have.\nWhat is missing.\nWhat to do.',
      body: 'Every job card opens into a personal read. No scores. No fake confidence. Just the honest picture.',
      cta: 'Next',
      illustration: 'fit',
    },
    {
      eyebrow: 'TAILORED RESUMES',
      headline: 'A resume written\nfor each role.',
      body: 'Dilly generates a resume tuned to the specific company and job, pulling the right bullets from your profile.',
      cta: 'Keep going',
      illustration: 'resume',
    },
    {
      eyebrow: 'INTERVIEW PREP',
      headline: 'Practice the interview\nbefore it happens.',
      body: 'Role-specific drills, company-aware questions, and feedback that makes you sharper with each round.',
      cta: 'Next',
      illustration: 'interview',
    },
    {
      eyebrow: 'APPLY SMARTER',
      headline: 'One tap to apply.\nOne tap to save.\nOne tap to tailor.',
      body: 'Dilly keeps your pipeline clean. Know what you applied to, what responded, what to follow up on.',
      cta: "Let's go",
      illustration: 'apply',
    },
  ],
  student: [
    {
      eyebrow: 'DILLY FOR STUDENTS',
      headline: "A career coach\nin your pocket.",
      body: 'Dilly knows you. your major, your clubs, your coursework. and guides you through the job market for people like you.',
      cta: 'Show me',
      illustration: 'journey',
    },
    {
      eyebrow: 'INTERNSHIPS THAT FIT',
      headline: 'Matched to your cohort\nand your story.',
      body: 'Not every internship posting. The ones recruiters in your field actually hire from. filtered and ranked.',
      cta: 'Next',
      illustration: 'internships',
    },
    {
      eyebrow: 'YOUR FIRST RESUME',
      headline: 'Written for the\ncompanies you want.',
      body: 'Dilly turns your coursework, projects, and clubs into a resume tailored to each role you care about.',
      cta: 'Keep going',
      illustration: 'resumes_student',
    },
    {
      eyebrow: 'AI IS CHANGING WORK',
      headline: 'Graduate into the right\nthings to learn.',
      body: "The Arena shows you which skills in your field are safe, which are vanishing, and what to build now.",
      cta: 'Next',
      illustration: 'wow',
    },
    {
      eyebrow: 'FIRST JOB, SORTED',
      headline: "Internship. Return offer.\nFirst full-time role.",
      body: "Dilly walks the path with you. Every week has one move. Every month you know where you stand.",
      cta: "Let's start",
      illustration: 'first_job',
    },
  ],
};

// ── Illustrations ───────────────────────────────────────────────────
// Simple stylized previews of the real feature. Not the real data
// (the user just signed up); just shape + color cues that match the
// feature being described.

function Illustration({ kind }: { kind: CardSpec['illustration'] }) {
  switch (kind) {
    case 'arena':
      return (
        <View style={[il.card, { backgroundColor: '#0F172A' }]}>
          <View style={il.badgeRow}>
            <View style={[il.levelBadge, { backgroundColor: '#EA580C' + '22', borderColor: '#EA580C' }]}>
              <Text style={[il.levelText, { color: '#FDBA74' }]}>HIGH</Text>
            </View>
          </View>
          <Text style={il.bigPct}>48%</Text>
          <Text style={il.headlineDark}>Your role is changing. Here is what is shifting and what to do about it.</Text>
          <View style={il.chip}><Text style={il.chipText}>MOST AT RISK</Text></View>
          <View style={il.line} />
          <View style={il.line} />
          <View style={[il.line, { width: '62%' }]} />
        </View>
      );
    case 'week':
      return (
        <View style={[il.card, { backgroundColor: '#0B1426' }]}>
          <View style={il.pillRow}>
            <View style={il.livePulse} />
            <Text style={il.pulseText}>THIS WEEK IN YOUR FIELD</Text>
          </View>
          <Text style={[il.headlineDark, { fontSize: 15, lineHeight: 20 }]}>One real shift in your industry, every week.</Text>
          <Text style={il.source}>Hand-picked. Not a feed, not a newsletter.</Text>
          <View style={[il.moveBox, { borderTopColor: '#22D3EE' }]}>
            <Text style={[il.moveLabel, { color: '#22D3EE' }]}>YOUR MOVE</Text>
            <Text style={il.moveText}>One thing to do about it. Specific to your role.</Text>
          </View>
        </View>
      );
    case 'market':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <Text style={il.eyebrow}>THE MARKET · YOUR FIELD</Text>
          <Text style={il.headlineLight}>What your role is worth right now.</Text>
          <View style={il.statRow}>
            <View style={il.statBox}>
              <Text style={il.statNum}>$142k</Text>
              <Text style={il.statLabel}>MEDIAN</Text>
            </View>
            <View style={il.statBox}>
              <Text style={[il.statNum, { color: '#16A34A' }]}>+6%</Text>
              <Text style={il.statLabel}>YOY</Text>
            </View>
            <View style={il.statBox}>
              <Text style={il.statNum}>1.2k</Text>
              <Text style={il.statLabel}>HIRING</Text>
            </View>
          </View>
        </View>
      );
    case 'profile':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: INDIGO + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="analytics" size={22} color={INDIGO} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={il.headlineLight}>My Career</Text>
              <Text style={il.subtle}>Dilly knows 34 things about you</Text>
            </View>
          </View>
          <View style={il.tagRow}>
            {['your wins', 'your decisions', 'your skills', 'your goals'].map((t, i) => (
              <View key={i} style={il.tag}><Text style={il.tagText}>{t}</Text></View>
            ))}
          </View>
          <View style={[il.line, { width: '92%' }]} />
          <View style={[il.line, { width: '70%' }]} />
        </View>
      );
    case 'ritual':
      return (
        <View style={[il.card, { backgroundColor: INK }]}>
          <Text style={[il.eyebrow, { color: VIOLET }]}>YOUR RITUAL</Text>
          <View style={il.ritualRow}>
            <Ionicons name="newspaper-outline" size={14} color="#22D3EE" />
            <Text style={il.ritualItem}>Weekly brief · Monday AM</Text>
          </View>
          <View style={il.ritualRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#22D3EE" />
            <Text style={il.ritualItem}>Threat report · refreshed weekly</Text>
          </View>
          <View style={il.ritualRow}>
            <Ionicons name="trending-up-outline" size={14} color="#22D3EE" />
            <Text style={il.ritualItem}>Market pulse · your field</Text>
          </View>
          <View style={il.ritualRow}>
            <Ionicons name="sparkles-outline" size={14} color="#22D3EE" />
            <Text style={il.ritualItem}>One move · every month</Text>
          </View>
        </View>
      );
    case 'jobs':
      return (
        <View style={[il.card, { backgroundColor: INK }]}>
          <View style={il.pillRow}>
            <View style={il.livePulse} />
            <Text style={il.pulseText}>TOP MATCH FOR YOU</Text>
          </View>
          <Text style={il.headlineDark}>A role Dilly ranked high for your profile.</Text>
          <Text style={il.source}>Ranked by fit. Not by keywords.</Text>
          <View style={[il.moveBox, { borderTopColor: VIOLET, marginTop: 10 }]}>
            <Text style={[il.moveLabel, { color: VIOLET }]}>DILLY'S READ</Text>
            <Text style={il.moveText}>One sentence on why this job actually fits you.</Text>
          </View>
        </View>
      );
    case 'fit':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <Text style={[il.eyebrow, { color: VIOLET }]}>WHAT YOU HAVE</Text>
          <View style={il.bulletRow}><View style={[il.dot, { backgroundColor: VIOLET }]} /><Text style={il.bulletText}>What you bring to this role</Text></View>
          <View style={il.bulletRow}><View style={[il.dot, { backgroundColor: VIOLET }]} /><Text style={il.bulletText}>Skills that directly apply</Text></View>
          <Text style={[il.eyebrow, { color: VIOLET, marginTop: 10 }]}>WHAT IS MISSING</Text>
          <View style={il.bulletRow}><View style={[il.dot, { backgroundColor: VIOLET }]} /><Text style={il.bulletText}>One thing to work on this week</Text></View>
        </View>
      );
    case 'resume':
      return (
        <View style={[il.card, { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.b1, gap: 6 }]}>
          <Text style={[il.headlineLight, { fontSize: 16 }]}>Tailored for this role</Text>
          <View style={[il.line, { width: '90%' }]} />
          <View style={[il.line, { width: '82%' }]} />
          <View style={[il.line, { width: '74%' }]} />
          <View style={[il.line, { width: '86%' }]} />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <View style={[il.tag, { backgroundColor: '#16A34A' + '22' }]}><Text style={[il.tagText, { color: '#166534' }]}>ATS ready</Text></View>
            <View style={[il.tag, { backgroundColor: VIOLET + '22' }]}><Text style={[il.tagText, { color: VIOLET }]}>tuned</Text></View>
          </View>
        </View>
      );
    case 'interview':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: VIOLET + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mic" size={16} color={VIOLET} />
            </View>
            <Text style={[il.headlineLight, { fontSize: 15 }]}>Mock interview in progress</Text>
          </View>
          <Text style={il.subtle}>"Tell me about a time you solved something hard."</Text>
          <View style={[il.moveBox, { borderTopColor: VIOLET, marginTop: 10 }]}>
            <Text style={[il.moveLabel, { color: VIOLET }]}>DILLY'S FEEDBACK</Text>
            <Text style={il.moveText}>Start with the outcome, not the setup. Trim the intro.</Text>
          </View>
        </View>
      );
    case 'apply':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1, gap: 8 }]}>
          <View style={il.applyRow}><Ionicons name="checkmark-circle" size={18} color="#16A34A" /><Text style={il.applyText}>Applied · Follow up Thursday</Text></View>
          <View style={il.applyRow}><Ionicons name="chatbubble" size={18} color={INDIGO} /><Text style={il.applyText}>Interview on Tuesday</Text></View>
          <View style={il.applyRow}><Ionicons name="bookmark" size={18} color={VIOLET} /><Text style={il.applyText}>Saved · Tailor resume</Text></View>
          <View style={il.applyRow}><Ionicons name="time" size={18} color={colors.t3} /><Text style={il.applyText}>Waiting · 9 days silent</Text></View>
        </View>
      );
    case 'journey':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <Text style={il.eyebrow}>YOUR JOURNEY</Text>
          <Text style={il.headlineLight}>One step at a time.</Text>
          <View style={il.stepRow}><View style={[il.checkDot, { backgroundColor: '#16A34A' }]}><Ionicons name="checkmark" size={10} color="#fff" /></View><Text style={il.stepDone}>Create your profile</Text></View>
          <View style={il.stepRow}><View style={[il.checkDot, { backgroundColor: INDIGO }]} /><Text style={il.stepActive}>Upload your first resume</Text></View>
          <View style={il.stepRow}><View style={il.stepDot} /><Text style={il.stepTodo}>Save 3 jobs you want</Text></View>
          <View style={il.stepRow}><View style={il.stepDot} /><Text style={il.stepTodo}>Practice one interview</Text></View>
        </View>
      );
    case 'internships':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <Text style={il.eyebrow}>INTERNSHIPS THIS WEEK</Text>
          <Text style={il.headlineLight}>New roles, matched to you.</Text>
          <View style={il.applyRow}><View style={[il.checkDot, { backgroundColor: INDIGO }]}><Ionicons name="briefcase" size={10} color="#fff" /></View><Text style={il.applyText}>Summer internship · in your field</Text></View>
          <View style={il.applyRow}><View style={[il.checkDot, { backgroundColor: VIOLET }]}><Ionicons name="school" size={10} color="#fff" /></View><Text style={il.applyText}>Junior-year program · paid</Text></View>
          <View style={il.applyRow}><View style={[il.checkDot, { backgroundColor: '#F59E0B' }]}><Ionicons name="time" size={10} color="#fff" /></View><Text style={il.applyText}>Fall opportunity · remote OK</Text></View>
        </View>
      );
    case 'resumes_student':
      return (
        <View style={[il.card, { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.b1, gap: 6 }]}>
          <Text style={[il.eyebrow, { color: VIOLET }]}>FROM YOUR PROFILE</Text>
          <View style={[il.line, { width: '74%' }]} />
          <View style={[il.line, { width: '88%' }]} />
          <View style={[il.line, { width: '62%' }]} />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <View style={il.tag}><Text style={il.tagText}>Courses</Text></View>
            <View style={il.tag}><Text style={il.tagText}>Projects</Text></View>
            <View style={il.tag}><Text style={il.tagText}>Clubs</Text></View>
            <View style={il.tag}><Text style={il.tagText}>Jobs</Text></View>
          </View>
        </View>
      );
    case 'wow':
      return (
        <View style={[il.card, { backgroundColor: INK }]}>
          <Text style={[il.eyebrow, { color: '#22D3EE' }]}>AI ARENA</Text>
          <Text style={il.headlineDark}>Safe skills vs vanishing skills.</Text>
          <View style={il.bulletRow}><Ionicons name="checkmark-circle" size={13} color="#16A34A" /><Text style={[il.moveText, { color: '#BBF7D0' }]}>Judgment and decision-making · growing</Text></View>
          <View style={il.bulletRow}><Ionicons name="checkmark-circle" size={13} color="#16A34A" /><Text style={[il.moveText, { color: '#BBF7D0' }]}>Communicating with people · growing</Text></View>
          <View style={il.bulletRow}><Ionicons name="warning" size={13} color="#EA580C" /><Text style={[il.moveText, { color: '#FED7AA' }]}>Tasks AI does in seconds · vanishing</Text></View>
        </View>
      );
    case 'first_job':
      return (
        <View style={[il.card, { backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }]}>
          <Text style={il.eyebrow}>YOUR PATH</Text>
          <View style={il.pathRow}><View style={[il.pathDot, { backgroundColor: '#16A34A' }]} /><Text style={il.stepDone}>Summer internship</Text></View>
          <View style={il.pathBar} />
          <View style={il.pathRow}><View style={[il.pathDot, { backgroundColor: INDIGO }]} /><Text style={il.stepActive}>Return offer conversation</Text></View>
          <View style={il.pathBar} />
          <View style={il.pathRow}><View style={[il.pathDot, { backgroundColor: colors.t3 }]} /><Text style={il.stepTodo}>First full-time role</Text></View>
        </View>
      );
  }
}

// ── Screen ──────────────────────────────────────────────────────────

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AppMode>('seeker');
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // On mount: if user has already seen the tutorial, bail immediately.
  // Otherwise pull their profile to pick the right mode script.
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        if (seen === 'true') {
          router.replace('/(app)');
          return;
        }
      } catch {}
      try {
        const p = await dilly.get('/profile');
        if (p) setMode(getAppMode(p as any));
      } catch {}
      setReady(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    })();
  }, []);

  const cards = CARDS[mode];
  const total = cards.length;

  // Progress bar animated width. MUST live above the `if (!ready) return`
  // below, otherwise on the first render (ready=false) these two hooks
  // aren't called, and on the second render (ready=true) they are —
  // which is the 'Rendered more hooks than during the previous render'
  // crash users hit during onboarding. Hook order has to be identical
  // on every render.
  const progressFraction = (idx + 1) / total;
  const progressAnim = useRef(new Animated.Value(progressFraction)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressFraction,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressFraction, progressAnim]);

  async function finish() {
    try {
      await AsyncStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
    } catch {}
    router.replace('/(app)');
  }

  function next() {
    if (idx >= total - 1) {
      finish();
      return;
    }
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    scrollRef.current?.scrollTo({ x: nextIdx * W, animated: true });
  }

  if (!ready) {
    return <View style={s.container} />;
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top row: full-width progress bar + skip. Bar spans the screen
          (minus horizontal padding) so users feel their way through the
          tutorial instead of counting dots. */}
      <View style={s.topRow}>
        <View style={s.progressTrack}>
          <Animated.View
            style={[
              s.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <TouchableOpacity onPress={finish} hitSlop={14} style={{ paddingLeft: 12 }}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const newIdx = Math.round(e.nativeEvent.contentOffset.x / W);
            if (newIdx !== idx) setIdx(newIdx);
          }}
          keyboardShouldPersistTaps="handled"
        >
          {cards.map((c, i) => (
            <View key={i} style={[s.page, { width: W }]}>
              <View style={s.illustrationWrap}>
                <Illustration kind={c.illustration} />
              </View>
              <Text style={s.eyebrow}>{c.eyebrow}</Text>
              <Text style={s.headline}>{c.headline}</Text>
              <Text style={s.body}>{c.body}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Sticky CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={s.cta} onPress={next} activeOpacity={0.9}>
          <Text style={s.ctaText}>
            {idx >= total - 1 ? "Let's start" : cards[idx]?.cta || 'Next'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 12,
  },
  // Progress track fills the row minus the Skip button. Height 4 so
  // the bar is thick enough to read progress at a glance without
  // fighting the content below for attention.
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.b1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: INDIGO,
    borderRadius: 2,
  },
  skipText: { fontSize: 13, fontWeight: '600', color: colors.t3 },

  page: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    gap: 14,
  },
  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '900', color: INDIGO, letterSpacing: 1.6,
  },
  headline: {
    fontSize: 26, fontWeight: '900', color: colors.t1, letterSpacing: -0.6, lineHeight: 32,
  },
  body: {
    fontSize: 15, color: colors.t2, lineHeight: 22,
  },

  ctaWrap: {
    paddingHorizontal: spacing.xl, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.b1,
    backgroundColor: colors.bg,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: INDIGO,
    paddingVertical: 16, borderRadius: radius.lg,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
});

// ── Illustration styles ─────────────────────────────────────────────

const il = StyleSheet.create({
  card: {
    width: W - 72, minHeight: 200,
    borderRadius: 18, padding: 16, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  badgeRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  levelText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bigPct: { fontSize: 38, fontWeight: '900', color: '#F8FAFC', letterSpacing: -1.5, lineHeight: 42 },
  headlineDark: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', lineHeight: 19 },
  headlineLight: { fontSize: 17, fontWeight: '800', color: colors.t1, letterSpacing: -0.2 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#EA580C' + '22' },
  chipText: { fontSize: 9, fontWeight: '900', color: '#FDBA74', letterSpacing: 1 },
  line: { height: 7, borderRadius: 3, backgroundColor: 'rgba(148, 163, 184, 0.35)', width: '85%' },

  pillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,211,238,0.12)',
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.35)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  livePulse: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22D3EE' },
  pulseText: { fontSize: 9, fontWeight: '900', color: '#22D3EE', letterSpacing: 1.2 },
  source: { fontSize: 11, color: '#94A3B8', fontStyle: 'italic' },

  moveBox: { backgroundColor: 'rgba(15, 23, 42, 0.35)', borderRadius: 8, padding: 10, borderTopWidth: 1 },
  moveLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
  moveText: { fontSize: 12, color: '#E2E8F0', fontWeight: '600', lineHeight: 17 },

  eyebrow: { fontSize: 10, fontWeight: '900', color: INDIGO, letterSpacing: 1.4 },
  subtle: { fontSize: 12, color: colors.t3, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  statBox: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.s2, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '900', color: colors.t1, letterSpacing: -0.4 },
  statLabel: { fontSize: 9, fontWeight: '800', color: colors.t3, letterSpacing: 1.1, marginTop: 3 },

  tagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1 },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.t2 },

  ritualRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ritualItem: { fontSize: 13, color: '#E2E8F0', fontWeight: '600' },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, color: colors.t1, lineHeight: 18 },

  applyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  applyText: { fontSize: 13, color: colors.t1, fontWeight: '600' },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  checkDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.s3, borderWidth: 1, borderColor: colors.b1, marginLeft: 5, marginRight: 5 },
  stepDone: { fontSize: 13, color: colors.t3, fontWeight: '500', textDecorationLine: 'line-through' },
  stepActive: { fontSize: 13, color: colors.t1, fontWeight: '700' },
  stepTodo: { fontSize: 13, color: colors.t3, fontWeight: '500' },

  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  pathDot: { width: 12, height: 12, borderRadius: 6 },
  pathBar: { width: 2, height: 14, backgroundColor: colors.b1, marginLeft: 5 },
});
