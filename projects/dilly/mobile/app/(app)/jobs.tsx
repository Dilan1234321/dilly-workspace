import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { getAutomationRisk } from '../../lib/automation-risk';
import InterestsPicker from '../../components/InterestsPicker';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { lookupCompanyATS } from '../../lib/atsLookup';
import { router, useLocalSearchParams } from 'expo-router';

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE  = '#0A84FF';
const INDIGO = '#5E5CE6';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequiredScores {
  smart?: number; grit?: number; build?: number;
  smart_why?: string; grit_why?: string; build_why?: string;
  overall_bar?: string;
}

interface Listing {
  id: string; title: string; company: string; location: string;
  description: string; url: string; posted_date: string; source: string;
  tags: string[]; team: string; remote: boolean; required_scores?: RequiredScores;
}

interface StudentScores { smart: number; grit: number; build: number; score: number; }

// Fallback when a listing hasn't been classified yet — competitive internship floor
const BASELINE_SCORES: RequiredScores = { smart: 65, grit: 65, build: 65 };

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = { Greenhouse: '#2ECC71', Lever: '#3498DB', Ashby: '#9B59B6', USAJOBS: '#E74C3C' };

function buildPersonalInsight(studentScores: StudentScores, rs: RequiredScores): string {
  const dims = [
    { key: 'smart' as const, label: 'Smart', mine: studentScores.smart, need: rs.smart ?? 0, why: rs.smart_why },
    { key: 'grit' as const, label: 'Grit', mine: studentScores.grit, need: rs.grit ?? 0, why: rs.grit_why },
    { key: 'build' as const, label: 'Build', mine: studentScores.build, need: rs.build ?? 0, why: rs.build_why },
  ];

  const gaps = dims.filter(d => d.need - d.mine > 0).sort((a, b) => (b.need - b.mine) - (a.need - a.mine));
  const clears = dims.filter(d => d.mine >= d.need);

  if (gaps.length === 0) {
    const strongest = dims.sort((a, b) => (b.mine - b.need) - (a.mine - a.need))[0];
    return `Your profile aligns well with this role. Lead your application with your ${strongest.label} experience to stand out from other candidates.`;
  }

  const biggest = gaps[0];
  const gap = biggest.need - biggest.mine;
  let insight = `Your ${biggest.label} is ${Math.round(biggest.mine)}, but this role looks for ${Math.round(biggest.need)} (${gap} point gap). `;

  if (biggest.why) {
    // Take the first sentence of the why explanation
    const firstSentence = biggest.why.split(/[.!]/)[0]?.trim();
    if (firstSentence) insight += firstSentence + '. ';
  }

  if (clears.length > 0) {
    insight += `Your ${clears.map(c => c.label).join(' and ')} ${clears.length > 1 ? 'are' : 'is'} already strong enough. Close the ${biggest.label} gap and you're competitive.`;
  } else {
    insight += `Focus on ${biggest.label} first since it's your biggest gap, then work on the others.`;
  }

  return insight;
}

function cleanDescription(d: string): string {
  if (!d) return '';
  // Strip all HTML tags (including malformed double-bracket ones)
  let text = d.replace(/<[^>]*>/g, ' ').replace(/[<>]+/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/<\/?\s*/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
  // Remove everything that looks like HTML/CSS artifacts
  text = text.replace(/div class[^.!?]*/gi, '').replace(/span style[^.!?]*/gi, '').replace(/font-family[^.!?]*/gi, '').replace(/font-size[^.!?]*/gi, '').replace(/content-intro[^.!?]*/gi, '').replace(/p>\s*/gi, '').replace(/12pt[^.!?]*/gi, '').trim();
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20 && !s.includes('{') && !s.includes('class='));
  return sentences.slice(0, 3).join(' ').slice(0, 350) + (text.length > 350 ? '...' : '');
}

function daysAgo(d: string): string {
  if (!d) return '';
  try {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today'; if (diff === 1) return '1d ago';
    if (diff < 7) return `${diff}d ago`; if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return `${Math.floor(diff / 30)}mo ago`;
  } catch { return ''; }
}

function dimColor(s: number, r: number): string { const g = Math.round((r - s) * 10) / 10; return g <= 0 ? GREEN : g <= 10 ? AMBER : CORAL; }
function gapLabel(s: number, r: number): string { const g = Math.round((r - s) * 10) / 10; return g <= 0 ? 'Ready' : g <= 10 ? `${g} pts away` : `${g} pts gap`; }

// ── Education Level Picker ────────────────────────────────────────────────────

const EDU_LEVELS = ['Undergraduate', 'Masters', 'PhD', 'MBA'];

function EducationPicker({ selected, onChange }: { selected: string; onChange: (v: string) => void }) {
  return (
    <View style={js.eduRow}>
      {EDU_LEVELS.map(level => (
        <AnimatedPressable
          key={level}
          style={[js.eduChip, selected === level && js.eduChipSelected]}
          onPress={() => onChange(level)}
          scaleDown={0.95}
        >
          <Text style={[js.eduChipText, selected === level && js.eduChipTextSelected]}>{level}</Text>
        </AnimatedPressable>
      ))}
    </View>
  );
}

// ── Dimension Bar ─────────────────────────────────────────────────────────────

function DimBar({ label, student, required }: { label: string; student: number; required: number }) {
  const color = dimColor(student, required);
  const gap = required - student;
  const pct = student / 100;
  return (
    <View style={js.dimBar}>
      <View style={js.dimBarHeader}>
        <Text style={js.dimBarLabel}>{label}</Text>
        <View style={js.dimBarScores}>
          <Text style={[js.dimBarYou, { color }]}>{Math.round(student)}</Text>
          <Text style={js.dimBarSlash}>/</Text>
          <Text style={js.dimBarReq}>{Math.round(required)}</Text>
        </View>
        {gap <= 0 ? <Ionicons name="checkmark-circle" size={12} color={GREEN} /> : <Text style={[js.dimBarGap, { color }]}>{gapLabel(student, required)}</Text>}
      </View>
      <View style={js.dimBarTrack}>
        <View style={[js.dimBarFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        <View style={[js.dimBarTarget, { left: `${Math.min((required / 100) * 100, 100)}%` }]} />
      </View>
    </View>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ listing, studentScores, studentProfile, userCohort, onApply, defaultExpanded }: {
  listing: Listing; studentScores: StudentScores | null; studentProfile: Record<string, any>; userCohort: string; onApply: (l: Listing) => void; defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const posted = daysAgo(listing.posted_date);
  const srcColor = SOURCE_COLORS[listing.source] || colors.t3;
  const rs = listing.required_scores;
  const hasRoleScores = rs && typeof rs.smart === 'number';
  const effectiveRs: RequiredScores = hasRoleScores ? rs! : BASELINE_SCORES;

  let readiness: 'ready' | 'close' | 'gap' | 'unknown' = 'unknown';
  const serverReadiness = (listing as any).readiness;
  if (serverReadiness === 'ready' || serverReadiness === 'almost' || serverReadiness === 'gap') {
    readiness = serverReadiness === 'almost' ? 'close' : serverReadiness;
  } else if (studentScores) {
    const dims = ['smart', 'grit', 'build'] as const;
    const worstGap = Math.max(...dims.map(dim => (effectiveRs[dim] ?? 0) - studentScores[dim]));
    readiness = worstGap <= 0 ? 'ready' : worstGap <= 10 ? 'close' : 'gap';
  }
  const rc = { ready: { color: GREEN, label: 'Ready', icon: 'checkmark-circle' as const }, close: { color: AMBER, label: 'Almost', icon: 'alert-circle' as const }, gap: { color: CORAL, label: 'Gap', icon: 'arrow-up-circle' as const }, unknown: { color: colors.t3, label: '', icon: 'help-circle' as const } }[readiness];
  const atsInfo = lookupCompanyATS(listing.company, listing.source);

  function tailorResume() {
    const p = studentProfile as any;
    const firstName = p.name?.trim().split(/\s+/)[0] || 'there';
    const cohort = p.track || p.cohort || 'General';
    openDillyOverlay({
      name: firstName, cohort,
      score: studentScores?.score || 0, smart: studentScores?.smart || 0,
      grit: studentScores?.grit || 0, build: studentScores?.build || 0,
      gap: 0, cohortBar: 75,
      referenceCompany: listing.company,
      applicationTarget: `${listing.title} at ${listing.company}`,
      isPaid: true,
      initialMessage: `Help me tailor my resume for the ${listing.title} role at ${listing.company}. What specific changes should I make to my bullet points and skills section to match this job and stand out to recruiters?`,
    });
  }

  function askDilly() {
    const p = studentProfile as any;
    const firstName = p.name?.trim().split(/\s+/)[0] || 'there';
    const cohort = p.track || p.cohort || 'General';
    let autoPrompt = `I'm looking at the ${listing.title} role at ${listing.company}.`;
    if (hasRoleScores && studentScores) {
      const gaps: string[] = []; const good: string[] = [];
      for (const [dim, label] of [['smart', 'Smart'], ['grit', 'Grit'], ['build', 'Build']] as const) {
        const mine = studentScores[dim]; const need = (rs as any)[dim] ?? 0;
        if (need - mine > 0) gaps.push(`my ${label} is ${Math.round(mine)} but they need ${Math.round(need)} (${need - mine} point gap)`);
        else good.push(label);
      }
      if (gaps.length > 0) {
        autoPrompt += ` My gaps: ${gaps.join(', ')}.`;
        if (good.length > 0) autoPrompt += ` I clear the bar on ${good.join(' and ')}.`;
        autoPrompt += ` What specific things should I do to close ${gaps.length === 1 ? 'this gap' : 'these gaps'} for this role?`;
      } else {
        autoPrompt += ` I clear the bar on all three dimensions. What should I focus on to stand out?`;
      }
    } else {
      autoPrompt += ` What do I need to be competitive for this role?`;
    }
    openDillyOverlay({ name: firstName, cohort, score: studentScores?.score || 0, smart: studentScores?.smart || 0, grit: studentScores?.grit || 0, build: studentScores?.build || 0, gap: 0, cohortBar: 75, referenceCompany: listing.company, applicationTarget: `${listing.title} at ${listing.company}`, isPaid: true, initialMessage: autoPrompt });
  }

  return (
    <AnimatedPressable style={js.jobCard} onPress={() => setExpanded(!expanded)} scaleDown={0.99}>
      <View style={js.cardOuter}>
        {readiness !== 'unknown' && <View style={[js.accentBar, { backgroundColor: rc.color }]} />}
        <View style={js.cardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 }}>
            <Text style={[js.cardTitle, { flex: 1 }]} numberOfLines={expanded ? 4 : 2}>{listing.title}</Text>
            {(() => { const risk = getAutomationRisk(listing.title); return (
              <View style={{ backgroundColor: risk.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: risk.border }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: risk.color }}>{risk.shortLabel}</Text>
              </View>
            ); })()}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <Text style={js.cardCompany}>{listing.company}</Text>
            {readiness !== 'unknown' && <Text style={[js.readinessLabel, { color: rc.color }]}> · {rc.label}</Text>}
          </View>
          <Text style={js.metaLine} numberOfLines={1}>
            {[listing.location, listing.remote ? 'Remote' : null, posted].filter(Boolean).join(' · ')}
          </Text>
      {(() => {
        const allCr: any[] = (listing as any).cohort_readiness || [];
        // Show only the user's matching cohort pill (or all if no cohort set)
        const visibleCr = userCohort
          ? allCr.filter(cr => (cr.cohort || '').toLowerCase() === userCohort.toLowerCase())
          : allCr;
        return visibleCr.length > 0 ? (
          <View style={js.cohortRow}>
            {visibleCr.map((cr: any, idx: number) => {
              const crColor = cr.readiness === 'ready' ? GREEN : cr.readiness === 'almost' ? AMBER : CORAL;
              return (
                <View key={idx} style={[js.cohortPill, { backgroundColor: crColor + '0D' }]}>
                  <Text style={[js.cohortPillText, { color: crColor }]}>{cr.cohort}</Text>
                </View>
              );
            })}
          </View>
        ) : null;
      })()}
        </View>
      </View>
      {expanded && (
        <View style={js.expandedSection}>
          {studentScores && (
            <View style={js.gapSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={js.gapTitle}>YOUR FIT</Text>
                {!hasRoleScores && <Text style={{ fontSize: 9, color: colors.t3, fontStyle: 'italic' }}>vs. competitive baseline</Text>}
              </View>
              {(() => {
                const allCr: any[] = (listing as any).cohort_readiness || [];
                // Show only the user's cohort scores in expanded view
                const matchedCr = userCohort
                  ? allCr.filter(cr => (cr.cohort || '').toLowerCase() === userCohort.toLowerCase())
                  : allCr;
                if (matchedCr.length > 0) {
                  return matchedCr.map((cr: any, idx: number) => (
                    <View key={idx} style={{ marginBottom: idx < matchedCr.length - 1 ? 12 : 0 }}>
                      <Text style={[js.gapTitle, { fontSize: 9, color: '#2B3A8E', marginBottom: 6 }]}>{cr.cohort}</Text>
                      <DimBar label="Smart" student={cr.student_smart ?? studentScores.smart} required={cr.required_smart ?? effectiveRs.smart ?? 0} />
                      <DimBar label="Grit" student={cr.student_grit ?? studentScores.grit} required={cr.required_grit ?? effectiveRs.grit ?? 0} />
                      <DimBar label="Build" student={cr.student_build ?? studentScores.build} required={cr.required_build ?? effectiveRs.build ?? 0} />
                    </View>
                  ));
                }
                return (
                  <>
                    <DimBar label="Smart" student={studentScores.smart} required={effectiveRs.smart ?? 0} />
                    <DimBar label="Grit" student={studentScores.grit} required={effectiveRs.grit ?? 0} />
                    <DimBar label="Build" student={studentScores.build} required={effectiveRs.build ?? 0} />
                  </>
                );
              })()}
              {effectiveRs.overall_bar && <Text style={js.overallBar}>{effectiveRs.overall_bar}</Text>}
              {atsInfo && (
            <View style={js.atsSection}>
              <View style={js.atsSectionHeader}>
                <Ionicons name="shield-checkmark" size={12} color={atsInfo.color} />
                <Text style={js.atsSectionTitle}>ATS COMPATIBILITY</Text>
              </View>
              <View style={js.atsRow}>
                <Text style={js.atsLabel}>System:</Text>
                <View style={[js.atsBadge, { backgroundColor: atsInfo.color + '15', borderColor: atsInfo.color + '30' }]}>
                  <Text style={[js.atsBadgeText, { color: atsInfo.color }]}>{atsInfo.system}</Text>
                </View>
                <View style={[js.atsBadge, {
                  backgroundColor: atsInfo.strictness === 'lenient' ? GREEN + '15' : atsInfo.strictness === 'moderate' ? AMBER + '15' : CORAL + '15',
                  borderColor: atsInfo.strictness === 'lenient' ? GREEN + '30' : atsInfo.strictness === 'moderate' ? AMBER + '30' : CORAL + '30',
                }]}>
                  <Text style={[js.atsBadgeText, {
                    color: atsInfo.strictness === 'lenient' ? GREEN : atsInfo.strictness === 'moderate' ? AMBER : CORAL,
                  }]}>{atsInfo.strictness}</Text>
                </View>
              </View>
              <Text style={js.atsTip}>{atsInfo.tips}</Text>
              {atsInfo.strictness === 'strict' && (
                <AnimatedPressable
                  style={js.atsFixBtn}
                  onPress={() => {
                    const p = studentProfile as any;
                    openDillyOverlay({
                      name: p.name?.trim().split(/\s+/)[0] || 'there',
                      cohort: p.track || 'General',
                      score: 0, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
                      referenceCompany: listing.company,
                      isPaid: true,
                      initialMessage: `${listing.company} uses ${atsInfo.system}, which is a strict ATS system. ${atsInfo.tips} Can you review my resume formatting and tell me exactly what to change to make it compatible with ${atsInfo.system}?`,
                    });
                  }}
                  scaleDown={0.97}
                >
                  <Ionicons name="construct" size={11} color={CORAL} />
                  <Text style={js.atsFixBtnText}>Check formatting with Dilly</Text>
                </AnimatedPressable>
              )}
            </View>
          )}
            </View>
          )}
          <Text style={js.description}>{cleanDescription(listing.description) || 'No description available.'}</Text>

          {hasRoleScores && studentScores && (
            <View style={js.insightWrap}>
              <Ionicons name="flash" size={12} color={GOLD} />
              <Text style={js.insightText}>{buildPersonalInsight(studentScores, rs)}</Text>
            </View>
          )}

          {hasRoleScores && studentScores && (
            <View style={js.scoringExplain}>
              <Text style={js.scoringTitle}>How this was calculated</Text>
              <Text style={js.scoringText}>
                Your scores were compared against requirements estimated by AI analysis of the job description. Readiness is based on your average fit across Smart, Grit, and Build.
              </Text>
            </View>
          )}

<View style={js.actionRow}>
            <Pressable style={js.applyBtn} onPress={(e) => { e.stopPropagation(); onApply(listing); }}>
              <Ionicons name="open-outline" size={13} color="#FFFFFF" />
              <Text style={js.applyBtnText}>Apply + Track</Text>
            </Pressable>
            <Pressable style={js.dillyBtn} onPress={(e) => { e.stopPropagation(); askDilly(); }}>
              <Ionicons name="chatbubble" size={12} color={GOLD} />
              <Text style={js.dillyBtnText}>Ask Dilly</Text>
            </Pressable>
            <Pressable style={js.tailorBtn} onPress={(e) => { e.stopPropagation(); tailorResume(); }}>
              <Ionicons name="document-text" size={12} color={INDIGO} />
              <Text style={js.tailorBtnText}>Tailor Resume</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AnimatedPressable>
  );
}

// ── Interests Setup Card ──────────────────────────────────────────────────────

function InterestsSetupCard({ profile, onComplete }: { profile: Record<string, any>; onComplete: () => void }) {
  // Auto-populate from majors and minors
  const majors: string[] = profile.majors || (profile.major ? [profile.major] : []);
  const minors: string[] = profile.minors || [];
  const autoPopulated = [...majors, ...minors].filter(Boolean);

  const existingInterests: string[] = profile.interests || [];
  const [interests, setInterests] = useState<string[]>(
    existingInterests.length > 0 ? existingInterests : [...autoPopulated]
  );
  const [eduLevel, setEduLevel] = useState(profile.education_level || 'Undergraduate');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (interests.length === 0) {
      Alert.alert('Pick at least one', 'Select at least one field of interest so we can find relevant jobs for you.');
      return;
    }
    setSaving(true);
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ interests, education_level: 'Undergraduate' }),
      });
      onComplete();
    } catch {
      Alert.alert('Error', 'Could not save interests.');
    }
    finally { setSaving(false); }
  }

  return (
    <View style={js.setupCard}>
      <View style={js.setupHeader}>
        <Ionicons name="compass" size={20} color={GOLD} />
        <Text style={js.setupTitle}>What fields interest you?</Text>
      </View>
      <Text style={js.setupSub}>
        Select the career fields you're interested in. Your major{majors.length > 0 ? `${majors.length > 1 ? 's are' : ' is'} pre-selected` : 's will be auto-added'}.
      </Text>

      <Text style={js.setupSectionLabel}>YOUR INTERESTS</Text>
      <InterestsPicker
        selected={interests}
        onChange={setInterests}
        autoPopulated={autoPopulated}
        maxVisible={15}
      />



      <AnimatedPressable
        style={[js.setupBtn, saving && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={saving}
        scaleDown={0.97}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={js.setupBtnText}>Show my jobs</Text>
          </>
        )}
      </AnimatedPressable>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusJobId = (params?.focus || '').toString();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterRemote, setFilterRemote] = useState(false);
  const [filterCompany, setFilterCompany] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filterReadiness, setFilterReadiness] = useState<'all' | 'ready' | 'close' | 'gap'>('all');
  const [activeTab, setActiveTab] = useState<'internship' | 'entry_level' | 'all'>('all');
  const [companies, setCompanies] = useState<{ name: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [filtered, setFiltered] = useState(false);
  const [interestsUsed, setInterestsUsed] = useState<string[]>([]);
  const [studentScores, setStudentScores] = useState<StudentScores | null>(null);
  const [rubricAnalysis, setRubricAnalysis] = useState<any>(null);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [needsSetup, setNeedsSetup] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Load profile + scores
  useEffect(() => {
    (async () => {
      try {
        const [auditRes, profileRes] = await Promise.all([
          dilly.get('/audit/latest'),
          dilly.get('/profile'),
        ]);
        const p = profileRes || {};
        setProfile(p);

        // Check if interests are set
        const hasInterests = (p.interests && Array.isArray(p.interests) && p.interests.length > 0);
        setNeedsSetup(!hasInterests);

        const audit = auditRes?.audit;
        const ra = audit?.rubric_analysis;
        if (audit?.final_score) {
          // Prefer per-cohort scores from rubric_analysis (compares apples-to-apples
          // with each job's per-cohort requirements). Fall back to overall scores.
          setStudentScores({
            score: audit.final_score,
            smart: ra?.primary_smart ?? audit.scores?.smart ?? 0,
            grit:  ra?.primary_grit  ?? audit.scores?.grit  ?? 0,
            build: ra?.primary_build ?? audit.scores?.build ?? 0,
          });
        }
        if (ra) {
          setRubricAnalysis(ra);
        }
      } catch {}
      finally { setProfileLoaded(true); }
    })();
  }, []);

  // Fetch listings
  const fetchListings = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('tab', activeTab);
      params.set('limit', '100');
      if (search.trim()) params.set('q', search.trim());
      if (filterCompany) params.set('company', filterCompany);
      if (filterReadiness !== 'all') params.set('readiness', filterReadiness === 'close' ? 'almost' : filterReadiness);
      const res = await dilly.fetch(`/v2/internships/feed?${params.toString()}`);
      const data = await res.json();
      const parsed = (data.listings || []).map((l: any) => {
        // Map v2 response to existing Listing shape
        const cr = l.cohort_readiness || [];
        const first = cr[0] || {};
        // Only show US + Canada listings
        const city = (l.location_city || '').toLowerCase();
        const state = (l.location_state || '').toLowerCase();
        const loc = city + ' ' + state;
        const isRemote = (l.work_mode === 'remote') || city.includes('remote');
        const isUS = !!state.match(/^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)$/i) || loc.includes('united states') || loc.includes('usa');
        const isCanada = loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver') || loc.includes('montreal') || loc.includes('calgary') || loc.includes('ottawa') || !!state.match(/^(on|bc|ab|qc|mb|sk|ns|nb|nl|pe|nt|yt|nu)$/i);
        const isIntl = !isRemote && !isUS && !isCanada && city.length > 0;
        return {
          id: l.id,
          title: l.title,
          company: l.company,
          _skip: !!isIntl,
          location: [l.location_city, l.location_state].filter(Boolean).join(', ') || l.work_mode || 'Unknown',
          description: l.description_preview || '',
          url: l.apply_url || '',
          posted_date: l.posted_date || '',
          source: 'Greenhouse',
          tags: [],
          team: '',
          remote: l.work_mode === 'remote',
          job_type: l.job_type,
          readiness: l.readiness,
          rank_score: l.rank_score,
          required_scores: {
            // Prefer cohort-specific requirements; fall back to the flat fields
            // on the listing so every card shows SGB requirements even when no
            // cohort match was computed.
            smart: first.required_smart ?? l.required_smart,
            grit:  first.required_grit  ?? l.required_grit,
            build: first.required_build ?? l.required_build,
          },
          student_scores_override: {
            smart: first.student_smart,
            grit: first.student_grit,
            build: first.student_build,
          },
          cohort_readiness: cr,
        };
      });
      setListings(parsed.filter((l: any) => !l._skip));
      setTotal(data.total || 0);
      setFiltered(!!search || !!filterCompany);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [search, filterCompany, activeTab, filterReadiness]);

  // Fetch companies
  useEffect(() => {
    // Companies are extracted from listings
    if (listings.length > 0) {
      const counts: Record<string, number> = {};
      listings.forEach(l => { counts[l.company] = (counts[l.company] || 0) + 1; });
      setCompanies(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })));
    }
  }, []);

  // Fetch listings once profile is loaded
  useEffect(() => {
    if (profileLoaded && !needsSetup) fetchListings();
  }, [profileLoaded, needsSetup, fetchListings, activeTab]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Apply + Track
  async function handleApply(listing: Listing) {
    if (listing.url) Linking.openURL(listing.url);
    try { await dilly.post(`/v2/internships/save?internship_id=${listing.id}`); } catch {}
    try {
      await dilly.fetch('/applications', {
        method: 'POST',
        body: JSON.stringify({
          company: listing.company, role: listing.title, status: 'applied',
          job_id: listing.id, job_url: listing.url,
          applied_at: new Date().toISOString().slice(0, 10),
          notes: `Applied via ${listing.source}. ${listing.location}`,
        }),
      });
      Alert.alert('Tracked', `${listing.company} added to your Internship Tracker.`);
    } catch {}
  }

  // After setup completes
  function handleSetupComplete() {
    setNeedsSetup(false);
    // Reload profile to get updated interests
    (async () => {
      try {
        const res = await dilly.fetch('/profile');
        const p = await res.json();
        setProfile(p || {});
      } catch {}
    })();
    fetchListings();
  }

  const primaryCohortId = rubricAnalysis?.primary_cohort_id || '';
  const isPreHealth = primaryCohortId === 'pre_health';
  const isPreLaw = primaryCohortId === 'pre_law';
  const isAdmissionsCohort = isPreHealth || isPreLaw;
  const pageTitle = isAdmissionsCohort ? 'Opportunities' : 'Internships';
  const itemNoun = isAdmissionsCohort ? 'opportunit' : 'internship';
  const itemPlural = (n: number) => isAdmissionsCohort ? (n === 1 ? 'opportunity' : 'opportunities') : (n === 1 ? 'internship' : 'internships');

  return (
    <View style={[js.container, { paddingTop: insets.top }]}>

      <FadeInView delay={0}>
      <View style={js.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={js.headerTitle}>{pageTitle}</Text>
              {!needsSetup && (
                <Text style={js.headerSub}>
                  {total} {filtered ? 'relevant ' : ''}{itemPlural(total)}
                  {filtered && interestsUsed.length > 0 ? ` for ${interestsUsed.slice(0, 2).join(', ')}${interestsUsed.length > 2 ? '...' : ''}` : ''}
                </Text>
              )}
            </View>
            <AnimatedPressable style={js.atsHeaderBtn} onPress={() => router.push('/(app)/ats')} scaleDown={0.95}>
              <Ionicons name="shield-checkmark" size={14} color={GOLD} />
              <Text style={js.atsHeaderBtnText}>ATS Scan</Text>
            </AnimatedPressable>
          </View>
        </View>
      </FadeInView>

      {/* Loading state — show spinner until profile is loaded */}
      {!profileLoaded ? (
        <View style={js.loadingWrap}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={js.loadingText}>Loading...</Text>
        </View>
      ) : needsSetup ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[js.scroll, { paddingBottom: insets.bottom + 40 }]}>
          <FadeInView delay={100}>
            <InterestsSetupCard profile={profile} onComplete={handleSetupComplete} />
          </FadeInView>
        </ScrollView>
      ) : (
        <>
          {/* Search */}
          <FadeInView delay={40}>
            <View style={js.searchWrap}>
              <Ionicons name="search" size={16} color={colors.t3} />
              <TextInput style={js.searchInput} value={searchInput} onChangeText={setSearchInput} placeholder="Search roles, companies, skills..." placeholderTextColor={colors.t3} returnKeyType="search" />
              {searchInput.length > 0 && (
                <AnimatedPressable onPress={() => { setSearchInput(''); setSearch(''); }} scaleDown={0.9} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.t3} />
                </AnimatedPressable>
              )}
            </View>
          </FadeInView>

          {/* Job Type Tabs */}
          <FadeInView delay={50}>
            <View style={js.tabRow}>
              {([['all', 'All'], ['internship', 'Internships'], ['entry_level', 'Entry-Level']] as const).map(([key, label]) => (
                <AnimatedPressable
                  key={key}
                  style={[js.tab, activeTab === key && js.tabActive]}
                  onPress={() => { setActiveTab(key); }}
                  scaleDown={0.95}
                >
                  <Text style={[js.tabText, activeTab === key && js.tabTextActive]}>{label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </FadeInView>

          {/* Filters */}
          <FadeInView delay={60}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={js.filterRow}>
              <AnimatedPressable
                style={js.settingsIcon}
                onPress={() => setNeedsSetup(true)}
                scaleDown={0.9}
              >
                <Ionicons name="options-outline" size={15} color={colors.t3} />
              </AnimatedPressable>
              <AnimatedPressable
                style={[js.filterChip, showAll && { backgroundColor: BLUE + '20', borderColor: BLUE + '40' }]}
                onPress={() => setShowAll(!showAll)}
                scaleDown={0.95}
              >
                <Text style={[js.filterText, showAll && { color: BLUE }]}>{showAll ? 'All jobs' : 'For you'}</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={[js.filterChip, filterRemote && { backgroundColor: GREEN + '20', borderColor: GREEN + '40' }]}
                onPress={() => setFilterRemote(!filterRemote)}
                scaleDown={0.95}
              >
                <Ionicons name="globe-outline" size={11} color={filterRemote ? GREEN : colors.t3} />
                <Text style={[js.filterText, filterRemote && { color: GREEN }]}>Remote</Text>
              </AnimatedPressable>
              {(['ready', 'close', 'gap'] as const).map(r => {
                const cfg = { ready: { color: GREEN, label: 'Ready', icon: 'checkmark-circle' }, close: { color: AMBER, label: 'Almost', icon: 'alert-circle' }, gap: { color: CORAL, label: 'Gap', icon: 'arrow-up-circle' } }[r];
                const active = filterReadiness === r;
                return (
                  <AnimatedPressable
                    key={r}
                    style={[js.filterChip, active && { backgroundColor: cfg.color + '20', borderColor: cfg.color + '40' }]}
                    onPress={() => setFilterReadiness(active ? 'all' : r)}
                    scaleDown={0.95}
                  >
                    <Text style={[js.filterText, active && { color: cfg.color }]}>{cfg.label}</Text>
                  </AnimatedPressable>
                );
              })}
              {filterCompany && (
                <AnimatedPressable style={[js.filterChip, { backgroundColor: GOLD + '20', borderColor: GOLD + '40' }]} onPress={() => setFilterCompany(null)} scaleDown={0.95}>
                  <Text style={[js.filterText, { color: GOLD }]}>{filterCompany}</Text>
                  <Ionicons name="close" size={10} color={GOLD} />
                </AnimatedPressable>
              )}

              {!filterCompany && companies.slice(0, 7).map(c => (
                <AnimatedPressable key={c.name} style={js.filterChip} onPress={() => setFilterCompany(c.name)} scaleDown={0.95}>
                  <Text style={js.filterText}>{c.name} ({c.count})</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </FadeInView>

          {/* Listings */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[js.scroll, { paddingBottom: insets.bottom + 80 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchListings(true)} tintColor={GOLD} />}
          >
            {loading ? (
              <View style={js.loadingWrap}>
                <ActivityIndicator size="large" color={GOLD} />
                <Text style={js.loadingText}>Loading internships...</Text>
              </View>
            ) : listings.length === 0 ? (
              <FadeInView delay={0}>
                <View style={js.emptyWrap}>
                  <Ionicons name="briefcase-outline" size={40} color={colors.t3 + '30'} />
                  <Text style={js.emptyTitle}>{filtered ? `No relevant ${itemPlural(2)}` : `No ${itemPlural(2)} found`}</Text>
                  <Text style={js.emptyText}>
                    {filtered ? 'Try adding more interests in your profile, or tap "All jobs" to see everything.' : search ? `No results for "${search}".` : 'Pull to refresh.'}
                  </Text>
                  {Array.isArray(rubricAnalysis?.fastest_path_moves) && rubricAnalysis.fastest_path_moves.length > 0 && (
                    <View style={{ marginTop: 18, width: '100%', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.5, marginBottom: 8 }}>
                        {isAdmissionsCohort ? 'THIS WEEK\'S ACTIONS' : 'YOUR PATH THIS WEEK'}
                      </Text>
                      {rubricAnalysis.fastest_path_moves.slice(0, 3).map((m: any, idx: number) => (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: GOLD }}>{idx + 1}</Text>
                          </View>
                          <Text style={{ flex: 1, fontSize: 12, color: colors.t1, lineHeight: 17 }}>
                            {typeof m === 'string' ? m : (m.action || m.label || m.title || '')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {filtered && (
                    <AnimatedPressable style={js.showAllInlineBtn} onPress={() => setShowAll(true)} scaleDown={0.97}>
                      <Text style={js.showAllInlineBtnText}>Show all jobs</Text>
                    </AnimatedPressable>
                  )}
                </View>
              </FadeInView>
            ) : (
              (() => {
                // For card-internal cohort matching (DimBars per cohort), use the
                // RICH cohort name (matches cohort_readiness[].cohort from the API).
                // The rubric snake_case ID is only the lookup key.
                const userCohort = (
                  rubricAnalysis?.primary_cohort_display_name ||
                  (profile as any).cohort ||
                  (profile as any).track ||
                  ''
                ).toLowerCase();
                // Top 3 close-to-ready jobs for "Your Path This Week"
                const pathJobs = [...listings]
                  .filter((l: any) => l.readiness === 'ready' || l.readiness === 'almost')
                  .sort((a: any, b: any) => {
                    const order: Record<string, number> = { ready: 0, almost: 1 };
                    return (order[a.readiness] ?? 9) - (order[b.readiness] ?? 9);
                  })
                  .slice(0, 3);
                const pathHeader = (
                  pathJobs.length > 0 ? (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.5, marginBottom: 6, marginLeft: 4 }}>
                        {isAdmissionsCohort ? 'READY TO APPLY' : 'YOUR PATH THIS WEEK'}
                      </Text>
                    </View>
                  ) : null
                );
                void pathHeader; // reserved — cards below already highlight readiness
                // When "For you" mode: filter to listings matching user's cohort (or uncategorized)
                const visibleListings = showAll || !userCohort
                  ? listings
                  : listings.filter((l: any) => {
                      const cr: any[] = l.cohort_readiness || [];
                      if (cr.length === 0) return true; // uncategorized — show for all
                      return cr.some(entry => (entry.cohort || '').toLowerCase() === userCohort);
                    });
                // If a focus job id was passed (deep link from home screen
                // top-matches), pin that listing to the top and auto-expand it.
                let orderedListings = visibleListings;
                if (focusJobId) {
                  const focusIdx = visibleListings.findIndex((l: any) => l.id === focusJobId);
                  if (focusIdx > 0) {
                    orderedListings = [
                      visibleListings[focusIdx],
                      ...visibleListings.slice(0, focusIdx),
                      ...visibleListings.slice(focusIdx + 1),
                    ];
                  }
                }
                return orderedListings.map((listing, i) => (
                  <FadeInView key={listing.id} delay={Math.min(i * 25, 250)}>
                    <JobCard
                      listing={listing}
                      studentScores={studentScores}
                      studentProfile={profile}
                      userCohort={userCohort}
                      onApply={handleApply}
                      defaultExpanded={listing.id === focusJobId}
                    />
                  </FadeInView>
                ));
              })()
            )}
            {listings.length > 0 && (
                  <View style={js.legendWrap}>
                    <View style={js.legendRow}><View style={[js.legendDot, { backgroundColor: GREEN }]} /><Text style={js.legendText}>Ready: 90%+ match across all dimensions</Text></View>
                    <View style={js.legendRow}><View style={[js.legendDot, { backgroundColor: AMBER }]} /><Text style={js.legendText}>Almost: 75-89% match, small gaps to close</Text></View>
                    <View style={js.legendRow}><View style={[js.legendDot, { backgroundColor: CORAL }]} /><Text style={js.legendText}>Gap: Below 75%, real work needed</Text></View>
                  </View>
                )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const js = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  
  // Header
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontFamily: 'Cinzel_900Black', fontSize: 28, letterSpacing: 2, color: '#1A1A2E' },
  headerSub: { fontSize: 13, color: 'rgba(26,26,46,0.5)', marginTop: 4, fontWeight: '400' },
  atsHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(43,58,142,0.06)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  atsHeaderBtnText: { fontSize: 11, fontWeight: '600', color: '#2B3A8E' },

  // Setup
  setupCard: { backgroundColor: '#F7F8FC', borderRadius: 20, padding: 24, marginBottom: 20, marginHorizontal: 20 },
  setupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  setupTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 18, color: '#1A1A2E' },
  setupSub: { fontSize: 14, color: 'rgba(26,26,46,0.5)', lineHeight: 22, marginBottom: 20 },
  setupSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#2B3A8E', marginBottom: 10, textTransform: 'uppercase' },
  setupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2B3A8E', borderRadius: 16, paddingVertical: 16, marginTop: 24 },
  setupBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 15, letterSpacing: 1, color: '#FFFFFF' },

  // Education picker
  eduRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  eduChip: { backgroundColor: '#EFF0F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  eduChipSelected: { backgroundColor: 'rgba(94,92,230,0.15)' },
  eduChipText: { fontSize: 13, color: 'rgba(26,26,46,0.5)', fontWeight: '500' },
  eduChipTextSelected: { color: '#5E5CE6' },

  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F7F8FC', borderRadius: 14, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 13 },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 0 },

  // Tabs
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 6, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: '#F7F8FC', alignItems: 'center' },
  tabActive: { backgroundColor: '#2B3A8E' },
  tabText: { fontSize: 13, fontWeight: '700', color: 'rgba(26,26,46,0.5)' },
  tabTextActive: { color: '#FFFFFF' },

  // Filters
  filterRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  filterChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#EFF0F6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  filterText: { fontSize: 12, color: 'rgba(26,26,46,0.5)', fontWeight: '500' },
  settingsIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F7F8FC', alignItems: 'center', justifyContent: 'center' },

  // Scroll
  scroll: { paddingHorizontal: 20, paddingTop: 4 },

  // Job Card — Robinhood inspired
  jobCard: { backgroundColor: '#F7F8FC', borderRadius: 14, marginBottom: 6, overflow: 'hidden' },
  cardOuter: { flexDirection: 'row' },
  accentBar: { width: 3, borderRadius: 0 },
  cardInner: { flex: 1, padding: 16, paddingLeft: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', letterSpacing: -0.3, lineHeight: 23 },
  cardCompany: { fontSize: 14, color: 'rgba(26,26,46,0.45)', marginTop: 3, fontWeight: '500' },
  readinessLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  metaLine: { fontSize: 13, color: 'rgba(26,26,46,0.3)', marginTop: 6 },

  // Legacy — keep for compat
  readinessBadge: { display: 'none' },
  readinessText: { display: 'none' },
  metaRow: { display: 'none' },
  metaChip: { display: 'none' },
  metaText: { fontSize: 12, color: 'rgba(26,26,46,0.3)' },
  sourceBadge: { display: 'none' },
  sourceBadgeText: { display: 'none' },

  // Cohort pills
  cohortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  cohortPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cohortPillText: { fontSize: 11, fontWeight: '600' },
  cohortBadge: { display: 'none' },
  cohortLevel: { display: 'none' },
  cohortName: { display: 'none' },

  // Tags — hidden in new design
  tagRow: { display: 'none' },
  tag: { display: 'none' },
  tagText: { display: 'none' },

  // Expanded section
  expandedSection: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EFF0F6' },
  
  // Fit section
  gapSection: { backgroundColor: '#EFF0F6', borderRadius: 14, padding: 16, marginBottom: 12 },
  gapTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: '#2B3A8E', marginBottom: 14, textTransform: 'uppercase' },

  // Dimension bars — clean and precise
  dimBar: { marginBottom: 10 },
  dimBarHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dimBarLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(26,26,46,0.45)', width: 44 },
  dimBarScores: { flexDirection: 'row', alignItems: 'baseline' },
  dimBarYou: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dimBarSlash: { fontSize: 12, color: 'rgba(26,26,46,0.3)', marginHorizontal: 2 },
  dimBarReq: { fontSize: 12, color: 'rgba(26,26,46,0.3)', fontVariant: ['tabular-nums'] },
  dimBarGap: { fontSize: 11, fontWeight: '600', marginLeft: 'auto' },
  dimBarTrack: { height: 3, backgroundColor: '#EFF0F6', borderRadius: 999, overflow: 'visible', position: 'relative' },
  dimBarFill: { height: '100%', borderRadius: 999 },
  dimBarTarget: { position: 'absolute', top: -3, width: 2, height: 9, backgroundColor: 'rgba(26,26,46,0.3)', borderRadius: 1 },
  overallBar: { fontSize: 12, color: '#2B3A8E', marginTop: 10, lineHeight: 18, fontWeight: '500' },

  // Description
  description: { fontSize: 13, color: 'rgba(26,26,46,0.5)', lineHeight: 20, marginBottom: 14 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10 },
  applyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2B3A8E', borderRadius: 14, paddingVertical: 14 },
  applyBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5, color: '#FFFFFF' },
  dillyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(43,58,142,0.08)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  dillyBtnText: { fontSize: 13, fontWeight: '700', color: '#2B3A8E' },
  tailorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(94,92,230,0.08)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  tailorBtnText: { fontSize: 13, fontWeight: '700', color: '#5E5CE6' },

  // Loading / Empty
  loadingWrap: { alignItems: 'center', paddingTop: 80, gap: 16 },
  loadingText: { fontSize: 13, color: 'rgba(26,26,46,0.3)' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  emptyText: { fontSize: 14, color: 'rgba(26,26,46,0.3)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 24 },
  showAllInlineBtn: { backgroundColor: 'rgba(10,132,255,0.1)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 10 },
  showAllInlineBtnText: { fontSize: 13, color: '#0A84FF', fontWeight: '600' },

  // Insight
  insightWrap: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(43,58,142,0.05)', borderRadius: 14, padding: 14, marginBottom: 12, alignItems: 'flex-start' },
  insightText: { flex: 1, fontSize: 13, color: '#2B3A8E', lineHeight: 20, fontWeight: '500' },

  // ATS
  atsSection: { backgroundColor: '#EFF0F6', borderRadius: 14, padding: 16, marginBottom: 12 },
  atsSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  atsSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: 'rgba(26,26,46,0.3)', textTransform: 'uppercase' },
  atsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  atsLabel: { fontSize: 12, color: 'rgba(26,26,46,0.3)' },
  atsBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  atsBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  atsTip: { fontSize: 12, color: 'rgba(26,26,46,0.5)', lineHeight: 18, marginBottom: 8 },
  atsFixBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,69,58,0.08)', borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  atsFixBtnText: { fontSize: 11, fontWeight: '600', color: '#FF453A' },

  // Scoring explain
  scoringExplain: { backgroundColor: '#F7F8FC', borderRadius: 12, padding: 12, marginBottom: 12 },
  scoringTitle: { fontSize: 10, fontWeight: '700', color: 'rgba(26,26,46,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  scoringText: { fontSize: 11, color: 'rgba(26,26,46,0.3)', lineHeight: 16, marginBottom: 6 },
  scoringDetail: { fontSize: 11, color: 'rgba(26,26,46,0.3)', lineHeight: 16, fontStyle: 'italic' },

  // Legend
  legendWrap: { paddingVertical: 20, paddingHorizontal: 4, gap: 8, borderTopWidth: 1, borderTopColor: '#EFF0F6', marginTop: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 11, color: 'rgba(26,26,46,0.3)' },
});