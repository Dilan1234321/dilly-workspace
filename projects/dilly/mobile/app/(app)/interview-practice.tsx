import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const PURPLE = '#AF52DE';

interface PrepQuestion {
  question: string;
  category: string;
  probability: string;
  why_flagged: string;
  prep_tip: string;
}

interface DimensionGap {
  dimension: string;
  gap: number;
  focus: string;
}

type Phase = 'setup' | 'loading' | 'practice' | 'review';

export default function InterviewPracticeScreen() {
  const insets = useSafeAreaInsets();
  const { company: paramCompany, role: paramRole } = useLocalSearchParams<{ company?: string; role?: string }>();

  const [phase, setPhase] = useState<Phase>('setup');
  const [company, setCompany] = useState(paramCompany || '');
  const [role, setRole] = useState(paramRole || '');
  const [jobDescription, setJobDescription] = useState('');
  const [questions, setQuestions] = useState<PrepQuestion[]>([]);
  const [gaps, setGaps] = useState<DimensionGap[]>([]);
  const [companyInsights, setCompanyInsights] = useState('');
  const [jdPowered, setJdPowered] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Auto-load if company+role were passed as params
  useEffect(() => {
    if (paramCompany && paramRole) {
      loadDeck(paramCompany, paramRole, '');
    }
  }, []);

  async function loadDeck(c: string, r: string, jd: string) {
    if (!c.trim() || !r.trim()) {
      Alert.alert('Missing info', 'Enter a company name and role.');
      return;
    }
    if (!jd.trim() || jd.trim().length < 20) {
      Alert.alert('Job description required', 'Paste the job description so Dilly can generate questions specific to this role.');
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

      // JD-powered question generation via Claude can take 30-60s
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
      setGaps(data.dimension_gaps || []);
      setCompanyInsights(data.company_insights || '');
      setJdPowered(!!data.jd_powered);
      setAnswers(new Array(data.questions?.length || 0).fill(''));
      setCurrentIdx(0);
      setCurrentAnswer('');
      setPhase('practice');
    } catch (e: any) {
      Alert.alert('Prep failed', e?.message || 'Unknown error.');
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
      setPhase('review');
    }
  }

  function skipQuestion() {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setCurrentAnswer('');
    } else {
      setPhase('review');
    }
  }

  const q = questions[currentIdx];
  const answeredCount = answers.filter(a => a.length > 0).length;

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
                  Company-specific questions powered by AI. Paste the job description and Dilly will generate the exact questions you're likely to face.
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.t2, marginBottom: 4, marginTop: 8 }}>Company <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={company}
                  onChangeText={setCompany}
                  placeholder="e.g. Google"
                  placeholderTextColor={colors.t3}
                  autoFocus
                />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.t2, marginBottom: 4, marginTop: 12 }}>Role <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={role}
                  onChangeText={setRole}
                  placeholder="e.g. Data Science Intern"
                  placeholderTextColor={colors.t3}
                />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.t2, marginBottom: 4, marginTop: 12 }}>Job Description <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]}
                  value={jobDescription}
                  onChangeText={setJobDescription}
                  placeholder="Paste the full job description or a job URL"
                  placeholderTextColor={colors.t3}
                  multiline
                />
                <AnimatedPressable
                  style={[s.startBtn, (!company.trim() || !role.trim() || jobDescription.trim().length < 20) && { opacity: 0.4 }]}
                  onPress={() => loadDeck(company, role, jobDescription)}
                  disabled={!company.trim() || !role.trim() || jobDescription.trim().length < 20}
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '20', marginBottom: 10 }}
                onPress={() => openDillyOverlay({
                  isPaid: true,
                  initialMessage: `I'm in a mock interview and was asked: "${q.question}". Help me structure a strong answer using the STAR method. ${q.prep_tip ? `Tip: ${q.prep_tip}` : ''}`,
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

      {/* Review phase */}
      {phase === 'review' && (
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}>
          <FadeInView delay={0}>
            <View style={s.reviewHeader}>
              <Ionicons name="checkmark-circle" size={32} color={GREEN} />
              <Text style={s.reviewTitle}>Practice complete</Text>
              <Text style={s.reviewSub}>
                {answeredCount} of {questions.length} questions answered for {company}.
              </Text>
            </View>

            {/* Company insights */}
            {companyInsights && (
              <View style={s.insightCard}>
                <Ionicons name="business-outline" size={12} color={GOLD} />
                <Text style={s.insightText}>{companyInsights}</Text>
              </View>
            )}

            {/* Dimension gaps */}
            {gaps.length > 0 && (
              <View style={s.gapSection}>
                <Text style={s.sectionLabel}>YOUR DIMENSION GAPS</Text>
                {gaps.map((g, i) => (
                  <View key={i} style={s.gapRow}>
                    <Text style={s.gapDim}>{g.dimension}</Text>
                    <View style={s.gapBarTrack}>
                      <View style={[s.gapBarFill, { width: `${Math.max(10, 100 - g.gap * 10)}%`, backgroundColor: g.gap > 5 ? CORAL : g.gap > 2 ? AMBER : GREEN }]} />
                    </View>
                    <Text style={s.gapFocus} numberOfLines={1}>{g.focus}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Answers recap */}
            <Text style={s.sectionLabel}>YOUR ANSWERS</Text>
            {questions.map((q, i) => (
              <View key={i} style={s.answerCard}>
                <Text style={s.answerQ} numberOfLines={2}>{q.question}</Text>
                {answers[i] ? (
                  <Text style={s.answerA}>{answers[i]}</Text>
                ) : (
                  <Text style={s.answerSkipped}>Skipped</Text>
                )}
              </View>
            ))}

            {/* Actions */}
            <View style={s.reviewActions}>
              <AnimatedPressable
                style={s.retryBtn}
                onPress={() => { setPhase('setup'); setQuestions([]); setAnswers([]); setCurrentIdx(0); }}
                scaleDown={0.97}
              >
                <Ionicons name="refresh" size={14} color={GOLD} />
                <Text style={s.retryBtnText}>Practice another role</Text>
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
    </View>
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
  input: {
    width: '100%', backgroundColor: colors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.t1, marginTop: 6,
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: PURPLE, borderRadius: 12, paddingVertical: 14,
    width: '100%', marginTop: 12,
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 13, color: colors.t3 },

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

  // Review
  reviewHeader: { alignItems: 'center', gap: 8, marginBottom: 20 },
  reviewTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 18, color: colors.t1 },
  reviewSub: { fontSize: 12, color: colors.t3, textAlign: 'center' },
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 16,
  },
  insightText: { fontSize: 11, color: colors.t2, flex: 1, lineHeight: 16 },
  gapSection: { marginBottom: 16 },
  sectionLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2,
    color: colors.t3, marginBottom: 10,
  },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  gapDim: { fontSize: 11, fontWeight: '700', color: colors.t1, width: 50 },
  gapBarTrack: { flex: 1, height: 6, backgroundColor: colors.b1, borderRadius: 3, overflow: 'hidden' },
  gapBarFill: { height: '100%', borderRadius: 3 },
  gapFocus: { fontSize: 10, color: colors.t3, flex: 1 },

  answerCard: {
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 8,
  },
  answerQ: { fontSize: 12, fontWeight: '700', color: colors.t1, marginBottom: 6 },
  answerA: { fontSize: 11, color: colors.t2, lineHeight: 16 },
  answerSkipped: { fontSize: 11, color: colors.t3, fontStyle: 'italic' },

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
