/**
 * SituationHomes — per-situation Home variants.
 *
 * Four seeker user_paths get bespoke Home screens that reshape the
 * hero, eyebrow copy, hero card, and CTA ordering to match how that
 * person is actually thinking about their job search:
 *
 *   exploring   → "Your next move" — generic next-step seeker
 *   dropout     → "Proof over paper" — portfolio-first framing
 *   laid_off    → "Runway + momentum" — calm but urgent
 *   visa       → "Timing + sponsors" — H1B/OPT-aware
 *
 * Design principles shared across all four:
 *   - No numeric scores (product rule).
 *   - Reads from /profile and /memory via sessionCache — zero new
 *     backend endpoints needed for v1.
 *   - One hero card. Three CTAs max. Never a dashboard.
 *   - Each has a unique accent color family that's distinct enough
 *     for a user to tell "I'm in the right app" at a glance.
 *
 * Dispatcher: see app/(app)/index.tsx HomeScreen — it routes based
 * on the cached /profile's user_path value.
 */

import { useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';
import FadeInView from './FadeInView';
import { DillyFace } from './DillyFace';
import { useCachedFetch } from '../lib/sessionCache';
import { dilly } from '../lib/dilly';
import { openDillyOverlay } from '../hooks/useDillyOverlay';
import { useAccent } from '../hooks/useTheme';

const INDIGO = colors.indigo;

/* ─────────────────────────────────────────────────────────────── */
/* Shared data fetch                                                */
/* ─────────────────────────────────────────────────────────────── */

interface HomeData {
  firstName: string;
  factCount: number;
  resumeCount: number;
  marketCount: number | null;
  profile: Record<string, any>;
}

async function fetchHomeData(): Promise<HomeData> {
  const [profileRes, memRes, feedRes, resumesRes] = await Promise.all([
    dilly.get('/profile').catch(() => null),
    dilly.fetch('/memory').then(r => r?.ok ? r.json() : null).catch(() => null),
    dilly.get('/v2/internships/feed?limit=1&sort=rank').catch(() => null),
    dilly.get('/generated-resumes').catch(() => null),
  ]);
  const rawName = String((profileRes as any)?.name || '').trim();
  const firstName =
    ((profileRes as any)?.first_name as string) ||
    (rawName && !rawName.includes('@') ? rawName.split(/\s+/)[0] : '') ||
    'there';
  const facts: any[] = (memRes as any)?.items && Array.isArray((memRes as any).items) ? (memRes as any).items : [];
  const resumes: any[] = Array.isArray((resumesRes as any)?.resumes) ? (resumesRes as any).resumes : (Array.isArray(resumesRes) ? resumesRes : []);
  return {
    firstName,
    factCount: facts.length,
    resumeCount: resumes.length,
    marketCount:
      feedRes && typeof (feedRes as any).total === 'number' ? (feedRes as any).total : null,
    profile: (profileRes as any) || {},
  };
}

function useHomeData(cacheKey: string) {
  return useCachedFetch<HomeData>(cacheKey, fetchHomeData, { ttlMs: 60_000 });
}

/* ─────────────────────────────────────────────────────────────── */
/* Reusable primitives                                             */
/* ─────────────────────────────────────────────────────────────── */

function HomeShell({
  insets, refreshing, onRefresh, accent, children,
}: {
  insets: { top: number; bottom: number };
  refreshing: boolean;
  onRefresh: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function Greeting({ eyebrow, firstName, line, eyebrowColor }:
  { eyebrow: string; firstName: string; line: string; eyebrowColor: string }) {
  const accent = useAccent();
  return (
    <View style={s.greetRow}>
      <View style={{ flex: 1 }}>
        <Text style={[s.eyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
        <Text style={s.greeting}>
          <Text style={{ color: accent }}>{firstName}</Text>
          {', '}
          {line}
        </Text>
      </View>
      <AnimatedPressable
        onPress={() => router.push({ pathname: '/(app)/my-dilly-profile', params: { openQr: '1' } } as any)}
        scaleDown={0.9}
        hitSlop={10}
      >
        <Ionicons name="qr-code" size={20} color={accent} />
      </AnimatedPressable>
      <AnimatedPressable
        onPress={() => router.push('/(app)/settings' as any)}
        scaleDown={0.9}
        hitSlop={10}
        style={{ marginLeft: 10 }}
      >
        <Ionicons name="settings-outline" size={20} color={colors.t3} />
      </AnimatedPressable>
    </View>
  );
}

function PromptRow({ text, onPress, tint }: { text: string; onPress: () => void; tint?: string }) {
  return (
    <AnimatedPressable style={s.promptRow} scaleDown={0.98} onPress={onPress}>
      <Text style={s.promptText}>{text}</Text>
      <Ionicons name="chatbubble-outline" size={14} color={tint || colors.t3} />
    </AnimatedPressable>
  );
}

function MarketTile({ count, label, accent, onPress }: { count: number | null; label: string; accent: string; onPress: () => void }) {
  if (count == null) return null;
  return (
    <AnimatedPressable style={[s.marketTile, { borderColor: accent + '30' }]} scaleDown={0.98} onPress={onPress}>
      <Text style={[s.marketNumber, { color: accent }]}>{count.toLocaleString()}</Text>
      <Text style={s.marketLabel}>{label}</Text>
      <View style={s.marketCtaRow}>
        <Text style={[s.marketCta, { color: accent }]}>Open the market</Text>
        <Ionicons name="arrow-forward" size={14} color={accent} />
      </View>
    </AnimatedPressable>
  );
}

function TalkCta({ label, seed, accent }: { label: string; seed: string; accent: string }) {
  return (
    <AnimatedPressable
      style={[s.talkCta, { backgroundColor: accent }]}
      scaleDown={0.97}
      onPress={() => openDillyOverlay({ isPaid: false, initialMessage: seed })}
    >
      <Ionicons name="chatbubble" size={14} color="#fff" />
      <Text style={s.talkCtaText}>{label}</Text>
    </AnimatedPressable>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* 1. Exploring Home — "Your next move."                           */
/* ─────────────────────────────────────────────────────────────── */

export function ExploringHome() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { data, refreshing, refresh } = useHomeData('home:exploring');
  const firstName = data?.firstName || 'there';
  const factCount = data?.factCount ?? 0;
  const resumeCount = data?.resumeCount ?? 0;
  const marketCount = data?.marketCount ?? null;

  return (
    <HomeShell insets={insets} refreshing={refreshing} onRefresh={refresh} accent={accent}>
      <Greeting
        eyebrow="YOUR NEXT MOVE"
        firstName={firstName}
        line="let's narrow it down."
        eyebrowColor={accent}
      />

      {/* Hero — 3 concrete next moves, picked for explorers. */}
      <FadeInView delay={40}>
        <View style={[s.heroCard, { backgroundColor: accent + '08', borderColor: accent + '22' }]}>
          <Text style={[s.heroKicker, { color: accent }]}>THE QUESTION THAT CRACKS IT OPEN</Text>
          <Text style={s.heroHead}>What would make the next job{'\n'}feel like the right one?</Text>
          <Text style={s.heroBody}>
            Most people searching never answer that clearly. Spend five minutes with Dilly and you'll know what you're actually optimizing for.
          </Text>
          <TalkCta
            label="Work it out with Dilly"
            seed="I'm exploring what comes next. Help me figure out what would actually make the next role feel like the right one. Ask me questions."
            accent={accent}
          />
        </View>
      </FadeInView>

      {/* Two prompt rows — "where do I start today". */}
      <FadeInView delay={100}>
        <Text style={s.sectionLabel}>START HERE TODAY</Text>
        <View style={{ gap: 8 }}>
          <PromptRow
            text="What kind of work actually energizes me?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: 'Help me figure out what kind of work actually energizes me. Ask me about moments where I lost track of time.' })}
          />
          <PromptRow
            text="Which industries should I even be looking at?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Based on what you know about me, suggest 3 industries I should seriously consider and why. Then ask me which feels closest." })}
          />
          <PromptRow
            text="What's a good first role to aim for?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Help me pick a target role for my first serious application. Ask me about constraints — location, pay floor, must-haves." })}
          />
        </View>
      </FadeInView>

      {/* Market tile. */}
      <FadeInView delay={160}>
        <Text style={s.sectionLabel}>THE MARKET</Text>
        <MarketTile
          count={marketCount}
          label="live roles Dilly is tracking"
          accent={accent}
          onPress={() => router.push('/(app)/jobs' as any)}
        />
      </FadeInView>

      {/* Profile depth nudge — only when thin. */}
      {factCount < 20 ? (
        <FadeInView delay={220}>
          <View style={s.growthNudge}>
            <Text style={s.growthLabel}>DILLY KNOWS {factCount}</Text>
            <Text style={s.growthBody}>
              Every real fact sharpens every job match. Tell Dilly one thing about yourself today.
            </Text>
          </View>
        </FadeInView>
      ) : null}

      {resumeCount > 0 ? (
        <FadeInView delay={260}>
          <Text style={s.footerNote}>
            {resumeCount} tailored resume{resumeCount === 1 ? '' : 's'} saved.
          </Text>
        </FadeInView>
      ) : null}
    </HomeShell>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* 2. Dropout Home — "Proof over paper."                           */
/* ─────────────────────────────────────────────────────────────── */

export function DropoutHome() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { data, refreshing, refresh } = useHomeData('home:dropout');
  const firstName = data?.firstName || 'there';
  const factCount = data?.factCount ?? 0;
  const marketCount = data?.marketCount ?? null;

  // Green-forward palette — dropouts need to feel backed, not pitied.
  const PROOF = '#0E9F6E';

  return (
    <HomeShell insets={insets} refreshing={refreshing} onRefresh={refresh} accent={PROOF}>
      <Greeting
        eyebrow="PROOF OVER PAPER"
        firstName={firstName}
        line="let's show what you can actually do."
        eyebrowColor={PROOF}
      />

      <FadeInView delay={40}>
        <View style={[s.heroCard, { backgroundColor: PROOF + '08', borderColor: PROOF + '28' }]}>
          <Text style={[s.heroKicker, { color: PROOF }]}>YOUR EDGE</Text>
          <Text style={s.heroHead}>
            Every hiring manager who's hiring well{'\n'}already knows — degrees aren't it.
          </Text>
          <Text style={s.heroBody}>
            They want receipts: shipped projects, real outcomes, a concrete problem you solved. Dilly helps you collect those and tell them well.
          </Text>
          <TalkCta
            label="Build my proof"
            seed="I don't have a degree. Help me turn what I've built into a short list of specific, sharp proof points. Ask me about one project at a time."
            accent={PROOF}
          />
        </View>
      </FadeInView>

      {/* Proof stack visual — facts the user has captured. */}
      <FadeInView delay={100}>
        <Text style={s.sectionLabel}>YOUR PROOF STACK</Text>
        <View style={s.proofStack}>
          <View style={[s.proofBar, { width: `${Math.min(100, (factCount / 40) * 100)}%`, backgroundColor: PROOF }]} />
        </View>
        <Text style={s.proofMeta}>
          <Text style={{ fontWeight: '800', color: colors.t1 }}>{factCount}</Text> receipts captured
          {factCount < 40 ? ` · ${40 - factCount} to go for a strong portfolio` : ' · strong portfolio'}
        </Text>
      </FadeInView>

      <FadeInView delay={160}>
        <Text style={s.sectionLabel}>QUICK PROOF PROMPTS</Text>
        <View style={{ gap: 8 }}>
          <PromptRow
            text="A project I shipped and what it cost me"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: 'I want to add a project to my proof stack. Ask me what I built, what went wrong, what I learned.' })}
            tint={PROOF}
          />
          <PromptRow
            text="A hard problem I solved without formal training"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Help me describe a hard problem I solved without formal training. Ask me what made it hard and how I got past it." })}
            tint={PROOF}
          />
          <PromptRow
            text="What I taught myself that most degree holders don't know"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: 'Help me name something specific I taught myself that most degree holders in my field don\'t actually know. Probe me.' })}
            tint={PROOF}
          />
        </View>
      </FadeInView>

      <FadeInView delay={220}>
        <Text style={s.sectionLabel}>OPEN ROLES THAT DON'T GATE ON DEGREES</Text>
        <MarketTile
          count={marketCount}
          label="roles Dilly is tracking · filter applied"
          accent={PROOF}
          onPress={() => router.push('/(app)/jobs' as any)}
        />
      </FadeInView>
    </HomeShell>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* 3. Laid-Off Home — "Runway + momentum."                         */
/* ─────────────────────────────────────────────────────────────── */

export function LaidOffHome() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { data, refreshing, refresh } = useHomeData('home:laid_off');
  const firstName = data?.firstName || 'there';
  const factCount = data?.factCount ?? 0;
  const marketCount = data?.marketCount ?? null;
  const layoffDate = useMemo(() => {
    const ev = (data?.profile?.life_events || []) as any[];
    const layoff = ev.find(e => e?.kind === 'layoff');
    if (!layoff?.at) return null;
    try { return new Date(layoff.at); } catch { return null; }
  }, [data?.profile?.life_events]);
  const weeksSince = layoffDate
    ? Math.max(0, Math.floor((Date.now() - layoffDate.getTime()) / (1000 * 60 * 60 * 24 * 7)))
    : null;

  // Coral/amber palette — urgency without panic.
  const RESET = '#C2410C';

  return (
    <HomeShell insets={insets} refreshing={refreshing} onRefresh={refresh} accent={RESET}>
      <Greeting
        eyebrow="THE RESET"
        firstName={firstName}
        line="momentum matters more than perfect."
        eyebrowColor={RESET}
      />

      {/* Regroup card — calm but moving. */}
      <FadeInView delay={40}>
        <View style={[s.heroCard, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Text style={[s.heroKicker, { color: RESET }]}>
            {weeksSince != null ? `WEEK ${weeksSince + 1}` : 'RIGHT NOW'}
          </Text>
          <Text style={s.heroHead}>
            First week: breathe and list.{'\n'}
            After that: send.
          </Text>
          <Text style={s.heroBody}>
            The data is clear — momentum in the first 30 days is worth more than polish. Dilly helps you ship three tailored applications a week, not perfect ones.
          </Text>
          <TalkCta
            label="Plan this week with Dilly"
            seed="I was just laid off. Help me plan this week. What's the ONE highest-leverage thing I should do today, and what can wait?"
            accent={RESET}
          />
        </View>
      </FadeInView>

      {/* Pipeline — 3 stages the user should be working. */}
      <FadeInView delay={100}>
        <Text style={s.sectionLabel}>YOUR PIPELINE</Text>
        <View style={s.pipelineRow}>
          <View style={[s.pipelineTile, { borderColor: RESET + '30' }]}>
            <Ionicons name="document-text" size={18} color={RESET} />
            <Text style={s.pipelineLabel}>Tailor</Text>
            <Text style={s.pipelineHint}>Match resume to the role</Text>
          </View>
          <View style={[s.pipelineTile, { borderColor: RESET + '30' }]}>
            <Ionicons name="send" size={18} color={RESET} />
            <Text style={s.pipelineLabel}>Send</Text>
            <Text style={s.pipelineHint}>Three this week, not one perfect</Text>
          </View>
          <View style={[s.pipelineTile, { borderColor: RESET + '30' }]}>
            <Ionicons name="mic" size={18} color={RESET} />
            <Text style={s.pipelineLabel}>Prep</Text>
            <Text style={s.pipelineHint}>Ten minutes in The Room</Text>
          </View>
        </View>
      </FadeInView>

      {/* Prompts — layoff-specific. */}
      <FadeInView delay={160}>
        <Text style={s.sectionLabel}>TODAY'S OPENING</Text>
        <View style={{ gap: 8 }}>
          <PromptRow
            text="How do I talk about the layoff in interviews?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Help me script a short, confident answer to 'why did you leave your last role?' that's honest about the layoff without making it the story." })}
            tint={RESET}
          />
          <PromptRow
            text="Who in my network should I reach out to this week?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Help me make a short list of people in my network to reach out to this week. Ask me about who comes to mind." })}
            tint={RESET}
          />
          <PromptRow
            text="What's my runway and how should I budget it?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Help me think through my financial runway and what a reasonable search timeline looks like. Ask me about my savings comfortably." })}
            tint={RESET}
          />
        </View>
      </FadeInView>

      <FadeInView delay={220}>
        <Text style={s.sectionLabel}>LIVE ROLES</Text>
        <MarketTile
          count={marketCount}
          label="roles open right now"
          accent={RESET}
          onPress={() => router.push('/(app)/jobs' as any)}
        />
      </FadeInView>

      <FadeInView delay={260}>
        <Text style={s.footerNote}>
          {factCount} things in your profile. Add one today — it sharpens every match.
        </Text>
      </FadeInView>
    </HomeShell>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* 4. Visa Home — "Timing + sponsors."                             */
/* ─────────────────────────────────────────────────────────────── */

export function VisaHome() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { data, refreshing, refresh } = useHomeData('home:visa');
  const firstName = data?.firstName || 'there';
  const factCount = data?.factCount ?? 0;
  const marketCount = data?.marketCount ?? null;

  // Blue/violet palette — trustworthy, serious, considered.
  const VISA = '#4338CA';

  return (
    <HomeShell insets={insets} refreshing={refreshing} onRefresh={refresh} accent={VISA}>
      <Greeting
        eyebrow="YOUR TIMELINE"
        firstName={firstName}
        line="sponsors and cutoffs first."
        eyebrowColor={VISA}
      />

      <FadeInView delay={40}>
        <View style={[s.heroCard, { backgroundColor: VISA + '08', borderColor: VISA + '28' }]}>
          <Text style={[s.heroKicker, { color: VISA }]}>THE REAL CONSTRAINT</Text>
          <Text style={s.heroHead}>
            The best job is useless{'\n'}
            if they won't sponsor.
          </Text>
          <Text style={s.heroBody}>
            Dilly filters the market for companies that sponsor, tracks your OPT/STEM/H1B cutoffs, and rewrites your resume for sponsor-side recruiters who screen differently. Nothing else wastes your time.
          </Text>
          <TalkCta
            label="Plan my visa timeline"
            seed="I'm on a visa. Help me lay out my timeline: what OPT/STEM/H1B deadlines I should be aware of and what my search should look like backwards from those."
            accent={VISA}
          />
        </View>
      </FadeInView>

      {/* Sponsor-first callout. */}
      <FadeInView delay={100}>
        <Text style={s.sectionLabel}>SPONSOR-FIRST THINKING</Text>
        <View style={s.infoCard}>
          <View style={[s.infoIcon, { backgroundColor: VISA + '15' }]}>
            <Ionicons name="globe" size={18} color={VISA} />
          </View>
          <Text style={s.infoTitle}>Filter the market, don't fight it.</Text>
          <Text style={s.infoBody}>
            Most listings aren't sponsor-friendly. Dilly's job feed applies a known-sponsor filter by default for visa users. Dead ends are deprioritized.
          </Text>
          <AnimatedPressable
            style={[s.infoCta, { backgroundColor: VISA }]}
            scaleDown={0.97}
            onPress={() => router.push('/(app)/jobs' as any)}
          >
            <Text style={s.infoCtaText}>Browse sponsor-friendly roles</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </AnimatedPressable>
        </View>
      </FadeInView>

      <FadeInView delay={160}>
        <Text style={s.sectionLabel}>FASTEST WAY TO USE DILLY</Text>
        <View style={{ gap: 8 }}>
          <PromptRow
            text="Which companies in my cohort actually sponsor?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Give me a list of companies in my cohort that are known to sponsor H1B. Start with the top 5 by recent H1B approval volume." })}
            tint={VISA}
          />
          <PromptRow
            text="How should I frame visa status in a cover letter?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Help me draft a short, confident mention of my visa status in a cover letter. Direct, not apologetic. Ask me what visa I'm on." })}
            tint={VISA}
          />
          <PromptRow
            text="What's my OPT / STEM clock telling me to do?"
            onPress={() => openDillyOverlay({ isPaid: false, initialMessage: "Walk me through where I am in my OPT / STEM extension clock and what it means for my job search timeline. Ask me about my I-765 dates." })}
            tint={VISA}
          />
        </View>
      </FadeInView>

      <FadeInView delay={220}>
        <Text style={s.sectionLabel}>LIVE ROLES</Text>
        <MarketTile
          count={marketCount}
          label="roles live right now"
          accent={VISA}
          onPress={() => router.push('/(app)/jobs' as any)}
        />
      </FadeInView>

      {factCount < 15 ? (
        <FadeInView delay={260}>
          <Text style={s.footerNote}>
            {factCount} facts in your profile. Add a few specifics about your field — visa-friendly recruiters screen hard.
          </Text>
        </FadeInView>
      ) : null}
    </HomeShell>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Shared styles                                                   */
/* ─────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingTop: 8, gap: 20 },

  greetRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 2 },
  greeting: {
    fontSize: 22, fontWeight: '800',
    color: colors.t1, letterSpacing: -0.5, lineHeight: 28,
  },

  sectionLabel: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    color: colors.t3, marginBottom: 8,
  },

  heroCard: {
    borderWidth: 1, borderRadius: 18, padding: 20, gap: 10,
  },
  heroKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  heroHead: {
    fontSize: 20, fontWeight: '800', color: colors.t1,
    letterSpacing: -0.4, lineHeight: 26, marginTop: 2,
  },
  heroBody: { fontSize: 13, color: colors.t2, lineHeight: 20 },

  talkCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, paddingVertical: 13, marginTop: 6,
  },
  talkCtaText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  promptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  promptText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.t1 },

  marketTile: {
    backgroundColor: '#fff',
    borderRadius: 16, padding: 18, borderWidth: 1,
  },
  marketNumber: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  marketLabel: { fontSize: 13, color: colors.t2, marginTop: 2 },
  marketCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  marketCta: { fontSize: 12, fontWeight: '800' },

  growthNudge: {
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
    borderRadius: 14, padding: 14,
  },
  growthLabel: { fontSize: 10, fontWeight: '900', color: INDIGO, letterSpacing: 1.4, marginBottom: 4 },
  growthBody: { fontSize: 12, color: colors.t2, lineHeight: 17 },

  footerNote: { fontSize: 12, color: colors.t3, textAlign: 'center', fontStyle: 'italic' },

  // Dropout
  proofStack: { height: 10, borderRadius: 5, backgroundColor: colors.s2, overflow: 'hidden' },
  proofBar: { height: '100%' },
  proofMeta: { fontSize: 12, color: colors.t2, marginTop: 6 },

  // Laid off
  pipelineRow: { flexDirection: 'row', gap: 8 },
  pipelineTile: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    padding: 12, gap: 6, alignItems: 'flex-start',
  },
  pipelineLabel: { fontSize: 13, fontWeight: '800', color: colors.t1 },
  pipelineHint: { fontSize: 10, color: colors.t3, lineHeight: 14 },

  // Visa
  infoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.b1, gap: 8,
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  infoTitle: { fontSize: 15, fontWeight: '800', color: colors.t1, letterSpacing: -0.2, marginTop: 4 },
  infoBody: { fontSize: 12, color: colors.t2, lineHeight: 18 },
  infoCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 12, paddingVertical: 11, marginTop: 6,
  },
  infoCtaText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
