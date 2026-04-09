import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  UIManager,
  Platform,
  Dimensions,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import ResumeScoreDashboard, { EditorScanData, CohortOption } from '../../components/ResumeScoreDashboard';
import TailorDiffModal, { TailorDiffPayload } from '../../components/TailorDiffModal';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE  = '#0A84FF';
const W = Dimensions.get('window').width;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Bullet { id: string; text: string; }
interface ExperienceEntry { id: string; company: string; role: string; date: string; location: string; bullets: Bullet[]; }
interface EducationEntry { id: string; university: string; major: string; minor: string; graduation: string; location: string; honors: string; gpa: string; }
interface ProjectEntry { id: string; name: string; date: string; location: string; bullets: Bullet[]; }
interface ContactSection { name: string; email: string; phone: string; location: string; linkedin: string; }
interface SimpleSection { id: string; lines: string[]; }
interface ResumeSection {
  key: string; label: string;
  contact?: ContactSection | null;
  education?: EducationEntry | null;
  experiences?: ExperienceEntry[] | null;
  projects?: ProjectEntry[] | null;
  simple?: SimpleSection | null;
}
interface BulletScore { score: number; label: string; hints: string[]; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2, 10); }

function sColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 55) return GOLD;
  if (score >= 30) return AMBER;
  return CORAL;
}

function sLabel(score: number): string {
  if (score >= 80) return 'Strong';
  if (score >= 55) return 'Good';
  if (score >= 30) return 'Needs work';
  return 'Weak';
}

// ── Smart placeholders by major ───────────────────────────────────────────────

const PLACEHOLDERS: Record<string, Record<string, string>> = {
  'Data Science': {
    bullet: 'Built a Python pipeline processing 50K+ records daily, reducing analysis time by 40%',
    company: 'DataCorp Analytics',
    role: 'Data Science Intern',
    project: 'Predictive Model for Student Retention',
    skill: 'Python, SQL, Pandas, Scikit-learn, Tableau, TensorFlow',
  },
  'Computer Science': {
    bullet: 'Developed a REST API handling 10K requests/day using Node.js and PostgreSQL',
    company: 'TechStartup Inc.',
    role: 'Software Engineering Intern',
    project: 'Full-Stack Task Management App',
    skill: 'JavaScript, React, Node.js, Python, AWS, Docker',
  },
  'Finance': {
    bullet: 'Built a DCF model valuing 3 potential acquisitions totaling $2.4B for the M&A team',
    company: 'Goldman Sachs',
    role: 'Investment Banking Summer Analyst',
    project: 'Portfolio Optimization Dashboard',
    skill: 'Excel, Bloomberg Terminal, Capital IQ, Financial Modeling, VBA',
  },
  default: {
    bullet: 'Led a team of 4 to deliver a project 2 weeks ahead of deadline, saving $5K in costs',
    company: 'Acme Corp',
    role: 'Summer Intern',
    project: 'Process Improvement Initiative',
    skill: 'Leadership, Excel, Communication, Project Management',
  },
};

function getPlaceholders(major: string): Record<string, string> {
  return PLACEHOLDERS[major] || PLACEHOLDERS.default;
}

// ── Section completion calc ───────────────────────────────────────────────────

function sectionCompleteness(sec: ResumeSection): { filled: number; total: number } {
  if (sec.contact) {
    const c = sec.contact;
    const fields = [c.name, c.email, c.phone, c.location, c.linkedin];
    return { filled: fields.filter(f => f.trim().length > 0).length, total: fields.length };
  }
  if (sec.education) {
    const e = sec.education;
    const fields = [e.university, e.major, e.graduation, e.gpa];
    return { filled: fields.filter(f => f.trim().length > 0).length, total: fields.length };
  }
  if (sec.experiences?.length) {
    const total = sec.experiences.length * 3; // company + role + at least 1 bullet
    let filled = 0;
    for (const e of sec.experiences) {
      if (e.company.trim()) filled++;
      if (e.role.trim()) filled++;
      if (e.bullets.some(b => b.text.trim().length > 10)) filled++;
    }
    return { filled, total };
  }
  if (sec.projects?.length) {
    const total = sec.projects.length * 2;
    let filled = 0;
    for (const p of sec.projects) {
      if (p.name.trim()) filled++;
      if (p.bullets.some(b => b.text.trim().length > 10)) filled++;
    }
    return { filled, total };
  }
  if (sec.simple?.lines?.length) {
    return { filled: sec.simple.lines.filter(l => l.trim().length > 0).length, total: Math.max(sec.simple.lines.length, 1) };
  }
  return { filled: 0, total: 1 };
}

function sectionIcon(key: string): string {
  if (key === 'contact') return 'person-outline';
  if (key === 'education') return 'school-outline';
  if (key.includes('experience') || key === 'research' || key.includes('involvement') || key.includes('volunteer')) return 'briefcase-outline';
  if (key === 'projects') return 'code-slash-outline';
  if (key === 'skills') return 'construct-outline';
  return 'document-text-outline';
}

// ── Overall Strength Meter ────────────────────────────────────────────────────

function StrengthMeter({ score }: { score: number }) {
  const anim = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    anim.value = withTiming(score / 100, { duration: 800, easing: Easing.out(Easing.cubic) });
    if (score >= 80) {
      glow.value = withRepeat(withSequence(
        withTiming(1, { duration: 1200 }),
        withTiming(0.3, { duration: 1200 }),
      ), -1, true);
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [score]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${anim.value * 100}%`,
    backgroundColor: interpolateColor(anim.value, [0, 0.3, 0.55, 0.8], [CORAL, AMBER, GOLD, GREEN]),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const color = sColor(score);
  const label = score >= 80 ? 'Recruiter Ready' : score >= 55 ? 'Getting There' : score >= 30 ? 'Needs Work' : 'Just Starting';

  return (
    <View style={rs.meterWrap}>
      <View style={rs.meterHeader}>
        <View>
          <Text style={rs.meterLabel}>RESUME STRENGTH</Text>
          <Text style={[rs.meterStatus, { color }]}>{label}</Text>
        </View>
        <View style={rs.meterScoreWrap}>
          <Text style={[rs.meterScore, { color }]}>{score}</Text>
          <Text style={rs.meterOf}>/100</Text>
        </View>
      </View>
      <View style={rs.meterTrack}>
        <Animated.View style={[rs.meterFill, barStyle]} />
        <Animated.View style={[rs.meterGlow, glowStyle]} />
      </View>
      <View style={rs.meterTicks}>
        <Text style={rs.meterTick}>0</Text>
        <Text style={[rs.meterTick, { color: CORAL }]}>30</Text>
        <Text style={[rs.meterTick, { color: AMBER }]}>55</Text>
        <Text style={[rs.meterTick, { color: GREEN }]}>80</Text>
        <Text style={rs.meterTick}>100</Text>
      </View>
    </View>
  );
}

// ── Completion Ring (small) ───────────────────────────────────────────────────

function CompletionDot({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? filled / total : 0;
  const color = pct >= 1 ? GREEN : pct >= 0.5 ? GOLD : colors.t3;
  return (
    <View style={[rs.compDot, { borderColor: color, backgroundColor: pct >= 1 ? color + '25' : 'transparent' }]}>
      {pct >= 1 ? (
        <Ionicons name="checkmark" size={8} color={color} />
      ) : (
        <Text style={[rs.compDotText, { color }]}>{Math.round(pct * 100)}%</Text>
      )}
    </View>
  );
}

// ── Bullet Score Bar ──────────────────────────────────────────────────────────

function BulletScoreBar({ score, previousScore }: { score: BulletScore | null; previousScore?: number | null }) {
  const fillAnim = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (score) {
      fillAnim.value = withSpring(score.score / 100, { damping: 15, stiffness: 120 });
      if (score.score >= 80) {
        shimmer.value = withRepeat(withSequence(
          withTiming(1, { duration: 1500 }),
          withTiming(0, { duration: 1500 }),
        ), -1, true);
      } else {
        shimmer.value = withTiming(0, { duration: 200 });
      }
    } else {
      fillAnim.value = withTiming(0, { duration: 300 });
      shimmer.value = withTiming(0, { duration: 200 });
    }
  }, [score?.score]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillAnim.value * 100}%`,
    backgroundColor: interpolateColor(fillAnim.value, [0, 0.3, 0.55, 0.8], [CORAL, AMBER, GOLD, GREEN]),
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value * 0.6,
  }));

  if (!score) return null;

  const color = sColor(score.score);
  const delta = previousScore != null ? score.score - previousScore : null;

  return (
    <View style={rs.bScoreWrap}>
      <View style={rs.bScoreRow}>
        <View style={rs.bScoreTrack}>
          <Animated.View style={[rs.bScoreFill, fillStyle]} />
          <Animated.View style={[rs.bScoreShimmer, shimmerStyle]} />
        </View>
        <View style={[rs.bScoreBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
          <Text style={[rs.bScoreNum, { color }]}>{score.score}</Text>
        </View>
        <Text style={[rs.bScoreLabel, { color }]}>{score.label}</Text>
        {delta != null && delta !== 0 && (
          <View style={[rs.deltaChip, { backgroundColor: delta > 0 ? GREEN + '15' : CORAL + '15' }]}>
            <Ionicons name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={8} color={delta > 0 ? GREEN : CORAL} />
            <Text style={[rs.deltaText, { color: delta > 0 ? GREEN : CORAL }]}>{Math.abs(delta)}</Text>
          </View>
        )}
      </View>
      {score.hints.length > 0 && (
        <View style={rs.bLintRow}>
          {score.hints.slice(0, 3).map((hint, i) => {
            const cat = categorizeHint(hint);
            return (
              <View
                key={i}
                style={[rs.bLintChip, { backgroundColor: cat.color + '15', borderColor: cat.color + '35' }]}
              >
                <Ionicons name={cat.icon as any} size={10} color={cat.color} />
                <Text style={[rs.bLintChipText, { color: cat.color }]} numberOfLines={2}>{hint}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Build 66 — live bullet lint: categorize hints into intent buckets so the
// user sees what KIND of problem each hint is about (weak verb vs missing
// metric vs passive voice vs length), color-coded at a glance.
function categorizeHint(hint: string): { icon: string; color: string } {
  const h = (hint || '').toLowerCase();
  if (/(verb|action|start with)/.test(h)) {
    return { icon: 'flash', color: CORAL };
  }
  if (/(metric|number|quantif|measur|%|percent|impact)/.test(h)) {
    return { icon: 'stats-chart', color: AMBER };
  }
  if (/(passive|active voice|were|was )/.test(h)) {
    return { icon: 'swap-horizontal', color: BLUE };
  }
  if (/(long|wordy|trim|tighten|concise|word count)/.test(h)) {
    return { icon: 'cut', color: '#5E5CE6' };
  }
  if (/(specif|vague|concrete|detail)/.test(h)) {
    return { icon: 'search', color: AMBER };
  }
  return { icon: 'bulb-outline', color: GOLD };
}

// ── Inline editable field (resume-style) ──────────────────────────────────────

function InlineField({ value, onChangeText, placeholder, style, bold, large, muted, onFocus: onFocusProp }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  style?: any; bold?: boolean; large?: boolean; muted?: boolean; onFocus?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[
        rs.inlineInput,
        bold && { fontWeight: '700' },
        large && { fontSize: 18 },
        muted && { color: colors.t2, fontSize: 11 },
        focused && rs.inlineFocused,
        style,
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.t3 + '60'}
      onFocus={() => { setFocused(true); onFocusProp?.(); }}
      onBlur={() => setFocused(false)}
      multiline
    />
  );
}

// ── Bullet editor ─────────────────────────────────────────────────────────────

function BulletEditor({ bullet, placeholder, onChange, onDelete, onScoreUpdate, initialScore }: {
  bullet: Bullet; placeholder: string;
  onChange: (text: string) => void; onDelete: () => void;
  onScoreUpdate: (id: string, score: BulletScore | null) => void;
  initialScore?: number | null;
}) {
  const [localScore, setLocalScore] = useState<BulletScore | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(initialScore ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scoreBullet = useCallback(async (text: string) => {
    if (text.trim().length < 10) {
      setLocalScore(null);
      onScoreUpdate(bullet.id, null);
      return;
    }
    try {
      const res = await dilly.fetch('/resume/bullet-score', {
        method: 'POST',
        body: JSON.stringify({ bullet: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (localScore) setPreviousScore(localScore.score);
        setLocalScore(data);
        onScoreUpdate(bullet.id, data);
      }
    } catch {}
  }, [bullet.id, localScore]);

  function handleChange(text: string) {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => scoreBullet(text), 600);
  }

  // Build 63: fast rule-based rewrite with accept/reject modal.
  // On tap, call /ats-rewrite with just this bullet, then show an inline
  // before/after card. Accept updates the bullet in place and re-scores.
  const [rewriteModalOpen, setRewriteModalOpen] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteSuggestion, setRewriteSuggestion] = useState<{
    original: string; rewritten: string; changes: string[];
  } | null>(null);

  async function handleAskDilly() {
    if (bullet.text.trim().length < 10) return;
    setRewriteModalOpen(true);
    setRewriteLoading(true);
    setRewriteSuggestion(null);
    try {
      const res = await dilly.fetch('/ats-rewrite', {
        method: 'POST',
        body: JSON.stringify({
          bullets: [bullet.text],
          use_llm: false, // fast deterministic rewriter
        }),
      });
      const data = await res.json().catch(() => null);
      const r = data?.rewrites?.[0];
      if (r && r.original && r.rewritten && r.original.trim() !== r.rewritten.trim()) {
        setRewriteSuggestion({
          original: r.original,
          rewritten: r.rewritten,
          changes: Array.isArray(r.changes) ? r.changes : [],
        });
      } else {
        // No change needed — fall back to the Dilly overlay for a longer conversation
        setRewriteModalOpen(false);
        const score = localScore?.score ?? 0;
        openDillyOverlay({
          isPaid: true,
          initialMessage: `Help me improve this resume bullet. It currently scores ${score}/100. Show me a rewritten version that would score higher, and explain what you changed and why. Do NOT use any emojis or special unicode characters.\n\nMy bullet: "${bullet.text}"`,
        });
      }
    } catch {
      setRewriteModalOpen(false);
    } finally {
      setRewriteLoading(false);
    }
  }

  function acceptRewrite() {
    if (!rewriteSuggestion) return;
    const newText = rewriteSuggestion.rewritten;
    onChange(newText);
    setRewriteModalOpen(false);
    setRewriteSuggestion(null);
    // Re-score the new text so the user sees the lift
    setTimeout(() => scoreBullet(newText), 150);
  }

  function rejectRewrite() {
    setRewriteModalOpen(false);
    setRewriteSuggestion(null);
  }

  useEffect(() => {
    if (bullet.text.trim().length >= 10) scoreBullet(bullet.text);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const canAskDilly = bullet.text.trim().length >= 10;

  return (
    <View style={rs.bulletWrap}>
      <View style={rs.bulletRow}>
        <Text style={rs.bulletDot}>{'•'}</Text>
        <View style={{ flex: 1 }}>
          <InlineField
            value={bullet.text}
            onChangeText={handleChange}
            placeholder={placeholder}
            style={{ fontSize: 13, lineHeight: 19 }}
          />
          <BulletScoreBar score={localScore} previousScore={previousScore} />
        </View>
        <AnimatedPressable onPress={onDelete} scaleDown={0.85} hitSlop={8}>
          <Ionicons name="close-circle" size={14} color={colors.t3 + '60'} />
        </AnimatedPressable>
      </View>
      {/* Ask Dilly — small button below bullet, left-aligned */}
      {canAskDilly && (
        <AnimatedPressable onPress={handleAskDilly} scaleDown={0.92} style={rs.askDillyRow}>
          <View style={rs.askDillyBtn}>
            <Ionicons name="sparkles" size={9} color={colors.indigo} />
          </View>
          <Text style={rs.askDillyText}>Improve with Dilly</Text>
        </AnimatedPressable>
      )}

      {/* Accept/Reject rewrite modal — compact before/after comparison */}
      <Modal visible={rewriteModalOpen} transparent animationType="fade" onRequestClose={rejectRewrite}>
        <View style={rs.rewriteModalOverlay}>
          <View style={rs.rewriteModalCard}>
            <View style={rs.rewriteModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={14} color={GOLD} />
                <Text style={rs.rewriteModalTitle}>Dilly suggests</Text>
              </View>
              <TouchableOpacity onPress={rejectRewrite} hitSlop={12}>
                <Ionicons name="close" size={18} color={colors.t2} />
              </TouchableOpacity>
            </View>

            {rewriteLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                <ActivityIndicator size="small" color={GOLD} />
                <Text style={{ fontSize: 11, color: colors.t3, marginTop: 8 }}>Writing a stronger version…</Text>
              </View>
            ) : rewriteSuggestion ? (
              <>
                <Text style={rs.rewriteLabelText}>BEFORE</Text>
                <Text style={rs.rewriteBefore}>{rewriteSuggestion.original}</Text>
                <View style={{ alignItems: 'center', marginVertical: 4 }}>
                  <Ionicons name="arrow-down" size={13} color={GOLD} />
                </View>
                <Text style={rs.rewriteLabelText}>AFTER</Text>
                <Text style={rs.rewriteAfter}>{rewriteSuggestion.rewritten}</Text>

                {rewriteSuggestion.changes.length > 0 && (
                  <View style={rs.rewriteChangesBlock}>
                    {rewriteSuggestion.changes.slice(0, 3).map((c, i) => (
                      <Text key={i} style={rs.rewriteChangeText}>• {c}</Text>
                    ))}
                  </View>
                )}

                <View style={rs.rewriteActionRow}>
                  <AnimatedPressable style={rs.rewriteRejectBtn} onPress={rejectRewrite} scaleDown={0.95}>
                    <Ionicons name="close" size={12} color={colors.t3} />
                    <Text style={rs.rewriteRejectText}>Skip</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={rs.rewriteAcceptBtn} onPress={acceptRewrite} scaleDown={0.95}>
                    <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    <Text style={rs.rewriteAcceptText}>Accept</Text>
                  </AnimatedPressable>
                </View>
              </>
            ) : (
              <Text style={{ fontSize: 11, color: colors.t3, textAlign: 'center', paddingVertical: 12 }}>
                No improvement found. Try editing the bullet directly or use the full chat.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Section editors (resume-preview style) ────────────────────────────────────

function ContactPreview({ contact, onChange }: { contact: ContactSection; onChange: (c: ContactSection) => void }) {
  const set = (k: keyof ContactSection, v: string) => onChange({ ...contact, [k]: v });
  return (
    <View style={rs.contactSection}>
      <InlineField value={contact.name} onChangeText={v => set('name', v)} placeholder="Your Full Name" bold large style={{ textAlign: 'center', fontSize: 20 }} />
      <View style={rs.contactRow}>
        <InlineField value={contact.email} onChangeText={v => set('email', v)} placeholder="email@utampa.edu" muted style={{ flex: 1, textAlign: 'center' }} />
      </View>
      <View style={rs.contactRow}>
        <InlineField value={contact.phone} onChangeText={v => set('phone', v)} placeholder="(555) 123-4567" muted style={{ flex: 1 }} />
        <Text style={rs.contactSep}>|</Text>
        <InlineField value={contact.location} onChangeText={v => set('location', v)} placeholder="Tampa, FL" muted style={{ flex: 1 }} />
        <Text style={rs.contactSep}>|</Text>
        <InlineField
          value={contact.linkedin}
          onChangeText={v => {
            // Auto-prefix linkedin.com/in/ if user starts typing a username
            if (v && !v.startsWith('linkedin.com/in/') && !v.startsWith('http') && v !== 'l' && v.length > 0) {
              set('linkedin', 'linkedin.com/in/' + v);
            } else {
              set('linkedin', v);
            }
          }}
          onFocus={() => {
            if (!contact.linkedin) set('linkedin', 'linkedin.com/in/');
          }}
          placeholder="linkedin.com/in/you"
          muted
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function EducationPreview({ edu, onChange }: { edu: EducationEntry; onChange: (e: EducationEntry) => void }) {
  const set = (k: keyof EducationEntry, v: string) => onChange({ ...edu, [k]: v });
  return (
    <View style={rs.resumeBlock}>
      <View style={rs.blockHeaderRow}>
        <InlineField value={edu.university} onChangeText={v => set('university', v)} placeholder="University of Tampa" bold style={{ flex: 1 }} />
        <InlineField value={edu.location} onChangeText={v => set('location', v)} placeholder="Tampa, FL" muted style={{ textAlign: 'right' }} />
      </View>
      <View style={rs.blockHeaderRow}>
        <InlineField value={edu.major} onChangeText={v => set('major', v)} placeholder="B.S. Data Science" style={{ flex: 1, fontStyle: 'italic' }} />
        <InlineField value={edu.graduation} onChangeText={v => set('graduation', v)} placeholder="May 2027" muted style={{ textAlign: 'right' }} />
      </View>
      {(edu.gpa || edu.honors) ? (
        <View style={rs.blockHeaderRow}>
          <InlineField value={edu.gpa ? `GPA: ${edu.gpa}` : ''} onChangeText={v => set('gpa', v.replace('GPA: ', ''))} placeholder="GPA: 3.8" muted style={{ flex: 1 }} />
          <InlineField value={edu.honors} onChangeText={v => set('honors', v)} placeholder="Dean's List" muted style={{ textAlign: 'right' }} />
        </View>
      ) : (
        <View style={rs.blockHeaderRow}>
          <InlineField value="" onChangeText={v => set('gpa', v)} placeholder="GPA: 3.8" muted style={{ flex: 1 }} />
          <InlineField value="" onChangeText={v => set('honors', v)} placeholder="Honors" muted style={{ textAlign: 'right' }} />
        </View>
      )}
    </View>
  );
}

function ExperiencePreview({ entries, onChange, ph, onScoreUpdate }: {
  entries: ExperienceEntry[]; onChange: (e: ExperienceEntry[]) => void;
  ph: Record<string, string>; onScoreUpdate: (id: string, s: BulletScore | null) => void;
}) {
  function updateEntry(i: number, u: Partial<ExperienceEntry>) { const n = [...entries]; n[i] = { ...n[i], ...u }; onChange(n); }
  function updateBullet(ei: number, bi: number, text: string) { const n = [...entries]; const b = [...n[ei].bullets]; b[bi] = { ...b[bi], text }; n[ei] = { ...n[ei], bullets: b }; onChange(n); }
  function addBullet(ei: number) { const n = [...entries]; n[ei] = { ...n[ei], bullets: [...n[ei].bullets, { id: uid(), text: '' }] }; onChange(n); }
  function deleteBullet(ei: number, bi: number) { const n = [...entries]; n[ei] = { ...n[ei], bullets: n[ei].bullets.filter((_, j) => j !== bi) }; onChange(n); }
  function addEntry() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onChange([...entries, { id: uid(), company: '', role: '', date: '', location: '', bullets: [{ id: uid(), text: '' }] }]); }
  function deleteEntry(i: number) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onChange(entries.filter((_, j) => j !== i)); }

  return (
    <View>
      {entries.map((entry, i) => (
        <View key={entry.id} style={rs.resumeBlock}>
          <View style={rs.blockHeaderRow}>
            <InlineField value={entry.company} onChangeText={v => updateEntry(i, { company: v })} placeholder={ph.company} bold style={{ flex: 1 }} />
            <InlineField value={entry.location} onChangeText={v => updateEntry(i, { location: v })} placeholder="City, ST" muted style={{ textAlign: 'right' }} />
          </View>
          <View style={rs.blockHeaderRow}>
            <InlineField value={entry.role} onChangeText={v => updateEntry(i, { role: v })} placeholder={ph.role} style={{ flex: 1, fontStyle: 'italic' }} />
            <InlineField value={entry.date} onChangeText={v => updateEntry(i, { date: v })} placeholder="Jun — Aug 2025" muted style={{ textAlign: 'right' }} />
          </View>
          {entry.bullets.map((b, j) => (
            <BulletEditor key={b.id} bullet={b} placeholder={ph.bullet} onChange={text => updateBullet(i, j, text)} onDelete={() => deleteBullet(i, j)} onScoreUpdate={onScoreUpdate} />
          ))}
          <View style={rs.blockActions}>
            <AnimatedPressable style={rs.addBtnSmall} onPress={() => addBullet(i)} scaleDown={0.97}>
              <Ionicons name="add" size={12} color={GOLD} />
              <Text style={rs.addBtnSmallText}>Bullet</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={() => deleteEntry(i)} scaleDown={0.9} hitSlop={8}>
              <Ionicons name="trash-outline" size={13} color={CORAL + '80'} />
            </AnimatedPressable>
          </View>
        </View>
      ))}
      <AnimatedPressable style={rs.addEntryBtn} onPress={addEntry} scaleDown={0.97}>
        <Ionicons name="add-circle-outline" size={14} color={GOLD} />
        <Text style={rs.addEntryText}>Add experience</Text>
      </AnimatedPressable>
    </View>
  );
}

function ProjectPreview({ projects, onChange, ph, onScoreUpdate }: {
  projects: ProjectEntry[]; onChange: (p: ProjectEntry[]) => void;
  ph: Record<string, string>; onScoreUpdate: (id: string, s: BulletScore | null) => void;
}) {
  function updateProj(i: number, u: Partial<ProjectEntry>) { const n = [...projects]; n[i] = { ...n[i], ...u }; onChange(n); }
  function updateBullet(pi: number, bi: number, text: string) { const n = [...projects]; const b = [...n[pi].bullets]; b[bi] = { ...b[bi], text }; n[pi] = { ...n[pi], bullets: b }; onChange(n); }
  function addBullet(pi: number) { const n = [...projects]; n[pi] = { ...n[pi], bullets: [...n[pi].bullets, { id: uid(), text: '' }] }; onChange(n); }
  function deleteBullet(pi: number, bi: number) { const n = [...projects]; n[pi] = { ...n[pi], bullets: n[pi].bullets.filter((_, j) => j !== bi) }; onChange(n); }
  function addProject() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onChange([...projects, { id: uid(), name: '', date: '', location: '', bullets: [{ id: uid(), text: '' }] }]); }
  function deleteProject(i: number) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onChange(projects.filter((_, j) => j !== i)); }

  return (
    <View>
      {projects.map((proj, i) => (
        <View key={proj.id} style={rs.resumeBlock}>
          <View style={rs.blockHeaderRow}>
            <InlineField value={proj.name} onChangeText={v => updateProj(i, { name: v })} placeholder={ph.project} bold style={{ flex: 1 }} />
            <InlineField value={proj.date} onChangeText={v => updateProj(i, { date: v })} placeholder="Jan 2026" muted style={{ textAlign: 'right' }} />
          </View>
          {proj.bullets.map((b, j) => (
            <BulletEditor key={b.id} bullet={b} placeholder={ph.bullet} onChange={text => updateBullet(i, j, text)} onDelete={() => deleteBullet(i, j)} onScoreUpdate={onScoreUpdate} />
          ))}
          <View style={rs.blockActions}>
            <AnimatedPressable style={rs.addBtnSmall} onPress={() => addBullet(i)} scaleDown={0.97}>
              <Ionicons name="add" size={12} color={GOLD} />
              <Text style={rs.addBtnSmallText}>Bullet</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={() => deleteProject(i)} scaleDown={0.9} hitSlop={8}>
              <Ionicons name="trash-outline" size={13} color={CORAL + '80'} />
            </AnimatedPressable>
          </View>
        </View>
      ))}
      <AnimatedPressable style={rs.addEntryBtn} onPress={addProject} scaleDown={0.97}>
        <Ionicons name="add-circle-outline" size={14} color={GOLD} />
        <Text style={rs.addEntryText}>Add project</Text>
      </AnimatedPressable>
    </View>
  );
}

function SimplePreview({ simple, onChange, ph }: { simple: SimpleSection; onChange: (s: SimpleSection) => void; ph: Record<string, string> }) {
  function updateLine(i: number, text: string) { const n = [...simple.lines]; n[i] = text; onChange({ ...simple, lines: n }); }
  function addLine() { onChange({ ...simple, lines: [...simple.lines, ''] }); }
  function deleteLine(i: number) { onChange({ ...simple, lines: simple.lines.filter((_, j) => j !== i) }); }
  return (
    <View style={rs.resumeBlock}>
      {simple.lines.map((line, i) => (
        <View key={i} style={rs.simpleRow}>
          <InlineField value={line} onChangeText={text => updateLine(i, text)} placeholder={ph.skill} style={{ flex: 1, fontSize: 12 }} />
          <AnimatedPressable onPress={() => deleteLine(i)} scaleDown={0.85} hitSlop={8}>
            <Ionicons name="close-circle" size={12} color={colors.t3 + '40'} />
          </AnimatedPressable>
        </View>
      ))}
      <AnimatedPressable style={rs.addBtnSmall} onPress={addLine} scaleDown={0.97}>
        <Ionicons name="add" size={12} color={GOLD} />
        <Text style={rs.addBtnSmallText}>Add line</Text>
      </AnimatedPressable>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ResumeEditorScreen() {
  const { variantId: incomingVariantId } = useLocalSearchParams<{ variantId?: string }>();
  const insets = useSafeAreaInsets();

  const [sections, setSections]     = useState<ResumeSection[]>([]);
  const [baseSections, setBaseSections] = useState<ResumeSection[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [major, setMajor]           = useState('');
  const [bulletScores, setBulletScores] = useState<Record<string, number>>({});
  const [overallScore, setOverallScore] = useState(0);
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [variants, setVariants]     = useState<any[]>([]);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showTailor, setShowTailor] = useState(false);
  const [tailorCompany, setTailorCompany] = useState('');
  const [tailorRole, setTailorRole] = useState('');
  const [tailorJD, setTailorJD] = useState('');
  const [tailoring, setTailoring] = useState(false);
  // Build 64: tailor-diff modal
  const [showTailorDiff, setShowTailorDiff] = useState(false);
  const [tailorDiffData, setTailorDiffData] = useState<TailorDiffPayload | null>(null);

  // Build-63 dashboard: debounced /resume/editor-scan result
  const [scanData, setScanData] = useState<EditorScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Build-65: re-audit button state
  const [reauditing, setReauditing] = useState(false);
  // Build-65: explicit cohort override (null = use user's primary major)
  const [cohortOverride, setCohortOverride] = useState<string | null>(null);
  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);

  // Load resume + profile for major
  useEffect(() => {
    (async () => {
      try {
        const [resumeRes, profileRes, auditRes] = await Promise.all([
          dilly.get('/resume/edited'),
          dilly.get('/profile'),
          dilly.get('/audit/latest').catch(() => null),
        ]);
        setMajor(profileRes?.majors?.[0] || profileRes?.major || '');

        // Seed initial score from latest audit — prefer primary cohort
        // composite from rubric_analysis over the legacy aggregate.
        const auditObj = auditRes?.audit ?? auditRes;
        const ra = auditObj?.rubric_analysis;
        const fs = ra?.primary_composite
          ?? auditObj?.final_score
          ?? 0;
        if (fs > 0) {
          setInitialScore(Math.round(Number(fs)));
          setOverallScore(Math.round(Number(fs)));
        }
        if (resumeRes?.resume?.sections?.length) {
          setSections(resumeRes.resume.sections);
          setBaseSections(resumeRes.resume.sections);
        } else {
          setSections([
            { key: 'contact', label: 'Contact', contact: { name: profileRes?.name || '', email: profileRes?.email || '', phone: '', location: '', linkedin: profileRes?.linkedin_url || '' } },
            { key: 'education', label: 'Education', education: { id: uid(), university: profileRes?.school_id === 'utampa' ? 'University of Tampa' : '', major: profileRes?.majors?.[0] || '', minor: profileRes?.minors?.[0] || '', graduation: '', location: 'Tampa, FL', honors: '', gpa: '' } },
            { key: 'professional_experience', label: 'Professional Experience', experiences: [{ id: uid(), company: '', role: '', date: '', location: '', bullets: [{ id: uid(), text: '' }] }] },
            { key: 'projects', label: 'Projects', projects: [{ id: uid(), name: '', date: '', location: '', bullets: [{ id: uid(), text: '' }] }] },
            { key: 'skills', label: 'Skills', simple: { id: uid(), lines: [''] } },
          ]);
        }
      } catch {
        setSections([
          { key: 'contact', label: 'Contact', contact: { name: '', email: '', phone: '', location: '', linkedin: '' } },
          { key: 'education', label: 'Education', education: { id: uid(), university: '', major: '', minor: '', graduation: '', location: '', honors: '', gpa: '' } },
          { key: 'professional_experience', label: 'Professional Experience', experiences: [{ id: uid(), company: '', role: '', date: '', location: '', bullets: [{ id: uid(), text: '' }] }] },
          { key: 'projects', label: 'Projects', projects: [{ id: uid(), name: '', date: '', location: '', bullets: [{ id: uid(), text: '' }] }] },
          { key: 'skills', label: 'Skills', simple: { id: uid(), lines: [''] } },
        ]);
      } finally {
        setLoading(false);
      }

      // Fetch resume variants; if we arrived from generate, auto-load that variant
      dilly.get('/resume/variants').then(async data => {
        const allVariants = data?.variants || [];
        setVariants(allVariants);
        if (incomingVariantId) {
          setActiveVariant(incomingVariantId);
          setExpanded(new Set());
          const varData = await dilly.get(`/resume/variants/${incomingVariantId}`);
          if (varData?.resume?.sections?.length) setSections(varData.resume.sections);
        }
      }).catch(() => {});
    })();
  }, []);

  // Build-65: single source of truth for the overall score.
  // The floating badge in the upper-right of the resume doc and the hero
  // score in ResumeScoreDashboard used to disagree because they were
  // computed from different sources (bullet-blend vs editor-scan). Now
  // they both come from the same place: the latest /resume/editor-scan
  // response's v2.overall.value, with a graceful fallback to the initial
  // audit score while the first scan is loading.
  useEffect(() => {
    const v2Overall = scanData?.v2?.overall?.value;
    if (typeof v2Overall === 'number' && v2Overall > 0) {
      setOverallScore(Math.round(v2Overall));
      return;
    }
    // No fresh scan yet — show the seeded audit score.
    if (initialScore !== null) setOverallScore(initialScore);
  }, [scanData, initialScore]);

  const ph = getPlaceholders(major);

  function toggleSection(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => {
      const next = new Set(prev || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateSection(key: string, updates: Partial<ResumeSection>) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, ...updates } : s));
    setHasChanges(true);
  }

  function handleBulletScoreUpdate(id: string, score: BulletScore | null) {
    setBulletScores(prev => {
      const next = { ...prev };
      if (score) next[id] = score.score;
      else delete next[id];
      return next;
    });
  }

  // ── Debounced /resume/editor-scan (build 63 dashboard) ──────────────────
  // Fires 600ms after the last section edit. Non-blocking — the editor stays
  // fully interactive while the scan runs in the background.
  const runEditorScan = useCallback(async () => {
    if (!sections || sections.length === 0) return;
    setScanLoading(true);
    try {
      const res = await dilly.fetch('/resume/editor-scan', {
        method: 'POST',
        body: JSON.stringify({
          sections,
          cohort_id: cohortOverride || undefined,
          variant_id: activeVariant || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setScanData(data);
      }
    } catch {} finally {
      setScanLoading(false);
    }
  }, [sections, cohortOverride, activeVariant]);

  useEffect(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(() => { runEditorScan(); }, 650);
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [sections, cohortOverride, activeVariant, runEditorScan]);

  // Build-65: load cohort list once for the switcher
  useEffect(() => {
    (async () => {
      try {
        const data = await dilly.get('/resume/cohorts');
        if (Array.isArray(data?.cohorts)) {
          setCohortOptions(data.cohorts as CohortOption[]);
        }
      } catch {}
    })();
  }, []);

  // Issue action: open the Dilly AI overlay pre-prompted to fix the tapped issue.
  // Closes the loop between the "Fix this first" list and the AI chat.
  function handleFixIssue(issue: any) {
    const firstName = (major || 'there').split(' ')[0];
    const vendors = (issue.affects_vendors || []).join(', ') || 'ATS parsers';
    openDillyOverlay({
      name: firstName,
      cohort: major || 'General',
      score: overallScore, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
      isPaid: true,
      initialMessage: [
        `I'm working on my resume and Dilly flagged an issue that's worth +${Math.round(issue.total_lift || issue.avg_lift || 0)} points.`,
        `Issue: "${issue.title}".`,
        `Affected vendors: ${vendors}.`,
        `Suggested fix: ${issue.fix}`,
        `Walk me through exactly what I should change on my resume. Give me specific before/after examples based on my sections, then ask me if I want to apply the fix now.`,
      ].join(' '),
    });
  }

  // ── PDF export ──────────────────────────────────────────────────────────
  // Backend stores the PDF in a transient cache and returns a public URL.
  // We open that URL with Linking — iOS Safari renders the PDF natively
  // with its standard share/save sheet. Works without expo-file-system
  // or expo-sharing.
  async function handleExport(template: 'tech' | 'business' | 'academic') {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await dilly.fetch('/resume/export', {
        method: 'POST',
        body: JSON.stringify({ sections, template }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        Alert.alert('Export failed', detail?.detail || 'Could not render the PDF.');
        return;
      }
      const data = await res.json();
      const url = data?.url;
      if (!url) {
        Alert.alert('Export failed', 'Empty response from server.');
        return;
      }
      setShowExportPicker(false);
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(
          'PDF ready',
          `Template: ${template}\nSize: ${Math.round((data.size_bytes || 0) / 1024)} KB\n\nCould not auto-open the PDF. Copy and paste this URL into Safari:\n${url}`
        );
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Unknown error.');
    } finally {
      setExporting(false);
    }
  }

  // Build 65: re-audit button handler — saves first if dirty, then runs
  // the full audit pipeline against the saved resume. On success, updates
  // the seeded initial score so the dashboard and floating badge reflect
  // the fresh numbers immediately. No paywall — the backend already
  // bypasses the subscription check for all users.
  async function handleReaudit() {
    if (reauditing) return;
    setReauditing(true);
    try {
      // Persist any unsaved edits first so the backend audits the latest text
      if (hasChanges) {
        const saveRes = await dilly.fetch('/resume/save', {
          method: 'POST',
          body: JSON.stringify({ sections }),
        });
        if (!saveRes.ok) {
          Alert.alert('Re-audit failed', 'Could not save your edits before auditing.');
          return;
        }
        setHasChanges(false);
      }
      const res = await dilly.fetch('/resume/audit', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        Alert.alert('Re-audit failed', detail?.detail || 'Could not re-audit the resume.');
        return;
      }
      const audit = await res.json();
      const ra = audit?.rubric_analysis;
      // Prefer primary cohort composite; fall back to legacy final_score
      const freshScore =
        (ra?.primary_composite != null ? Number(ra.primary_composite) : null) ??
        (audit?.final_score != null ? Number(audit.final_score) : null);
      if (freshScore != null && freshScore > 0) {
        setInitialScore(Math.round(freshScore));
        setOverallScore(Math.round(freshScore));
      }
      // Force the coaching dashboard to refetch so vendor/rubric scores update
      setTimeout(() => { runEditorScan(); }, 100);
      Alert.alert('Re-audit complete', freshScore != null ? `Your score: ${Math.round(freshScore)}/100` : 'Your resume has been re-audited.');
    } catch (e: any) {
      Alert.alert('Re-audit failed', e?.message || 'Unknown error.');
    } finally {
      setReauditing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // dilly.fetch gives us a real Response; dilly.post returns the parsed body
      // and has no .ok field — the old code always fell into the catch even on success.
      const res = await dilly.fetch('/resume/save', {
        method: 'POST',
        body: JSON.stringify({ sections }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || 'save failed');
      }
      setHasChanges(false);
      Alert.alert('Saved', 'Your resume has been saved.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save resume.');
    }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <View style={[rs.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ color: colors.t3, marginTop: 12, fontSize: 12 }}>Loading your resume...</Text>
      </View>
    );
  }

  return (
    <View style={[rs.container, { paddingTop: insets.top }]}>

      {/* Nav bar */}
      <FadeInView delay={0}>
        <View style={rs.navBar}>
          <AnimatedPressable onPress={() => {
            if (hasChanges) {
              Alert.alert('Unsaved changes', 'Save before leaving?', [
                { text: 'Discard', style: 'destructive', onPress: () => router.back() },
                { text: 'Save', onPress: async () => { await handleSave(); router.back(); } },
                { text: 'Cancel', style: 'cancel' },
              ]);
            } else { router.back(); }
          }} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.t1} />
          </AnimatedPressable>
          <Text style={rs.navTitle}>Resume Editor</Text>
          <AnimatedPressable onPress={handleSave} scaleDown={0.9} disabled={saving || !hasChanges}>
            {saving ? <ActivityIndicator size="small" color={GOLD} /> : (
              <Text style={[rs.saveBtn, !hasChanges && { opacity: 0.3 }]}>Save</Text>
            )}
          </AnimatedPressable>
        </View>
      </FadeInView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[rs.scroll, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">

        {/* Resume selector — grid button */}
        <View style={rs.variantSection}>
          <AnimatedPressable style={rs.gridBtn} onPress={() => setShowGrid(true)} scaleDown={0.97}>
            <View style={rs.gridBtnLeft}>
              <Ionicons name="document-text" size={16} color={colors.gold} />
              <Text style={rs.gridBtnTitle} numberOfLines={1}>
                {activeVariant
                  ? (variants.find((v: any) => v.id === activeVariant)?.label || variants.find((v: any) => v.id === activeVariant)?.job_company || 'Tailored')
                  : 'Base Resume'}
              </Text>
            </View>
            <View style={rs.gridBtnRight}>
              <Text style={rs.gridBtnCount}>{variants.length + 1} resumes</Text>
              <Ionicons name="grid" size={16} color={colors.t2} />
            </View>
          </AnimatedPressable>
        </View>

        {/* Tailor for a job */}
        <AnimatedPressable
          style={rs.tailorBtn}
          onPress={() => setShowTailor(true)}
          scaleDown={0.97}
        >
          <Ionicons name="sparkles" size={14} color="#2B3A8E" />
          <Text style={rs.tailorBtnText}>Tailor for a job</Text>
        </AnimatedPressable>

        {/* Generate new resume with AI */}
        <AnimatedPressable
          style={rs.tailorBtn}
          onPress={() => router.push('/(app)/resume-generate')}
          scaleDown={0.97}
        >
          <Ionicons name="flash" size={14} color="#2B3A8E" />
          <Text style={rs.tailorBtnText}>Generate resume with AI</Text>
        </AnimatedPressable>

        {/* Build-63 dashboard: collapsible header + the dashboard card */}
        <View style={{ marginBottom: 6 }}>
          <AnimatedPressable
            style={rs.dashToggle}
            onPress={() => setShowDashboard(v => !v)}
            scaleDown={0.97}
          >
            <Ionicons name="analytics" size={13} color={GOLD} />
            <Text style={rs.dashToggleText}>
              {showDashboard ? 'Hide coaching dashboard' : 'Show coaching dashboard'}
            </Text>
            <Ionicons name={showDashboard ? 'chevron-up' : 'chevron-down'} size={13} color={colors.t3} />
          </AnimatedPressable>
          {showDashboard && (
            <ResumeScoreDashboard
              scan={scanData}
              loading={scanLoading}
              onFixIssue={handleFixIssue}
              cohortOptions={cohortOptions}
              activeCohortId={cohortOverride}
              onSelectCohort={(cid) => setCohortOverride(cid)}
            />
          )}
        </View>

        {/* Export button row */}
        <View style={rs.exportRow}>
          <AnimatedPressable
            style={rs.exportBtn}
            onPress={() => setShowExportPicker(true)}
            scaleDown={0.97}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={GOLD} />
            ) : (
              <>
                <Ionicons name="download" size={13} color={GOLD} />
                <Text style={rs.exportBtnText}>Export PDF</Text>
              </>
            )}
          </AnimatedPressable>
        </View>

        {/* Resume document */}
        <FadeInView delay={120}>
          <View style={rs.resumeDoc}>

            {/* Floating score badge */}
            <View style={rs.scoreBadgeWrap}>
              <View style={rs.scoreBadgeRing}>
                <View style={[rs.scoreBadgeProgress, {
                  borderColor: sColor(overallScore),
                  borderTopColor: 'transparent',
                  transform: [{ rotate: `${(overallScore / 100) * 360}deg` }],
                }]} />
              </View>
              <View style={[rs.scoreBadgeInner, { borderColor: sColor(overallScore) + '30' }]}>
                <Text style={[rs.scoreBadgeNum, { color: sColor(overallScore) }]}>{overallScore}</Text>
              </View>
            </View>

            {/* Sections as accordion */}
            {sections.map((sec, i) => {
              const comp = sectionCompleteness(sec);
              const isOpen = expanded?.has(sec.key) ?? false;

              return (
                <View key={sec.key}>
                  {/* Section header (like a resume section divider) */}
                  <AnimatedPressable style={rs.sectionDivider} onPress={() => toggleSection(sec.key)} scaleDown={0.995}>
                    <View style={rs.sectionDividerLine} />
                    <View style={rs.sectionDividerLabel}>
                      <Ionicons name={sectionIcon(sec.key) as any} size={11} color={GOLD} />
                      <Text style={rs.sectionDividerText}>{(sec.label || sec.key.replace(/_/g, ' ')).toUpperCase()}</Text>
                      <CompletionDot filled={comp.filled} total={comp.total} />
                    </View>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.t3} />
                  </AnimatedPressable>

                  {/* Content */}
                  {isOpen && (
                    <View style={rs.sectionContent}>
                      {sec.contact && <ContactPreview contact={sec.contact} onChange={c => updateSection(sec.key, { contact: c })} />}
                      {sec.education && <EducationPreview edu={sec.education} onChange={e => updateSection(sec.key, { education: e })} />}
                      {sec.experiences && <ExperiencePreview entries={sec.experiences} onChange={e => updateSection(sec.key, { experiences: e })} ph={ph} onScoreUpdate={handleBulletScoreUpdate} />}
                      {sec.projects && <ProjectPreview projects={sec.projects} onChange={p => updateSection(sec.key, { projects: p })} ph={ph} onScoreUpdate={handleBulletScoreUpdate} />}
                      {sec.simple && <SimplePreview simple={sec.simple} onChange={s => updateSection(sec.key, { simple: s })} ph={ph} />}
                    </View>
                  )}
                </View>
              );
            })}

          </View>
        </FadeInView>

        {/* Re-audit — runs the full audit pipeline on the currently saved sections */}
        <FadeInView delay={300}>
          <AnimatedPressable
            style={[rs.reauditBtn, reauditing && { opacity: 0.6 }]}
            onPress={handleReaudit}
            scaleDown={0.97}
            disabled={reauditing}
          >
            {reauditing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flash" size={16} color="#FFFFFF" />
                <Text style={rs.reauditBtnText}>Re-audit my resume</Text>
              </>
            )}
          </AnimatedPressable>
          <Text style={rs.reauditHint}>Run the full audit pipeline on your current resume</Text>
        </FadeInView>

      </ScrollView>

      {/* Bento grid modal */}
      <Modal visible={showGrid} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowGrid(false)}>
        <View style={rs.bentoOverlay}>
          <View style={[rs.bentoContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
            <View style={rs.bentoHeader}>
              <Text style={rs.bentoTitle}>My Resumes</Text>
              <TouchableOpacity onPress={() => setShowGrid(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.t1} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={rs.bentoGrid}>
              {/* Base resume card — always first, larger */}
              <AnimatedPressable
                style={[rs.bentoCardLarge, !activeVariant && rs.bentoCardSelected]}
                onPress={() => { setActiveVariant(null); setSections(baseSections); setExpanded(new Set()); setShowGrid(false); }}
                scaleDown={0.96}
              >
                <View style={rs.bentoCardIcon}>
                  <Ionicons name="document-text" size={28} color={colors.gold} />
                </View>
                <Text style={rs.bentoCardTitle}>Base Resume</Text>
                <Text style={rs.bentoCardSub}>Your original resume</Text>
                {!activeVariant && <View style={rs.bentoActiveDot}><Ionicons name="checkmark-circle" size={16} color={colors.green} /></View>}
              </AnimatedPressable>

              {/* Variant cards */}
              {variants.map((v: any, i: number) => {
                const isActive = activeVariant === v.id;
                const isTailored = v.type === 'tailored';
                return (
                  <AnimatedPressable
                    key={v.id}
                    style={[rs.bentoCard, isActive && rs.bentoCardSelected]}
                    onPress={() => {
                      setActiveVariant(v.id);
                      setShowGrid(false);
                      setExpanded(new Set());
                      dilly.get(`/resume/variants/${v.id}`).then(data => {
                        if (data?.resume?.sections?.length) setSections(data.resume.sections);
                      }).catch(() => {});
                    }}
                    scaleDown={0.96}
                  >
                    <View style={[rs.bentoCardIcon, isTailored && { backgroundColor: colors.golddim }]}>
                      <Ionicons name={isTailored ? 'sparkles' : 'copy'} size={20} color={isTailored ? colors.gold : colors.t2} />
                    </View>
                    <Text style={rs.bentoCardTitle} numberOfLines={1}>{v.label || v.job_company || 'Variant'}</Text>
                    <Text style={rs.bentoCardSub} numberOfLines={1}>
                      {isTailored ? `Tailored for ${v.job_company || 'job'}` : v.cohort || 'Custom variant'}
                    </Text>
                    {isActive && <View style={rs.bentoActiveDot}><Ionicons name="checkmark-circle" size={16} color={colors.green} /></View>}
                  </AnimatedPressable>
                );
              })}

              {/* Create new — tailor button */}
              <AnimatedPressable
                style={rs.bentoCardNew}
                onPress={() => { setShowGrid(false); setTimeout(() => setShowTailor(true), 300); }}
                scaleDown={0.96}
              >
                <View style={[rs.bentoCardIcon, { backgroundColor: colors.golddim }]}>
                  <Ionicons name="add" size={24} color={colors.gold} />
                </View>
                <Text style={[rs.bentoCardTitle, { color: colors.gold }]}>Tailor for a job</Text>
                <Text style={rs.bentoCardSub}>AI rewrites for a company</Text>
              </AnimatedPressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Tailor modal */}
      <Modal visible={showTailor} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowTailor(false)}>
        <View style={rs.tailorOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
            <View style={[rs.tailorCard, { paddingBottom: insets.bottom + 20 }]}>
              <View style={rs.tailorHeader}>
                <Text style={rs.tailorTitle}>Tailor Resume</Text>
                <TouchableOpacity onPress={() => setShowTailor(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={colors.t2} />
                </TouchableOpacity>
              </View>
              <Text style={rs.tailorSub}>Dilly will rewrite your resume bullets to match this role.</Text>
              <TextInput
                style={rs.tailorInput}
                value={tailorCompany}
                onChangeText={setTailorCompany}
                placeholder="Company (e.g. Google)"
                placeholderTextColor={colors.t3}
                autoFocus
              />
              <TextInput
                style={rs.tailorInput}
                value={tailorRole}
                onChangeText={setTailorRole}
                placeholder="Role (e.g. Data Science Intern)"
                placeholderTextColor={colors.t3}
              />
              <TextInput
                style={[rs.tailorInput, { minHeight: 90, textAlignVertical: 'top' }]}
                value={tailorJD}
                onChangeText={setTailorJD}
                placeholder="Paste the job description (optional — better tailoring)"
                placeholderTextColor={colors.t3}
                multiline
              />
              <AnimatedPressable
                style={[rs.tailorSubmitBtn, (!tailorCompany.trim() || !tailorRole.trim()) && { opacity: 0.4 }]}
                onPress={async () => {
                  if (!tailorCompany.trim() || !tailorRole.trim()) return;
                  // Close setup modal, open diff modal in loading state
                  setShowTailor(false);
                  setTailorDiffData(null);
                  setShowTailorDiff(true);
                  setTailoring(true);
                  try {
                    const res = await dilly.fetch('/resume/tailor-diff', {
                      method: 'POST',
                      body: JSON.stringify({
                        job_company: tailorCompany.trim(),
                        job_title: tailorRole.trim(),
                        job_description: tailorJD.trim() || undefined,
                      }),
                    });
                    if (!res.ok) {
                      const detail = await res.json().catch(() => null);
                      Alert.alert('Tailoring failed', detail?.detail || 'Could not generate a tailored version.');
                      setShowTailorDiff(false);
                      return;
                    }
                    const data = await res.json();
                    setTailorDiffData(data as TailorDiffPayload);
                  } catch (e: any) {
                    Alert.alert('Tailoring failed', e?.message || 'Unknown error.');
                    setShowTailorDiff(false);
                  } finally {
                    setTailoring(false);
                  }
                }}
                scaleDown={0.97}
                disabled={!tailorCompany.trim() || !tailorRole.trim()}
              >
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                <Text style={rs.tailorSubmitText}>Preview tailored version</Text>
              </AnimatedPressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Build 64: rich tailor-diff modal ─────────────────────────────── */}
      <TailorDiffModal
        visible={showTailorDiff}
        loading={tailoring}
        diff={tailorDiffData}
        onClose={() => {
          setShowTailorDiff(false);
          setTailorDiffData(null);
        }}
        onAcceptAll={async () => {
          if (!tailorDiffData) return;
          try {
            // Create a new tailored variant pre-populated with the Claude output
            const createRes = await dilly.fetch('/resume/variants', {
              method: 'POST',
              body: JSON.stringify({
                label: `Tailored — ${tailorDiffData.job_company}`,
                job_company: tailorDiffData.job_company,
                job_title: tailorDiffData.job_title,
                cohort: tailorDiffData.cohort,
                type: 'job',
                sections: tailorDiffData.tailored_sections,
              }),
            });
            if (!createRes.ok) {
              Alert.alert('Could not save variant', 'The diff was generated but saving failed. Try again.');
              return;
            }
            const created = await createRes.json();
            // Refresh the variant list and switch to the new one
            const varRes = await dilly.get('/resume/variants');
            setVariants(varRes?.variants || []);
            if (created?.id) {
              setActiveVariant(created.id);
              setSections(tailorDiffData.tailored_sections as any);
              setHasChanges(false);
            }
            setShowTailorDiff(false);
            setTailorDiffData(null);
            setTailorCompany('');
            setTailorRole('');
            setTailorJD('');
          } catch (e: any) {
            Alert.alert('Save failed', e?.message || 'Unknown error.');
          }
        }}
      />

      {/* ── Export template picker (build 63) ───────────────────────────── */}
      <Modal visible={showExportPicker} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowExportPicker(false)}>
        <View style={rs.exportModalOverlay}>
          <View style={rs.exportModalCard}>
            <View style={rs.exportModalHeader}>
              <Text style={rs.exportModalTitle}>Export as PDF</Text>
              <TouchableOpacity onPress={() => setShowExportPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={colors.t2} />
              </TouchableOpacity>
            </View>
            <Text style={rs.exportModalSub}>Pick a template. All templates are single-column and ATS-friendly.</Text>
            {([
              { key: 'tech' as const, label: 'Tech', hint: 'Left-aligned, Skills near top, GitHub prominent' },
              { key: 'business' as const, label: 'Business', hint: 'Centered contact, formal spacing' },
              { key: 'academic' as const, label: 'Academic', hint: 'Research-heavy, Education front-loaded' },
            ]).map(tpl => (
              <AnimatedPressable
                key={tpl.key}
                style={rs.exportTemplateRow}
                onPress={() => handleExport(tpl.key)}
                scaleDown={0.97}
                disabled={exporting}
              >
                <View style={{ flex: 1 }}>
                  <Text style={rs.exportTemplateLabel}>{tpl.label}</Text>
                  <Text style={rs.exportTemplateHint}>{tpl.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={GOLD} />
              </AnimatedPressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Tailoring in-progress overlay */}
      {tailoring && (
        <View style={rs.tailoringOverlay}>
          <ActivityIndicator size="large" color="#2B3A8E" />
          <Text style={rs.tailoringText}>Dilly is tailoring your resume for {tailorCompany}...</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rs = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  saveBtn: { fontFamily: 'Cinzel_700Bold', fontSize: 13, color: GOLD, letterSpacing: 0.5 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Strength meter
  meterWrap: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 16,
  },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  meterLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: colors.t3 },
  meterStatus: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  meterScoreWrap: { flexDirection: 'row', alignItems: 'flex-end' },
  meterScore: { fontFamily: 'Cinzel_700Bold', fontSize: 32 },
  meterOf: { fontFamily: 'Cinzel_400Regular', fontSize: 12, color: colors.t3, paddingBottom: 5, marginLeft: 2 },
  meterTrack: { height: 6, backgroundColor: colors.s3, borderRadius: 999, overflow: 'hidden', position: 'relative' },
  meterFill: { height: '100%', borderRadius: 999 },
  meterGlow: {
    position: 'absolute', top: -2, left: 0, right: 0, bottom: -2,
    borderRadius: 999, backgroundColor: GOLD, opacity: 0,
  },
  meterTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  meterTick: { fontSize: 8, color: colors.t3 },

  // Resume document (paper style)
  resumeDoc: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 20, position: 'relative' as const,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },

  // Section divider
  sectionDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  sectionDividerLine: { flex: 0, width: 0 },
  sectionDividerLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionDividerText: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 2, color: GOLD },
  sectionContent: { paddingHorizontal: 16, paddingBottom: 8 },

  // Completion dot
  compDot: {
    width: 22, height: 16, borderRadius: 8,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  compDotText: { fontSize: 7, fontWeight: '700' },

  // Contact
  contactSection: { paddingVertical: 8, alignItems: 'center' },
  contactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap' },
  contactSep: { color: colors.t3, fontSize: 10, marginHorizontal: 2 },

  // Resume block (experience/education entry)
  resumeBlock: { paddingVertical: 6 },
  blockHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingLeft: 12 },

  // Inline input
  inlineInput: {
    fontSize: 14, color: colors.t1, paddingVertical: 4, paddingHorizontal: 6,
    borderRadius: 6, borderWidth: 1, borderColor: 'transparent',
  },
  inlineFocused: { borderColor: GOLD + '40', backgroundColor: 'rgba(201,168,76,0.04)' },

  // Bullets
  bulletWrap: { paddingLeft: 4, marginBottom: 2 },
  bulletRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  bulletDot: { color: colors.t2, fontSize: 14, marginTop: 6, width: 12 },
  // Ask Dilly row (below bullet, left-aligned)
  askDillyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginLeft: 18, marginTop: 2, marginBottom: 4,
  },
  askDillyBtn: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.idim,
    borderWidth: 1, borderColor: colors.ibdr,
    alignItems: 'center', justifyContent: 'center',
  },
  askDillyText: {
    fontSize: 10, color: colors.indigo, fontWeight: '500',
  },

  // Bullet score bar
  bScoreWrap: { marginTop: 4, marginBottom: 4, marginLeft: 2 },
  bScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bScoreTrack: { flex: 1, height: 3, backgroundColor: colors.s3, borderRadius: 999, overflow: 'hidden', position: 'relative' },
  bScoreFill: { height: '100%', borderRadius: 999 },
  bScoreShimmer: {
    position: 'absolute', top: -1, left: 0, right: 0, bottom: -1,
    borderRadius: 999, backgroundColor: GOLD,
  },
  bScoreBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  bScoreNum: { fontFamily: 'Cinzel_700Bold', fontSize: 10 },
  bScoreLabel: { fontSize: 9, fontWeight: '600' },
  deltaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  deltaText: { fontSize: 9, fontWeight: '700' },
  bScoreHint: { fontSize: 10, color: colors.t3, lineHeight: 14, marginTop: 3, paddingLeft: 2 },
  // Build 66 lint chips
  bLintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5, paddingLeft: 2 },
  bLintChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3,
    maxWidth: '100%',
  },
  bLintChipText: { fontSize: 9, fontWeight: '600', lineHeight: 12, flexShrink: 1 },

  // Add buttons
  addBtnSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  addBtnSmallText: { fontSize: 11, color: GOLD, fontWeight: '600' },
  addEntryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: GOLD + '30', borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 10, marginTop: 8, marginBottom: 4,
  },
  addEntryText: { fontSize: 11, color: GOLD, fontWeight: '600' },

  // Simple rows
  simpleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },

  // Re-audit
  reauditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, marginTop: 20,
  },
  reauditBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#FFFFFF' },
  reauditHint: { fontSize: 10, color: colors.t3, textAlign: 'center', marginTop: 6 },

  // Variant selector
  variantSection: { marginBottom: 12 },
  variantLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2, color: colors.t3, marginBottom: 8 },
  variantRow: { gap: 8 },
  variantChip: { backgroundColor: colors.s2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.b1 },
  variantChipActive: { backgroundColor: colors.golddim, borderColor: colors.goldbdr },
  variantChipText: { fontSize: 12, fontWeight: '600', color: colors.t2, maxWidth: 140 },
  variantChipTextActive: { color: colors.gold },

  // Floating score badge
  scoreBadgeWrap: {
    position: 'absolute', top: -10, right: -10, zIndex: 10,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  scoreBadgeRing: {
    position: 'absolute', width: 44, height: 44,
    borderRadius: 22, overflow: 'hidden',
  },
  scoreBadgeProgress: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3, borderColor: 'transparent',
  },
  scoreBadgeInner: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  scoreBadgeNum: { fontFamily: 'Cinzel_700Bold', fontSize: 13 },

  // Tailor button
  // ── Build-63 dashboard toggle + export button + export modal ──────────
  dashToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8,
  },
  dashToggleText: { flex: 1, fontSize: 11, color: GOLD, fontWeight: '700' },
  exportRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  exportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '40',
    paddingVertical: 10,
  },
  exportBtnText: { fontSize: 11, color: GOLD, fontWeight: '700' },
  exportModalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)',
  },
  exportModalCard: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  exportModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  exportModalTitle: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  exportModalSub: { fontSize: 11, color: colors.t3, marginBottom: 14 },
  exportTemplateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 8,
  },
  exportTemplateLabel: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  exportTemplateHint: { fontSize: 11, color: colors.t3, marginTop: 2 },

  // Rewrite accept/reject modal
  rewriteModalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 20,
  },
  rewriteModalCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.bg, borderRadius: 16,
    borderWidth: 1, borderColor: colors.b1,
    padding: 16,
  },
  rewriteModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  rewriteModalTitle: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  rewriteLabelText: {
    fontSize: 9, color: colors.t3, fontWeight: '700',
    letterSpacing: 1, marginBottom: 4,
  },
  rewriteBefore: {
    fontSize: 12, color: colors.t2, lineHeight: 17,
    backgroundColor: CORAL + '08', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: CORAL + '20',
  },
  rewriteAfter: {
    fontSize: 12, color: colors.t1, fontWeight: '600', lineHeight: 17,
    backgroundColor: GREEN + '10', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: GREEN + '25',
  },
  rewriteChangesBlock: {
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: colors.b1,
  },
  rewriteChangeText: { fontSize: 10, color: colors.t3, lineHeight: 14 },
  rewriteActionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rewriteRejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.b1, borderRadius: 10, paddingVertical: 10,
  },
  rewriteRejectText: { fontSize: 12, color: colors.t3, fontWeight: '600' },
  rewriteAcceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: GOLD, borderRadius: 10, paddingVertical: 10,
  },
  rewriteAcceptText: { fontSize: 12, color: '#FFFFFF', fontWeight: '700' },

  tailorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.golddim, borderRadius: 10,
    paddingVertical: 10, marginBottom: 12,
    borderWidth: 1, borderColor: colors.goldbdr,
  },
  tailorBtnText: { fontSize: 13, fontWeight: '600', color: colors.gold },

  // Grid button
  gridBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.s1, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.b1,
  },
  gridBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  gridBtnTitle: { fontSize: 14, fontWeight: '600', color: colors.t1 },
  gridBtnRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gridBtnCount: { fontSize: 11, color: colors.t3 },

  // Bento grid
  bentoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  bentoContainer: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  bentoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20, paddingHorizontal: 4,
  },
  bentoTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 18, letterSpacing: 1, color: colors.t1 },
  bentoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  bentoCardLarge: {
    width: '100%', backgroundColor: colors.s1, borderRadius: 16, padding: 20,
    borderWidth: 1.5, borderColor: colors.b1, position: 'relative',
  },
  bentoCard: {
    width: '47.5%', backgroundColor: colors.s1, borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: colors.b1, position: 'relative',
  },
  bentoCardNew: {
    width: '47.5%', backgroundColor: colors.bg, borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: colors.goldbdr, borderStyle: 'dashed',
  },
  bentoCardSelected: {
    borderColor: colors.gold, backgroundColor: colors.golddim,
  },
  bentoCardIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.s2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  bentoCardTitle: { fontSize: 14, fontWeight: '700', color: colors.t1, marginBottom: 3 },
  bentoCardSub: { fontSize: 11, color: colors.t3 },
  bentoActiveDot: { position: 'absolute', top: 12, right: 12 },

  // Tailor modal
  tailorOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  tailorCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  tailorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tailorTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 1, color: colors.t1 },
  tailorSub: { fontSize: 12, color: colors.t2, marginBottom: 14, lineHeight: 18 },
  tailorInput: {
    backgroundColor: colors.s1, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 14, fontSize: 14, color: colors.t1, marginBottom: 10,
  },
  tailorSubmitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 14, marginTop: 6,
  },
  tailorSubmitText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#FFFFFF' },

  // Tailoring overlay
  tailoringOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  tailoringText: { fontSize: 14, color: colors.t2, marginTop: 16, textAlign: 'center', paddingHorizontal: 40 },
});