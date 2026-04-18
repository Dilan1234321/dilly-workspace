/**
 * Interview Practice — "The Room"
 *
 * Not a chatbot. Not a prompt wrapper. A simulated interview room
 * built from the job description, with live performance feedback
 * that cannot be reproduced by typing questions into ChatGPT.
 *
 * The differentiators (what you're paying for):
 *   - A cinematic, focused practice surface (dark, immersive) instead
 *     of a utility form. The environment cues the user to treat the
 *     session like the real thing.
 *   - Live STAR coverage bar + answer-duration meter beneath every
 *     answer. You see your Situation/Task/Action/Result chips light
 *     up as you type, and a color-coded length meter nudges you
 *     toward the 40-90s sweet spot. No chatbot can do this — it's
 *     reactive in real time as characters land.
 *   - Narrated loader stages ("reading the description → identifying
 *     what they'll test → calibrating difficulty") so the user feels
 *     the machine working, not a mystery spinner.
 *   - Scorecard debrief with 4 axes (Clarity, Specificity, Structure,
 *     Confidence) derived from the feedback payload. Feels like a
 *     hiring rubric, not a grade.
 *   - Your-answer / stronger-answer side-by-side on each question,
 *     so the user sees the specific gap and closes it.
 *
 * The API contract (prep-deck → feedback) is unchanged — this is a
 * pure UI rewrite. If the backend ever ships voice transcription, the
 * practice surface is already shaped for it.
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  LayoutAnimation, UIManager, Alert, Animated, Easing,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import InlineToastView, { useInlineToast } from '../../components/InlineToast';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Palette — dark mode is only used during the immersive practice
// phase. Setup and debrief stay in the light Dilly brand.
const INDIGO = '#2B3A8E';
const NIGHT_BG = '#0B0F1E';
const NIGHT_CARD = '#151A2E';
const NIGHT_BORDER = 'rgba(255,255,255,0.08)';
const NIGHT_TEXT = '#E8EAF4';
const NIGHT_MUTED = 'rgba(232,234,244,0.55)';
const NIGHT_DIM = 'rgba(232,234,244,0.35)';
const GLOW_INDIGO = '#5B6EE1';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';

interface PrepQuestion {
  question: string;
  category: string;
  probability: string;
  why_flagged: string;
  prep_tip: string;
}

interface PerQuestionFeedback {
  rating: 'strong' | 'needs_work' | 'weak' | 'skipped';
  feedback: string;
  model_answer: string;
}

interface InterviewFeedback {
  verdict: 'ready' | 'almost' | 'needs_work';
  overall: string;
  top_strength: string;
  priority_fix: string;
  per_question: PerQuestionFeedback[];
  action_items: string[];
}

type Phase = 'setup' | 'loading' | 'practice' | 'analyzing' | 'review';

const RATING_CONFIG = {
  strong: { label: 'Strong', color: GREEN },
  needs_work: { label: 'Needs Work', color: AMBER },
  weak: { label: 'Weak', color: CORAL },
  skipped: { label: 'Skipped', color: NIGHT_DIM },
};

const VERDICT_CONFIG = {
  ready: { label: "You're ready.", sub: "This is a hire-level performance. Keep the edge.", color: GREEN },
  almost: { label: 'Almost there.', sub: "You'd be competitive. Tighten a few spots and it's yours.", color: AMBER },
  needs_work: { label: 'Not there yet.', sub: "One more session at this rubric and you're close.", color: CORAL },
};

// Loader narration — the user sees the machine working. Each line
// dwells for ~1.4s. If the API comes back faster, the loader just
// jumps to the final state. If slower, the last line stays pinned.
const LOADER_STAGES = [
  { icon: 'eye', text: 'Reading the job description' },
  { icon: 'analytics', text: "Identifying what they'll actually test" },
  { icon: 'aperture', text: 'Picking 5 questions that matter most' },
  { icon: 'shield-checkmark', text: 'Calibrating difficulty to the role' },
];

const ANALYZING_NARRATION = [
  "Reviewing each answer against the hiring bar",
  "Checking specificity, structure, and depth",
  "Looking for the exact gap holding you back",
  "Scoring against how they actually hire",
];

// STAR keyword detectors. Rough but honest — chosen because they
// actually appear in strong answers. Matched case-insensitively,
// as whole-word fragments, against the current answer text.
const STAR_PATTERNS: Record<'S' | 'T' | 'A' | 'R', RegExp[]> = {
  S: [/\b(when|while|during|at the time|context|situation|background)\b/i,
      /\b(our team|the company|our customers|the project)\b/i],
  T: [/\b(my (?:goal|task|job|responsibility)|i had to|i needed to|i was asked)\b/i,
      /\b(target|objective|deadline|goal|challenge)\b/i],
  A: [/\b(i (?:led|built|designed|shipped|wrote|owned|ran|proposed|pitched|organized|implemented|architected|rolled out|launched|negotiated))\b/i,
      /\b(i decided to|my approach|first, i|then i|i convinced)\b/i],
  R: [/\b(\d+(?:\.\d+)?\s*(?:%|percent|x|kx|k|m|million))\b/i,
      /\b(increased|decreased|shipped|delivered|saved|won|closed|converted|reduced|cut)\b/i,
      /\b(as a result|ultimately|we landed|we ended up|we hit|ended up)\b/i],
};

// 40s floor and 90s ceiling are the sweet spot for behavioral answers.
// The color-coded meter nudges toward that band in real time.
const TARGET_MIN_SEC = 40;
const TARGET_MAX_SEC = 90;

// Words-per-second assumption for spoken answers (≈ natural speech).
// We convert character count -> estimated spoken duration so the
// timer shows a meaningful duration even when the user is typing.
const AVG_WORDS_PER_SEC = 2.3;

export default function InterviewPracticeScreen() {
  const toast = useInlineToast();
  const insets = useSafeAreaInsets();
  const { company: paramCompany, role: paramRole } = useLocalSearchParams<{ company?: string; role?: string }>();

  const [phase, setPhase] = useState<Phase>('setup');
  const [company, setCompany] = useState(paramCompany || '');
  const [role, setRole] = useState(paramRole || '');
  const [jobDescription, setJobDescription] = useState('');
  const [questions, setQuestions] = useState<PrepQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [jdTooShort, setJdTooShort] = useState(false);
  const [jobUrl, setJobUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [loaderStage, setLoaderStage] = useState(0);
  const [analyzingLine, setAnalyzingLine] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Rotate through loader narration stages.
  useEffect(() => {
    if (phase !== 'loading') { setLoaderStage(0); return; }
    const id = setInterval(() => {
      setLoaderStage(s => Math.min(s + 1, LOADER_STAGES.length - 1));
    }, 1400);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'analyzing') { setAnalyzingLine(0); return; }
    const id = setInterval(() => {
      setAnalyzingLine(l => (l + 1) % ANALYZING_NARRATION.length);
    }, 1800);
    return () => clearInterval(id);
  }, [phase]);

  async function handleUrlFetch() {
    const url = jobUrl.trim();
    if (!url || url.length < 10) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const res = await dilly.fetch('/jobs/fetch-jd', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error('Could not fetch job details');
      const data = await res.json();
      if (data.job_title) setCompany(data.company || '');
      if (data.job_title) setRole(data.job_title || '');
      if (data.job_description && data.job_description.length > 50) {
        setJobDescription(data.job_description);
      }
      if (!data.job_title && !data.job_description) {
        setUrlError('Could not extract job details from this URL. Try entering manually.');
      }
    } catch {
      setUrlError('Could not fetch from this URL. Try pasting the job description manually.');
    } finally {
      setUrlLoading(false);
    }
  }

  useEffect(() => {
    if (paramCompany && paramRole) {
      loadDeck(paramCompany, paramRole, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmed = jobDescription.trim();
    setJdTooShort(trimmed.length > 0 && trimmed.length < 100);
  }, [jobDescription]);

  const canGenerate = company.trim().length > 0 && role.trim().length > 0 && jobDescription.trim().length >= 100;

  // JD quality meter — visible signal that "more detail = better prep".
  const jdLen = jobDescription.trim().length;
  const jdQuality =
    jdLen === 0 ? { pct: 0, label: 'Empty', color: NIGHT_DIM } :
    jdLen < 100 ? { pct: 20, label: 'Too thin', color: CORAL } :
    jdLen < 400 ? { pct: 55, label: 'Usable', color: AMBER } :
    jdLen < 900 ? { pct: 85, label: 'Strong detail', color: GREEN } :
                  { pct: 100, label: 'Full spec', color: GREEN };

  async function loadDeck(c: string, r: string, jd: string) {
    if (!c.trim() || !r.trim()) {
      toast.show({ message: 'Enter a company and role.' });
      return;
    }
    if (!jd.trim() || jd.trim().length < 100) {
      toast.show({ message: 'Paste a more detailed job description.' });
      return;
    }
    setPhase('loading');
    try {
      let finalJD = jd.trim();
      const isUrl = /^https?:\/\//i.test(finalJD) || /^(www\.)?[\w-]+\.(com|co|io|org|net|jobs)\//i.test(finalJD);
      if (isUrl && finalJD.split('\n').length <= 3) {
        try {
          const fetchRes = await dilly.fetch('/jobs/fetch-jd', {
            method: 'POST',
            body: JSON.stringify({ url: finalJD }),
          });
          if (fetchRes.ok) {
            const fetchData = await fetchRes.json();
            if (fetchData?.job_description?.length > 50) {
              finalJD = fetchData.job_description;
            }
          }
        } catch {}
      }

      const deckCtrl = new AbortController();
      const deckTimeout = setTimeout(() => deckCtrl.abort(), 90_000);
      const res = await dilly.fetch('/interview/prep-deck', {
        method: 'POST',
        body: JSON.stringify({
          company: c.trim(),
          role: r.trim(),
          job_description: finalJD || undefined,
        }),
        signal: deckCtrl.signal,
      });
      clearTimeout(deckTimeout);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.detail || 'Could not generate prep deck.');
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setAnswers(new Array(data.questions?.length || 0).fill(''));
      setCurrentIdx(0);
      setCurrentAnswer('');
      setPhase('practice');
    } catch {
      toast.show({ message: 'Prep failed. Try again.' });
      setPhase('setup');
    }
  }

  function submitAnswer() {
    const updated = [...answers];
    updated[currentIdx] = currentAnswer.trim();
    setAnswers(updated);
    setCurrentAnswer('');

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      const finalAnswers = [...updated];
      finalAnswers[currentIdx] = currentAnswer.trim();
      requestFeedback(finalAnswers);
    }
  }

  function skipQuestion() {
    const updated = [...answers];
    updated[currentIdx] = '';
    setAnswers(updated);

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setCurrentAnswer('');
    } else {
      requestFeedback(updated);
    }
  }

  async function requestFeedback(finalAnswers: string[], retryCount = 0) {
    setPhase('analyzing');
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 180_000);
      const res = await dilly.fetch('/interview/feedback', {
        method: 'POST',
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          job_description: jobDescription.trim(),
          questions_and_answers: questions.map((q, i) => ({
            question: q.question,
            answer: finalAnswers[i] || '',
            category: q.category,
          })),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        // 402 is handled globally by the paywall wrapper in lib/dilly.
        // We just need to not crash after it surfaces — bail to setup.
        if (res.status === 402) {
          setPhase('setup');
          return;
        }
        const d = await res.json().catch(() => null);
        throw new Error(d?.detail || `Server error ${res.status}`);
      }

      const data: InterviewFeedback = await res.json();
      setFeedback(data);
      setExpandedCards(new Set());
      setPhase('review');
    } catch {
      if (retryCount < 1) {
        requestFeedback(finalAnswers, retryCount + 1);
        return;
      }
      Alert.alert(
        'Feedback took too long',
        'Dilly could not generate feedback for this session. This can happen with long interviews. Want to try again?',
        [
          { text: 'Try Again', onPress: () => requestFeedback(finalAnswers, 0) },
          { text: 'Skip Feedback', onPress: () => { setFeedback(null); setPhase('review'); } },
        ],
      );
    }
  }

  function toggleCard(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function resetToSetup() {
    setPhase('setup');
    setQuestions([]);
    setAnswers([]);
    setCurrentIdx(0);
    setCurrentAnswer('');
    setFeedback(null);
    setExpandedCards(new Set());
  }

  const q = questions[currentIdx];
  const isDark = phase === 'practice';

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: isDark ? NIGHT_BG : colors.bg }]}>
      <NavBar dark={isDark} onBack={() => router.back()} phase={phase} currentIdx={currentIdx} total={questions.length} />

      {phase === 'setup' && (
        <SetupPhase
          company={company} setCompany={setCompany}
          role={role} setRole={setRole}
          jobDescription={jobDescription} setJobDescription={setJobDescription}
          jobUrl={jobUrl} setJobUrl={setJobUrl}
          urlLoading={urlLoading} urlError={urlError}
          onUrlFetch={handleUrlFetch}
          jdTooShort={jdTooShort} jdQuality={jdQuality}
          canGenerate={canGenerate}
          onStart={() => loadDeck(company, role, jobDescription)}
          insetsBottom={insets.bottom}
        />
      )}

      {phase === 'loading' && <LoadingPhase company={company} role={role} stage={loaderStage} />}

      {phase === 'practice' && q && (
        <PracticePhase
          scrollRef={scrollRef}
          question={q}
          company={company}
          role={role}
          currentIdx={currentIdx}
          total={questions.length}
          currentAnswer={currentAnswer}
          setCurrentAnswer={setCurrentAnswer}
          onSubmit={submitAnswer}
          onSkip={skipQuestion}
          insetsBottom={insets.bottom}
        />
      )}

      {phase === 'analyzing' && <AnalyzingPhase company={company} line={analyzingLine} />}

      {phase === 'review' && (
        <ReviewPhase
          feedback={feedback}
          questions={questions}
          answers={answers}
          company={company}
          role={role}
          expandedCards={expandedCards}
          onToggle={toggleCard}
          onRetry={resetToSetup}
          onDone={() => router.back()}
          insetsBottom={insets.bottom}
        />
      )}

      <InlineToastView {...toast.props} />
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Nav                                                              */
/* ─────────────────────────────────────────────────────────────── */

function NavBar({ dark, onBack, phase, currentIdx, total }:
  { dark: boolean; onBack: () => void; phase: Phase; currentIdx: number; total: number }) {
  const title =
    phase === 'practice' ? `${currentIdx + 1} / ${total}` :
    phase === 'analyzing' ? 'Debriefing...' :
    phase === 'review' ? 'Debrief' : 'The Room';
  return (
    <View style={[s.navBar, { borderBottomColor: dark ? NIGHT_BORDER : colors.b1 }]}>
      <AnimatedPressable onPress={onBack} scaleDown={0.9} hitSlop={12}>
        <Ionicons name="chevron-back" size={22} color={dark ? NIGHT_TEXT : colors.t1} />
      </AnimatedPressable>
      <Text style={[s.navTitle, { color: dark ? NIGHT_TEXT : colors.t1 }]}>
        {title}
      </Text>
      <View style={{ width: 22 }} />
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Setup — cinematic gateway                                        */
/* ─────────────────────────────────────────────────────────────── */

function SetupPhase({
  company, setCompany, role, setRole,
  jobDescription, setJobDescription,
  jobUrl, setJobUrl, urlLoading, urlError, onUrlFetch,
  jdTooShort, jdQuality, canGenerate, onStart, insetsBottom,
}: any) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insetsBottom + 60 }]}>
        <FadeInView delay={0}>
          {/* Hero — no logo, no chatbot framing. This is a Room. */}
          <View style={s.hero}>
            <View style={s.heroRingOuter}>
              <View style={s.heroRingInner}>
                <Ionicons name="mic" size={28} color={INDIGO} />
              </View>
            </View>
            <Text style={s.heroKicker}>STEP INTO</Text>
            <Text style={s.heroTitle}>The Interview Room</Text>
            <Text style={s.heroSub}>
              This isn't a chatbot. Dilly reads the job, builds five questions they'll actually ask, and tracks your answers in real time — structure, specificity, and pace — against the way companies like this actually hire.
            </Text>
            <View style={s.heroProofRow}>
              <ProofChip icon="flash" text="5 questions" />
              <ProofChip icon="time" text="~10 min" />
              <ProofChip icon="medal" text="Role-specific" />
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={80}>
          <Text style={s.sectionHeader}>PASTE THE ROLE</Text>

          <View style={s.inputCard}>
            {/* URL primary — one tap, everything fills. */}
            <FieldLabel text="Job URL" hint="Fastest way in" />
            <View style={s.urlRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={jobUrl}
                onChangeText={setJobUrl}
                placeholder="Paste a Greenhouse, Lever, or careers page URL"
                placeholderTextColor={colors.t3}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={onUrlFetch}
              />
              <AnimatedPressable
                style={[s.urlBtn, (!jobUrl.trim() || urlLoading) && { opacity: 0.4 }]}
                onPress={onUrlFetch}
                disabled={!jobUrl.trim() || urlLoading}
                scaleDown={0.95}
              >
                {urlLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="arrow-forward" size={16} color="#fff" />}
              </AnimatedPressable>
            </View>
            {urlError ? <Text style={s.urlError}>{urlError}</Text> : null}

            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>OR ENTER MANUALLY</Text>
              <View style={s.dividerLine} />
            </View>

            <FieldLabel text="Company" required />
            <TextInput
              style={s.input}
              value={company}
              onChangeText={setCompany}
              placeholder="e.g. Stripe"
              placeholderTextColor={colors.t3}
              autoFocus={!company}
            />
            <FieldLabel text="Role" required top />
            <TextInput
              style={s.input}
              value={role}
              onChangeText={setRole}
              placeholder="e.g. Senior Product Engineer"
              placeholderTextColor={colors.t3}
            />

            <View style={{ marginTop: 14 }}>
              <View style={s.jdHeaderRow}>
                <FieldLabel text="Job Description" required inline />
                <View style={s.jdQualityPill}>
                  <View style={[s.jdQualityDot, { backgroundColor: jdQuality.color }]} />
                  <Text style={[s.jdQualityText, { color: jdQuality.color }]}>{jdQuality.label}</Text>
                </View>
              </View>
              <TextInput
                style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]}
                value={jobDescription}
                onChangeText={setJobDescription}
                placeholder="Paste the full description. The more detail, the sharper the questions."
                placeholderTextColor={colors.t3}
                multiline
              />
              <View style={s.jdQualityTrack}>
                <View style={[s.jdQualityFill, { width: `${jdQuality.pct}%`, backgroundColor: jdQuality.color }]} />
              </View>
              {jdTooShort && (
                <Text style={s.jdWarning}>
                  Too short for accurate interview questions. Paste the full description.
                </Text>
              )}
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={140}>
          <AnimatedPressable
            style={[s.enterBtn, !canGenerate && { opacity: 0.35 }]}
            onPress={onStart}
            disabled={!canGenerate}
            scaleDown={0.97}
          >
            <Text style={s.enterBtnText}>Step into the Room</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </AnimatedPressable>
          <Text style={s.enterFootnote}>
            No recruiter hears this session. It's yours.
          </Text>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProofChip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={s.proofChip}>
      <Ionicons name={icon} size={11} color={INDIGO} />
      <Text style={s.proofChipText}>{text}</Text>
    </View>
  );
}

function FieldLabel({ text, required, top, hint, inline }:
  { text: string; required?: boolean; top?: boolean; hint?: string; inline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: top ? 12 : (inline ? 0 : 4), marginBottom: 6 }}>
      <Text style={s.fieldLabel}>{text}{required ? <Text style={{ color: CORAL }}> *</Text> : null}</Text>
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Loading — narrated stages                                        */
/* ─────────────────────────────────────────────────────────────── */

function LoadingPhase({ company, role, stage }: { company: string; role: string; stage: number }) {
  return (
    <View style={s.loadingWrap}>
      <View style={s.loadingCardLight}>
        <View style={s.loadingRing}>
          <ActivityIndicator size="small" color={INDIGO} />
        </View>
        <Text style={s.loadingCompany}>
          {company.toUpperCase()} · {role}
        </Text>
        <View style={{ gap: 10, marginTop: 20, width: '100%' }}>
          {LOADER_STAGES.map((st, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <View key={i} style={s.loaderRow}>
                <View style={[s.loaderBullet, {
                  backgroundColor: done ? INDIGO : active ? INDIGO + '30' : colors.s3,
                  borderColor: done || active ? INDIGO : colors.b1,
                }]}>
                  {done
                    ? <Ionicons name="checkmark" size={10} color="#fff" />
                    : active
                      ? <View style={s.loaderPulse} />
                      : null}
                </View>
                <Text style={[s.loaderText, {
                  color: done ? colors.t2 : active ? colors.t1 : colors.t3,
                  fontWeight: active ? '700' : '500',
                }]}>
                  {st.text}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Practice — immersive dark room                                   */
/* ─────────────────────────────────────────────────────────────── */

function PracticePhase({
  scrollRef, question, company, role, currentIdx, total,
  currentAnswer, setCurrentAnswer, onSubmit, onSkip, insetsBottom,
}: any) {
  // Derived live metrics for the performance bar.
  const metrics = useMemo(() => {
    const text = currentAnswer;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const estSec = Math.round(words / AVG_WORDS_PER_SEC);
    const star = {
      S: STAR_PATTERNS.S.some(rx => rx.test(text)),
      T: STAR_PATTERNS.T.some(rx => rx.test(text)),
      A: STAR_PATTERNS.A.some(rx => rx.test(text)),
      R: STAR_PATTERNS.R.some(rx => rx.test(text)),
    };
    const starCount = (star.S ? 1 : 0) + (star.T ? 1 : 0) + (star.A ? 1 : 0) + (star.R ? 1 : 0);
    return { words, estSec, star, starCount };
  }, [currentAnswer]);

  const durationColor =
    metrics.estSec === 0 ? NIGHT_DIM :
    metrics.estSec < TARGET_MIN_SEC ? AMBER :
    metrics.estSec <= TARGET_MAX_SEC ? GREEN :
    CORAL;
  const durationHint =
    metrics.estSec === 0 ? 'Start talking' :
    metrics.estSec < TARGET_MIN_SEC ? 'Keep going — add specifics' :
    metrics.estSec <= TARGET_MAX_SEC ? 'Sweet spot' :
    'Tighten it up';

  const canSubmit = currentAnswer.trim().length >= 40;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={[s.scroll, { paddingBottom: insetsBottom + 40 }]}>
        {/* Progress dots */}
        <View style={s.dotProgress}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={[
                s.progressPip,
                i < currentIdx && { backgroundColor: GLOW_INDIGO, opacity: 0.5 },
                i === currentIdx && { backgroundColor: GLOW_INDIGO, width: 22 },
                i > currentIdx && { backgroundColor: NIGHT_BORDER },
              ]}
            />
          ))}
        </View>

        {/* Interviewer card — grounds the user in a specific moment */}
        <FadeInView delay={0} key={currentIdx}>
          <View style={s.interviewerStrip}>
            <View style={s.interviewerDot} />
            <Text style={s.interviewerText}>
              Interviewing at <Text style={s.interviewerCo}>{company}</Text> for <Text style={s.interviewerCo}>{role}</Text>
            </Text>
          </View>

          <View style={s.questionCardNight}>
            <View style={s.questionHeaderRow}>
              <CategoryTag category={question.category} probability={question.probability} />
            </View>
            <Text style={s.questionTextNight}>{question.question}</Text>
            {question.why_flagged ? (
              <View style={s.whyFlaggedNight}>
                <Ionicons name="alert-circle" size={12} color={AMBER} />
                <Text style={s.whyFlaggedNightText}>{question.why_flagged}</Text>
              </View>
            ) : null}
          </View>

          {question.prep_tip ? (
            <View style={s.tipCardNight}>
              <View style={s.tipIconBubble}>
                <Ionicons name="bulb" size={11} color={AMBER} />
              </View>
              <Text style={s.tipTextNight}>{question.prep_tip}</Text>
            </View>
          ) : null}

          <AnimatedPressable
            style={s.dillyHelpBtnNight}
            onPress={() => openDillyOverlay({
              isPaid: true,
              initialMessage: `I'm practicing for the ${role} role at ${company}. I was asked: "${question.question}". Based on this job description, help me structure a strong answer. What specific experiences from my Dilly Profile should I highlight? ${question.prep_tip ? 'Tip: ' + question.prep_tip : ''}`,
            })}
            scaleDown={0.97}
          >
            <Ionicons name="sparkles" size={12} color={GLOW_INDIGO} />
            <Text style={s.dillyHelpBtnText}>Think it through with Dilly</Text>
          </AnimatedPressable>

          {/* Answer surface — dark, wide, spacious */}
          <Text style={s.yourAnswerLabel}>YOUR ANSWER</Text>
          <TextInput
            style={s.answerInputNight}
            value={currentAnswer}
            onChangeText={setCurrentAnswer}
            placeholder="Talk it out here. Aim for 45-90 seconds when spoken aloud."
            placeholderTextColor={NIGHT_DIM}
            multiline
            textAlignVertical="top"
          />

          {/* Live performance bar — the thing no chatbot can do */}
          <View style={s.perfBar}>
            <View style={s.perfTopRow}>
              <View style={s.perfMetric}>
                <Text style={[s.perfValue, { color: durationColor }]}>
                  {metrics.estSec === 0 ? '0s' : `~${metrics.estSec}s`}
                </Text>
                <Text style={s.perfHint}>{durationHint}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <View style={s.perfMetric}>
                <Text style={s.perfValue}>{metrics.words}</Text>
                <Text style={s.perfHint}>words</Text>
              </View>
              <View style={{ flex: 1 }} />
              <View style={s.perfMetric}>
                <Text style={[s.perfValue, { color: metrics.starCount === 4 ? GREEN : metrics.starCount >= 2 ? AMBER : NIGHT_DIM }]}>
                  {metrics.starCount} / 4
                </Text>
                <Text style={s.perfHint}>STAR</Text>
              </View>
            </View>

            {/* Duration track — nudges toward 40-90s band */}
            <View style={s.durationTrack}>
              <View style={[s.durationBand, {
                left: `${(TARGET_MIN_SEC / 120) * 100}%`,
                right: `${100 - (TARGET_MAX_SEC / 120) * 100}%`,
              }]} />
              <View style={[s.durationMarker, {
                left: `${Math.min(100, (metrics.estSec / 120) * 100)}%`,
                backgroundColor: durationColor,
              }]} />
            </View>

            {/* STAR chips — light up as you hit each pillar */}
            <View style={s.starRow}>
              {(['S', 'T', 'A', 'R'] as const).map(letter => (
                <View
                  key={letter}
                  style={[
                    s.starChip,
                    metrics.star[letter] && { backgroundColor: GLOW_INDIGO + '25', borderColor: GLOW_INDIGO },
                  ]}
                >
                  <Text style={[
                    s.starChipLetter,
                    metrics.star[letter] && { color: '#FFFFFF' },
                  ]}>
                    {letter}
                  </Text>
                  <Text style={[
                    s.starChipLabel,
                    metrics.star[letter] && { color: GLOW_INDIGO + 'DD' },
                  ]}>
                    {letter === 'S' ? 'Situation' : letter === 'T' ? 'Task' : letter === 'A' ? 'Action' : 'Result'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Actions */}
          <View style={s.actionRow}>
            <AnimatedPressable
              style={[s.submitBtnNight, !canSubmit && { opacity: 0.35 }]}
              onPress={onSubmit}
              disabled={!canSubmit}
              scaleDown={0.97}
            >
              <Text style={s.submitBtnNightText}>
                {currentIdx < total - 1 ? 'Lock in · Next' : 'Lock in · Debrief'}
              </Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </AnimatedPressable>
            <AnimatedPressable style={s.skipBtnNight} onPress={onSkip} scaleDown={0.97}>
              <Text style={s.skipBtnNightText}>Skip</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CategoryTag({ category, probability }: { category: string; probability: string }) {
  const color = probability === 'high' ? CORAL : probability === 'medium' ? AMBER : GLOW_INDIGO;
  const probLabel = probability === 'high' ? 'LIKELY' : probability === 'medium' ? 'POSSIBLE' : 'STRETCH';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={[s.catTag, { borderColor: color + '55', backgroundColor: color + '18' }]}>
        <View style={[s.catDot, { backgroundColor: color }]} />
        <Text style={[s.catTagText, { color }]}>{probLabel}</Text>
      </View>
      <Text style={s.catCategory}>{category}</Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Analyzing                                                        */
/* ─────────────────────────────────────────────────────────────── */

function AnalyzingPhase({ company, line }: { company: string; line: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    ).start();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={s.loadingWrap}>
      <View style={s.loadingCardLight}>
        <Animated.View style={[s.analyzingGlyph, { transform: [{ rotate }] }]}>
          <Ionicons name="aperture" size={38} color={INDIGO} />
        </Animated.View>
        <Text style={s.analyzingHeadline}>Debriefing your {company} round</Text>
        <Text style={s.analyzingLine}>{ANALYZING_NARRATION[line]}...</Text>
        <Text style={s.analyzingFooter}>
          Takes about 30 seconds. Worth it.
        </Text>
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Review / Debrief                                                 */
/* ─────────────────────────────────────────────────────────────── */

function ReviewPhase({
  feedback, questions, answers, company, role,
  expandedCards, onToggle, onRetry, onDone, insetsBottom,
}: any) {
  if (!feedback) {
    return (
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insetsBottom + 40 }]}>
        <View style={s.debriefCard}>
          <Ionicons name="alert-circle" size={24} color={AMBER} />
          <Text style={s.verdictHeadline}>Practice complete</Text>
          <Text style={s.verdictSub}>
            Couldn't generate AI feedback this time. You answered {answers.filter((a: string) => a.length > 0).length} of {questions.length} at {company}.
          </Text>
        </View>
        <View style={s.reviewActions}>
          <AnimatedPressable style={s.retryBtn} onPress={onRetry} scaleDown={0.97}>
            <Ionicons name="refresh" size={14} color={INDIGO} />
            <Text style={s.retryBtnText}>Run it back</Text>
          </AnimatedPressable>
          <AnimatedPressable style={s.doneBtn} onPress={onDone} scaleDown={0.97}>
            <Text style={s.doneBtnText}>Done</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    );
  }

  const verdict = VERDICT_CONFIG[feedback.verdict];
  const strong = feedback.per_question.filter((p: any) => p?.rating === 'strong').length;
  const total = questions.length;

  // Derived scorecard. Maps the four rating levels into four-axis
  // sub-scores. Clarity comes from feedback text length / non-skipped
  // answers; Specificity weights 'strong' heavier; Structure rewards
  // non-skipped + non-weak; Confidence is a function of average rating.
  const ratingWeight = (r: string) => r === 'strong' ? 1 : r === 'needs_work' ? 0.55 : r === 'weak' ? 0.2 : 0;
  const avg = feedback.per_question.length
    ? feedback.per_question.reduce((acc: number, p: any) => acc + ratingWeight(p?.rating || 'skipped'), 0) / feedback.per_question.length
    : 0;

  const nonSkipped = feedback.per_question.filter((p: any) => p?.rating !== 'skipped').length;
  const scorecard = {
    clarity:     Math.round(Math.min(1, avg * 0.9 + (nonSkipped / total) * 0.15) * 100),
    specificity: Math.round(Math.min(1, avg * 1.05) * 100),
    structure:   Math.round(Math.min(1, avg * 0.85 + (strong / total) * 0.2) * 100),
    confidence:  Math.round(Math.min(1, avg * 0.95 + (nonSkipped / total) * 0.1) * 100),
  };

  return (
    <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insetsBottom + 40 }]}>
      <FadeInView delay={0}>
        {/* Verdict headline — the one thing the user looks at first */}
        <View style={[s.verdictCard, { borderColor: verdict.color + '50' }]}>
          <View style={[s.verdictGlyph, { backgroundColor: verdict.color + '15', borderColor: verdict.color + '40' }]}>
            <Ionicons
              name={feedback.verdict === 'ready' ? 'trophy' : feedback.verdict === 'almost' ? 'time' : 'barbell'}
              size={22}
              color={verdict.color}
            />
          </View>
          <Text style={[s.verdictHeadline, { color: verdict.color }]}>{verdict.label}</Text>
          <Text style={s.verdictSub}>{verdict.sub}</Text>
          <View style={s.verdictDivider} />
          <Text style={s.verdictBody}>{feedback.overall}</Text>
        </View>

        {/* Scorecard — feels like a hiring rubric */}
        <Text style={s.sectionHeader}>SCORECARD</Text>
        <View style={s.scorecardCard}>
          <ScoreRow label="Clarity"     value={scorecard.clarity} />
          <ScoreRow label="Specificity" value={scorecard.specificity} />
          <ScoreRow label="Structure"   value={scorecard.structure} />
          <ScoreRow label="Confidence"  value={scorecard.confidence} />
        </View>

        {/* Strength / Gap — side by side, not buried */}
        <View style={s.sgRow}>
          <View style={[s.sgCard, { borderColor: GREEN + '40' }]}>
            <Text style={[s.sgLabel, { color: GREEN }]}>WHAT WORKED</Text>
            <Text style={s.sgText}>{feedback.top_strength}</Text>
          </View>
          <View style={[s.sgCard, { borderColor: AMBER + '40' }]}>
            <Text style={[s.sgLabel, { color: AMBER }]}>CLOSE THIS GAP</Text>
            <Text style={s.sgText}>{feedback.priority_fix}</Text>
          </View>
        </View>

        {/* Per-question — side-by-side answer upgrade */}
        <Text style={s.sectionHeader}>QUESTION BY QUESTION</Text>
        {questions.map((qq: PrepQuestion, i: number) => {
          const pq = feedback.per_question[i];
          const rating = pq?.rating || 'skipped';
          const config = RATING_CONFIG[rating];
          const isExpanded = expandedCards.has(i);
          const userAnswer = answers[i];

          return (
            <AnimatedPressable
              key={i}
              style={s.debriefCard}
              onPress={() => onToggle(i)}
              scaleDown={0.98}
            >
              <View style={s.debriefHeader}>
                <Text style={s.debriefQNum}>Q{i + 1}</Text>
                <Text style={s.debriefQ} numberOfLines={isExpanded ? undefined : 2}>{qq.question}</Text>
                <View style={[s.ratingPill, { backgroundColor: config.color + '15', borderColor: config.color + '40' }]}>
                  <Text style={[s.ratingPillText, { color: config.color }]}>{config.label}</Text>
                </View>
              </View>
              <View style={s.debriefExpandRow}>
                <Text style={s.debriefExpandHint}>{isExpanded ? 'Tap to collapse' : 'Tap to see the upgrade'}</Text>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.t3} />
              </View>

              {isExpanded && (
                <View style={s.debriefExpanded}>
                  {/* Side by side answer diff */}
                  <View style={s.diffRow}>
                    <View style={[s.diffCol, { borderColor: colors.b1 }]}>
                      <Text style={[s.diffLabel, { color: colors.t3 }]}>YOUR ANSWER</Text>
                      <Text style={s.diffTextYours}>
                        {userAnswer || <Text style={{ fontStyle: 'italic' }}>Skipped</Text>}
                      </Text>
                    </View>
                    <View style={[s.diffCol, { borderColor: GREEN + '40', backgroundColor: GREEN + '08' }]}>
                      <Text style={[s.diffLabel, { color: GREEN }]}>STRONGER ANSWER</Text>
                      <Text style={s.diffTextModel}>
                        {pq?.model_answer || '—'}
                      </Text>
                    </View>
                  </View>

                  {pq?.feedback ? (
                    <View style={s.coachBlock}>
                      <View style={s.coachBullet} />
                      <Text style={s.coachText}>{pq.feedback}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </AnimatedPressable>
          );
        })}

        {/* Action items */}
        {feedback.action_items && feedback.action_items.length > 0 && (
          <>
            <Text style={s.sectionHeader}>BEFORE THE REAL INTERVIEW</Text>
            <View style={s.actionsCardLight}>
              {feedback.action_items.map((item: string, i: number) => (
                <AnimatedPressable
                  key={i}
                  style={[s.actionItemLight, i === feedback.action_items.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => openDillyOverlay({
                    isPaid: true,
                    initialMessage: `I'm preparing for the ${role} role at ${company}. One of my action items is: "${item}". Help me work on this. What specific steps should I take?`,
                  })}
                  scaleDown={0.98}
                >
                  <View style={s.actionBulletLight}>
                    <Text style={s.actionBulletTextLight}>{i + 1}</Text>
                  </View>
                  <Text style={s.actionItemTextLight}>{item}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                </AnimatedPressable>
              ))}
            </View>
          </>
        )}

        <View style={s.reviewActions}>
          <AnimatedPressable style={s.retryBtn} onPress={onRetry} scaleDown={0.97}>
            <Ionicons name="refresh" size={14} color={INDIGO} />
            <Text style={s.retryBtnText}>Run it back</Text>
          </AnimatedPressable>
          <AnimatedPressable style={s.doneBtn} onPress={onDone} scaleDown={0.97}>
            <Text style={s.doneBtnText}>Done</Text>
          </AnimatedPressable>
        </View>
      </FadeInView>
    </ScrollView>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? GREEN : value >= 55 ? AMBER : CORAL;
  return (
    <View style={s.scoreRow}>
      <Text style={s.scoreLabel}>{label}</Text>
      <View style={s.scoreTrack}>
        <View style={[s.scoreFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.scoreValue, { color }]}>{value}</Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Styles                                                           */
/* ─────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 1.4 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // ── Setup: Hero ────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    paddingVertical: 22,
    marginBottom: 18,
  },
  heroRingOuter: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: INDIGO + '08',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  heroRingInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: INDIGO + '12',
    borderWidth: 1, borderColor: INDIGO + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  heroKicker: { fontSize: 10, fontWeight: '800', color: INDIGO, letterSpacing: 2, marginBottom: 6 },
  heroTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 28, color: colors.t1, letterSpacing: -0.4,
    textAlign: 'center', marginBottom: 10,
  },
  heroSub: {
    fontSize: 13, color: colors.t2, lineHeight: 20,
    textAlign: 'center', paddingHorizontal: 12, marginBottom: 14,
  },
  heroProofRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  proofChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '22',
  },
  proofChipText: { fontSize: 10, fontWeight: '700', color: INDIGO, letterSpacing: 0.3 },

  // ── Setup: Input card ─────────────────────────────────────────
  sectionHeader: {
    fontFamily: 'Cinzel_700Bold', fontSize: 10, letterSpacing: 1.4,
    color: colors.t3, marginBottom: 10, marginTop: 8,
  },
  inputCard: {
    backgroundColor: colors.s1, borderRadius: 16,
    borderWidth: 1, borderColor: colors.b1,
    padding: 16,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.t2, letterSpacing: 0.3 },
  fieldHint: { fontSize: 10, color: colors.t3, fontStyle: 'italic' },
  input: {
    backgroundColor: colors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 13, color: colors.t1,
  },
  urlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: INDIGO, alignItems: 'center', justifyContent: 'center',
  },
  urlError: { fontSize: 11, color: CORAL, marginTop: 6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.b1 },
  dividerText: { fontSize: 9, color: colors.t3, fontWeight: '700', letterSpacing: 1.2 },
  jdHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  jdQualityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.b1,
  },
  jdQualityDot: { width: 6, height: 6, borderRadius: 3 },
  jdQualityText: { fontSize: 10, fontWeight: '700' },
  jdQualityTrack: {
    height: 3, borderRadius: 2, backgroundColor: colors.b1,
    marginTop: 8, overflow: 'hidden',
  },
  jdQualityFill: { height: '100%' },
  jdWarning: { fontSize: 11, color: CORAL, marginTop: 8, lineHeight: 16 },

  enterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 17,
    marginTop: 18,
    shadowColor: INDIGO, shadowOpacity: 0.22, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  enterBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  enterFootnote: { fontSize: 11, color: colors.t3, textAlign: 'center', marginTop: 10, fontStyle: 'italic' },

  // ── Loading ────────────────────────────────────────────────────
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingCardLight: {
    backgroundColor: colors.s1, borderRadius: 18,
    borderWidth: 1, borderColor: colors.b1,
    padding: 24, alignItems: 'center', width: '100%',
  },
  loadingRing: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '28',
    alignItems: 'center', justifyContent: 'center',
  },
  loadingCompany: {
    fontSize: 11, fontWeight: '800', color: colors.t2,
    letterSpacing: 1.2, marginTop: 14,
  },
  loaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loaderBullet: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  loaderPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: INDIGO },
  loaderText: { fontSize: 13, flex: 1 },

  // ── Analyzing ──────────────────────────────────────────────────
  analyzingGlyph: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '28',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  analyzingHeadline: { fontSize: 15, fontWeight: '800', color: colors.t1, textAlign: 'center' },
  analyzingLine: { fontSize: 13, color: colors.t2, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  analyzingFooter: { fontSize: 11, color: colors.t3, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },

  // ── Practice: progress ─────────────────────────────────────────
  dotProgress: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 18 },
  progressPip: { width: 8, height: 8, borderRadius: 4 },

  // ── Practice: interviewer strip + question ────────────────────
  interviewerStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  interviewerDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: CORAL,
  },
  interviewerText: { fontSize: 11, color: NIGHT_MUTED, letterSpacing: 0.2 },
  interviewerCo: { color: NIGHT_TEXT, fontWeight: '700' },

  questionCardNight: {
    backgroundColor: NIGHT_CARD, borderRadius: 16,
    borderWidth: 1, borderColor: NIGHT_BORDER,
    padding: 20, marginBottom: 12,
  },
  questionHeaderRow: { marginBottom: 12 },
  catTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
  },
  catDot: { width: 5, height: 5, borderRadius: 2.5 },
  catTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  catCategory: { fontSize: 10, color: NIGHT_MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  questionTextNight: {
    fontSize: 18, fontWeight: '700', color: NIGHT_TEXT,
    lineHeight: 26, letterSpacing: -0.2,
  },
  whyFlaggedNight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: NIGHT_BORDER,
  },
  whyFlaggedNightText: { fontSize: 11, color: AMBER, flex: 1, lineHeight: 16 },

  tipCardNight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: AMBER + '10', borderRadius: 10, borderWidth: 1, borderColor: AMBER + '22',
    padding: 11, marginBottom: 12,
  },
  tipIconBubble: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: AMBER + '22',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  tipTextNight: { fontSize: 12, color: NIGHT_TEXT, flex: 1, lineHeight: 17 },

  dillyHelpBtnNight: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: GLOW_INDIGO + '15', borderWidth: 1, borderColor: GLOW_INDIGO + '30',
    marginBottom: 18,
  },
  dillyHelpBtnText: { fontSize: 12, fontWeight: '700', color: GLOW_INDIGO },

  yourAnswerLabel: {
    fontSize: 10, fontWeight: '800', color: NIGHT_MUTED,
    letterSpacing: 1.5, marginBottom: 8,
  },
  answerInputNight: {
    minHeight: 130,
    backgroundColor: NIGHT_CARD, borderRadius: 12,
    borderWidth: 1, borderColor: NIGHT_BORDER,
    padding: 14, fontSize: 14, color: NIGHT_TEXT, lineHeight: 20,
  },

  // ── Practice: live performance bar ────────────────────────────
  perfBar: {
    backgroundColor: NIGHT_CARD, borderRadius: 12,
    borderWidth: 1, borderColor: NIGHT_BORDER,
    padding: 12, marginTop: 10, marginBottom: 14,
  },
  perfTopRow: { flexDirection: 'row', alignItems: 'flex-end' },
  perfMetric: { alignItems: 'center' },
  perfValue: { fontSize: 20, fontWeight: '800', color: NIGHT_TEXT, letterSpacing: -0.5 },
  perfHint: { fontSize: 9, color: NIGHT_DIM, fontWeight: '700', letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase' },

  durationTrack: {
    height: 4, borderRadius: 2, marginTop: 12,
    backgroundColor: NIGHT_BORDER, position: 'relative', overflow: 'visible',
  },
  durationBand: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: GREEN + '35', borderRadius: 2,
  },
  durationMarker: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5,
    top: -3, marginLeft: -5,
    borderWidth: 2, borderColor: NIGHT_BG,
  },

  starRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  starChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: NIGHT_BORDER,
  },
  starChipLetter: { fontSize: 12, fontWeight: '900', color: NIGHT_DIM },
  starChipLabel: { fontSize: 10, color: NIGHT_DIM, fontWeight: '600' },

  // ── Practice: actions ─────────────────────────────────────────
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  submitBtnNight: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: GLOW_INDIGO, borderRadius: 12, paddingVertical: 15,
    shadowColor: GLOW_INDIGO, shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  submitBtnNightText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  skipBtnNight: {
    paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', borderRadius: 12,
    borderWidth: 1, borderColor: NIGHT_BORDER,
  },
  skipBtnNightText: { fontSize: 12, color: NIGHT_MUTED, fontWeight: '700' },

  // ── Review: verdict ────────────────────────────────────────────
  verdictCard: {
    backgroundColor: colors.s1, borderRadius: 18,
    borderWidth: 1.5, padding: 22, marginBottom: 18,
    alignItems: 'center',
  },
  verdictGlyph: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  verdictHeadline: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center' },
  verdictSub: { fontSize: 13, color: colors.t2, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  verdictDivider: { height: 1, backgroundColor: colors.b1, alignSelf: 'stretch', marginVertical: 14 },
  verdictBody: { fontSize: 13, color: colors.t1, lineHeight: 20, textAlign: 'center' },

  // ── Review: scorecard ──────────────────────────────────────────
  scorecardCard: {
    backgroundColor: colors.s1, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 16, gap: 10,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreLabel: { fontSize: 12, color: colors.t2, fontWeight: '700', width: 88 },
  scoreTrack: { flex: 1, height: 6, backgroundColor: colors.b1, borderRadius: 3, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreValue: { fontSize: 13, fontWeight: '800', width: 34, textAlign: 'right' },

  // ── Review: strength / gap ─────────────────────────────────────
  sgRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sgCard: {
    flex: 1, backgroundColor: colors.s1, borderRadius: 14,
    borderWidth: 1, padding: 12,
  },
  sgLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  sgText: { fontSize: 12, color: colors.t1, lineHeight: 17 },

  // ── Review: per-question ───────────────────────────────────────
  debriefCard: {
    backgroundColor: colors.s1, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 10,
  },
  debriefHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  debriefQNum: { fontSize: 11, fontWeight: '900', color: INDIGO, letterSpacing: 0.5, marginTop: 1 },
  debriefQ: { fontSize: 13, fontWeight: '700', color: colors.t1, flex: 1, lineHeight: 19 },
  ratingPill: {
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  ratingPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  debriefExpandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  debriefExpandHint: { fontSize: 10, color: colors.t3, fontWeight: '600' },

  debriefExpanded: { marginTop: 14, gap: 14 },
  diffRow: { gap: 10 },
  diffCol: { borderRadius: 10, borderWidth: 1, padding: 11 },
  diffLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  diffTextYours: { fontSize: 12, color: colors.t2, lineHeight: 18 },
  diffTextModel: { fontSize: 12, color: colors.t1, lineHeight: 18, fontWeight: '500' },

  coachBlock: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.b1,
  },
  coachBullet: { width: 4, height: 14, borderRadius: 2, backgroundColor: INDIGO, marginTop: 3 },
  coachText: { fontSize: 12, color: colors.t1, lineHeight: 18, flex: 1 },

  // ── Review: action items ──────────────────────────────────────
  actionsCardLight: {
    backgroundColor: colors.s1, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1,
    overflow: 'hidden', marginBottom: 16,
  },
  actionItemLight: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  actionBulletLight: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: INDIGO + '15', alignItems: 'center', justifyContent: 'center',
  },
  actionBulletTextLight: { fontSize: 11, fontWeight: '900', color: INDIGO },
  actionItemTextLight: { fontSize: 12, color: colors.t1, flex: 1, lineHeight: 18 },

  // ── Review: bottom ────────────────────────────────────────────
  reviewActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  retryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.s1, borderRadius: 12, borderWidth: 1, borderColor: INDIGO + '40',
    paddingVertical: 14,
  },
  retryBtnText: { fontSize: 13, fontWeight: '800', color: INDIGO },
  doneBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: INDIGO, borderRadius: 12, paddingVertical: 14,
  },
  doneBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
