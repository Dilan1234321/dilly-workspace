import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  LayoutAnimation, UIManager,
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

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const PURPLE = '#AF52DE';
const GRAY  = '#8E8E93';

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
  strong: { label: 'Strong', color: GREEN, bg: GREEN + '15', border: GREEN + '35' },
  needs_work: { label: 'Needs Work', color: AMBER, bg: AMBER + '15', border: AMBER + '35' },
  weak: { label: 'Weak', color: CORAL, bg: CORAL + '15', border: CORAL + '35' },
  skipped: { label: 'Skipped', color: GRAY, bg: GRAY + '15', border: GRAY + '35' },
};

const VERDICT_CONFIG = {
  ready: { label: 'Ready to interview', color: GREEN, icon: 'checkmark-circle' as const },
  almost: { label: 'Almost there', color: AMBER, icon: 'alert-circle' as const },
  needs_work: { label: 'More practice needed', color: CORAL, icon: 'close-circle' as const },
};

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
  const scrollRef = useRef<ScrollView>(null);

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

  // Auto-load if company+role were passed as params
  useEffect(() => {
    if (paramCompany && paramRole) {
      loadDeck(paramCompany, paramRole, '');
    }
  }, []);

  // Track JD length for inline validation
  useEffect(() => {
    const trimmed = jobDescription.trim();
    if (trimmed.length > 0 && trimmed.length < 100) {
      setJdTooShort(true);
    } else {
      setJdTooShort(false);
    }
  }, [jobDescription]);

  const canGenerate = company.trim().length > 0 && role.trim().length > 0 && jobDescription.trim().length >= 100;

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
      // Detect if JD is a URL and fetch it first
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
    } catch (e: any) {
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
      // All questions done, go to analysis
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

  async function requestFeedback(finalAnswers: string[]) {
    setPhase('analyzing');
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 120_000);
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
        const d = await res.json().catch(() => null);
        throw new Error(d?.detail || 'Feedback generation failed.');
      }

      const data: InterviewFeedback = await res.json();
      setFeedback(data);
      setExpandedCards(new Set());
      setPhase('review');
    } catch (e: any) {
      toast.show({ message: 'Could not generate feedback. Try again.' });
      // Fall back to review without feedback
      setFeedback(null);
      setPhase('review');
    }
  }

  function toggleCard(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
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

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Nav */}
      <View style={s.navBar}>
        <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </AnimatedPressable>
        <Text style={s.navTitle}>Interview Practice</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Setup phase */}
      {phase === 'setup' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}>
            <FadeInView delay={0}>
              <View style={s.setupCard}>
                <View style={s.setupIcon}>
                  <Ionicons name="mic" size={28} color={PURPLE} />
                </View>
                <Text style={s.setupTitle}>Interview Practice</Text>
                <Text style={s.setupSub}>
                  Paste a job URL or enter the details manually.
                </Text>

                {/* URL option */}
                <Text style={s.inputLabel}>Job URL</Text>
                <TextInput
                  style={s.input}
                  value={jobUrl}
                  onChangeText={setJobUrl}
                  placeholder="Paste a job listing URL"
                  placeholderTextColor={colors.t3}
                  autoCapitalize="none"
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={() => handleUrlFetch()}
                />
                {urlLoading && <ActivityIndicator size="small" color={PURPLE} style={{ marginTop: 8 }} />}
                {urlError ? <Text style={{ fontSize: 12, color: '#FF453A', marginTop: 4 }}>{urlError}</Text> : null}

                {/* Divider */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.b1 }} />
                  <Text style={{ fontSize: 12, color: colors.t3 }}>or enter manually</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.b1 }} />
                </View>

                <Text style={s.inputLabel}>Company <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={company}
                  onChangeText={setCompany}
                  placeholder="e.g. Google"
                  placeholderTextColor={colors.t3}
                  autoFocus
                />
                <Text style={[s.inputLabel, { marginTop: 12 }]}>Role <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={role}
                  onChangeText={setRole}
                  placeholder="e.g. Data Science Intern"
                  placeholderTextColor={colors.t3}
                />
                <Text style={[s.inputLabel, { marginTop: 12 }]}>Job Description <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]}
                  value={jobDescription}
                  onChangeText={setJobDescription}
                  placeholder="Paste the full job description or a job URL"
                  placeholderTextColor={colors.t3}
                  multiline
                />
                {jdTooShort && (
                  <Text style={s.jdWarning}>
                    This job description isn't detailed enough for accurate interview questions. Paste the full description.
                  </Text>
                )}
                <AnimatedPressable
                  style={[s.startBtn, !canGenerate && { opacity: 0.4 }]}
                  onPress={() => loadDeck(company, role, jobDescription)}
                  disabled={!canGenerate}
                  scaleDown={0.97}
                >
                  <Ionicons name="flash" size={16} color="#FFFFFF" />
                  <Text style={s.startBtnText}>Generate interview questions</Text>
                </AnimatedPressable>
              </View>
            </FadeInView>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={s.loadingText}>Generating questions for {company}...</Text>
        </View>
      )}

      {/* Practice phase */}
      {phase === 'practice' && q && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}>
            {/* Progress */}
            <View style={s.progressRow}>
              <Text style={s.progressText}>Question {currentIdx + 1} of {questions.length}</Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${((currentIdx + 1) / questions.length) * 100}%` }]} />
              </View>
            </View>

            {/* Question card */}
            <FadeInView delay={0} key={currentIdx}>
              <View style={s.questionCard}>
                <View style={s.questionMeta}>
                  <View style={[s.probBadge, {
                    backgroundColor: q.probability === 'high' ? CORAL + '15' : q.probability === 'medium' ? AMBER + '15' : colors.s3,
                    borderColor: q.probability === 'high' ? CORAL + '35' : q.probability === 'medium' ? AMBER + '35' : colors.b1,
                  }]}>
                    <Text style={[s.probText, {
                      color: q.probability === 'high' ? CORAL : q.probability === 'medium' ? AMBER : colors.t3,
                    }]}>
                      {q.probability === 'high' ? 'Likely' : q.probability === 'medium' ? 'Possible' : 'Stretch'}
                    </Text>
                  </View>
                  <Text style={s.categoryText}>{q.category}</Text>
                </View>
                <Text style={s.questionText}>{q.question}</Text>
                {q.why_flagged && (
                  <Text style={s.whyFlagged}>Why this matters: {q.why_flagged}</Text>
                )}
              </View>

              {/* Prep tip */}
              {q.prep_tip && (
                <View style={s.tipCard}>
                  <Ionicons name="bulb-outline" size={12} color={AMBER} />
                  <Text style={s.tipText}>{q.prep_tip}</Text>
                </View>
              )}

              {/* Ask Dilly for help */}
              <AnimatedPressable
                style={s.dillyHelpBtn}
                onPress={() => openDillyOverlay({
                  isPaid: true,
                  initialMessage: `I'm practicing for the ${role} role at ${company}. I was asked: "${q.question}". Based on this job description, help me structure a strong answer. What specific experiences from my Dilly Profile should I highlight? ${q.prep_tip ? 'Tip: ' + q.prep_tip : ''}`,
                })}
                scaleDown={0.97}
              >
                <Ionicons name="sparkles" size={13} color={GOLD} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: GOLD }}>Ask Dilly for help</Text>
              </AnimatedPressable>

              {/* Answer input */}
              <TextInput
                style={s.answerInput}
                value={currentAnswer}
                onChangeText={setCurrentAnswer}
                placeholder="Type your answer here..."
                placeholderTextColor={colors.t3}
                multiline
                textAlignVertical="top"
              />

              {/* Actions */}
              <View style={s.actionRow}>
                <AnimatedPressable
                  style={[s.submitBtn, currentAnswer.trim().length < 10 && { opacity: 0.4 }]}
                  onPress={submitAnswer}
                  disabled={currentAnswer.trim().length < 10}
                  scaleDown={0.97}
                >
                  <Text style={s.submitBtnText}>
                    {currentIdx < questions.length - 1 ? 'Submit & Next' : 'Submit & Review'}
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                </AnimatedPressable>
                <AnimatedPressable style={s.skipBtn} onPress={skipQuestion} scaleDown={0.97}>
                  <Text style={s.skipBtnText}>Skip</Text>
                </AnimatedPressable>
              </View>
            </FadeInView>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Analyzing phase */}
      {phase === 'analyzing' && (
        <View style={s.loadingWrap}>
          <View style={s.analyzingCard}>
            <View style={s.pulsingDots}>
              <PulsingDot delay={0} />
              <PulsingDot delay={200} />
              <PulsingDot delay={400} />
            </View>
            <Text style={s.analyzingTitle}>Analyzing your answers for {company}...</Text>
            <Text style={s.analyzingSub}>
              Reviewing each response against the job description and your profile
            </Text>
          </View>
        </View>
      )}

      {/* Review phase */}
      {phase === 'review' && (
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}>
          <FadeInView delay={0}>
            {feedback ? (
              <>
                {/* Overall Assessment Card */}
                <View style={[s.assessmentCard, { borderColor: VERDICT_CONFIG[feedback.verdict].color + '40' }]}>
                  <View style={s.verdictRow}>
                    <Ionicons
                      name={VERDICT_CONFIG[feedback.verdict].icon}
                      size={28}
                      color={VERDICT_CONFIG[feedback.verdict].color}
                    />
                    <Text style={[s.verdictLabel, { color: VERDICT_CONFIG[feedback.verdict].color }]}>
                      {VERDICT_CONFIG[feedback.verdict].label}
                    </Text>
                  </View>
                  <Text style={s.overallText}>{feedback.overall}</Text>

                  <View style={s.assessmentDivider} />

                  <View style={s.assessmentItem}>
                    <View style={[s.assessmentDot, { backgroundColor: GREEN }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.assessmentItemLabel}>Top strength</Text>
                      <Text style={s.assessmentItemText}>{feedback.top_strength}</Text>
                    </View>
                  </View>

                  <View style={s.assessmentItem}>
                    <View style={[s.assessmentDot, { backgroundColor: AMBER }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.assessmentItemLabel}>Priority fix</Text>
                      <Text style={s.assessmentItemText}>{feedback.priority_fix}</Text>
                    </View>
                  </View>
                </View>

                {/* Per-Question Feedback Cards */}
                <Text style={s.sectionLabel}>QUESTION-BY-QUESTION</Text>
                {questions.map((q, i) => {
                  const pq = feedback.per_question[i];
                  const rating = pq?.rating || 'skipped';
                  const config = RATING_CONFIG[rating];
                  const isExpanded = expandedCards.has(i);
                  const userAnswer = answers[i];

                  return (
                    <AnimatedPressable
                      key={i}
                      style={s.feedbackCard}
                      onPress={() => toggleCard(i)}
                      scaleDown={0.98}
                    >
                      {/* Always visible: question + rating */}
                      <View style={s.feedbackCardHeader}>
                        <Text style={s.feedbackCardQuestion} numberOfLines={isExpanded ? undefined : 2}>
                          {q.question}
                        </Text>
                        <View style={[s.ratingBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
                          <Text style={[s.ratingBadgeText, { color: config.color }]}>{config.label}</Text>
                        </View>
                      </View>

                      {/* Expand indicator */}
                      <View style={s.expandIndicator}>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={colors.t3}
                        />
                      </View>

                      {/* Expanded content */}
                      {isExpanded && (
                        <View style={s.feedbackExpanded}>
                          {/* Their answer */}
                          <View style={s.answerBlock}>
                            <Text style={s.answerBlockLabel}>Your answer</Text>
                            <Text style={s.answerBlockText}>
                              {userAnswer || 'Skipped'}
                            </Text>
                          </View>

                          {/* Feedback */}
                          {pq?.feedback ? (
                            <View style={s.feedbackBlock}>
                              <Text style={s.feedbackBlockLabel}>Feedback</Text>
                              <Text style={s.feedbackBlockText}>{pq.feedback}</Text>
                            </View>
                          ) : null}

                          {/* Model answer */}
                          {pq?.model_answer ? (
                            <View style={s.modelBlock}>
                              <Text style={s.modelBlockLabel}>A strong candidate might say</Text>
                              <Text style={s.modelBlockText}>{pq.model_answer}</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </AnimatedPressable>
                  );
                })}

                {/* Action Items Card */}
                {feedback.action_items.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>BEFORE THE REAL INTERVIEW</Text>
                    <View style={s.actionsCard}>
                      {feedback.action_items.map((item, i) => (
                        <AnimatedPressable
                          key={i}
                          style={s.actionItem}
                          onPress={() => openDillyOverlay({
                            isPaid: true,
                            initialMessage: `I'm preparing for the ${role} role at ${company}. One of my action items is: "${item}". Help me work on this. What specific steps should I take?`,
                          })}
                          scaleDown={0.98}
                        >
                          <View style={s.actionBullet}>
                            <Text style={s.actionBulletText}>{i + 1}</Text>
                          </View>
                          <Text style={s.actionItemText}>{item}</Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                        </AnimatedPressable>
                      ))}
                    </View>
                  </>
                )}
              </>
            ) : (
              /* Fallback if feedback failed */
              <View style={s.assessmentCard}>
                <View style={s.verdictRow}>
                  <Ionicons name="alert-circle" size={28} color={AMBER} />
                  <Text style={[s.verdictLabel, { color: AMBER }]}>Practice complete</Text>
                </View>
                <Text style={s.overallText}>
                  We could not generate AI feedback for this session. You answered {answers.filter(a => a.length > 0).length} of {questions.length} questions for {company}.
                </Text>
              </View>
            )}

            {/* Bottom buttons */}
            <View style={s.reviewActions}>
              <AnimatedPressable
                style={s.retryBtn}
                onPress={resetToSetup}
                scaleDown={0.97}
              >
                <Ionicons name="refresh" size={14} color={GOLD} />
                <Text style={s.retryBtnText}>Practice again</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={s.doneBtn}
                onPress={() => router.back()}
                scaleDown={0.97}
              >
                <Text style={s.doneBtnText}>Done</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        </ScrollView>
      )}
      <InlineToastView {...toast.props} />
    </View>
  );
}


// Pulsing dot component for the analyzing animation
function PulsingDot({ delay }: { delay: number }) {
  const [opacity, setOpacity] = useState(0.3);

  useEffect(() => {
    let mounted = true;
    const interval = setInterval(() => {
      if (mounted) setOpacity(prev => (prev === 0.3 ? 1 : 0.3));
    }, 600);
    const timer = setTimeout(() => {
      if (mounted) setOpacity(1);
    }, delay);
    return () => {
      mounted = false;
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [delay]);

  return (
    <View style={[s.dot, { opacity }]} />
  );
}


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // Setup
  setupCard: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 24, alignItems: 'center', gap: 8,
  },
  setupIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: PURPLE + '12', borderWidth: 1, borderColor: PURPLE + '30',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  setupTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 16, color: colors.t1, textAlign: 'center' },
  setupSub: { fontSize: 12, color: colors.t3, textAlign: 'center', lineHeight: 18, marginBottom: 8 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: colors.t2, marginBottom: 4, marginTop: 8, alignSelf: 'flex-start' },
  input: {
    width: '100%', backgroundColor: colors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.t1, marginTop: 6,
  },
  jdWarning: {
    fontSize: 11, color: CORAL, marginTop: 6, lineHeight: 16, alignSelf: 'flex-start',
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: PURPLE, borderRadius: 12, paddingVertical: 14,
    width: '100%', marginTop: 12,
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  loadingText: { fontSize: 13, color: colors.t3 },

  // Analyzing
  analyzingCard: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 32, alignItems: 'center', gap: 16, width: '100%',
  },
  pulsingDots: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: PURPLE },
  analyzingTitle: { fontSize: 14, fontWeight: '700', color: colors.t1, textAlign: 'center' },
  analyzingSub: { fontSize: 12, color: colors.t3, textAlign: 'center', lineHeight: 18 },

  // Progress
  progressRow: { marginBottom: 16, gap: 6 },
  progressText: { fontSize: 10, color: colors.t3, fontWeight: '600' },
  progressTrack: { height: 4, backgroundColor: colors.b1, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: PURPLE, borderRadius: 2 },

  // Question card
  questionCard: {
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 10,
  },
  questionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  probBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  probText: { fontSize: 9, fontWeight: '700' },
  categoryText: { fontSize: 10, color: colors.t3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  questionText: { fontSize: 15, fontWeight: '700', color: colors.t1, lineHeight: 22 },
  whyFlagged: { fontSize: 11, color: AMBER, marginTop: 8, lineHeight: 16 },

  // Tip
  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: AMBER + '08', borderRadius: 10, borderWidth: 1, borderColor: AMBER + '20',
    padding: 10, marginBottom: 12,
  },
  tipText: { fontSize: 11, color: colors.t2, flex: 1, lineHeight: 16 },

  // Dilly help button
  dillyHelpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '20', marginBottom: 10,
  },

  // Answer input
  answerInput: {
    minHeight: 120, backgroundColor: colors.s2, borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1,
    padding: 12, fontSize: 13, color: colors.t1, lineHeight: 19,
    marginBottom: 12,
  },

  // Actions
  actionRow: { flexDirection: 'row', gap: 8 },
  submitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 13,
  },
  submitBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  skipBtn: {
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
  },
  skipBtnText: { fontSize: 12, color: colors.t3, fontWeight: '600' },

  // Review - Overall assessment
  assessmentCard: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1.5,
    borderColor: colors.b1, padding: 20, marginBottom: 20,
  },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  verdictLabel: { fontSize: 16, fontWeight: '800' },
  overallText: { fontSize: 13, color: colors.t2, lineHeight: 20, marginBottom: 8 },
  assessmentDivider: { height: 1, backgroundColor: colors.b1, marginVertical: 12 },
  assessmentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  assessmentDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  assessmentItemLabel: { fontSize: 11, fontWeight: '700', color: colors.t3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  assessmentItemText: { fontSize: 12, color: colors.t1, lineHeight: 18 },

  // Section label
  sectionLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2,
    color: colors.t3, marginBottom: 10,
  },

  // Per-question feedback cards
  feedbackCard: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 8,
  },
  feedbackCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
  },
  feedbackCardQuestion: { fontSize: 13, fontWeight: '700', color: colors.t1, flex: 1, lineHeight: 19 },
  ratingBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  ratingBadgeText: { fontSize: 10, fontWeight: '700' },
  expandIndicator: { alignItems: 'center', marginTop: 6 },

  feedbackExpanded: { marginTop: 12, gap: 12 },
  answerBlock: {
    backgroundColor: colors.bg, borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: colors.b1,
  },
  answerBlockLabel: { fontSize: 10, fontWeight: '700', color: colors.t3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  answerBlockText: { fontSize: 12, color: colors.t2, lineHeight: 18, fontStyle: 'normal' },

  feedbackBlock: {},
  feedbackBlockLabel: { fontSize: 10, fontWeight: '700', color: GOLD, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  feedbackBlockText: { fontSize: 12, color: colors.t1, lineHeight: 18 },

  modelBlock: {
    backgroundColor: GREEN + '08', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: GREEN + '20',
  },
  modelBlockLabel: { fontSize: 10, fontWeight: '700', color: GREEN, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  modelBlockText: { fontSize: 12, color: colors.t2, lineHeight: 18, fontStyle: 'italic' },

  // Action items card
  actionsCard: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    overflow: 'hidden', marginBottom: 16,
  },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  actionBullet: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center',
  },
  actionBulletText: { fontSize: 10, fontWeight: '800', color: GOLD },
  actionItemText: { fontSize: 12, color: colors.t1, flex: 1, lineHeight: 18 },

  // Review bottom buttons
  reviewActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  retryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '40',
    paddingVertical: 12,
  },
  retryBtnText: { fontSize: 12, fontWeight: '700', color: GOLD },
  doneBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 12,
  },
  doneBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
