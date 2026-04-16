import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Share,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const W = Dimensions.get('window').width;
const INDIGO = colors.indigo;
const GREEN = colors.green;
const AMBER = colors.amber;
const CORAL = colors.coral;

type Stage = 'idle' | 'generating' | 'done' | 'error' | 'not_ready';

interface GeneratedSection {
  key: string;
  label: string;
  contact?: { name?: string; email?: string; phone?: string; location?: string; linkedin?: string };
  education?: { university?: string; major?: string; minor?: string; graduation?: string; location?: string; gpa?: string; honors?: string };
  experiences?: { company?: string; role?: string; date?: string; location?: string; bullets?: { text: string }[] }[];
  projects?: { name?: string; date?: string; tech?: string; bullets?: { text: string }[] }[];
  simple?: { lines?: string[] };
}

const GENERATION_STEPS = [
  'Reading your Dilly profile…',
  'Tailoring experience bullets…',
  'Matching job description keywords…',
  'Formatting for ATS compatibility…',
  'Finalizing your resume…',
];

function PulsingDot({ delay = 0 }: { delay?: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: INDIGO, marginHorizontal: 3, marginTop: delay }, style]} />
  );
}

export default function ResumeGenerateScreen() {
  const insets = useSafeAreaInsets();
  const { jobTitle: paramTitle, company: paramCompany, jd: paramJd, viewId } = useLocalSearchParams<{ jobTitle?: string; company?: string; jd?: string; viewId?: string }>();
  const [stage, setStage] = useState<Stage>(viewId ? 'done' : 'idle');
  // Captures the server's actual error detail so the user sees something
  // more useful than a generic "Generation Failed" screen.
  const [generateError, setGenerateError] = useState<string>('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');

  // Always sync from params when they change (handles navigating from different jobs)
  useEffect(() => {
    if (paramTitle) setJobTitle(paramTitle);
    if (paramCompany) setCompany(paramCompany);
    if (paramJd) setJd(paramJd);
    if (paramTitle || paramCompany || paramJd) {
      setStage('idle');
      setSections([]);
      setVariantId(null);
      setSaved(false);
    }
  }, [paramTitle, paramCompany, paramJd]);
  const [stepIdx, setStepIdx] = useState(0);
  const [sections, setSections] = useState<GeneratedSection[]>([]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [atsInfo, setAtsInfo] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Resume generation usage ticker for the header
  const [resumeUsage, setResumeUsage] = useState<{ used: number; limit: number; plan: string; unlimited: boolean } | null>(null);

  // Fetch usage on mount + after each generation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await dilly.get('/resume/generate/usage');
        if (cancelled || !u) return;
        setResumeUsage({
          used: Number((u as any).used) || 0,
          limit: Number((u as any).limit) || 0,
          plan: String((u as any).plan || 'starter'),
          unlimited: !!(u as any).unlimited,
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [stage]);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumePreviewRef = useRef<View>(null);

  // Downloads real text-layer PDF / DOCX from the server (NOT a PNG
  // screenshot — ATS parsers need real text bytes to extract). We still
  // need the variant to be saved first, because the download endpoint
  // pulls from the stored sections row.
  async function handleDownloadFormat(format: 'pdf' | 'docx') {
    try {
      if (!variantId) {
        Alert.alert(
          'Saving resume…',
          'Give it a second and tap Download again. Dilly is saving this version.',
        );
        return;
      }
      const fileSystemMod: any = require('expo-file-system');
      const FileSystem = fileSystemMod?.default ?? fileSystemMod;

      const token = await dilly.tokenProvider.getToken();
      const name = (profile.name || 'Resume').replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const safeCompany = company.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Company';
      const filename = `${name}_${safeCompany}_Resume.${format}`;
      const destPath = (FileSystem?.cacheDirectory || FileSystem?.documentDirectory || '') + filename;

      const url = `${(require('../../lib/tokens') as any).API_BASE}/generated-resumes/${variantId}/file?format=${format}`;

      // Use downloadAsync — handles redirects, auth headers, and writes straight to disk.
      const res = await FileSystem.downloadAsync(url, destPath, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res?.uri) {
        throw new Error('Download failed');
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, {
          mimeType: format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          UTI: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.wordprocessingml.document',
          dialogTitle: filename,
        });
      } else {
        Alert.alert('Saved', `Saved to ${res.uri}`);
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Could not download resume.');
    }
  }

  // Offer the user PDF or DOCX via an iOS action sheet
  function handleDownload() {
    // Newer Expo apps have ActionSheetIOS available on iOS for this native feel.
    if (Platform.OS === 'ios') {
      try {
        const { ActionSheetIOS } = require('react-native');
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Download resume',
            message: 'Choose a format. PDF is best for most companies. DOCX is best for older ATS like Taleo or some Workday portals.',
            options: ['Cancel', 'PDF', 'Word (DOCX)'],
            cancelButtonIndex: 0,
          },
          (idx: number) => {
            if (idx === 1) handleDownloadFormat('pdf');
            else if (idx === 2) handleDownloadFormat('docx');
          },
        );
        return;
      } catch {}
    }
    // Fallback: plain Alert picker
    Alert.alert(
      'Download resume',
      'Choose a format',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'PDF', onPress: () => handleDownloadFormat('pdf') },
        { text: 'Word (DOCX)', onPress: () => handleDownloadFormat('docx') },
      ],
    );
  }

  const progressAnim = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  useEffect(() => {
    (async () => {
      try {
        // If viewing an existing resume, load it
        if (viewId) {
          const resume = await dilly.get(`/generated-resumes/${viewId}`);
          if (resume) {
            setJobTitle(resume.job_title || '');
            setCompany(resume.company || '');
            setJd(resume.job_description || '');
            setSections(resume.sections || []);
            setSaved(true);
            setVariantId(viewId);
            setStage('done');
          }
        }

        const profileRes = await dilly.get('/profile');
        setProfile(profileRes || {});
      } catch {}
      finally { setProfileLoaded(true); }
    })();
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  async function handleGenerate() {
    if (!jobTitle.trim() || !company.trim()) {
      Alert.alert('Missing info', 'Please enter a job title and company.');
      return;
    }
    if (!jd.trim()) {
      Alert.alert('Job description required', 'Paste the job description so Dilly can tailor your resume for this role.');
      return;
    }

    setStage('generating');
    setStepIdx(0);
    setSections([]);
    setVariantId(null);
    setSaved(false);
    setGenerateError('');
    progressAnim.value = 0;

    // Animate through steps
    let step = 0;
    progressAnim.value = withTiming(0.15, { duration: 400 });
    stepTimer.current = setInterval(() => {
      step++;
      if (step < GENERATION_STEPS.length) {
        setStepIdx(step);
        progressAnim.value = withTiming((step + 1) / GENERATION_STEPS.length, { duration: 700 });
      }
    }, 3500);

    try {
      // AI generation streams tokens and can take 30-60s; override the default 22s timeout
      const genController = new AbortController();
      const genTimeout = setTimeout(() => genController.abort(), 90_000);
      const res = await dilly.fetch('/resume/generate', {
        method: 'POST',
        body: JSON.stringify({
          job_title: jobTitle.trim(),
          job_company: company.trim(),
          job_description: jd.trim() || undefined,
        }),
        signal: genController.signal,
      });
      clearTimeout(genTimeout);

      if (stepTimer.current) {
        clearInterval(stepTimer.current);
        stepTimer.current = null;
      }

      if (!res.ok) {
        // Plan gate: surface upgrade path instead of generic error
        if (res.status === 402) {
          const d = await res.json().catch(() => null);
          const code = d?.detail?.code || d?.code;
          const msg = d?.detail?.message || d?.message || 'Monthly resume limit reached.';
          const requiredPlan = d?.detail?.required_plan || d?.required_plan || 'dilly';
          if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
          setStage('idle');
          Alert.alert(
            code === 'PLAN_LIMIT_REACHED' ? 'Monthly limit reached' : 'Upgrade to generate',
            msg,
            [
              { text: 'Not now', style: 'cancel' },
              { text: requiredPlan === 'pro' ? 'Upgrade to Pro' : 'Upgrade to Dilly', onPress: () => router.push('/(app)/settings') },
            ],
          );
          return;
        }
        // Extract the real server detail so the error screen can show why.
        let serverDetail = '';
        try {
          const d = await res.json();
          serverDetail = d?.detail?.message || d?.detail || d?.error || JSON.stringify(d).slice(0, 300);
        } catch {}
        throw new Error(serverDetail || `Server error ${res.status}`);
      }

      const data = await res.json();

      // Handle not_ready response
      if (data.not_ready) {
        if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
        setAtsInfo(data);
        setStage('not_ready');
        return;
      }

      // New format: JSON object with sections array
      const parsed: GeneratedSection[] = data.sections || [];
      if (parsed.length === 0) {
        // Fallback: try old format (raw JSON array)
        const text = JSON.stringify(data);
        const jsonStart = text.indexOf('[');
        const jsonEnd = text.lastIndexOf(']');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const fallback = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
          if (Array.isArray(fallback) && fallback.length > 0) {
            parsed.push(...fallback);
          }
        }
      }

      setSections(parsed);
      setAtsInfo(data);
      progressAnim.value = withTiming(1, { duration: 500 });
      setStage('done');

      // Auto-save as a variant
      await saveVariant(parsed);
    } catch (err: any) {
      if (stepTimer.current) {
        clearInterval(stepTimer.current);
        stepTimer.current = null;
      }
      // Surface the real reason on the error screen — massively improves
      // debuggability for users and for us reading support threads.
      const detail = String(err?.message || err?.toString?.() || 'Unknown error').slice(0, 400);
      setGenerateError(detail);
      // eslint-disable-next-line no-console
      console.warn('[resume/generate failed]', detail, err);
      setStage('error');
    }
  }

  async function saveVariant(sectionsToSave: GeneratedSection[]) {
    try {
      // Persist the verification fields alongside the resume so the
      // download endpoint can render the right per-ATS formatting and
      // the history view can show the parse score later.
      const res = await dilly.post('/generated-resumes', {
        job_title: jobTitle.trim(),
        company: company.trim(),
        job_description: jd.trim() || undefined,
        sections: sectionsToSave,
        ats_system: atsInfo?.ats || 'greenhouse',
        ats_parse_score: atsInfo?.ats_parse_score || 0,
        keyword_coverage_pct: atsInfo?.keyword_coverage_pct || 0,
      });
      const id = res?.id;
      if (id) setVariantId(id);
      setSaved(true);
    } catch {
      // Saving failed silently — not blocking
    }
  }

  function handleReset() {
    setStage('idle');
    setSections([]);
    setVariantId(null);
    setSaved(false);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Generate Resume</Text>
        {resumeUsage && !resumeUsage.unlimited ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
            backgroundColor: (resumeUsage.limit - resumeUsage.used) <= 1 ? '#FEF3C7' : colors.s2,
            minWidth: 36, justifyContent: 'center',
          }}>
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: (resumeUsage.limit - resumeUsage.used) <= 1 ? '#92400E' : colors.t2,
            }}>
              {Math.max(0, resumeUsage.limit - resumeUsage.used)} left
            </Text>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stage === 'idle' && (
          <FadeInView>
            {/* Hero */}
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons name="sparkles" size={24} color={INDIGO} />
              </View>
              <Text style={styles.heroTitle}>AI Resume Builder</Text>
              <Text style={styles.heroSub}>
                Dilly reads your profile, your experiences, and the job description to write a
                tailored resume from scratch  -  not a template.
              </Text>
            </View>

            {/* Form */}
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Job Title <Text style={{ color: colors.coral }}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Data Science Intern"
                placeholderTextColor={colors.t3}
                value={jobTitle}
                onChangeText={setJobTitle}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Company <Text style={{ color: colors.coral }}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Goldman Sachs"
                placeholderTextColor={colors.t3}
                value={company}
                onChangeText={setCompany}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Job Description <Text style={{ color: colors.coral }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.jdInput]}
                placeholder="Paste the full job description  -  required for accurate scoring and tailoring…"
                placeholderTextColor={colors.t3}
                value={jd}
                onChangeText={setJd}
                multiline
                textAlignVertical="top"
                returnKeyType="done"
              />
            </View>


            <AnimatedPressable style={styles.generateBtn} onPress={handleGenerate}>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>Generate My Resume</Text>
            </AnimatedPressable>

            <Text style={styles.disclaimer}>
              Takes ~15-25 seconds. Your Dilly profile and current resume are used as source material.
            </Text>
          </FadeInView>
        )}

        {stage === 'generating' && (
          <FadeInView>
            <View style={styles.generatingCard}>
              <View style={styles.dotsRow}>
                <PulsingDot delay={0} />
                <PulsingDot delay={4} />
                <PulsingDot delay={8} />
              </View>
              <Text style={styles.generatingTitle}>Building your resume</Text>
              <Text style={styles.generatingStep}>{GENERATION_STEPS[stepIdx]}</Text>

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, progressStyle]} />
              </View>

              <Text style={styles.generatingHint}>
                Tailored for {jobTitle} at {company}
              </Text>
            </View>
          </FadeInView>
        )}

        {stage === 'done' && (
          <FadeInView>
            <View style={styles.doneCard}>
              <View style={styles.doneIcon}>
                <Ionicons name="checkmark-circle" size={36} color={GREEN} />
              </View>
              <Text style={styles.doneTitle}>Resume Generated</Text>
              <Text style={styles.doneSub}>
                Tailored for <Text style={{ fontWeight: '600' }}>{jobTitle}</Text> at{' '}
                <Text style={{ fontWeight: '600' }}>{company}</Text>
              </Text>

              {/* Section list */}
              <View style={styles.sectionList}>
                {sections.map((s, i) => (
                  <View key={s.key ?? i} style={styles.sectionRow}>
                    <Ionicons name="checkmark" size={14} color={GREEN} />
                    <Text style={styles.sectionLabel}>{s.label ?? s.key}</Text>
                  </View>
                ))}
              </View>

              {/* ATS Badge */}
              {atsInfo?.ats && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FFF4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#C6F6D5', marginTop: 8 }}>
                  <Ionicons name="shield-checkmark" size={14} color={GREEN} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: GREEN }}>
                    {atsInfo.ats_label || `Formatted for ${(atsInfo.ats || '').charAt(0).toUpperCase() + (atsInfo.ats || '').slice(1)}`}
                  </Text>
                </View>
              )}

              {/* Verification chips — parse score + keyword coverage + facts used */}
              {(atsInfo?.ats_parse_score || atsInfo?.keyword_coverage_pct || atsInfo?.facts_used) ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {typeof atsInfo?.ats_parse_score === 'number' && atsInfo.ats_parse_score > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.s2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Ionicons name="scan" size={10} color={colors.t2} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.t2 }}>
                        {atsInfo.ats_parse_score}/100 ATS parse
                      </Text>
                    </View>
                  )}
                  {typeof atsInfo?.keyword_coverage_pct === 'number' && atsInfo.keyword_coverage_pct > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: atsInfo.keyword_coverage_pct >= 70 ? '#F0FFF4' : '#FFFBEB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Ionicons name="key" size={10} color={atsInfo.keyword_coverage_pct >= 70 ? GREEN : AMBER} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: atsInfo.keyword_coverage_pct >= 70 ? GREEN : AMBER }}>
                        {atsInfo.keyword_coverage_pct}% keyword match
                      </Text>
                    </View>
                  )}
                  {typeof atsInfo?.facts_used === 'number' && atsInfo.facts_used > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.s2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Ionicons name="sparkles" size={10} color={colors.t2} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.t2 }}>
                        Built from {atsInfo.facts_used} of your facts
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/* Keyword coverage warning — shown when the JD asks for things
                  the profile doesn't know about. This is the "you may get
                  filtered out" banner. Tapping opens Dilly AI with a
                  concrete starter message. */}
              {atsInfo?.keyword_warning && Array.isArray(atsInfo.missing_keywords) && atsInfo.missing_keywords.length > 0 && (
                <View style={{ backgroundColor: '#FFFBEB', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#FDE68A', marginTop: 8, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="warning" size={14} color={AMBER} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: AMBER }}>
                      Low keyword match ({atsInfo.keyword_coverage_pct}%)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.t2, lineHeight: 17 }}>
                    The JD asks for things like{' '}
                    <Text style={{ fontWeight: '700', color: colors.t1 }}>
                      {(atsInfo.missing_keywords as string[]).slice(0, 4).join(', ')}
                    </Text>{' '}
                    that aren't clearly in your profile. If you actually have experience with these, tell Dilly and we'll weave them in.
                  </Text>
                  <AnimatedPressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                    onPress={() => openDillyOverlay({
                      isPaid: true,
                      initialMessage: `For my ${jobTitle} resume at ${company}, Dilly doesn't have enough about me for: ${(atsInfo.missing_keywords as string[]).slice(0, 5).join(', ')}. Ask me about each one so you can add them to my profile.`,
                    })}
                    scaleDown={0.97}
                  >
                    <Ionicons name="chatbubble" size={11} color={colors.indigo} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.indigo }}>Tell Dilly about these</Text>
                  </AnimatedPressable>
                </View>
              )}

              {/* Gaps warning */}
              {atsInfo?.readiness === 'gaps' && Array.isArray(atsInfo.gaps) && atsInfo.gaps.length > 0 && (
                <View style={{ backgroundColor: '#FFFBEB', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#FDE68A', marginTop: 8, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle" size={14} color={AMBER} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: AMBER }}>Gaps detected</Text>
                  </View>
                  {atsInfo.gaps.map((g: string, i: number) => (
                    <Text key={i} style={{ fontSize: 12, color: colors.t2, lineHeight: 17 }}>- {g}</Text>
                  ))}
                  <AnimatedPressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                    onPress={() => openDillyOverlay({
                      isPaid: true,
                      initialMessage: `My resume for ${jobTitle} at ${company} has gaps: ${atsInfo.gaps.join(', ')}. Help me figure out how to close these gaps.`,
                    })}
                    scaleDown={0.97}
                  >
                    <Ionicons name="chatbubble" size={11} color={colors.indigo} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.indigo }}>Ask Dilly how to close these gaps</Text>
                  </AnimatedPressable>
                </View>
              )}

              {saved && (
                <View style={styles.savedBadge}>
                  <Ionicons name="bookmark" size={13} color={INDIGO} />
                  <Text style={styles.savedText}>Saved as a Resume Variant</Text>
                </View>
              )}
            </View>

            {/* Inline resume preview */}
            <View ref={resumePreviewRef} collapsable={false} style={styles.previewCard}>
              <Text style={styles.previewTitle}>Your Tailored Resume</Text>
              {sections.map((sec: any, si: number) => (
                <View key={sec.key ?? si} style={styles.previewSection}>
                  <Text style={styles.previewSectionLabel}>{sec.label ?? sec.key}</Text>

                  {/* Contact */}
                  {sec.contact && (
                    <View style={styles.previewEntry}>
                      {!!sec.contact.name && <Text style={styles.previewEntryTitle}>{sec.contact.name}</Text>}
                      <Text style={styles.previewEntryDates}>
                        {[sec.contact.email, sec.contact.phone, sec.contact.location, sec.contact.linkedin].filter(Boolean).join(' | ')}
                      </Text>
                    </View>
                  )}

                  {/* Education */}
                  {sec.education && (
                    <View style={styles.previewEntry}>
                      <Text style={styles.previewEntryTitle}>{sec.education.university}</Text>
                      <Text style={styles.previewEntryDates}>
                        {[sec.education.major, sec.education.minor ? `Minor: ${sec.education.minor}` : '', sec.education.graduation].filter(Boolean).join(' | ')}
                      </Text>
                      {!!sec.education.gpa && <Text style={styles.previewBullet}>GPA: {sec.education.gpa}</Text>}
                      {!!sec.education.honors && <Text style={styles.previewBullet}>{sec.education.honors}</Text>}
                    </View>
                  )}

                  {/* Experiences */}
                  {Array.isArray(sec.experiences) && sec.experiences.map((exp: any, ei: number) => (
                    <View key={exp.id ?? ei} style={styles.previewEntry}>
                      <Text style={styles.previewEntryTitle}>{exp.role}{exp.company ? `, ${exp.company}` : ''}</Text>
                      <Text style={styles.previewEntryDates}>{[exp.date, exp.location].filter(Boolean).join(' | ')}</Text>
                      {Array.isArray(exp.bullets) && exp.bullets.map((b: any, bi: number) => (
                        <Text key={b.id ?? bi} style={styles.previewBullet}>• {typeof b === 'string' ? b : b.text}</Text>
                      ))}
                    </View>
                  ))}

                  {/* Projects */}
                  {Array.isArray(sec.projects) && sec.projects.map((proj: any, pi: number) => (
                    <View key={proj.id ?? pi} style={styles.previewEntry}>
                      <Text style={styles.previewEntryTitle}>{proj.name}</Text>
                      <Text style={styles.previewEntryDates}>{[proj.tech, proj.date].filter(Boolean).join(' | ')}</Text>
                      {Array.isArray(proj.bullets) && proj.bullets.map((b: any, bi: number) => (
                        <Text key={b.id ?? bi} style={styles.previewBullet}>• {typeof b === 'string' ? b : b.text}</Text>
                      ))}
                    </View>
                  ))}

                  {/* Skills (simple lines) */}
                  {sec.simple?.lines && (
                    <View style={styles.previewEntry}>
                      {sec.simple.lines.map((line: string, li: number) => (
                        <Text key={li} style={styles.previewBullet}>{line}</Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Actions */}
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleDownload}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Download Resume</Text>
            </AnimatedPressable>

            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleReset}>
              <Ionicons name="refresh" size={18} color={INDIGO} />
              <Text style={[styles.actionBtnText, { color: INDIGO }]}>Generate Another</Text>
            </AnimatedPressable>
          </FadeInView>
        )}

        {/* Not Ready — Dilly never invents. When the profile is too thin for
            this role, we surface the gaps and route each gap into a one-tap
            "Tell Dilly about X" prompt. Fill them in, come back, regenerate. */}
        {stage === 'not_ready' && atsInfo && (
          <FadeInView>
            <View style={[styles.errorCard, { borderColor: colors.ibdr, backgroundColor: colors.idim }]}>
              <Ionicons name="hand-left" size={36} color={colors.indigo} />
              <Text style={styles.errorTitle}>Tell Dilly more first.</Text>
              <Text style={styles.errorSub}>
                {atsInfo.summary || "Dilly doesn't know enough about you to build an honest resume for this role yet."}
              </Text>
              {Array.isArray(atsInfo.gaps) && atsInfo.gaps.length > 0 && (
                <View style={{ marginTop: 12, gap: 6, width: '100%' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t1 }}>What Dilly is missing:</Text>
                  {atsInfo.gaps.map((g: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.indigo, marginTop: 6 }} />
                      <Text style={{ fontSize: 13, color: colors.t2, lineHeight: 18, flex: 1 }}>{g}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* One-tap "tell Dilly about this" chips — one per specific gap */}
            {Array.isArray(atsInfo.tell_dilly_prompts) && atsInfo.tell_dilly_prompts.length > 0 && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t3, letterSpacing: 0.5, paddingHorizontal: 2 }}>
                  FASTEST WAY TO FIX
                </Text>
                {(atsInfo.tell_dilly_prompts as string[]).slice(0, 5).map((prompt, i) => (
                  <AnimatedPressable
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: colors.s1,
                      borderWidth: 1,
                      borderColor: colors.b1,
                    }}
                    onPress={() => openDillyOverlay({ isPaid: true, initialMessage: prompt })}
                    scaleDown={0.98}
                  >
                    <Ionicons name="chatbubble" size={14} color={colors.indigo} />
                    <Text style={{ fontSize: 13, color: colors.t1, flex: 1 }}>{prompt}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                  </AnimatedPressable>
                ))}
              </View>
            )}

            <AnimatedPressable
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `I tried to generate a resume for ${jobTitle} at ${company} but I'm not ready yet. Walk me through each gap one by one so I can tell you about them and build out my profile.`,
              })}
            >
              <Ionicons name="chatbubble" size={16} color={INDIGO} />
              <Text style={[styles.actionBtnText, { color: INDIGO }]}>Talk it through with Dilly</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleReset}>
              <Ionicons name="refresh" size={18} color={INDIGO} />
              <Text style={[styles.actionBtnText, { color: INDIGO }]}>Try a different role</Text>
            </AnimatedPressable>
          </FadeInView>
        )}

        {stage === 'error' && (
          <FadeInView>
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={36} color={AMBER} />
              <Text style={styles.errorTitle}>Generation Failed</Text>
              <Text style={styles.errorSub}>
                Something went wrong on our end. Try again in a moment.
              </Text>
              {!!generateError && (
                <View style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.s1,
                  borderWidth: 1,
                  borderColor: colors.b1,
                  width: '100%',
                }}>
                  <Text style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.t3,
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}>
                    ERROR DETAIL
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.t2, fontFamily: 'Menlo' }} selectable>
                    {generateError}
                  </Text>
                </View>
              )}
            </View>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleReset}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Try Again</Text>
            </AnimatedPressable>
          </FadeInView>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.s1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.t1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  // Hero
  heroCard: {
    backgroundColor: colors.idim,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ibdr,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.ibdr,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.t1,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Form
  formCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b2,
    padding: spacing.xl,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t1,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.b2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.t1,
  },
  jdInput: {
    height: 120,
    paddingTop: spacing.sm + 2,
  },

  // Generate button
  generateBtn: {
    backgroundColor: INDIGO,
    borderRadius: radius.xl,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: colors.t3,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.xs,
  },

  // Warning card (no track / no audit)
  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: `${AMBER}12`, borderRadius: radius.md,
    borderWidth: 1, borderColor: `${AMBER}30`, padding: spacing.md,
  },
  warnTitle: { fontSize: 13, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  warnSub: { fontSize: 12, color: colors.t2, lineHeight: 18 },

  // Score card
  scoreCard: {
    backgroundColor: colors.s1, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.b2, padding: spacing.md, gap: 12,
  },
  scoreCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreCardLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: colors.t3 },
  cohortBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${INDIGO}12`, borderRadius: 999, borderWidth: 1, borderColor: `${INDIGO}25`,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  cohortBadgeText: { fontSize: 11, fontWeight: '700', color: INDIGO },
  scoreDims: { flexDirection: 'row', gap: 10 },
  scoreDim: { flex: 1, gap: 4 },
  scoreDimLabel: { fontSize: 10, fontWeight: '600', color: colors.t3, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreDimVal: { fontFamily: 'Cinzel_700Bold', fontSize: 20 },
  scoreDimBar: { height: 4, borderRadius: 2, backgroundColor: colors.s3, overflow: 'hidden' },
  scoreDimFill: { height: '100%', borderRadius: 2 },
  scoreNote: { fontSize: 11, color: colors.t3, lineHeight: 16 },

  // Generating
  generatingCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b2,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  generatingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.t1,
  },
  generatingStep: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: colors.s3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: INDIGO,
    borderRadius: 2,
  },
  generatingHint: {
    fontSize: 11,
    color: colors.t3,
    textAlign: 'center',
  },

  // Done
  doneCard: {
    backgroundColor: colors.gdim,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gbdr,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  doneIcon: {
    marginBottom: spacing.xs,
  },
  doneTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.t1,
  },
  doneSub: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
  },
  sectionList: {
    width: '100%',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  sectionLabel: {
    fontSize: 13,
    color: colors.t1,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.idim,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.ibdr,
    marginTop: spacing.xs,
  },
  savedText: {
    fontSize: 12,
    color: INDIGO,
    fontWeight: '600',
  },

  // Action buttons
  actionBtn: {
    borderRadius: radius.xl,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtnPrimary: {
    backgroundColor: INDIGO,
  },
  actionBtnSecondary: {
    backgroundColor: colors.idim,
    borderWidth: 1,
    borderColor: colors.ibdr,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Error
  errorCard: {
    backgroundColor: colors.adim,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.abdr,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.t1,
  },
  errorSub: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Inline resume preview
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 20,
    marginTop: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 16,
    textAlign: 'center',
  },
  previewSection: {
    marginBottom: 14,
  },
  previewSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.t2,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
    paddingBottom: 4,
    marginBottom: 8,
  },
  previewEntry: {
    marginBottom: 10,
  },
  previewEntryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t1,
  },
  previewEntryDates: {
    fontSize: 11,
    color: colors.t3,
    marginBottom: 4,
  },
  previewBullet: {
    fontSize: 12,
    color: colors.t2,
    lineHeight: 18,
    paddingLeft: 4,
    marginBottom: 2,
  },
});
