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
} from 'react-native';
import { router } from 'expo-router';
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
import { apiFetch } from '../../lib/auth';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
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
        <Text style={rs.bScoreHint} numberOfLines={2}>
          <Ionicons name="bulb-outline" size={10} color={GOLD} /> {score.hints[0]}
        </Text>
      )}
    </View>
  );
}

// ── Inline editable field (resume-style) ──────────────────────────────────────

function InlineField({ value, onChangeText, placeholder, style, bold, large, muted }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  style?: any; bold?: boolean; large?: boolean; muted?: boolean;
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
      onFocus={() => setFocused(true)}
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
      const res = await apiFetch('/resume/bullet-score', {
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

  function handleAskDilly() {
    if (bullet.text.trim().length < 10) return;
    const score = localScore?.score ?? 0;
    const scoreLabel = sLabel(score);
    openDillyOverlay({
      isPaid: true,
      initialMessage: `Help me improve this resume bullet. It currently scores ${score}/100 (${scoreLabel}). Show me a rewritten version that would score higher, and explain what you changed and why. Do NOT use any emojis or special unicode characters.\n\nMy bullet: "${bullet.text}"`,
    });
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
        <InlineField value={contact.linkedin} onChangeText={v => set('linkedin', v)} placeholder="linkedin.com/in/you" muted style={{ flex: 1 }} />
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
  const insets = useSafeAreaInsets();

  const [sections, setSections]     = useState<ResumeSection[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [major, setMajor]           = useState('');
  const [bulletScores, setBulletScores] = useState<Record<string, number>>({});
  const [overallScore, setOverallScore] = useState(0);
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [variants, setVariants]     = useState<any[]>([]);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);

  // Load resume + profile for major
  useEffect(() => {
    (async () => {
      try {
        const [resumeRes, profileRes, auditRes] = await Promise.all([
          apiFetch('/resume/edited').then(r => r.json()),
          apiFetch('/profile').then(r => r.json()),
          apiFetch('/audit/latest').then(r => r.json()).catch(() => null),
        ]);
        setMajor(profileRes?.majors?.[0] || profileRes?.major || '');

        // Seed initial score from latest audit or profile
        const auditObj = auditRes?.audit ?? auditRes;
        const fs = auditObj?.final_score
          || profileRes?.overall_dilly_score
          || 0;
        if (fs > 0) {
          setInitialScore(Math.round(Number(fs)));
          setOverallScore(Math.round(Number(fs)));
        }
        if (resumeRes?.resume?.sections?.length) {
          setSections(resumeRes.resume.sections);
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

      // Fetch resume variants
      apiFetch('/resume/variants').then(r => r.json()).then(data => {
        setVariants(data?.variants || []);
      }).catch(() => {});
    })();
  }, []);

  // Recalculate overall score when bullet scores change
  // Only switch from the initial audit score once the user has actually made edits
  useEffect(() => {
    if (!hasChanges) {
      // No edits yet — keep showing the real audit score
      if (initialScore !== null) setOverallScore(initialScore);
      return;
    }
    const scores = Object.values(bulletScores);
    if (scores.length === 0) { setOverallScore(initialScore ?? 0); return; }
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    // Blend bullet avg with section completeness
    let completionBonus = 0;
    let totalSections = 0;
    for (const sec of sections) {
      const c = sectionCompleteness(sec);
      if (c.total > 0) {
        completionBonus += c.filled / c.total;
        totalSections++;
      }
    }
    const completionPct = totalSections > 0 ? completionBonus / totalSections : 0;
    const blended = Math.round(avg * 0.7 + completionPct * 100 * 0.3);
    setOverallScore(Math.min(100, blended));
  }, [bulletScores, sections, hasChanges, initialScore]);

  const ph = getPlaceholders(major);

  function toggleSection(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => prev === key ? null : key);
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

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiFetch('/resume/save', { method: 'POST', body: JSON.stringify({ sections }) });
      if (!res.ok) throw new Error();
      setHasChanges(false);
      Alert.alert('Saved', 'Your resume has been saved.');
    } catch { Alert.alert('Error', 'Could not save resume.'); }
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

        {/* Resume variants */}
        {variants.length > 0 && (
          <View style={rs.variantSection}>
            <Text style={rs.variantLabel}>MY RESUMES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rs.variantRow}>
              <TouchableOpacity
                style={[rs.variantChip, !activeVariant && rs.variantChipActive]}
                onPress={() => setActiveVariant(null)}
              >
                <Text style={[rs.variantChipText, !activeVariant && rs.variantChipTextActive]}>Base Resume</Text>
              </TouchableOpacity>
              {variants.map((v: any) => (
                <TouchableOpacity
                  key={v.id}
                  style={[rs.variantChip, activeVariant === v.id && rs.variantChipActive]}
                  onPress={() => {
                    setActiveVariant(v.id);
                    apiFetch(`/resume/variants/${v.id}`).then(r => r.json()).then(data => {
                      if (data?.resume?.sections) setSections(data.resume.sections);
                    }).catch(() => {});
                  }}
                >
                  <Text style={[rs.variantChipText, activeVariant === v.id && rs.variantChipTextActive]} numberOfLines={1}>
                    {v.label || v.job_company || 'Variant'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Overall strength */}
        <FadeInView delay={60}>
          <StrengthMeter score={overallScore} />
        </FadeInView>

        {/* Resume document */}
        <FadeInView delay={120}>
          <View style={rs.resumeDoc}>

            {/* Sections as accordion */}
            {sections.map((sec, i) => {
              const comp = sectionCompleteness(sec);
              const isOpen = expanded === sec.key;

              return (
                <View key={sec.key}>
                  {/* Section header (like a resume section divider) */}
                  <AnimatedPressable style={rs.sectionDivider} onPress={() => toggleSection(sec.key)} scaleDown={0.995}>
                    <View style={rs.sectionDividerLine} />
                    <View style={rs.sectionDividerLabel}>
                      <Ionicons name={sectionIcon(sec.key) as any} size={11} color={GOLD} />
                      <Text style={rs.sectionDividerText}>{sec.label.toUpperCase()}</Text>
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

        {/* Re-audit */}
        <FadeInView delay={300}>
          <AnimatedPressable style={rs.reauditBtn} onPress={() => Alert.alert('Re-audit', 'Re-auditing requires a Dilly Pro subscription. Upgrade in Settings.')} scaleDown={0.97}>
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={rs.reauditBtnText}>Re-audit my resume</Text>
          </AnimatedPressable>
          <Text style={rs.reauditHint}>Score your entire resume with one tap</Text>
        </FadeInView>

      </ScrollView>
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

  // Resume document
  resumeDoc: {
    backgroundColor: colors.s1, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    overflow: 'hidden', paddingVertical: 8,
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
});