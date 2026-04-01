import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { getToken } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE  = '#0A84FF';

type Phase = 'idle' | 'scanning' | 'done';

interface AuditSummary {
  id?: string;
  ts?: number;
  final_score?: number;
  scores?: { smart?: number; grit?: number; build?: number };
  detected_track?: string;
  dilly_take?: string;
}

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 80) return GREEN;
  if (s >= 55) return AMBER;
  return CORAL;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
  return `${Math.floor(diff / 30)} months ago`;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Scanning animation stages ─────────────────────────────────────────────────

const SCAN_STAGES = [
  { label: 'Parsing your resume', icon: 'document-text', duration: 2500 },
  { label: 'Analyzing bullet impact', icon: 'analytics', duration: 3000 },
  { label: 'Scoring dimensions', icon: 'speedometer', duration: 2500 },
  { label: 'Calculating your rank', icon: 'podium', duration: 2000 },
  { label: 'Generating insights', icon: 'bulb', duration: 1500 },
];

function ScanProgress({ stageIndex }: { stageIndex: number }) {
  const pulse = useSharedValue(0.3);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ), -1, true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={ns.scanWrap}>
      <Animated.View style={[ns.scanGlow, pulseStyle]} />
      <View style={ns.scanContent}>
        {SCAN_STAGES.map((stage, i) => {
          const isActive = i === stageIndex;
          const isDone = i < stageIndex;
          return (
            <View key={i} style={ns.scanRow}>
              <View style={[ns.scanDot, isDone && ns.scanDotDone, isActive && ns.scanDotActive]}>
                {isDone ? (
                  <Ionicons name="checkmark" size={10} color={GREEN} />
                ) : isActive ? (
                  <ActivityIndicator size={10} color={GOLD} />
                ) : (
                  <View style={ns.scanDotInner} />
                )}
              </View>
              {i < SCAN_STAGES.length - 1 && (
                <View style={[ns.scanLine, isDone && { backgroundColor: GREEN + '40' }]} />
              )}
              <Text style={[ns.scanLabel, isActive && { color: GOLD, fontWeight: '700' }, isDone && { color: GREEN }]}>
                {stage.label}
              </Text>
              {isDone && <Ionicons name="checkmark-circle" size={12} color={GREEN} style={{ marginLeft: 4 }} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Score History Item ─────────────────────────────────────────────────────────

function HistoryItem({ audit, index, isLatest }: { audit: AuditSummary; index: number; isLatest: boolean }) {
  const score = audit.final_score ?? 0;
  const color = scoreColor(score);
  return (
    <View style={[ns.historyItem, isLatest && { borderColor: GOLD + '30' }]}>
      <View style={[ns.historyScoreCircle, { borderColor: color + '40' }]}>
        <Text style={[ns.historyScore, { color }]}>{score}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ns.historyDate}>
          {audit.ts ? formatDate(audit.ts) : 'Unknown date'}
          {isLatest ? '  (Latest)' : ''}
        </Text>
        <View style={ns.historyDims}>
          {audit.scores && ['smart', 'grit', 'build'].map(d => (
            <Text key={d} style={ns.historyDim}>
              {d.charAt(0).toUpperCase() + d.slice(1)}: {Math.round((audit.scores as any)[d] ?? 0)}
            </Text>
          ))}
        </View>
        {audit.dilly_take ? (
          <Text style={ns.historyTake} numberOfLines={2}>{audit.dilly_take}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Before/After Results ──────────────────────────────────────────────────────

function ResultsCard({ newAudit, previousScore }: { newAudit: AuditSummary; previousScore: number | null }) {
  const score = newAudit.final_score ?? 0;
  const color = scoreColor(score);
  const delta = previousScore != null ? score - previousScore : null;
  const barAnim = useSharedValue(0);

  useEffect(() => {
    barAnim.value = withTiming(score / 100, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [score]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barAnim.value * 100}%`,
    backgroundColor: interpolateColor(barAnim.value, [0, 0.3, 0.55, 0.8], [CORAL, AMBER, GOLD, GREEN]),
  }));

  return (
    <View style={ns.resultsCard}>
      <Text style={ns.resultsEyebrow}>YOUR NEW SCORE</Text>

      <View style={ns.resultsScoreRow}>
        <Text style={[ns.resultsScore, { color }]}>{score}</Text>
        <Text style={ns.resultsOf}>/100</Text>
        {delta != null && delta !== 0 && (
          <View style={[ns.resultsDelta, { backgroundColor: delta > 0 ? GREEN + '15' : CORAL + '15' }]}>
            <Ionicons name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={delta > 0 ? GREEN : CORAL} />
            <Text style={[ns.resultsDeltaText, { color: delta > 0 ? GREEN : CORAL }]}>{Math.abs(delta)} pts</Text>
          </View>
        )}
      </View>

      {previousScore != null && (
        <View style={ns.beforeAfter}>
          <View style={ns.baItem}>
            <Text style={ns.baLabel}>Before</Text>
            <Text style={[ns.baScore, { color: scoreColor(previousScore) }]}>{previousScore}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.t3} />
          <View style={ns.baItem}>
            <Text style={ns.baLabel}>After</Text>
            <Text style={[ns.baScore, { color }]}>{score}</Text>
          </View>
        </View>
      )}

      <View style={ns.resultsBar}>
        <Animated.View style={[ns.resultsBarFill, barStyle]} />
      </View>

      {/* Dimension scores */}
      <View style={ns.resultsDims}>
        {[
          { key: 'smart', label: 'Smart', color: BLUE },
          { key: 'grit',  label: 'Grit',  color: GOLD },
          { key: 'build', label: 'Build', color: GREEN },
        ].map(d => (
          <View key={d.key} style={ns.resultsDimTile}>
            <Text style={[ns.resultsDimScore, { color: d.color }]}>
              {Math.round((newAudit.scores as any)?.[d.key] ?? 0)}
            </Text>
            <Text style={ns.resultsDimLabel}>{d.label}</Text>
          </View>
        ))}
      </View>

      {newAudit.dilly_take ? (
        <View style={ns.resultsTake}>
          <Ionicons name="chatbubble-outline" size={12} color={GOLD} />
          <Text style={ns.resultsTakeText}>{newAudit.dilly_take}</Text>
        </View>
      ) : null}

      <AnimatedPressable style={ns.resultsBtn} onPress={() => router.push('/(app)/score-detail')} scaleDown={0.97}>
        <Text style={ns.resultsBtnText}>View Full Breakdown</Text>
        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
      </AnimatedPressable>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NewAuditScreen() {
  const insets = useSafeAreaInsets();

  const [phase, setPhase]                 = useState<Phase>('idle');
  const [file, setFile]                   = useState<PickedFile | null>(null);
  const [latestAudit, setLatestAudit]     = useState<AuditSummary | null>(null);
  const [history, setHistory]             = useState<AuditSummary[]>([]);
  const [newResult, setNewResult]         = useState<AuditSummary | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [scanStage, setScanStage]         = useState(0);
  const [loading, setLoading]             = useState(true);
  const [useEditor, setUseEditor]         = useState(false);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current state
  useEffect(() => {
    (async () => {
      try {
        const [latestRes, historyRes] = await Promise.all([
          dilly.get('/audit/latest'),
          dilly.get('/audit/history'),
        ]);
        const latest = latestRes?.audit;
        if (latest) setLatestAudit(latest);
        setHistory(historyRes?.audits || []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  // Pick file
  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 10 * 1024 * 1024) {
        Alert.alert('File too large', 'Max file size is 10MB.');
        return;
      }
      setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'application/pdf', size: asset.size || 0 });
      setUseEditor(false);
    } catch {
      Alert.alert('Error', 'Could not access your files. Please try again.');
    }
  }

  // Run audit
  async function runAudit() {
    if (!file && !useEditor) {
      Alert.alert('No resume', 'Upload a PDF or use your saved resume from the editor.');
      return;
    }

    setPreviousScore(latestAudit?.final_score ?? null);
    setPhase('scanning');
    setScanStage(0);

    // Animate stages
    let stage = 0;
    function advanceStage() {
      stage++;
      if (stage < SCAN_STAGES.length) {
        setScanStage(stage);
        scanTimer.current = setTimeout(advanceStage, SCAN_STAGES[stage].duration);
      }
    }
    scanTimer.current = setTimeout(advanceStage, SCAN_STAGES[0].duration);

    try {
      let result: any;

      if (useEditor) {
        // Audit from saved editor resume
        const res = await dilly.fetch('/resume/audit', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        result = await res.json();
      } else if (file) {
        // Upload file audit
        const token = await getToken();
        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        } as any);

        const res = await fetch(`${API_BASE}/audit/first-run`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
          body: formData,
        });
        result = await res.json();
      }

      // Clear stage timer and jump to end
      if (scanTimer.current) clearTimeout(scanTimer.current);
      setScanStage(SCAN_STAGES.length);

      // Brief pause to show all stages done
      await new Promise(r => setTimeout(r, 800));

      if (result?.final_score != null) {
        setNewResult(result);
        setLatestAudit(result);
        // Prepend to history
        setHistory(prev => [result, ...prev].slice(0, 20));

        // Update base resume in the editor from the latest parsed resume
        // This ensures the resume editor always reflects the most recent audit
        try {
          await dilly.post('/resume/sync-base').catch(() => null);
        } catch {}
      } else {
        Alert.alert('Audit Failed', result?.detail || result?.error || 'Resume audit failed. Please try uploading again.');
      }

      setPhase('done');
    } catch (e: any) {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      setPhase('idle');
      Alert.alert('Error', e.message || 'Resume audit failed. Please try uploading again.');
    }
  }

  function resetToIdle() {
    setPhase('idle');
    setFile(null);
    setNewResult(null);
    setUseEditor(false);
  }

  if (loading) {
    return (
      <View style={[ns.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  return (
    <View style={[ns.container, { paddingTop: insets.top }]}>

      {/* Nav bar */}
      <FadeInView delay={0}>
        <View style={ns.navBar}>
          <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.t1} />
          </AnimatedPressable>
          <Text style={ns.navTitle}>New Audit</Text>
          <View style={{ width: 22 }} />
        </View>
      </FadeInView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[ns.scroll, { paddingBottom: insets.bottom + 40 }]}>

        {/* ── Idle phase ──────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* Current score summary */}
            <FadeInView delay={60}>
              {latestAudit?.final_score != null ? (
                <View style={ns.currentCard}>
                  <View style={ns.currentHeader}>
                    <Ionicons name="time-outline" size={12} color={colors.t3} />
                    <Text style={ns.currentLabel}>LAST AUDIT</Text>
                    <Text style={ns.currentAge}>
                      {latestAudit.ts ? timeAgo(latestAudit.ts) : ''}
                    </Text>
                  </View>
                  <View style={ns.currentScoreRow}>
                    <Text style={[ns.currentScore, { color: scoreColor(latestAudit.final_score) }]}>
                      {latestAudit.final_score}
                    </Text>
                    <Text style={ns.currentOf}>/100</Text>
                    <View style={{ flex: 1 }} />
                    <View style={ns.currentDims}>
                      {latestAudit.scores && ['smart', 'grit', 'build'].map(d => (
                        <View key={d} style={ns.currentDimChip}>
                          <Text style={ns.currentDimLabel}>{d.charAt(0).toUpperCase() + d.slice(1)}</Text>
                          <Text style={ns.currentDimScore}>{Math.round((latestAudit.scores as any)[d] ?? 0)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {latestAudit.dilly_take && (
                    <Text style={ns.currentTake} numberOfLines={2}>{latestAudit.dilly_take}</Text>
                  )}
                </View>
              ) : (
                <View style={ns.emptyCurrentCard}>
                  <Ionicons name="star-outline" size={24} color={GOLD} />
                  <Text style={ns.emptyCurrentTitle}>Your first score is waiting</Text>
                  <Text style={ns.emptyCurrentSub}>Upload your resume and find out exactly where you stand.</Text>
                </View>
              )}
            </FadeInView>

            {/* Upload zone */}
            <FadeInView delay={120}>
              <AnimatedPressable style={[ns.uploadZone, file && ns.uploadZoneSelected]} onPress={pickFile} scaleDown={0.98}>
                {file ? (
                  <View style={ns.uploadFileInfo}>
                    <View style={ns.uploadFileIcon}>
                      <Ionicons name="document-text" size={20} color={GREEN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ns.uploadFileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={ns.uploadFileSize}>{formatBytes(file.size)}</Text>
                    </View>
                    <AnimatedPressable onPress={() => setFile(null)} scaleDown={0.9} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.t3} />
                    </AnimatedPressable>
                  </View>
                ) : (
                  <>
                    <View style={ns.uploadIcon}>
                      <Ionicons name="cloud-upload-outline" size={28} color={GOLD} />
                    </View>
                    <Text style={ns.uploadTitle}>Upload your resume</Text>
                    <Text style={ns.uploadSub}>PDF or DOCX · Max 10MB</Text>
                  </>
                )}
              </AnimatedPressable>

              {/* Use saved resume option */}
              <AnimatedPressable
                style={[ns.editorOption, useEditor && { borderColor: GOLD + '40', backgroundColor: 'rgba(201,168,76,0.06)' }]}
                onPress={() => { setUseEditor(!useEditor); setFile(null); }}
                scaleDown={0.98}
              >
                <Ionicons name={useEditor ? 'checkmark-circle' : 'create-outline'} size={16} color={useEditor ? GOLD : colors.t3} />
                <Text style={[ns.editorOptionText, useEditor && { color: GOLD }]}>
                  Use my saved resume from the editor
                </Text>
              </AnimatedPressable>
            </FadeInView>

            {/* Pre-audit tips */}
            <FadeInView delay={180}>
              <View style={ns.tipsCard}>
                <View style={ns.tipsHeader}>
                  <Ionicons name="bulb-outline" size={12} color={GOLD} />
                  <Text style={ns.tipsTitle}>BEFORE YOU AUDIT</Text>
                </View>
                {[
                  { icon: 'document-outline', tip: 'Keep your resume to one page' },
                  { icon: 'analytics-outline', tip: 'Include numbers in your bullet points' },
                  { icon: 'flash-outline', tip: 'Start bullets with strong action verbs' },
                  { icon: 'search-outline', tip: 'Check for typos and formatting issues' },
                ].map((t, i) => (
                  <View key={i} style={ns.tipRow}>
                    <Ionicons name={t.icon as any} size={13} color={colors.t3} />
                    <Text style={ns.tipText}>{t.tip}</Text>
                  </View>
                ))}
              </View>
            </FadeInView>

            {/* Audit button */}
            <FadeInView delay={240}>
              <AnimatedPressable
                style={[ns.auditBtn, !file && !useEditor && { opacity: 0.5 }]}
                onPress={runAudit}
                disabled={!file && !useEditor}
                scaleDown={0.97}
              >
                <Ionicons name="flash" size={18} color="#FFFFFF" />
                <Text style={ns.auditBtnText}>Audit My Resume</Text>
              </AnimatedPressable>
            </FadeInView>

            {/* Score history */}
            {history.length > 0 && (
              <FadeInView delay={300}>
                <View style={ns.historySection}>
                  <View style={ns.historyHeader}>
                    <Ionicons name="time-outline" size={12} color={GOLD} />
                    <Text style={ns.historyTitle}>SCORE HISTORY</Text>
                    <Text style={ns.historyCount}>{history.length} audit{history.length > 1 ? 's' : ''}</Text>
                  </View>
                  {history.slice(0, 5).map((a, i) => (
                    <HistoryItem key={a.id || i} audit={a} index={i} isLatest={i === 0} />
                  ))}
                </View>
              </FadeInView>
            )}
          </>
        )}

        {/* ── Scanning phase ──────────────────────────────────────────── */}
        {phase === 'scanning' && (
          <FadeInView delay={0}>
            <View style={ns.scanningSection}>
              <Text style={ns.scanningTitle}>Auditing your resume</Text>
              <Text style={ns.scanningSub}>This usually takes 10-20 seconds</Text>
              <ScanProgress stageIndex={scanStage} />
            </View>
          </FadeInView>
        )}

        {/* ── Results phase ───────────────────────────────────────────── */}
        {phase === 'done' && newResult && (
          <>
            <FadeInView delay={0}>
              <ResultsCard newAudit={newResult} previousScore={previousScore} />
            </FadeInView>

            <FadeInView delay={200}>
              <AnimatedPressable style={ns.runAgainBtn} onPress={resetToIdle} scaleDown={0.97}>
                <Ionicons name="refresh" size={14} color={GOLD} />
                <Text style={ns.runAgainText}>Run another audit</Text>
              </AnimatedPressable>
            </FadeInView>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ns = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // Current score
  currentCard: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 16,
  },
  currentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  currentLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: colors.t3 },
  currentAge: { fontSize: 10, color: colors.t3, marginLeft: 'auto' },
  currentScoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginBottom: 6 },
  currentScore: { fontFamily: 'Cinzel_700Bold', fontSize: 36 },
  currentOf: { fontFamily: 'Cinzel_400Regular', fontSize: 12, color: colors.t3, paddingBottom: 6 },
  currentDims: { flexDirection: 'row', gap: 6 },
  currentDimChip: {
    backgroundColor: colors.s3, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  currentDimLabel: { fontSize: 8, color: colors.t3, fontWeight: '600', textTransform: 'uppercase' },
  currentDimScore: { fontSize: 12, color: colors.t1, fontWeight: '700' },
  currentTake: { fontSize: 12, color: colors.t2, lineHeight: 18, marginTop: 6 },

  emptyCurrentCard: {
    backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)',
    padding: 24, alignItems: 'center', marginBottom: 16, gap: 8,
  },
  emptyCurrentTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, color: GOLD, letterSpacing: 0.5 },
  emptyCurrentSub: { fontSize: 12, color: colors.t3, textAlign: 'center', lineHeight: 18 },

  // Upload
  uploadZone: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1.5,
    borderColor: colors.b1, borderStyle: 'dashed',
    padding: 28, alignItems: 'center', marginBottom: 10, gap: 8,
  },
  uploadZoneSelected: { borderColor: GREEN + '40', borderStyle: 'solid' },
  uploadIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(201,168,76,0.10)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.20)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  uploadSub: { fontSize: 11, color: colors.t3 },
  uploadFileInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  uploadFileIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: GREEN + '12', alignItems: 'center', justifyContent: 'center',
  },
  uploadFileName: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  uploadFileSize: { fontSize: 10, color: colors.t3, marginTop: 1 },

  // Editor option
  editorOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  editorOptionText: { fontSize: 13, color: colors.t2 },

  // Tips
  tipsCard: {
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 16,
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  tipsTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: GOLD },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  tipText: { fontSize: 12, color: colors.t2, flex: 1 },

  // Audit button
  auditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, marginBottom: 20,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  auditBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 0.8, color: '#FFFFFF' },

  // Scanning
  scanningSection: { alignItems: 'center', paddingTop: 32, paddingBottom: 20 },
  scanningTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 1, color: colors.t1, marginBottom: 4 },
  scanningSub: { fontSize: 12, color: colors.t3, marginBottom: 28 },
  scanWrap: { width: '100%', position: 'relative' },
  scanGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16, backgroundColor: GOLD, opacity: 0.03,
  },
  scanContent: { paddingHorizontal: 20, paddingVertical: 16 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  scanDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.s3, borderWidth: 1, borderColor: colors.b1,
    alignItems: 'center', justifyContent: 'center',
  },
  scanDotDone: { backgroundColor: GREEN + '15', borderColor: GREEN + '30' },
  scanDotActive: { backgroundColor: GOLD + '15', borderColor: GOLD + '40' },
  scanDotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.t3 + '30' },
  scanLine: {
    position: 'absolute', left: 11, top: 24, width: 2, height: 16,
    backgroundColor: colors.b1,
  },
  scanLabel: { fontSize: 13, color: colors.t3, flex: 1 },

  // Results
  resultsCard: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: GOLD + '20',
    padding: 20, marginBottom: 16,
  },
  resultsEyebrow: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: GOLD, marginBottom: 12 },
  resultsScoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 12 },
  resultsScore: { fontFamily: 'Cinzel_700Bold', fontSize: 48 },
  resultsOf: { fontFamily: 'Cinzel_400Regular', fontSize: 14, color: colors.t3, paddingBottom: 8 },
  resultsDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, marginBottom: 8,
  },
  resultsDeltaText: { fontSize: 13, fontWeight: '700' },
  beforeAfter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    backgroundColor: colors.s3, borderRadius: 12, padding: 12, marginBottom: 14,
  },
  baItem: { alignItems: 'center', gap: 2 },
  baLabel: { fontSize: 9, color: colors.t3, fontWeight: '600', textTransform: 'uppercase' },
  baScore: { fontFamily: 'Cinzel_700Bold', fontSize: 22 },
  resultsBar: { height: 5, backgroundColor: colors.s3, borderRadius: 999, overflow: 'hidden', marginBottom: 14 },
  resultsBarFill: { height: '100%', borderRadius: 999 },
  resultsDims: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  resultsDimTile: {
    flex: 1, backgroundColor: colors.s3, borderRadius: 10,
    padding: 10, alignItems: 'center',
  },
  resultsDimScore: { fontFamily: 'Cinzel_700Bold', fontSize: 18, marginBottom: 2 },
  resultsDimLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 7, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.t3 },
  resultsTake: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, padding: 12, marginBottom: 14,
  },
  resultsTakeText: { flex: 1, fontSize: 12, color: colors.t2, lineHeight: 18 },
  resultsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 13,
  },
  resultsBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 12, letterSpacing: 0.5, color: '#FFFFFF' },
  runAgainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: GOLD + '30', borderRadius: 12, paddingVertical: 12,
  },
  runAgainText: { fontSize: 12, color: GOLD, fontWeight: '600' },

  // History
  historySection: { marginBottom: 16 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  historyTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.5, color: GOLD, flex: 1 },
  historyCount: { fontSize: 10, color: colors.t3 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 8,
  },
  historyScoreCircle: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  historyScore: { fontFamily: 'Cinzel_700Bold', fontSize: 16 },
  historyDate: { fontSize: 11, color: colors.t2, fontWeight: '600', marginBottom: 3 },
  historyDims: { flexDirection: 'row', gap: 8 },
  historyDim: { fontSize: 10, color: colors.t3 },
  historyTake: { fontSize: 10, color: colors.t3, lineHeight: 15, marginTop: 4 },
});