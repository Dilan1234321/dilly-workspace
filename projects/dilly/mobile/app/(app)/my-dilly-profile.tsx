/**
 * MY DILLY. Your Career DNA.
 *
 * Not a settings page. Not a list of facts. A living, breathing
 * representation of who you are professionally. everything Dilly
 * knows, visualized beautifully.
 *
 * Sections:
 * 1. Identity Card (premium gradient hero)
 * 2. Talk to Dilly (rotating conversation starter)
 * 3. Strengths Map (visual grid of career strengths)
 * 4. Skills Cloud (tag cloud with confidence sizing)
 * 5. Experiences (timeline with extracted details)
 * 6. Generated Resumes Gallery
 * 7. What Dilly Still Needs (missing profile areas)
 * 8. Profile Activity
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  LayoutAnimation, RefreshControl, Animated, Easing,
  Dimensions, Image, TextInput, Keyboard, Alert, Switch, Modal,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { CAREER_FIELDS as CAREER_FIELD_OPTIONS, ALL_COHORTS, MAJOR_TO_COHORTS, detectCohorts } from '../../lib/cohorts';
import { mediumHaptic } from '../../lib/haptics';
import { useAppMode } from '../../hooks/useAppMode';
import { useSituationCopy } from '../../hooks/useSituationCopy';
import { useCachedFetch } from '../../lib/sessionCache';
import { applyPathOverrides } from '../../lib/pathCategories';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { useResolvedTheme, ResolvedTheme } from '../../hooks/useTheme';
import { useExtractionState } from '../../hooks/useExtractionPending';
import AnimatedPressable from '../../components/AnimatedPressable';
import { FirstVisitCoach } from '../../components/FirstVisitCoach';
import FadeInView from '../../components/FadeInView';
import DillyFooter from '../../components/DillyFooter';
import DillyCardEditor, { type CardData } from '../../components/DillyCard';
import { DillyFace } from '../../components/DillyFace';
import InlinePopup, { type PopupAction } from '../../components/InlinePopup';
import InlineToastView, { useInlineToast } from '../../components/InlineToast';

const W = Dimensions.get('window').width;
const GOLD = '#2B3A8E';
const COBALT = '#1652F0';
const CYAN = '#58A6FF';

const US_CANADA_CITIES = [
  'New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 'Chicago, IL', 'Boston, MA',
  'Seattle, WA', 'Austin, TX', 'Denver, CO', 'Miami, FL', 'Washington, DC',
  'Atlanta, GA', 'Dallas, TX', 'Houston, TX', 'San Diego, CA', 'Philadelphia, PA',
  'Phoenix, AZ', 'Portland, OR', 'Nashville, TN', 'Charlotte, NC', 'Raleigh, NC',
  'Minneapolis, MN', 'San Jose, CA', 'Pittsburgh, PA', 'Detroit, MI', 'Salt Lake City, UT',
  'Tampa, FL', 'Orlando, FL', 'Indianapolis, IN', 'Columbus, OH', 'St. Louis, MO',
  'Kansas City, MO', 'Richmond, VA', 'Baltimore, MD', 'Milwaukee, WI', 'Sacramento, CA',
  'Toronto, ON', 'Vancouver, BC', 'Montreal, QC', 'Calgary, AB', 'Ottawa, ON',
  'Remote',
];

// ── Types ────────────────────────────────────────────────────────────────────

interface FactItem {
  id: string; category: string; label: string; value: string;
  confidence: string; created_at: string; source: string;
}

interface MemorySurface {
  items: FactItem[];
  grouped: Record<string, FactItem[]>;
}

// ── Category config ──────────────────────────────────────────────────────────

// Category colors tuned to stay legible on BOTH dark and light
// surfaces. Bright yellows (#FFD700) and light ambers (#FF9F0A)
// vanish on white — swapped to darker amber / brown-gold tones
// that hold contrast on both themes while still feeling warm.
// Same swap applied to coral and any other light-on-light case.
// Base strength categories. These labels + icons apply to every
// user_path by default. The render path overlays per-path renames
// via applyPathOverrides() below — e.g. a veteran sees
// 'life_context' as "Service & Mission" with a medal icon instead of
// the generic "Background". Facts still live under the canonical
// category keys so the extraction pipeline is untouched.
const STRENGTH_CATEGORIES_BASE: Record<string, { icon: string; label: string; color: string }> = {
  achievement:          { icon: 'trophy',        label: 'Achievements',   color: '#B7791F' },
  goal:                 { icon: 'flag',          label: 'Goals',          color: '#15803D' },
  target_company:       { icon: 'business',      label: 'Target Cos',     color: COBALT },
  skill_unlisted:       { icon: 'code-slash',    label: 'Hidden Skills',  color: '#0E7490' },
  project_detail:       { icon: 'construct',     label: 'Projects',       color: '#15803D' },
  motivation:           { icon: 'heart',         label: 'Motivations',    color: '#BE185D' },
  personality:          { icon: 'person',        label: 'Personality',    color: '#7C3AED' },
  soft_skill:           { icon: 'people',        label: 'Soft Skills',    color: '#7C3AED' },
  hobby:                { icon: 'football',      label: 'Interests',      color: '#C2410C' },
  strength:             { icon: 'trending-up',   label: 'Strengths',      color: '#15803D' },
  weakness:             { icon: 'alert-circle',  label: 'Weaknesses',     color: '#B91C1C' },
  challenge:            { icon: 'fitness',       label: 'Challenges',     color: '#B45309' },
  area_for_improvement: { icon: 'arrow-up',      label: 'To Improve',     color: '#B45309' },
  fear:                 { icon: 'thunderstorm',  label: 'Concerns',       color: '#4B5563' },
  company_culture_pref: { icon: 'storefront',    label: 'Culture Fit',    color: '#B7791F' },
  life_context:         { icon: 'home',          label: 'Background',     color: '#C2410C' },
};

const CORE_CATEGORIES = [
  { key: 'goal', nudge: 'your career goals' },
  { key: 'target_company', nudge: 'your dream companies' },
  { key: 'skill_unlisted', nudge: 'skills not in your profile yet' },
  { key: 'project_detail', nudge: 'a project you worked on' },
  { key: 'motivation', nudge: 'what drives you' },
  { key: 'personality', nudge: 'your work style' },
  { key: 'strength', nudge: 'what you are good at' },
  { key: 'hobby', nudge: 'your hobbies' },
  { key: 'company_culture_pref', nudge: 'your ideal workplace' },
  { key: 'achievement', nudge: 'something you are proud of' },
];

// Rotating conversation starters
const CONVERSATION_STARTERS = [
  { display: 'Tell me about a project you are proud of', prompt: 'Help me describe a project I am proud of. Ask me about it.', icon: 'construct' },
  { display: 'What kind of company culture do you thrive in?', prompt: 'Help me figure out what kind of company culture I thrive in. Ask me questions.', icon: 'storefront' },
  { display: 'What is a skill Dilly does not know about yet?', prompt: 'I have a skill you do not know about yet. Ask me about it so you can add it to my profile.', icon: 'code-slash' },
  { display: 'What are you most passionate about in your career?', prompt: 'Help me articulate what I am most passionate about in my career. Ask me questions.', icon: 'heart' },
  { display: 'Describe your biggest professional achievement', prompt: 'Help me describe my biggest professional achievement. Ask me what happened.', icon: 'trophy' },
  { display: 'What does your ideal first job look like?', prompt: 'Help me describe what my ideal first job looks like. Ask me what matters to me.', icon: 'business' },
];

// ── Strength Ring ────────────────────────────────────────────────────────────

function StrengthRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const sw = 4;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct / 100);
  const color = pct >= 70 ? colors.green : pct >= 40 ? '#FF9F0A' : '#FF453A';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={sw} fill="transparent" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={sw} fill="transparent"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 14, fontWeight: '800', color: '#fff' }}>{pct}%</Text>
    </View>
  );
}

// ── Fact Row (measures own position for inline popup) ────────────────────────

/**
 * PulseTimelineSection — chronological feed of the user's daily
 * pulse entries. Hits /pulse/history, renders up to 20 as a
 * simple list with date + mood + response. Expands on tap to show
 * the full text; collapsed rows show 2 lines. No LLM, no
 * pagination beyond the first 20 (users who want more deserve a
 * dedicated 'all pulses' screen later).
 */
function PulseTimelineSection({ theme }: { theme: ResolvedTheme }) {
  interface PulseEntry {
    id: string;
    date: string;
    prompt: string;
    response: string;
    mood?: string | null;
  }
  const [entries, setEntries] = useState<PulseEntry[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await dilly.get('/pulse/history?limit=20') as any;
        if (Array.isArray(r?.entries)) setEntries(r.entries);
        else setEntries([]);
      } catch {
        setEntries([]);
      }
    })();
  }, []);

  if (entries === null) return null;
  if (entries.length === 0) return null;

  const relativeDate = (iso: string): string => {
    try {
      const d = new Date(iso.slice(0, 10) + 'T00:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      if (diff < 7) return `${diff}d ago`;
      if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  return (
    <>
      <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>YOUR PULSES</Text>
      <View style={{ gap: 6 }}>
        {entries.map(e => {
          const expanded = expandedId === e.id;
          return (
            <AnimatedPressable
              key={e.id}
              onPress={() => setExpandedId(expanded ? null : e.id)}
              scaleDown={0.98}
              style={{
                backgroundColor: theme.surface.s1,
                borderColor: theme.surface.border,
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent,
                }} />
                <Text style={{
                  fontSize: 11, fontWeight: '700', color: theme.surface.t3,
                  letterSpacing: 0.5,
                }}>
                  {relativeDate(e.date)}
                </Text>
                {e.mood ? (
                  <View style={{
                    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
                    backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, borderWidth: 1,
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: theme.accent, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {e.mood}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={{
                  fontSize: 13, lineHeight: 19,
                  color: theme.surface.t2, fontStyle: 'italic',
                }}
                numberOfLines={expanded ? undefined : 1}
              >
                {e.prompt}
              </Text>
              <Text
                style={{ fontSize: 14, lineHeight: 20, color: theme.surface.t1 }}
                numberOfLines={expanded ? undefined : 2}
              >
                {e.response}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </>
  );
}

function FactRow({ fact, color, onPress }: { fact: FactItem; color: string; onPress: (anchor: { x: number; y: number }) => void }) {
  const rowRef = useRef<View>(null);
  const theme = useResolvedTheme();
  return (
    <AnimatedPressable
      style={d.factRow}
      onPress={() => {
        rowRef.current?.measureInWindow((x, y, w, h) => {
          onPress({ x: x + w - 30, y: y + h / 2 });
        });
      }}
      scaleDown={0.98}
    >
      <View ref={rowRef} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
        <View style={[d.factDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[d.factLabel, { color: theme.surface.t1 }]}>{fact.label}</Text>
          <Text style={[d.factValue, { color: theme.surface.t2 }]}>{fact.value}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={14} color={theme.surface.t3} />
      </View>
    </AnimatedPressable>
  );
}

function SkillTag({ skill, conf, onPress }: { skill: FactItem; conf: number; onPress: (anchor: { x: number; y: number }) => void }) {
  const tagRef = useRef<View>(null);
  const theme = useResolvedTheme();
  return (
    <AnimatedPressable
      style={[
        d.skillTag,
        {
          opacity: 0.5 + conf * 0.5,
          backgroundColor: theme.accent + '14',
          borderColor: theme.accent + '33',
        },
      ]}
      onPress={() => {
        tagRef.current?.measureInWindow((x, y, w, h) => {
          onPress({ x: x + w / 2, y: y + h });
        });
      }}
      scaleDown={0.95}
    >
      <View ref={tagRef} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[d.skillTagText, { fontSize: 11 + conf * 3, color: theme.accent }]}>{skill.label || skill.value}</Text>
        {/* Tiny pencil glyph so users know the tag is editable.
            Faint on purpose — it's an affordance cue, not a button. */}
        <Ionicons name="create-outline" size={10} color={theme.accent} style={{ opacity: 0.55 }} />
      </View>
    </AnimatedPressable>
  );
}

// ── Loading State ────────────────────────────────────────────────────────────
// Matches the "What We Think" loading experience. animated DillyFace with
// rotating status lines. but with text tuned to what My Dilly actually
// shows (the user's identity, facts, story).

const MY_DILLY_LOADING_TEXTS = [
  'Gathering everything Dilly knows about you...',
  'Opening your profile...',
  'Pulling your strengths and skills...',
  'Arranging your story...',
  'Almost ready...',
];

function MyDillyLoadingState({ insetTop }: { insetTop: number }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [textIdx, setTextIdx] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    const interval = setInterval(
      () => setTextIdx(i => (i + 1) % MY_DILLY_LOADING_TEXTS.length),
      2500,
    );
    return () => clearInterval(interval);
  }, [pulseAnim]);

  return (
    <View style={[d.container, { paddingTop: insetTop }]}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }}>
        <DillyFace size={120} />
        <Animated.Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: colors.t2,
            marginTop: 24,
            opacity: pulseAnim,
            textAlign: 'center',
            paddingHorizontal: 24,
          }}
        >
          {MY_DILLY_LOADING_TEXTS[textIdx]}
        </Animated.Text>
      </View>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

function SeekerProfileScreen() {
  const insets = useSafeAreaInsets();
  // User-chosen theme (accent + surface + shape + type + density).
  // Threaded into container bg, header title, and card surfaces so
  // picking Mint/Sky/Midnight etc in Customize actually paints this
  // screen end-to-end.
  const theme = useResolvedTheme();
  // Holder mode reframes this tab as 'My Career'. a trajectory
  // tracker rather than an identity builder. Seekers/students keep
  // 'My Dilly' + the existing identity framing.
  const appMode = useAppMode();
  const isHolder = appMode === 'holder';
  // Per-situation copy for CTAs + chat seeds on this tab. Zero-cost
  // lookup from the cached /profile; reshapes tone per user_path.
  const situationCopy = useSituationCopy();
  const toast = useInlineToast();
  const [data, setData] = useState<MemorySurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [starterIdx, setStarterIdx] = useState(0);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [popup, setPopup] = useState<{ visible: boolean; anchor?: { x: number; y: number }; fact?: FactItem }>({ visible: false });
  const [editingFact, setEditingFact] = useState<{ fact: FactItem; label: string; value: string } | null>(null);
  const [resumes, setResumes] = useState<{ id: string; job_title: string; company: string; created_at: string }[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTagline, setEditTagline] = useState('');
  const [editEmail, setEditEmail] = useState('');
  // Mission statement — user-owned, surfaced as the hero block
  // on the public web profile. Edited from this screen only.
  const [editMission, setEditMission] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [editingMajor, setEditingMajor] = useState(false);
  const [editingMinor, setEditingMinor] = useState(false);
  const [careerFieldsExpanded, setCareerFieldsExpanded] = useState(false);
  const [editMajors, setEditMajors] = useState<string[]>([]);
  const [editMinors, setEditMinors] = useState<string[]>([]);
  const [majorSearch, setMajorSearch] = useState('');
  const [minorSearch, setMinorSearch] = useState('');
  const [editExtraCohorts, setEditExtraCohorts] = useState<string[]>([]);
  const [readableSlug, setReadableSlug] = useState<string>('');
  const [profilePrefix, setProfilePrefix] = useState<string>('s');
  const [cohortSearch, setCohortSearch] = useState('');
  const [webBio, setWebBio] = useState('');
  const [webBioSaving, setWebBioSaving] = useState(false);
  const [webTagline, setWebTagline] = useState('');
  const [webTaglineSaving, setWebTaglineSaving] = useState(false);
  const [showWebProfile, setShowWebProfile] = useState(false);
  const [showQrFullscreen, setShowQrFullscreen] = useState(false);
  const qrCaptureRef = useRef<View>(null);
  const searchParams = useLocalSearchParams<{ openQr?: string }>();
  useEffect(() => {
    if (searchParams?.openQr === '1') {
      setShowQrFullscreen(true);
      // Clear the param so back-nav then re-opening Career Center doesn't reopen the modal
      try { router.setParams({ openQr: undefined as any }); } catch {}
    }
  }, [searchParams?.openQr]);
  const [webSections, setWebSections] = useState<Record<string, boolean>>({
    strengths: true, skills: true, experience: true, projects: true, looking_for: true, education: true,
  });
  const [hiddenFactIds, setHiddenFactIds] = useState<string[]>([]);
  const [showFactToggles, setShowFactToggles] = useState(false);
  // Manual-add modal state. Free users who skipped the resume upload
  // can't use the chat-based add flow (paywall). This lets them type
  // facts directly into their profile. Paid users can still use chat,
  // but this works for everyone.
  const [addFactModal, setAddFactModal] = useState<{
    visible: boolean;
    category: string;
    categoryLabel: string;
    label: string;
    value: string;
    saving: boolean;
  }>({ visible: false, category: '', categoryLabel: '', label: '', value: '', saving: false });

  // Mount-lifecycle animation for the Add-Fact modal. `mounted`
  // stays true through the exit fade so the card can animate OUT
  // instead of being yanked from the tree. `anim` drives opacity
  // + scale. This replaces the old pattern where the modal appeared
  // instantly — tester feedback: "every single popup should have a
  // smooth animation coming in and coming out."
  const [addFactMounted, setAddFactMounted] = useState(false);
  const addFactAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (addFactModal.visible) {
      setAddFactMounted(true);
      Animated.timing(addFactAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (addFactMounted) {
      Animated.timing(addFactAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setAddFactMounted(false);
      });
    }
    // addFactMounted intentionally excluded from deps — we only want
    // to react to visible changes, not the unmount settle cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addFactModal.visible, addFactAnim]);

  function openAddFactModal(category: string, categoryLabel: string) {
    setAddFactModal({
      visible: true,
      category,
      categoryLabel,
      label: '',
      value: '',
      saving: false,
    });
  }

  async function submitAddFact() {
    const { category, label, value } = addFactModal;
    if (!category || !label.trim() || !value.trim()) return;
    setAddFactModal(prev => ({ ...prev, saving: true }));
    try {
      const res = await dilly.fetch('/memory/items', {
        method: 'POST',
        body: JSON.stringify({
          category,
          label: label.trim().slice(0, 80),
          value: value.trim().slice(0, 400),
        }),
      });
      if (res?.ok) {
        setAddFactModal({ visible: false, category: '', categoryLabel: '', label: '', value: '', saving: false });
        // Refetch the memory surface so the new fact shows up.
        try {
          const mr = await dilly.fetch('/memory');
          if (mr?.ok) setData(await mr.json());
        } catch {}
      } else {
        setAddFactModal(prev => ({ ...prev, saving: false }));
      }
    } catch {
      setAddFactModal(prev => ({ ...prev, saving: false }));
    }
  }
  const starterOpacity = useRef(new Animated.Value(1)).current;

  async function addCity(city: string) {
    const current = profile.job_locations || [];
    if (current.some((c: string) => c.toLowerCase() === city.toLowerCase())) {
      setCitySearch('');
      setShowCityDropdown(false);
      return;
    }
    const updated = [...current, city];
    setProfile((prev: any) => ({ ...prev, job_locations: updated }));
    setCitySearch('');
    setShowCityDropdown(false);
    await dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ job_locations: updated }) }).catch(() => {});
  }

  // Fetch slug with retry. New accounts occasionally race: the profile
  // is created before the slug endpoint can read it back, or the
  // endpoint itself is still cold on Railway. One extra attempt with a
  // 1.5s delay covers the window without blocking the UI noticeably.
  async function resolveSlugWithRetry(): Promise<{ slug?: string; prefix?: string } | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await dilly.fetch('/profile/generate-slug', { method: 'POST' });
        if (r?.ok) {
          const j = await r.json();
          if (j?.slug) return j;
        } else {
          console.warn('[MyDilly] generate-slug non-OK:', r?.status);
        }
      } catch (e: any) {
        console.warn('[MyDilly] generate-slug error:', e?.message || e);
      }
      if (attempt === 0) await new Promise(res => setTimeout(res, 1500));
    }
    return null;
  }

  const fetchData = useCallback(async () => {
    try {
      const [memRes, profileRes, resumesRes, slugRes] = await Promise.all([
        dilly.fetch('/memory').catch(() => null),
        dilly.get('/profile').catch(() => null),
        dilly.get('/generated-resumes').catch(() => null),
        resolveSlugWithRetry(),
      ]);
      if (memRes?.ok) {
        const json = await memRes.json();
        setData(json);
      }
      if (profileRes) {
        setProfile(profileRes);
        // Set prefix from profile user_type
        const ut = profileRes.user_type || 'student';
        const pfx = (ut === 'general' || ut === 'professional') ? 'p' : 's';
        setProfilePrefix(pfx);
        // Use readable_slug from profile if available
        if (profileRes.readable_slug) setReadableSlug(profileRes.readable_slug);
        setWebBio(profileRes.profile_bio || '');
        setWebTagline(profileRes.profile_tagline || profileRes.custom_tagline || '');
        if (profileRes.web_profile_settings?.sections) setWebSections(profileRes.web_profile_settings.sections);
        if (Array.isArray(profileRes.web_profile_settings?.hidden_fact_ids)) {
          setHiddenFactIds(profileRes.web_profile_settings.hidden_fact_ids);
        }
      }
      if (Array.isArray(resumesRes)) setResumes(resumesRes);
      else if (resumesRes?.resumes) setResumes(resumesRes.resumes);
      // Slug from API overrides profile value
      if (slugRes?.slug) {
        setReadableSlug(slugRes.slug);
        if (slugRes.prefix) setProfilePrefix(slugRes.prefix);
      }
    } catch (e) { console.warn('[MyDilly] fetch error:', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  // Re-fetch when tab becomes active (after AI conversation adds new facts)
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // Re-fetch whenever the Dilly AI overlay finishes extracting new
  // facts. Without this, the user would close the overlay, land on
  // My Dilly, and see the OLD fact count because the extraction
  // /ai/chat/flush call runs async in the background after close.
  // useExtractionState broadcasts a seq bump when flush resolves;
  // we key off that to pull the fresh profile + memory.
  const extraction = useExtractionState();
  useEffect(() => {
    if (extraction.seq === 0) return;
    fetchData();
  }, [extraction.seq, fetchData]);

  // Auto-retry if profile has zero facts (resume extraction may still be running)
  const retryRef = useRef(0);
  useEffect(() => {
    if (!loading && data && (data.items || []).length === 0 && retryRef.current < 3) {
      const timer = setTimeout(() => {
        retryRef.current += 1;
        fetchData();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [loading, data]);

  // Rotate conversation starters
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(starterOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setStarterIdx(i => (i + 1) % CONVERSATION_STARTERS.length);
        Animated.timing(starterOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(async () => {
    mediumHaptic();
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Derived
  const p = profile as any;
  const firstName = (p.name || '').trim().split(/\s+/)[0] || 'You';
  const fullName = (p.name || '').trim() || 'Your Name';
  const cohort = p.cohort || p.track || '';
  const school = p.school_id === 'utampa' ? 'University of Tampa' : (p.school_name || '');
  const totalFacts = data?.items?.length ?? 0;
  const filledCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) > 0);
  const missingCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) === 0);
  const completeness = CORE_CATEGORIES.length > 0 ? Math.round((filledCore.length / CORE_CATEGORIES.length) * 100) : 0;
  const starter = CONVERSATION_STARTERS[starterIdx];

  // Skills from skill_unlisted + soft_skill categories
  const allSkills = [
    ...(data?.grouped?.skill_unlisted || []),
    ...(data?.grouped?.soft_skill || []),
  ];

  // Strength categories that have facts
  // Derive the path-aware category map from the base. A veteran's
  // grid relabels some tiles; a dropout's, a parent_returning's, etc.
  // Facts still live under the canonical keys so extraction logic is
  // unchanged — this is a presentation-layer remap only.
  const STRENGTH_CATEGORIES = applyPathOverrides(STRENGTH_CATEGORIES_BASE, (profile as any)?.user_path);
  const strengthCats = Object.keys(STRENGTH_CATEGORIES).filter(k => (data?.grouped?.[k]?.length ?? 0) > 0);

  // Share a resume card
  const handleShareResume = (resume: { id: string; job_title: string; company: string }) => {
    router.push({ pathname: '/(app)/resume-generate', params: { viewId: resume.id } });
  };

  if (loading) {
    return <MyDillyLoadingState insetTop={insets.top} />;
  }

  return (
    <View style={[d.container, { backgroundColor: theme.surface.bg }]}>
      {/* First-visit coach mark — seekers/students. */}
      <FirstVisitCoach
        id="my-dilly-seeker-v1"
        iconName="person-circle"
        headline="Everything Dilly knows about you."
        subline="The more she learns, the sharper your fit reads and tailored resumes get."
      />

      {/* Toast overlay. absolute, top-most z-index */}
      <InlineToastView
        {...toast.props}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999 }}
      />

      {/* Header */}
      <View style={[d.header, {
        paddingTop: insets.top + 8,
        borderBottomColor: theme.surface.border,
      }]}>
        <AnimatedPressable onPress={async () => {
          if (editMode) {
            // Save changes
            try {
              const patch: any = {
                name: editName.trim() || undefined,
                profile_tagline: editTagline.trim() || undefined,
                // Mission statement — saved to both the canonical
                // field and the legacy profile_bio fallback so the
                // public profile reads it on either field.
                mission_statement: editMission.trim(),
                profile_bio: editMission.trim(),
              };
              // Include majors/minors if they were edited
              if (editingMajor) patch.majors = editMajors;
              if (editingMinor) patch.minors = editMinors;
              // Always save extra_cohorts
              patch.extra_cohorts = editExtraCohorts;
              // Recompute cohorts from majors + minors + extras
              const newCohorts = detectCohorts(editMajors, editMinors, p.pre_professional_track || '');
              const allCohorts = [...new Set([...newCohorts, ...editExtraCohorts])];
              patch.cohorts = allCohorts;

              await dilly.fetch('/profile', {
                method: 'PATCH',
                body: JSON.stringify(patch),
              });
              setProfile((prev: any) => ({
                ...prev,
                name: editName.trim() || prev.name,
                profile_tagline: editTagline.trim(),
                ...(editingMajor ? { majors: editMajors } : {}),
                ...(editingMinor ? { minors: editMinors } : {}),
                extra_cohorts: editExtraCohorts,
                cohorts: allCohorts,
              }));
              toast.show({ message: 'Profile updated!', type: 'success' });
            } catch { toast.show({ message: 'Could not save.' }); }
            setEditMode(false);
          } else {
            // Enter edit mode
            setEditName(p.name || '');
            setEditTagline(p.profile_tagline || p.custom_tagline || '');
            setEditMission((p.mission_statement || p.profile_bio || '').toString());
            setEditEmail(p.email || '');
            setEditMajors(p.majors || (p.major ? [p.major] : []));
            setEditMinors(p.minors || []);
            setEditExtraCohorts(p.extra_cohorts || []);
            setEditingMajor(false);
            setEditingMinor(false);
            setEditMode(true);
          }
        }} scaleDown={0.95} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: editMode ? colors.green : theme.accent }}>{editMode ? 'Save' : 'Edit'}</Text>
        </AnimatedPressable>
        <Text style={[d.headerTitle, {
          color: theme.surface.t1,
          fontFamily: theme.type.display,
          fontWeight: theme.type.heroWeight,
          letterSpacing: theme.type.heroTracking,
        }]}>{isHolder ? 'My Career' : 'My Dilly'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity
            onPress={() => setShowQrFullscreen(true)}
            hitSlop={12}
            disabled={!readableSlug}
            style={{ opacity: readableSlug ? 1 : 0.35 }}
          >
            <Ionicons name="qr-code" size={20} color={theme.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(app)/settings')} hitSlop={12}>
            <Ionicons name="settings-outline" size={20} color={colors.t3} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[d.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
      >

        {/* QR Code CTA. Kept prominent here because the header icon
            was invisible to most testers. Renamed from "Your business
            card" to "Your Dilly QR Code" so it reads like a modern
            credential, not a paper prop. */}
        {!editMode && readableSlug ? (
          <FadeInView delay={0}>
            <AnimatedPressable
              onPress={() => setShowQrFullscreen(true)}
              scaleDown={0.98}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: theme.accentSoft,
                borderWidth: 1, borderColor: theme.accentBorder,
                borderRadius: 14, padding: 14, marginBottom: 14,
              }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 10,
                backgroundColor: '#fff',
                borderWidth: 1, borderColor: theme.accentBorder,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="qr-code" size={22} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.accent, letterSpacing: 0.2 }}>
                  Your Dilly QR Code
                </Text>
                <Text style={{ fontSize: 11, color: theme.surface.t2, marginTop: 2, lineHeight: 15 }}>
                  Your whole career in a single scan. Recruiters tap it and land on your live Dilly profile instantly.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.surface.t3} />
            </AnimatedPressable>
          </FadeInView>
        ) : null}

        {/* ── Edit Profile Section ──────────────────────────── */}
        {editMode && (
          <FadeInView delay={0}>
            <View style={d.editSection}>
              {/* Photo */}
              <AnimatedPressable
                style={d.editPhotoBtn}
                onPress={async () => {
                  try {
                    const ImagePicker = await import('expo-image-picker');
                    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
                    if (!result.canceled && result.assets?.[0]) {
                      const asset = result.assets[0];
                      const headers = await (await import('../../lib/auth')).authHeaders();
                      const form = new FormData();
                      form.append('file', { uri: asset.uri, name: 'photo.jpg', type: 'image/jpeg' } as any);
                      await fetch(`${API_BASE}/profile/photo`, { method: 'POST', headers, body: form });
                      toast.show({ message: 'Photo updated!', type: 'success' });
                    }
                  } catch { toast.show({ message: 'Could not update photo.' }); }
                }}
                scaleDown={0.95}
              >
                {/* Photo OR grayed-out 'add photo' placeholder. Reads
                    the URL from whichever source has it first. The
                    full profile (p.photo_url) can be slow to hydrate
                    while the dashboard identity already knows the
                    photo exists, which is why users were seeing the
                    camera icon even though they had a photo: we were
                    checking p.photo_url only, and it was still
                    undefined on first render. Coalescing across
                    identity + p fixes that. */}
                {(() => {
                  const photoUrl = identity.photo_url || p.photo_url || '';
                  if (!photoUrl) {
                    return (
                      <View style={d.editPhotoPlaceholder}>
                        <Ionicons name="camera" size={28} color={colors.t3} />
                      </View>
                    );
                  }
                  const uri = String(photoUrl).startsWith('http')
                    ? `${photoUrl}?_t=${Date.now()}`
                    : `${API_BASE}${photoUrl}?_t=${Date.now()}`;
                  return <Image source={{ uri }} style={d.editPhotoImg} />;
                })()}
                <Text style={d.editPhotoLabel}>
                  {(identity.photo_url || p.photo_url) ? 'Change photo' : 'Add a photo'}
                </Text>
              </AnimatedPressable>

              {/* Name */}
              <View style={d.editField}>
                <Text style={d.editFieldLabel}>Name</Text>
                <TextInput style={d.editFieldInput} value={editName} onChangeText={setEditName} placeholder="Your name" placeholderTextColor={colors.t3} />
              </View>

              {/* Mission Statement — rendered on the public web
                  profile as the hero block under the CTAs. One or
                  two sentences on why you do what you do. */}
              <View style={d.editField}>
                <Text style={d.editFieldLabel}>Mission Statement</Text>
                <Text style={{ fontSize: 11, color: colors.t3, marginBottom: 6, lineHeight: 15 }}>
                  One or two lines on why you do what you do. Recruiters read this first.
                </Text>
                <TextInput
                  style={[d.editFieldInput, { minHeight: 90, textAlignVertical: 'top' as const, paddingTop: 10 }]}
                  value={editMission}
                  onChangeText={setEditMission}
                  placeholder="e.g. I help early-stage teams ship things that people actually use. I'm drawn to problems where the hard part is the judgment, not the code."
                  placeholderTextColor={colors.t3}
                  multiline
                  maxLength={320}
                />
                <Text style={{ fontSize: 10, color: colors.t3, marginTop: 4, textAlign: 'right' }}>
                  {editMission.length} / 320
                </Text>
              </View>

              {/* Majors & Minors (students only) */}
              {p.user_type !== 'general' && p.user_type !== 'professional' && (
                <>
                  {/* Major */}
                  <View style={d.editField}>
                    <Text style={d.editFieldLabel}>Major</Text>
                    {!editingMajor ? (
                      <View style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {(editMajors.length > 0 ? editMajors : ['No major set']).map((m, i) => (
                            <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.s2 }}>
                              <Text style={{ fontSize: 12, color: colors.t1 }}>{m}</Text>
                            </View>
                          ))}
                        </View>
                        <AnimatedPressable onPress={() => setEditingMajor(true)} scaleDown={0.95}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.indigo }}>Changed major?</Text>
                        </AnimatedPressable>
                      </View>
                    ) : (
                      <View style={{ gap: 6 }}>
                        <TextInput
                          style={d.editFieldInput}
                          value={majorSearch}
                          onChangeText={setMajorSearch}
                          placeholder="Search majors..."
                          placeholderTextColor={colors.t3}
                        />
                        {majorSearch.length > 1 && (
                          <View style={{ maxHeight: 120, backgroundColor: colors.s1, borderRadius: 8, borderWidth: 1, borderColor: colors.b1 }}>
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                              {Object.keys(MAJOR_TO_COHORTS)
                                .filter(m => m.toLowerCase().includes(majorSearch.toLowerCase()))
                                .slice(0, 8)
                                .map(m => (
                                  <TouchableOpacity
                                    key={m}
                                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderColor: colors.b1 }}
                                    onPress={() => {
                                      if (!editMajors.includes(m)) setEditMajors([...editMajors, m]);
                                      setMajorSearch('');
                                    }}
                                  >
                                    <Text style={{ fontSize: 12, color: colors.t1 }}>{m}</Text>
                                  </TouchableOpacity>
                                ))}
                            </ScrollView>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {editMajors.map((m, i) => (
                            <AnimatedPressable
                              key={i}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.accent }}
                              onPress={() => setEditMajors(editMajors.filter((_, idx) => idx !== i))}
                              scaleDown={0.95}
                            >
                              <Text style={{ fontSize: 11, color: '#fff' }}>{m}</Text>
                              <Ionicons name="close-circle" size={12} color="#fff" />
                            </AnimatedPressable>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Minor */}
                  <View style={d.editField}>
                    <Text style={d.editFieldLabel}>Minor</Text>
                    {!editingMinor ? (
                      <View style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {(editMinors.length > 0 ? editMinors : ['No minor']).map((m, i) => (
                            <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.s2 }}>
                              <Text style={{ fontSize: 12, color: colors.t2 }}>{m}</Text>
                            </View>
                          ))}
                        </View>
                        <AnimatedPressable onPress={() => setEditingMinor(true)} scaleDown={0.95}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: theme.accent }}>Changed minor?</Text>
                        </AnimatedPressable>
                      </View>
                    ) : (
                      <View style={{ gap: 6 }}>
                        <TextInput
                          style={d.editFieldInput}
                          value={minorSearch}
                          onChangeText={setMinorSearch}
                          placeholder="Search minors..."
                          placeholderTextColor={colors.t3}
                        />
                        {minorSearch.length > 1 && (
                          <View style={{ maxHeight: 120, backgroundColor: colors.s1, borderRadius: 8, borderWidth: 1, borderColor: colors.b1 }}>
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                              {Object.keys(MAJOR_TO_COHORTS)
                                .filter(m => m.toLowerCase().includes(minorSearch.toLowerCase()))
                                .slice(0, 8)
                                .map(m => (
                                  <TouchableOpacity
                                    key={m}
                                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderColor: colors.b1 }}
                                    onPress={() => {
                                      if (!editMinors.includes(m)) setEditMinors([...editMinors, m]);
                                      setMinorSearch('');
                                    }}
                                  >
                                    <Text style={{ fontSize: 12, color: colors.t1 }}>{m}</Text>
                                  </TouchableOpacity>
                                ))}
                            </ScrollView>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {editMinors.map((m, i) => (
                            <AnimatedPressable
                              key={i}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.accent }}
                              onPress={() => setEditMinors(editMinors.filter((_, idx) => idx !== i))}
                              scaleDown={0.95}
                            >
                              <Text style={{ fontSize: 11, color: '#fff' }}>{m}</Text>
                              <Ionicons name="close-circle" size={12} color="#fff" />
                            </AnimatedPressable>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Extra Cohorts - see more jobs */}
                  <View style={d.editField}>
                    <Text style={d.editFieldLabel}>Your Cohorts</Text>
                    {(p.cohorts || []).length > 0 ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 8 }}>
                        {(p.cohorts || []).map((c: string, i: number) => (
                          <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.indigo + '15', borderWidth: 1, borderColor: colors.indigo + '30' }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.indigo }}>{c}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, color: colors.t3, marginTop: 2, marginBottom: 8 }}>Based on your major</Text>
                    )}
                    <Text style={d.editFieldLabel}>See More Jobs In</Text>
                    <Text style={{ fontSize: 10, color: colors.t3, marginTop: 1 }}>Add up to 3 extra fields to see more jobs</Text>
                    <View style={{ gap: 6, marginTop: 6 }}>
                      <TextInput
                        style={d.editFieldInput}
                        value={cohortSearch}
                        onChangeText={setCohortSearch}
                        placeholder="Search fields..."
                        placeholderTextColor={colors.t3}
                      />
                      {cohortSearch.length > 1 && (
                        <View style={{ maxHeight: 140, backgroundColor: colors.s1, borderRadius: 8, borderWidth: 1, borderColor: colors.b1 }}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {ALL_COHORTS
                              .filter(c => c.toLowerCase().includes(cohortSearch.toLowerCase()))
                              .filter(c => !editExtraCohorts.includes(c))
                              .slice(0, 8)
                              .map(c => (
                                <TouchableOpacity
                                  key={c}
                                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderColor: colors.b1 }}
                                  onPress={() => {
                                    if (editExtraCohorts.length < 3) {
                                      setEditExtraCohorts([...editExtraCohorts, c]);
                                      setCohortSearch('');
                                    }
                                  }}
                                >
                                  <Text style={{ fontSize: 12, color: colors.t1 }}>{c}</Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {editExtraCohorts.map((c, i) => (
                          <AnimatedPressable
                            key={i}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1652F0' }}
                            onPress={() => setEditExtraCohorts(editExtraCohorts.filter((_, idx) => idx !== i))}
                            scaleDown={0.95}
                          >
                            <Text style={{ fontSize: 11, color: '#fff' }}>{c}</Text>
                            <Ionicons name="close-circle" size={12} color="#fff" />
                          </AnimatedPressable>
                        ))}
                        {editExtraCohorts.length === 0 && (
                          <Text style={{ fontSize: 11, color: colors.t3, fontStyle: 'italic' }}>None added yet</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </>
              )}

              {/* Career Fields (non-students only) — collapsible.
                  Long list of chips was bloating the edit box and
                  pushing everything else off screen. Collapsed by
                  default, tap header to expand. */}
              {(p.user_type === 'general' || p.user_type === 'professional') && (
                <View style={d.editField}>
                  <AnimatedPressable
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setCareerFieldsExpanded(v => !v);
                    }}
                    scaleDown={0.98}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={d.editFieldLabel}>Career Fields</Text>
                      {(p.career_fields || []).length > 0 && (
                        <Text style={{ fontSize: 11, color: colors.t3 }}>
                          {(p.career_fields || []).length} selected
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={careerFieldsExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.t3}
                    />
                  </AnimatedPressable>
                  {careerFieldsExpanded && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {CAREER_FIELD_OPTIONS.map(field => {
                        const selected = (p.career_fields || []).includes(field);
                        return (
                          <AnimatedPressable
                            key={field}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                              backgroundColor: selected ? colors.indigo : colors.s2,
                              borderWidth: 1, borderColor: selected ? colors.indigo : colors.b1,
                            }}
                            onPress={async () => {
                              const current = p.career_fields || [];
                              const updated = selected ? current.filter((f: string) => f !== field) : [...current, field];
                              setProfile((prev: any) => ({ ...prev, career_fields: updated }));
                              await dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ career_fields: updated }) }).catch(() => {});
                            }}
                            scaleDown={0.95}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: selected ? '#fff' : colors.t2 }}>{field}</Text>
                          </AnimatedPressable>
                        );
                      })}
                    </View>
                  )}
                  {!careerFieldsExpanded && (p.career_fields || []).length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {(p.career_fields || []).slice(0, 3).map((f: string) => (
                        <View key={f} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.indigo + '15' }}>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.indigo }}>{f}</Text>
                        </View>
                      ))}
                      {(p.career_fields || []).length > 3 && (
                        <Text style={{ fontSize: 10, color: colors.t3, alignSelf: 'center' }}>
                          +{(p.career_fields || []).length - 3} more
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Cities — moved inside the edit box so it's
                  discoverable. Previously lived far below the edit
                  panel and users didn't realize cities were editable. */}
              <View style={d.editField}>
                <Text style={d.editFieldLabel}>Cities you're available in</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {(p.job_locations || []).map((city: string, i: number) => (
                    <View key={i} style={d.cityChip}>
                      <Ionicons name="location" size={12} color={colors.indigo} />
                      <Text style={d.cityChipText}>{city}</Text>
                      <AnimatedPressable
                        onPress={async () => {
                          const updated = (p.job_locations || []).filter((_: string, j: number) => j !== i);
                          setProfile((prev: any) => ({ ...prev, job_locations: updated }));
                          await dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ job_locations: updated }) }).catch(() => {});
                        }}
                        scaleDown={0.9}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={14} color={colors.t3} />
                      </AnimatedPressable>
                    </View>
                  ))}
                  {(p.job_locations || []).length === 0 && (
                    <Text style={{ fontSize: 11, color: colors.t3, fontStyle: 'italic' }}>None added yet</Text>
                  )}
                </View>
                <View style={[d.cityInputRow, { marginTop: 8 }]}>
                  <TextInput
                    style={d.cityInput}
                    placeholder="Type a city (e.g. New York)"
                    placeholderTextColor={colors.t3}
                    value={citySearch}
                    onChangeText={(t) => { setCitySearch(t); setShowCityDropdown(t.length >= 2); }}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (citySearch.trim().length >= 2) addCity(citySearch.trim());
                    }}
                  />
                  {citySearch.trim().length >= 2 && (
                    <AnimatedPressable
                      style={d.cityAddBtn}
                      onPress={() => addCity(citySearch.trim())}
                      scaleDown={0.95}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                    </AnimatedPressable>
                  )}
                </View>
                {showCityDropdown && (
                  <View style={d.cityDropdown}>
                    {US_CANADA_CITIES.filter(c => c.toLowerCase().includes(citySearch.toLowerCase())).slice(0, 5).map((city, i) => (
                      <AnimatedPressable
                        key={i}
                        style={d.cityDropdownItem}
                        onPress={() => addCity(city)}
                        scaleDown={0.98}
                      >
                        <Ionicons name="location-outline" size={14} color={colors.t2} />
                        <Text style={d.cityDropdownText}>{city}</Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </FadeInView>
        )}

        {/* ── Profile Growth Meter ───────────────────────────────
            THE retention lever. Every chat adds facts; every fact makes
            Dilly sharper; sharper Dilly = better guidance. This meter
            makes the loop visible. No streaks (streaks punish the people
            who need a day off). just a growth number + a clear target
            + context for where they stand.

            States:
              0-9 facts   → "Dilly is just starting to know you"
              10-39 facts → "Dilly is learning you"
              40-79 facts → "Dilly knows you well"
              80+ facts   → "Dilly knows you deeply"
            At 80+ we stop showing the meter. they've internalized
            the behavior, no need to nag. */}
        {!editMode && totalFacts < 80 && (
          <FadeInView delay={0}>
            <View style={[d.growthCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
              <View style={d.growthHeader}>
                <Text style={[d.growthLabel, { color: theme.accent }]}>DILLY KNOWS</Text>
                <Text style={d.growthCount}>
                  <Text style={[d.growthCountNum, { color: theme.surface.t1 }]}>{totalFacts}</Text>
                  <Text style={[d.growthCountUnit, { color: theme.surface.t3 }]}> {totalFacts === 1 ? 'thing' : 'things'}</Text>
                </Text>
              </View>
              {/* Progress bar. tops out at 80 */}
              <View style={[d.growthTrack, { backgroundColor: theme.accent + '1a' }]}>
                <View style={[d.growthFill, { width: `${Math.min(100, (totalFacts / 80) * 100)}%`, backgroundColor: theme.accent }]} />
              </View>
              <Text style={[d.growthSub, { color: theme.surface.t2 }]}>
                {totalFacts === 0
                  ? "Tell Dilly anything about your career. It all sharpens your fit narratives and resumes."
                  : totalFacts < 10
                    ? "Just getting started. The average person who lands their target role has 80+ things in their profile."
                    : totalFacts < 40
                      ? `${totalFacts} is a real start. The average person who lands their role has 80+.`
                      : `${totalFacts} is strong. A few more conversations and Dilly will know you better than most recruiters.`}
              </Text>
              <AnimatedPressable
                style={[d.growthCta, { backgroundColor: theme.accent }]}
                onPress={() => openDillyOverlay({
                  name: firstName,
                  isPaid: false,
                  initialMessage: situationCopy.empty_chat_seed,
                })}
                scaleDown={0.97}
              >
                <Ionicons name="chatbubble" size={13} color="#fff" />
                <Text style={d.growthCtaText}>{situationCopy.talk_cta}</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        )}

        {/* ── 0. Cities (read-only view) ────────────────────────
            Edit controls live inside the Edit box (see editMode
            panel above) so users don't have to scroll to find them. */}
        {!editMode && (
          <FadeInView delay={0}>
            <View style={d.citySection}>
              <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>CITIES YOU'RE AVAILABLE IN</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(p.job_locations || []).map((city: string, i: number) => (
                  <View key={i} style={[d.cityChip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                    <Ionicons name="location" size={12} color={theme.accent} />
                    <Text style={[d.cityChipText, { color: theme.surface.t1 }]}>{city}</Text>
                  </View>
                ))}
                {(p.job_locations || []).length === 0 && (
                  <Text style={{ fontSize: 12, color: theme.surface.t3 }}>Tap Edit to add cities</Text>
                )}
              </View>
            </View>
          </FadeInView>
        )}

        {/* ── 1. Dilly Card ──────────────────────────────────── */}
        <FadeInView delay={0}>
          <DillyCardEditor
            initialData={{
              name: fullName,
              school: p.user_type === 'professional' ? '' : school,
              major: p.user_type === 'professional' ? (p.career_fields?.[0] || '') : (p.majors?.[0] || p.major || ''),
              classYear: p.user_type === 'professional' ? '' : (p.graduation_year ? String(p.graduation_year) : ''),
              tagline: p.profile_tagline || p.custom_tagline || '',
              email: p.email || '',
              phones: p.phones || [{ label: 'Cell', number: '' }],
              username: p.profile_slug || '',
              photoUri: p.profile_slug ? `https://api.trydilly.com/profile/public/${p.profile_slug}/photo` : null,
              city: (p.job_locations || [])[0] || '',
              readableSlug: readableSlug || '',
              profilePrefix: profilePrefix,
            }}
            onSave={() => {}}
            userType={p.user_type}
          />
        </FadeInView>

        {/* ── 1b. Your Public Profile ──────────────────────────── */}
        <FadeInView delay={40}>
          <AnimatedPressable
            style={{ backgroundColor: theme.accentSoft, borderRadius: 14, borderWidth: 1, borderColor: theme.accentBorder, padding: 16, marginBottom: 4 }}
            onPress={() => setShowWebProfile(!showWebProfile)}
            scaleDown={0.98}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="globe-outline" size={18} color={theme.accent} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.surface.t1 }}>Your Public Profile</Text>
              </View>
              <Ionicons name={showWebProfile ? 'chevron-up' : 'chevron-down'} size={16} color={theme.surface.t3} />
            </View>
            {readableSlug ? (
              <Text style={{ fontSize: 11, color: theme.surface.t3, marginTop: 4, marginLeft: 28 }}>
                hellodilly.com/{profilePrefix}/{readableSlug}
              </Text>
            ) : null}
          </AnimatedPressable>

          {showWebProfile && (
            <View style={{ backgroundColor: theme.accentSoft, borderRadius: 14, borderWidth: 1, borderColor: theme.accentBorder, padding: 16, gap: 14 }}>
              {/* Tagline */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t3, letterSpacing: 1, marginBottom: 6 }}>TAGLINE</Text>
                <TextInput
                  style={{ fontSize: 14, color: colors.t1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.b1, backgroundColor: colors.s2 }}
                  value={webTagline}
                  onChangeText={setWebTagline}
                  onEndEditing={() => {
                    const next = webTagline.trim();
                    setWebTaglineSaving(true);
                    // Keep the rest of the UI in sync so other spots reading profile_tagline update too
                    setProfile((prev: any) => ({ ...prev, profile_tagline: next, custom_tagline: next }));
                    dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ profile_tagline: next }) })
                      .then(() => setWebTaglineSaving(false))
                      .catch(() => setWebTaglineSaving(false));
                  }}
                  placeholder="Your tagline (e.g. Data Scientist at Tampa)"
                  placeholderTextColor={colors.t3}
                  maxLength={80}
                  returnKeyType="done"
                />
                {webTaglineSaving && <Text style={{ fontSize: 10, color: colors.t3, marginTop: 2 }}>Saving...</Text>}
              </View>

              {/* Mission Statement — replaces the old "Bio" block.
                  Saves to profile_bio for backward compat with the
                  web profile that reads either field (per the PATCH
                  allow-list in api/routers/profile.py the canonical
                  field is mission_statement). */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t3, letterSpacing: 1, marginBottom: 6 }}>MISSION STATEMENT</Text>
                <Text style={{ fontSize: 11, color: colors.t3, marginBottom: 6, lineHeight: 15 }}>
                  One or two lines on why you do what you do. Recruiters read this first on your public profile.
                </Text>
                <TextInput
                  style={{ fontSize: 14, color: colors.t1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.b1, backgroundColor: colors.s2, minHeight: 90, textAlignVertical: 'top' }}
                  value={webBio}
                  onChangeText={setWebBio}
                  onEndEditing={() => {
                    setWebBioSaving(true);
                    // Write to BOTH fields: mission_statement is the
                    // canonical home; profile_bio is the legacy
                    // fallback the public-profile API reads. Writing
                    // both means either web surface reads the fresh
                    // value without a schema migration step.
                    const val = webBio.trim();
                    dilly.fetch('/profile', {
                      method: 'PATCH',
                      body: JSON.stringify({ mission_statement: val, profile_bio: val }),
                    })
                      .then(() => setWebBioSaving(false))
                      .catch(() => setWebBioSaving(false));
                  }}
                  placeholder="e.g. I help early-stage teams ship things that people actually use. I'm drawn to problems where the hard part is the judgment, not the code."
                  placeholderTextColor={colors.t3}
                  maxLength={320}
                  multiline
                  returnKeyType="done"
                  blurOnSubmit
                />
                {webBioSaving && <Text style={{ fontSize: 10, color: colors.t3, marginTop: 2 }}>Saving...</Text>}
              </View>

              {/* Section toggles */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t3, letterSpacing: 1, marginBottom: 8 }}>VISIBLE SECTIONS</Text>
                {[
                  { key: 'strengths', label: 'What I Bring' },
                  { key: 'skills', label: 'Skills' },
                  { key: 'experience', label: 'Experience' },
                  { key: 'projects', label: 'Projects' },
                  { key: 'looking_for', label: 'What I\'m Looking For' },
                  { key: 'education', label: 'Education' },
                ].map(sec => (
                  <View key={sec.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderColor: colors.b1 }}>
                    <Text style={{ fontSize: 14, color: colors.t1 }}>{sec.label}</Text>
                    <Switch
                      value={webSections[sec.key] !== false}
                      onValueChange={v => {
                        const updated = { ...webSections, [sec.key]: v };
                        setWebSections(updated);
                        dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ web_profile_settings: { sections: updated, hidden_fact_ids: hiddenFactIds } }) }).catch(() => {});
                      }}
                      trackColor={{ false: theme.surface.border, true: theme.accent + '40' }}
                      thumbColor={webSections[sec.key] !== false ? theme.accent : '#f4f3f4'}
                    />
                  </View>
                ))}
              </View>

              {/* Per-fact toggles */}
              <View>
                <AnimatedPressable
                  onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowFactToggles(!showFactToggles); }}
                  scaleDown={0.98}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t3, letterSpacing: 1 }}>MANAGE VISIBLE FACTS</Text>
                  <Ionicons name={showFactToggles ? 'chevron-up' : 'chevron-down'} size={14} color={colors.t3} />
                </AnimatedPressable>
                {showFactToggles && data?.items && (
                  <View style={{ marginTop: 6 }}>
                    {data.items.slice(0, 30).map((fact: any, i: number) => {
                      const cat = (fact.category || '').toLowerCase();
                      const isPrivate = ['challenge', 'concern', 'weakness', 'fear', 'personal', 'contact', 'phone', 'email_address', 'areas_for_improvement', 'life_context'].includes(cat);
                      if (isPrivate) return null;
                      const isPublic = !hiddenFactIds.includes(fact.id);
                      return (
                        <View key={fact.id || i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: colors.b1 }}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.t1 }} numberOfLines={1}>{fact.label || fact.value}</Text>
                            <Text style={{ fontSize: 10, color: colors.t3 }}>{
                              ({ skill_unlisted: 'Technical Skill', soft_skill: 'Soft Skill', technical_skill: 'Technical Skill', skill: 'Skill', achievement: 'Achievement', project_detail: 'Project', project: 'Project', experience: 'Experience', education: 'Education', goal: 'Goal', interest: 'Interest', career_interest: 'Career Interest', strength: 'Strength', personality: 'Personality' } as any)[fact.category] || fact.category
                            }</Text>
                          </View>
                          <Switch
                            value={isPublic}
                            onValueChange={async v => {
                              if (!fact.id) return;
                              // Optimistic UI update
                              const optimistic = v
                                ? hiddenFactIds.filter(id => id !== fact.id)
                                : [...hiddenFactIds.filter(id => id !== fact.id), fact.id];
                              setHiddenFactIds(optimistic);
                              // Atomic server update (throws on error)
                              try {
                                const res: any = await dilly.post(
                                  v ? '/profile/web/show-fact' : '/profile/web/hide-fact',
                                  { fact_id: fact.id },
                                );
                                if (Array.isArray(res?.hidden_fact_ids)) {
                                  setHiddenFactIds(res.hidden_fact_ids);
                                }
                              } catch (e: any) {
                                // Revert on failure
                                setHiddenFactIds(hiddenFactIds);
                                const status = e?.status || e?.response?.status;
                                const reason = e?.message || e?.code || 'unknown';
                                // eslint-disable-next-line no-console
                                console.warn('[hide/show-fact failed]', { status, reason, fact_id: fact.id, err: e });
                                toast.show({ message: `Could not update: ${status || ''} ${reason}`.trim() });
                              }
                            }}
                            trackColor={{ false: theme.surface.border, true: theme.accent + '40' }}
                            thumbColor={isPublic ? theme.accent : '#f4f3f4'}
                          />
                        </View>
                      );
                    })}
                    <Text style={{ fontSize: 10, color: colors.t3, marginTop: 8, textAlign: 'center' }}>
                      Private facts (challenges, concerns, weaknesses) are never shown publicly.
                    </Text>
                  </View>
                )}
              </View>

              {/* Profile action buttons */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t3, letterSpacing: 1, marginBottom: 8 }}>PROFILE BUTTONS</Text>

                {/* Book a Chat */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 14, color: colors.t1 }}>Book a Chat</Text>
                    <Text style={{ fontSize: 11, color: colors.t3, marginTop: 2 }}>Visitors can pick a time to talk with you</Text>
                  </View>
                  <Switch
                    value={p.booking_availability?.enabled || false}
                    onValueChange={v => {
                      const current = p.booking_availability || { enabled: false, timezone: 'America/New_York', windows: [], slot_duration: 30, buffer: 15, max_days_ahead: 14 };
                      const updated = { ...current, enabled: v };
                      if (v && (!updated.windows || updated.windows.length === 0)) {
                        updated.windows = [
                          { day: 1, start: '09:00', end: '17:00' },
                          { day: 2, start: '09:00', end: '17:00' },
                          { day: 3, start: '09:00', end: '17:00' },
                          { day: 4, start: '09:00', end: '17:00' },
                          { day: 5, start: '09:00', end: '17:00' },
                        ];
                      }
                      setProfile((prev: any) => ({ ...prev, booking_availability: updated }));
                      dilly.fetch('/booking/availability', { method: 'PATCH', body: JSON.stringify(updated) }).catch(() => {});
                    }}
                    trackColor={{ false: theme.surface.border, true: theme.accent + '40' }}
                    thumbColor={p.booking_availability?.enabled ? theme.accent : '#f4f3f4'}
                  />
                </View>

                {/* QR button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 0.5, borderColor: colors.b1 }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 14, color: colors.t1 }}>Show QR code</Text>
                    <Text style={{ fontSize: 11, color: colors.t3, marginTop: 2 }}>Visitors can scan a QR to save your profile</Text>
                  </View>
                  <Switch
                    value={p.show_qr_button !== false}
                    onValueChange={v => {
                      setProfile((prev: any) => ({ ...prev, show_qr_button: v }));
                      dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ show_qr_button: v }) }).catch(() => {});
                    }}
                    trackColor={{ false: theme.surface.border, true: theme.accent + '40' }}
                    thumbColor={p.show_qr_button !== false ? theme.accent : '#f4f3f4'}
                  />
                </View>

                {/* Refer button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 0.5, borderColor: colors.b1 }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 14, color: colors.t1 }}>Show Refer</Text>
                    <Text style={{ fontSize: 11, color: colors.t3, marginTop: 2 }}>Visitors can share your profile with others</Text>
                  </View>
                  <Switch
                    value={p.show_refer_button !== false}
                    onValueChange={v => {
                      setProfile((prev: any) => ({ ...prev, show_refer_button: v }));
                      dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ show_refer_button: v }) }).catch(() => {});
                    }}
                    trackColor={{ false: theme.surface.border, true: theme.accent + '40' }}
                    thumbColor={p.show_refer_button !== false ? theme.accent : '#f4f3f4'}
                  />
                </View>
              </View>

              {/* View + Share + QR */}
              {readableSlug ? (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <AnimatedPressable
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.accent, paddingVertical: 12, borderRadius: 10 }}
                      onPress={() => {
                        const { Linking } = require('react-native');
                        Linking.openURL(`https://hellodilly.com/${profilePrefix}/${readableSlug}`);
                      }}
                      scaleDown={0.97}
                    >
                      <Ionicons name="open-outline" size={14} color="#fff" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>View</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.accentSoft, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.accentBorder }}
                      onPress={() => {
                        const { Share } = require('react-native');
                        Share.share({ message: `https://hellodilly.com/${profilePrefix}/${readableSlug}` });
                      }}
                      scaleDown={0.97}
                    >
                      <Ionicons name="share-outline" size={14} color={theme.accent} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>Share</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.t3, fontStyle: 'italic' }}>Setting up your profile link...</Text>
              )}
            </View>
          )}
        </FadeInView>

        {/* ── 2. Talk to Dilly (rotating prompt) ───────────────── */}
        <FadeInView delay={80}>
          <AnimatedPressable
            style={[d.talkCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
            onPress={() => openDillyOverlay({
              isPaid: true,
              initialMessage: starter.prompt,
            })}
            scaleDown={0.98}
          >
            <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: starterOpacity }}>
              <View style={[d.talkIcon, { backgroundColor: theme.accent + '22' }]}>
                <Ionicons name={starter.icon as any} size={18} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[d.talkPrompt, { color: theme.surface.t1 }]}>{starter.display}</Text>
                <Text style={[d.talkHint, { color: theme.accent }]}>Tap to tell Dilly</Text>
              </View>
              <Ionicons name="chatbubble-ellipses" size={20} color={theme.accent} />
            </Animated.View>
          </AnimatedPressable>
        </FadeInView>

        {/* ── 3. Strengths Map ─────────────────────────────────── */}
        {/* Always render — even when no facts exist yet. Free-tier
            users who skipped the resume upload previously saw a
            blank profile because the whole section was gated on
            strengthCats.length > 0. Rendering the 16 empty
            category tiles with an "add" affordance gives them a
            way to populate without the resume and without hitting
            the paid chat gate. */}
        <FadeInView delay={200}>
            {/* Section header with a prominent always-visible Add
                button. Users were missing the in-tile +s before. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>
                {strengthCats.length > 0 ? 'WHAT WE KNOW ABOUT YOU' : 'BUILD YOUR PROFILE'}
              </Text>
              {/* 'Add a fact' is a rounded rectangle (not a pill) and
                  follows the user's accent from Customize Dilly. Radius
                  pulls from theme.shape.sm so shape axis actually
                  propagates here too. */}
              <AnimatedPressable
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: theme.shape.sm,
                  backgroundColor: theme.accentSoft,
                  borderWidth: 1, borderColor: theme.accentBorder,
                }}
                onPress={() => {
                  // Default to "project_detail" — widest-relevant bucket
                  // for a first fact. User can add anywhere after.
                  openAddFactModal('project_detail', STRENGTH_CATEGORIES.project_detail.label);
                }}
                scaleDown={0.95}
                hitSlop={8}
              >
                <Ionicons name="add" size={12} color={theme.accent} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.accent, letterSpacing: 0.2 }}>Add a fact</Text>
              </AnimatedPressable>
            </View>
            {/* Empty-state hint — only shown when no facts exist.
                Makes the grid of 16 empty tiles read as an
                invitation, not a void. */}
            {strengthCats.length === 0 && (
              <Text style={{
                fontSize: 12,
                lineHeight: 18,
                color: theme.surface.t2,
                marginBottom: 10,
              }}>
                Tap any category to add a fact. No resume needed — you can build your profile one small thing at a time.
              </Text>
            )}
            <View style={d.strengthGrid}>
              {Object.entries(STRENGTH_CATEGORIES).map(([key, cfg]) => {
                const facts = data?.grouped?.[key] || [];
                const filled = facts.length > 0;
                return (
                  <AnimatedPressable
                    key={key}
                    style={[
                      d.strengthCard,
                      { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                      filled && { borderColor: cfg.color + '40', backgroundColor: cfg.color + '08' },
                    ]}
                    onPress={() => {
                      if (filled) {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setExpandedCat(expandedCat === key ? null : key);
                      } else {
                        // Empty category tile -> open manual-add
                        // modal. Chat-based add was paywalled for free
                        // users with no way to add anything manually,
                        // leaving the whole profile un-populatable
                        // without a resume.
                        openAddFactModal(key, cfg.label);
                      }
                    }}
                    scaleDown={0.96}
                  >
                    <View style={[d.strengthIcon, { backgroundColor: filled ? cfg.color + '20' : theme.surface.s2 }]}>
                      <Ionicons name={cfg.icon as any} size={16} color={filled ? cfg.color : theme.surface.t3} />
                    </View>
                    <Text
                      style={[d.strengthName, { color: filled ? theme.surface.t1 : theme.surface.t3 }]}
                      numberOfLines={1}
                    >
                      {cfg.label}
                    </Text>
                    {filled ? (
                      <View style={[d.strengthBadge, { backgroundColor: cfg.color + '20' }]}>
                        <Text style={[d.strengthBadgeText, { color: cfg.color }]}>{facts.length}</Text>
                      </View>
                    ) : (
                      <Ionicons name="add-circle-outline" size={14} color={theme.surface.t3} />
                    )}
                  </AnimatedPressable>
                );
              })}
            </View>

            {/* Expanded category details */}
            {expandedCat && data?.grouped?.[expandedCat] && (
              <View style={[d.expandedFacts, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
                {data.grouped[expandedCat].slice(0, 8).map((fact, i) => (
                  <FactRow
                    key={fact.id || i}
                    fact={fact}
                    color={STRENGTH_CATEGORIES[expandedCat]?.color || theme.surface.t3}
                    onPress={(anchor) => setPopup({ visible: true, anchor, fact })}
                  />
                ))}
                {/* Add new fact — manual add so free users
                    without a resume can still populate this. */}
                <AnimatedPressable
                  style={[d.factRow, { borderTopWidth: 1, borderTopColor: theme.surface.border, paddingTop: 10 }]}
                  onPress={() => openAddFactModal(expandedCat, STRENGTH_CATEGORIES[expandedCat]?.label || expandedCat)}
                  scaleDown={0.97}
                >
                  <Ionicons name="add-circle" size={16} color={theme.accent} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.accent }}>Add to {STRENGTH_CATEGORIES[expandedCat]?.label || expandedCat}</Text>
                </AnimatedPressable>
              </View>
            )}
          </FadeInView>

        {/* ── 4. Skills Cloud ──────────────────────────────────── */}
        {allSkills.length > 0 && (
          <FadeInView delay={260}>
            <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>SKILLS DILLY KNOWS</Text>
            <View style={d.skillCloud}>
              {allSkills.slice(0, 20).map((skill, i) => {
                const conf = skill.confidence === 'high' ? 1 : skill.confidence === 'medium' ? 0.7 : 0.4;
                return (
                  <SkillTag key={skill.id || i} skill={skill} conf={conf} onPress={(anchor) => setPopup({ visible: true, anchor, fact: skill })} />
                );
              })}
            </View>
          </FadeInView>
        )}

        {/* ── 5. Help Dilly Help You (always visible) ─────────── */}
        <FadeInView delay={320}>
          <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>HELP DILLY HELP YOU</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[
              { icon: 'people', text: 'A leadership role you held', prompt: 'Help me describe a leadership role I held. Ask me about it.', color: colors.indigo },
              { icon: 'rocket', text: 'A project you are proud of', prompt: 'Help me talk about a project I am proud of. Ask me what I built.', color: colors.green },
              { icon: 'briefcase', text: 'An internship experience', prompt: 'Help me describe an internship I did. Ask me about the role.', color: colors.amber },
              { icon: 'compass', text: 'Your career goals', prompt: 'Help me articulate my career goals. Ask me what I want to do.', color: COBALT },
              { icon: 'build', text: 'A skill you are developing', prompt: 'Help me describe a skill I am developing. Ask me about it.', color: colors.coral },
              { icon: 'heart', text: 'A challenge you overcame', prompt: 'Help me talk about a challenge I overcame. Ask me what happened.', color: '#E040FB' },
              { icon: 'hand-left', text: 'Volunteer work', prompt: 'Help me describe my volunteer work. Ask me about the experience.', color: colors.green },
              { icon: 'school', text: 'Academic honors or GPA', prompt: 'Help me add my academic achievements to my profile. Ask me about them.', color: colors.indigo },
              { icon: 'flag', text: 'A club or organization', prompt: 'Help me describe a club or organization I was involved in. Ask me about my role.', color: colors.amber },
              { icon: 'globe', text: 'Industries that interest you', prompt: 'Help me figure out which industries interest me. Ask me what excites me.', color: COBALT },
              { icon: 'star', text: 'Your dream companies', prompt: 'Help me think about my dream companies. Ask me what I am looking for.', color: GOLD },
              { icon: 'chatbubbles', text: 'A time you worked on a team', prompt: 'Help me describe a time I worked on a team. Ask me about it.', color: colors.coral },
            ].slice((totalFacts % 8), (totalFacts % 8) + 4).concat(
              [{ icon: 'people', text: 'A leadership role', prompt: 'Help me describe a leadership role I held. Ask me about it.', color: colors.indigo },
               { icon: 'rocket', text: 'A project you are proud of', prompt: 'Help me talk about a project I am proud of. Ask me what I built.', color: colors.green },
               { icon: 'briefcase', text: 'An internship', prompt: 'Help me describe an internship I did. Ask me about the role.', color: colors.amber },
               { icon: 'compass', text: 'Your career goals', prompt: 'Help me articulate my career goals. Ask me what I want to do.', color: COBALT }]
            ).slice(0, 4).map((item, i) => (
              <AnimatedPressable
                key={i}
                style={[d.nudgeCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                onPress={() => openDillyOverlay({
                  isPaid: true,
                  initialMessage: item.prompt,
                })}
                scaleDown={0.97}
              >
                <View style={[d.nudgeIcon, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={16} color={item.color} />
                </View>
                <Text style={[d.nudgeText, { color: theme.surface.t1 }]}>{item.text}</Text>
                <Ionicons name="chevron-forward" size={12} color={theme.surface.t3} />
              </AnimatedPressable>
            ))}
          </ScrollView>
        </FadeInView>

        {/* ── 5b. Milestones ──────────────────────────────────── */}
        <FadeInView delay={350}>
          <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>YOUR MILESTONES</Text>
          <View style={{ gap: 6 }}>
            {totalFacts > 0 && (
              <View style={[d.milestoneRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={[d.milestoneText, { color: theme.surface.t2 }]}>{totalFacts} fact{totalFacts !== 1 ? 's' : ''} in your Dilly Profile</Text>
              </View>
            )}
            {resumes.length > 0 && (
              <View style={[d.milestoneRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={[d.milestoneText, { color: theme.surface.t2 }]}>{resumes.length} tailored resume{resumes.length !== 1 ? 's' : ''} generated</Text>
              </View>
            )}
            {totalFacts === 0 && resumes.length === 0 && (
              <AnimatedPressable
                style={[d.milestoneRow, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
                onPress={() => openDillyOverlay({ isPaid: false, initialMessage: 'I just joined Dilly. Help me get started building my profile. Ask me about my experiences, skills, and goals.' })}
                scaleDown={0.98}
              >
                <Ionicons name="chatbubble" size={16} color={theme.accent} />
                <Text style={[d.milestoneText, { color: theme.accent }]}>Start telling Dilly about yourself to unlock milestones</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.accent} />
              </AnimatedPressable>
            )}
          </View>
        </FadeInView>
        {/* ── 6. Pulse timeline ─────────────────────────────────
            Surfaces the user's daily pulse reflections as a
            chronological body of work. Makes the daily habit
            visible — users can see how they were feeling two weeks
            ago, what they were working on a month back. Zero LLM.
            Hides entirely when no pulses exist yet. */}
        <FadeInView delay={380}>
          <PulseTimelineSection theme={theme} />
        </FadeInView>

        {/* ── 7. My Resumes ──────────────────────────────────── */}
        {resumes.length > 0 && (
          <FadeInView delay={400}>
            <Text style={[d.sectionLabel, { color: theme.surface.t3 }]}>MY RESUMES</Text>
            {resumes.slice(0, 5).map((r) => {
              const date = new Date(r.created_at);
              const dateStr = `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
              return (
                <AnimatedPressable
                  key={r.id}
                  style={d.resumeCard}
                  onPress={() => router.push({ pathname: '/(app)/resume-generate', params: { viewId: r.id } })}
                  scaleDown={0.98}
                >
                  <Ionicons name="document-text-outline" size={18} color={COBALT} />
                  <View style={{ flex: 1 }}>
                    <Text style={d.resumeTitle}>{r.job_title}</Text>
                    <Text style={d.resumeSub}>{r.company} · {dateStr}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={10}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleShareResume(r);
                    }}
                    style={d.resumeShareBtn}
                  >
                    <Ionicons name="share-outline" size={16} color={COBALT} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                </AnimatedPressable>
              );
            })}
          </FadeInView>
        )}

        {/* Refresh reminder */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.t3, textAlign: 'center', lineHeight: 17 }}>
            Talked to Dilly? Pull down to refresh and see new things on your profile.
          </Text>
        </View>

        <DillyFooter />
      </ScrollView>

      {/* Inline popup for fact editing */}
      <InlinePopup
        visible={popup.visible}
        anchor={popup.anchor}
        title={popup.fact?.label}
        message={popup.fact?.value}
        actions={[
          {
            label: 'Edit',
            onPress: () => {
              if (!popup.fact) return;
              setEditingFact({ fact: popup.fact, label: popup.fact.label, value: popup.fact.value });
            },
          },
          {
            label: 'Delete',
            destructive: true,
            onPress: () => {
              if (!popup.fact) return;
              const factId = popup.fact.id;
              Alert.alert(
                'Dilly will forget this',
                'This information will be permanently removed from your Dilly Profile. Dilly will no longer know this about you.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
              try {
                await dilly.fetch(`/memory/items/${factId}`, { method: 'DELETE' });
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setData(prev => {
                  if (!prev) return prev;
                  const items = prev.items.filter(it => it.id !== factId);
                  const grouped: Record<string, any[]> = {};
                  for (const item of items) {
                    if (!grouped[item.category]) grouped[item.category] = [];
                    grouped[item.category].push(item);
                  }
                  return { ...prev, items, grouped };
                });
              } catch {}
                    },
                  },
                ],
              );
            },
          },
        ]}
        onClose={() => setPopup({ visible: false })}
      />

      {/* Inline fact editor */}
      {editingFact && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.15)' }]}
            activeOpacity={1}
            onPress={() => { Keyboard.dismiss(); setEditingFact(null); }}
          />
          <View style={d.inlineEditor}>
            <Text style={d.inlineEditorFieldLabel}>Title</Text>
            <TextInput
              style={d.inlineEditorLabelInput}
              value={editingFact.label}
              onChangeText={(v) => setEditingFact(prev => prev ? { ...prev, label: v } : prev)}
              autoFocus
              returnKeyType="next"
            />
            <Text style={[d.inlineEditorFieldLabel, { marginTop: 12 }]}>Value</Text>
            <TextInput
              style={d.inlineEditorInput}
              value={editingFact.value}
              onChangeText={(v) => setEditingFact(prev => prev ? { ...prev, value: v } : prev)}
              multiline
              returnKeyType="done"
              blurOnSubmit
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={d.inlineEditorCancel}
                onPress={() => setEditingFact(null)}
              >
                <Text style={{ fontSize: 13, color: colors.t2 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={d.inlineEditorSave}
                onPress={async () => {
                  if (!editingFact) return;
                  const { fact, label, value } = editingFact;
                  if (label.trim() === fact.label && value.trim() === fact.value) { setEditingFact(null); return; }
                  try {
                    await dilly.fetch(`/memory/items/${fact.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ label: label.trim(), value: value.trim() }),
                    });
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setData(prev => {
                      if (!prev) return prev;
                      const items = prev.items.map(it => it.id === fact.id ? { ...it, label: label.trim(), value: value.trim() } : it);
                      const grouped: Record<string, any[]> = {};
                      for (const item of items) {
                        if (!grouped[item.category]) grouped[item.category] = [];
                        grouped[item.category].push(item);
                      }
                      return { ...prev, items, grouped };
                    });
                  } catch {}
                  setEditingFact(null);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Manual add-fact modal. Reuses the inline-editor look for
          consistency. This is the escape hatch for free-tier users
          who didn't upload a resume — they can still grow their
          profile without being gated into the paid chat surface.
          Inline theme overrides are required because the base
          StyleSheet freezes the colors proxy at module load and
          would otherwise render white-on-white in dark mode. */}
      {addFactMounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Animated backdrop — fades opacity in sync with the card. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: 'rgba(0,0,0,0.5)',
                opacity: addFactAnim,
              },
            ]}
            pointerEvents={addFactModal.visible ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => { Keyboard.dismiss(); setAddFactModal(prev => ({ ...prev, visible: false })); }}
            />
          </Animated.View>
          {/* Animated card — fade + subtle scale-up from 0.96. */}
          <Animated.View
            style={[
              d.inlineEditor,
              {
                backgroundColor: theme.surface.s1,
                borderColor: theme.surface.border,
                opacity: addFactAnim,
                transform: [{
                  scale: addFactAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  }),
                }],
              },
            ]}
          >
            {/* Category picker — tap the pill to change bucket
                without closing the modal. Makes the top-level
                "Add a fact" button genuinely useful. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
              {Object.entries(STRENGTH_CATEGORIES).map(([k, cfg]) => {
                const active = addFactModal.category === k;
                return (
                  <AnimatedPressable
                    key={k}
                    onPress={() => setAddFactModal(prev => ({ ...prev, category: k, categoryLabel: cfg.label }))}
                    scaleDown={0.95}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: active ? cfg.color + '22' : theme.surface.s2,
                      borderWidth: 1, borderColor: active ? cfg.color + '55' : theme.surface.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: active ? '800' : '600', color: active ? cfg.color : theme.surface.t2 }}>
                      {cfg.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
            <Text style={[d.inlineEditorFieldLabel, { color: theme.surface.t3 }]}>Title</Text>
            <TextInput
              style={[d.inlineEditorLabelInput, { color: theme.surface.t1, borderColor: theme.surface.border, backgroundColor: theme.surface.s2 }]}
              value={addFactModal.label}
              onChangeText={(v) => setAddFactModal(prev => ({ ...prev, label: v }))}
              placeholder="e.g. Team Lead at University Data Lab"
              placeholderTextColor={theme.surface.t3}
              autoFocus
              returnKeyType="next"
              maxLength={80}
            />
            <Text style={[d.inlineEditorFieldLabel, { marginTop: 12, color: theme.surface.t3 }]}>Details</Text>
            <TextInput
              style={[d.inlineEditorInput, { color: theme.surface.t1, borderColor: theme.surface.border, backgroundColor: theme.surface.s2 }]}
              value={addFactModal.value}
              onChangeText={(v) => setAddFactModal(prev => ({ ...prev, value: v }))}
              placeholder="What happened, what you did, what you learned."
              placeholderTextColor={theme.surface.t3}
              multiline
              returnKeyType="done"
              blurOnSubmit
              maxLength={400}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[d.inlineEditorCancel, { backgroundColor: theme.surface.s2 }]}
                onPress={() => setAddFactModal(prev => ({ ...prev, visible: false }))}
                disabled={addFactModal.saving}
              >
                <Text style={{ fontSize: 13, color: theme.surface.t2 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[d.inlineEditorSave, { backgroundColor: theme.accent }, (!addFactModal.label.trim() || !addFactModal.value.trim() || addFactModal.saving) && { opacity: 0.5 }]}
                onPress={submitAddFact}
                disabled={!addFactModal.label.trim() || !addFactModal.value.trim() || addFactModal.saving}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>
                  {addFactModal.saving ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* QR Code Fullscreen. The QR itself stays dark-on-white for scan
          reliability — theme only chromes the surrounding screen. */}
      <Modal visible={showQrFullscreen} animationType="slide" presentationStyle="fullScreen" transparent={false}>
        <View style={{ flex: 1, backgroundColor: theme.surface.bg, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface.s2, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
            onPress={() => setShowQrFullscreen(false)}
          >
            <Ionicons name="close" size={20} color={theme.surface.t1} />
          </TouchableOpacity>

          {readableSlug ? (
            <>
              <View ref={qrCaptureRef} collapsable={false} style={{ padding: 24, backgroundColor: '#ffffff', alignItems: 'center' }}>
                {(() => {
                  let QRCode: any = null;
                  try { QRCode = require('react-native-qrcode-svg').default; } catch {}
                  if (!QRCode) return <Text style={{ color: colors.t3 }}>QR not available</Text>;
                  // Match the web profile QR: dark code + rectangular dark Dilly wordmark
                  // centered on a rounded white cutout. ECL=H keeps it scannable.
                  const QR_SIZE = 300;
                  const LOGO_W = 96;
                  const LOGO_H = Math.round(LOGO_W * (140 / 258));
                  const CUTOUT_PAD = 7;
                  return (
                    <View style={{ width: QR_SIZE, height: QR_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                      <QRCode
                        value={`https://hellodilly.com/${profilePrefix}/${readableSlug}`}
                        size={QR_SIZE}
                        color="#1e293b"
                        backgroundColor="#ffffff"
                        ecl="H"
                      />
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          width: LOGO_W + CUTOUT_PAD * 2,
                          height: LOGO_H + CUTOUT_PAD * 2,
                          backgroundColor: '#ffffff',
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Image
                          source={require('../../assets/dilly-wordmark.png')}
                          style={{ width: LOGO_W, height: LOGO_H, tintColor: '#1e293b' }}
                          resizeMode="contain"
                        />
                      </View>
                    </View>
                  );
                })()}
                {/* Name + URL sit INSIDE the captured QR card so they
                    travel with the shared image — stay dark-on-white. */}
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 14 }}>
                  {p.name || 'Your Profile'}
                </Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  hellodilly.com/{profilePrefix}/{readableSlug}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: theme.surface.t3, marginTop: 16, textAlign: 'center' }}>
                Scan to view profile
              </Text>
              <AnimatedPressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.accent }}
                onPress={async () => {
                  try {
                    let captureRef: any = null;
                    try { captureRef = require('react-native-view-shot').captureRef; } catch {}
                    let Sharing: any = null;
                    try { Sharing = require('expo-sharing'); } catch {}
                    if (!captureRef || !qrCaptureRef.current) {
                      // Fallback: share the link only
                      const { Share } = require('react-native');
                      await Share.share({
                        message: `https://hellodilly.com/${profilePrefix}/${readableSlug}`,
                        url: `https://hellodilly.com/${profilePrefix}/${readableSlug}`,
                      });
                      return;
                    }
                    const uri = await captureRef(qrCaptureRef.current, {
                      format: 'png',
                      quality: 1,
                      result: 'tmpfile',
                    });
                    if (!uri) return;
                    if (Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync())) {
                      await Sharing.shareAsync(uri, {
                        mimeType: 'image/png',
                        UTI: 'public.png',
                        dialogTitle: `${p.name || 'Dilly'} QR Code`,
                      });
                    } else {
                      const { Share } = require('react-native');
                      await Share.share({ url: uri, message: `https://hellodilly.com/${profilePrefix}/${readableSlug}` });
                    }
                  } catch (e) {
                    toast.show({ message: 'Could not share QR.' });
                  }
                }}
                scaleDown={0.97}
              >
                <Ionicons name="share-outline" size={15} color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Share QR</Text>
              </AnimatedPressable>
            </>
          ) : (
            <Text style={{ color: theme.surface.t3 }}>Setting up your profile link...</Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Holder "My Career" ────────────────────────────────────────────────────────
// Jobholders don't want a facts list. they want a career dashboard:
// trajectory, skills arsenal, and a real market-position block powered
// by BLS OES wage percentiles (dilly_core/bls_wages.py). Zero-LLM.

const HOLDER_ACCENT = '#1B3FA0';

function formatUsd(n: number): string {
  if (n >= 1000) return '$' + Math.round(n / 1000).toLocaleString() + 'K';
  return '$' + n.toLocaleString();
}

function tenureLabel(months: number): string {
  if (!months || months < 1) return '';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} in role`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${yrs} year${yrs === 1 ? '' : 's'} in role`;
  return `${yrs}y ${rem}m in role`;
}

function HolderCareer() {
  const insets = useSafeAreaInsets();
  // Holder layout reads theme so the entire My Career surface
  // respects dark mode. All the hc.* styles below lock in light
  // palette values at module load; we override at the call sites.
  const theme = useResolvedTheme();
  // Session-cached: renders instantly from the prior fetch on remount
  // (tab switches, mode flips), revalidates in background only if the
  // cached copy is older than 60s.
  const { data, loading, refreshing, refresh } = useCachedFetch<any>(
    'holder:career-dashboard',
    async () => {
      const res = await dilly.fetch('/holder/career-dashboard');
      return res?.ok ? await res.json() : null;
    },
    { ttlMs: 60_000 },
  );
  // Full profile (for the DillyCard and link-out surface). Cached
  // separately so other screens that read /profile share the same
  // session entry and don't duplicate the network call.
  const profileQ = useCachedFetch<any>(
    'profile:full',
    async () => await dilly.get('/profile').catch(() => null),
    { ttlMs: 60_000 },
  );
  const p = profileQ.data || {};
  const onRefresh = async () => { await Promise.all([refresh(), profileQ.refresh()]); };

  const identity  = data?.identity  || {};
  const comp      = data?.comp_benchmark;
  const trajectory: any[] = Array.isArray(data?.trajectory) ? data.trajectory : [];
  const skills: string[]  = Array.isArray(data?.skills)     ? data.skills     : [];

  const firstName = String(identity.name || '').split(/\s+/)[0] || 'there';
  // Photo URL resolution for the header avatar. Three sources in
  // priority order so fresh holders (no slug yet) still get an image:
  //   1. /profile/public/{slug}/photo (public, CDN-cached)
  //   2. identity.photo_url (dashboard response)
  //   3. p.photo_url (full profile response)
  // Cache-bust with a minute-resolution timestamp so stale 404s on
  // the CDN clear within ~60s of a new upload.
  const _bust = Math.floor(Date.now() / 60000);
  const photoFull =
    p.profile_slug
      ? `${API_BASE}/profile/public/${p.profile_slug}/photo?_t=${_bust}`
      : identity.photo_url
        ? (String(identity.photo_url).startsWith('http')
            ? identity.photo_url
            : `${API_BASE}${identity.photo_url}`)
        : p.photo_url
          ? (String(p.photo_url).startsWith('http')
              ? p.photo_url
              : `${API_BASE}${p.photo_url}`)
          : null;

  if (loading) {
    return (
      <View style={[hc.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.lg, gap: 16 }}>
          <View style={hc.skelHeader} />
          <View style={hc.skelCardTall} />
          <View style={hc.skelCard} />
        </View>
      </View>
    );
  }

  return (
    <View style={[hc.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}>
      {/* First-visit coach — holders see their career dashboard
          here. Different id/copy than the seeker variant. */}
      <FirstVisitCoach
        id="my-dilly-holder-v1"
        iconName="analytics"
        headline="Your career, tracked."
        subline="Your trajectory, raise brief, escape hatch, and everything Dilly is learning about you on the job."
      />

      <ScrollView
        contentContainerStyle={[hc.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {/* Header: name, role, company, photo */}
        <View style={hc.idRow}>
          <View style={{ flex: 1 }}>
            <Text style={[hc.eyebrow, { color: theme.accent }]}>MY CAREER</Text>
            <Text style={[hc.name, { color: theme.surface.t1 }]}>{identity.name || firstName}</Text>
            {identity.current_role ? (
              <Text style={[hc.role, { color: theme.surface.t2 }]}>
                {identity.current_role}
                {identity.current_company ? ` · ${identity.current_company}` : ''}
              </Text>
            ) : null}
            <View style={hc.metaRow}>
              {identity.years_experience ? (
                <Text style={[hc.meta, { color: theme.surface.t3 }]}>{identity.years_experience} yrs</Text>
              ) : null}
              {identity.tenure_months ? (
                <>
                  <View style={[hc.metaDot, { backgroundColor: theme.surface.t3 }]} />
                  <Text style={[hc.meta, { color: theme.surface.t3 }]}>{tenureLabel(identity.tenure_months)}</Text>
                </>
              ) : null}
            </View>
          </View>
          {photoFull ? (
            <Image source={{ uri: photoFull }} style={[hc.photo, { backgroundColor: theme.surface.s1 }]} />
          ) : (
            <View style={[hc.photo, hc.photoPlaceholder, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <Ionicons name="person" size={28} color={theme.surface.t3} />
            </View>
          )}
        </View>

        {/* DillyCard. reused from the seeker profile, mapped to
            role/company/YOE so the front shows the jobholder's
            actual identity. Card back + template picker work the
            same. */}
        <FadeInView delay={20}>
          <DillyCardEditor
            initialData={{
              name: identity.name || p.name || '',
              // Repurpose "school" slot for the company (line 1 on the card)
              school: identity.current_company || '',
              // "major" slot becomes their role
              major: identity.current_role || '',
              // "classYear" slot becomes tenure or YOE
              classYear:
                identity.tenure_months && identity.tenure_months >= 12
                  ? `since ${new Date().getFullYear() - Math.floor(identity.tenure_months / 12)}`
                  : identity.years_experience
                    ? `${identity.years_experience} yrs`
                    : '',
              tagline: p.profile_tagline || p.custom_tagline || '',
              email: p.email || '',
              phones: p.phones || [{ label: 'Cell', number: '' }],
              username: p.profile_slug || '',
              // Photo resolution order changed: prefer the explicit
              // photo_url fields FIRST (authoritative from /profile
              // and the career-dashboard), fall back to the public
              // slug URL only as a last resort. Previously we tried
              // the slug URL first, but that endpoint returns 404
              // when the user has a profile photo stored only in
              // photo_url (e.g. holders who uploaded during holder
              // onboarding but never hit the slug-photo migration).
              // Result: card showed the initial instead of the
              // actual photo even though the profile had one.
              photoUri: (() => {
                const bust = Math.floor(Date.now() / 60000);
                if (identity.photo_url) {
                  return String(identity.photo_url).startsWith('http')
                    ? `${identity.photo_url}?_t=${bust}`
                    : `${API_BASE}${identity.photo_url}?_t=${bust}`;
                }
                if (p.photo_url) {
                  return String(p.photo_url).startsWith('http')
                    ? `${p.photo_url}?_t=${bust}`
                    : `${API_BASE}${p.photo_url}?_t=${bust}`;
                }
                if (p.profile_slug) {
                  return `https://api.trydilly.com/profile/public/${p.profile_slug}/photo?_t=${bust}`;
                }
                return null;
              })(),
              city: (p.job_locations || [])[0] || '',
              readableSlug: p.readable_slug || '',
              profilePrefix: 'p',
            }}
            onSave={() => {}}
            userType={p.user_type || 'professional'}
          />
        </FadeInView>

        {/* Comp benchmark. the money shot */}
        {comp ? (
          <FadeInView delay={40}>
            <View style={hc.compCard}>
              <Text style={hc.compEyebrow}>MARKET POSITION</Text>
              <Text style={hc.compHeadline}>
                {comp.title}s earn {formatUsd(comp.p25)}–{formatUsd(comp.p75)}
              </Text>
              <Text style={hc.compSub}>
                Your estimated market value at {identity.years_experience || 0} yrs:{' '}
                <Text style={hc.compEstValue}>{formatUsd(comp.estimated_wage)}</Text>
              </Text>

              {/* Percentile bar */}
              <View style={hc.pctTrack}>
                <View style={[hc.pctFill, { width: `${Math.max(6, comp.estimated_percentile)}%` }]} />
                <View style={[hc.pctMarker, { left: `${Math.max(6, comp.estimated_percentile)}%` }]}>
                  <Text style={hc.pctMarkerText}>P{comp.estimated_percentile}</Text>
                </View>
              </View>

              {/* Percentile scale */}
              <View style={hc.pctScale}>
                {[
                  { k: 'p10', v: comp.p10 },
                  { k: 'p25', v: comp.p25 },
                  { k: 'p50', v: comp.p50 },
                  { k: 'p75', v: comp.p75 },
                  { k: 'p90', v: comp.p90 },
                ].map(({ k, v }) => (
                  <View key={k} style={hc.pctTick}>
                    <Text style={hc.pctTickPct}>{k.toUpperCase().replace('P', '')}</Text>
                    <Text style={hc.pctTickVal}>{formatUsd(v)}</Text>
                  </View>
                ))}
              </View>

              {/* Company premium badge. only rendered when we had a
                  curated multiplier for this user's company. Keeps
                  the claim honest ("adjusted for {Company}") instead
                  of silently inflating the number. Below-1.0 mults
                  (nonprofits etc.) show the same badge with a minus
                  framing. */}
              {comp.company_multiplier && comp.company_multiplier !== 1 ? (
                <View style={hc.companyPremiumRow}>
                  <Ionicons
                    name={comp.company_multiplier > 1 ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={comp.company_multiplier > 1 ? '#4ADE80' : '#F87171'}
                  />
                  <Text style={hc.companyPremiumText}>
                    Adjusted for {String(comp.company_match || '').replace(/\b\w/g, c => c.toUpperCase())}
                    {'  '}
                    <Text style={{ color: comp.company_multiplier > 1 ? '#4ADE80' : '#F87171' }}>
                      {comp.company_multiplier > 1 ? '+' : ''}
                      {Math.round((comp.company_multiplier - 1) * 100)}%
                    </Text>
                  </Text>
                </View>
              ) : null}

              <Text style={hc.compFoot}>
                {comp.source} · national, cross-industry
                {comp.company_multiplier && comp.company_multiplier !== 1 ? '' : ' · excludes geo + company premium'}
              </Text>
            </View>
          </FadeInView>
        ) : null}

        {/* Trajectory timeline */}
        {trajectory.length > 0 ? (
          <FadeInView delay={80}>
            <Text style={[hc.sectionLabel, { color: theme.surface.t3 }]}>TRAJECTORY</Text>
            <View style={hc.trajWrap}>
              {trajectory.map((t, i) => {
                const last = i === trajectory.length - 1;
                return (
                  <View key={`${t.company}-${i}`} style={hc.trajRow}>
                    {/* Rail */}
                    <View style={hc.trajRail}>
                      <View style={[hc.trajDot, { backgroundColor: theme.surface.border, borderColor: theme.surface.bg }, i === 0 && { backgroundColor: theme.accent }]} />
                      {!last && <View style={[hc.trajLine, { backgroundColor: theme.surface.border }]} />}
                    </View>
                    {/* Content */}
                    <View style={hc.trajContent}>
                      {t.role ? <Text style={[hc.trajRole, { color: theme.surface.t1 }]}>{t.role}</Text> : null}
                      <Text style={[hc.trajCompany, { color: theme.surface.t2 }]}>
                        {t.company}
                        {t.date ? <Text style={[hc.trajDate, { color: theme.surface.t3 }]}>   ·  {t.date}</Text> : null}
                      </Text>
                      {t.location ? <Text style={[hc.trajLocation, { color: theme.surface.t3 }]}>{t.location}</Text> : null}
                      {(t.bullets || []).slice(0, 3).map((b: string, j: number) => (
                        <Text key={j} style={[hc.trajBullet, { color: theme.surface.t2 }]} numberOfLines={2}>• {b}</Text>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </FadeInView>
        ) : null}

        {/* Power duo: Raise Brief + Escape Hatch. These are the two
            holder-killer tools. one prepares for the conversation
            you want to have, the other quietly reads the market for
            the conversation you might need later. Sit-above-skills
            placement: after trajectory so they always appear in the
            top half of the scroll, never buried. */}
        <FadeInView delay={100}>
          <View style={hc.powerDuo}>
            <AnimatedPressable
              style={[hc.powerCard, hc.powerCardLeft, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
              scaleDown={0.97}
              onPress={() => router.push('/(app)/raise-brief' as any)}
            >
              <View style={[hc.powerIcon, { backgroundColor: '#FACC15' + '22' }]}>
                <Ionicons name="trending-up" size={18} color="#CA8A04" />
              </View>
              <Text style={[hc.powerLabel, { color: theme.surface.t1 }]}>RAISE BRIEF</Text>
              <Text style={[hc.powerSub, { color: theme.surface.t2 }]}>Your pre-meeting playbook.</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[hc.powerCard, hc.powerCardRight, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
              scaleDown={0.97}
              onPress={() => router.push('/(app)/escape-hatch' as any)}
            >
              <View style={[hc.powerIcon, { backgroundColor: '#60A5FA' + '22' }]}>
                <Ionicons name="compass" size={18} color="#2563EB" />
              </View>
              <Text style={[hc.powerLabel, { color: theme.surface.t1 }]}>ESCAPE HATCH</Text>
              <Text style={[hc.powerSub, { color: theme.surface.t2 }]}>Quiet read on what's out there.</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* Skills arsenal */}
        {skills.length > 0 ? (
          <FadeInView delay={120}>
            <Text style={[hc.sectionLabel, { color: theme.surface.t3 }]}>SKILLS ARSENAL</Text>
            <View style={hc.skillsGrid}>
              {skills.map((s, i) => (
                <View key={`${s}-${i}`} style={[hc.skillChip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                  <Text style={[hc.skillText, { color: theme.accent }]} numberOfLines={1}>{s}</Text>
                </View>
              ))}
            </View>
          </FadeInView>
        ) : null}

        {/* Tenure insights. quick read on how long they've been in
            the current role. Uses trajectory + tenure_months from
            the dashboard; computes a median-tenure note only when
            we have something reasonable to say. */}
        {identity.tenure_months && identity.tenure_months >= 1 ? (
          <FadeInView delay={140}>
            <Text style={[hc.sectionLabel, { color: theme.surface.t3 }]}>TENURE READ</Text>
            <View style={[hc.tenureCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <View style={hc.tenureRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[hc.tenureNum, { color: theme.surface.t1 }]}>
                    {identity.tenure_months >= 12
                      ? `${(identity.tenure_months / 12).toFixed(1)} yrs`
                      : `${identity.tenure_months} mo`}
                  </Text>
                  <Text style={[hc.tenureLabel, { color: theme.surface.t3 }]}>
                    in {identity.current_role || 'your current role'}
                  </Text>
                </View>
                <View style={hc.tenureRight}>
                  <Text style={[hc.tenureRightPct, { color: theme.accent }]}>
                    {identity.tenure_months >= 36 ? 'STICKY'
                      : identity.tenure_months >= 18 ? 'TYPICAL'
                      : 'EARLY'}
                  </Text>
                  <Text style={[hc.tenureRightSub, { color: theme.surface.t2 }]}>
                    {identity.tenure_months >= 36 ? 'promotion or move worth a look'
                      : identity.tenure_months >= 18 ? 'on track for this role'
                      : 'building credibility here'}
                  </Text>
                </View>
              </View>
            </View>
          </FadeInView>
        ) : null}

        {/* What's Next. three tap-to-Dilly starter prompts tailored
            for holders. Kills the "nothing's here" feeling on fresh
            accounts and teaches what Dilly is actually for. */}
        <FadeInView delay={180}>
          <Text style={[hc.sectionLabel, { color: theme.surface.t3 }]}>WHAT TO ASK DILLY</Text>
          <View style={{ gap: 8 }}>
            {[
              {
                icon: 'trending-up' as const,
                title: 'Should I ask for a raise?',
                seed: `I'm a ${identity.current_role || 'professional'} with ${identity.years_experience || 'some'} years of experience${identity.current_company ? ` at ${identity.current_company}` : ''}. I've been in this role ${identity.tenure_months ? `${Math.round(identity.tenure_months)} months` : 'for a while'}. Walk me through whether it's time to ask for a raise, and what number to ask for.`,
              },
              {
                icon: 'git-branch' as const,
                title: 'What should I learn this quarter?',
                seed: `I'm a ${identity.current_role || 'professional'}. My field is shifting fast with AI. What are the 2-3 things I should actually learn this quarter to stay valuable and future-proof my career?`,
              },
              {
                icon: 'compass' as const,
                title: 'Is it time to move on?',
                seed: `I'm a ${identity.current_role || 'professional'}${identity.current_company ? ` at ${identity.current_company}` : ''}, ${identity.tenure_months ? `${Math.round(identity.tenure_months)} months in` : 'been here a while'}. Help me think through whether it's time to start looking for something new. Push back on me.`,
              },
            ].map(prompt => (
              <AnimatedPressable
                key={prompt.title}
                style={[hc.promptCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                scaleDown={0.98}
                onPress={() => openDillyOverlay({ isPaid: true, initialMessage: prompt.seed })}
              >
                <View style={[hc.promptIcon, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name={prompt.icon} size={16} color={theme.accent} />
                </View>
                <Text style={[hc.promptText, { color: theme.surface.t1 }]}>{prompt.title}</Text>
                <Ionicons name="arrow-forward" size={14} color={theme.surface.t3} />
              </AnimatedPressable>
            ))}
          </View>
        </FadeInView>

        {/* Ask Dilly */}
        <FadeInView delay={220}>
          <AnimatedPressable
            style={[hc.askCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
            scaleDown={0.98}
            onPress={() => openDillyOverlay({ isPaid: true })}
          >
            <View style={[hc.askIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="chatbubbles" size={18} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[hc.askTitle, { color: theme.surface.t1 }]}>Talk to Dilly</Text>
              <Text style={[hc.askSub, { color: theme.surface.t2 }]}>Negotiate a raise, plan your next move, or stress-test a job offer.</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={theme.accent} />
          </AnimatedPressable>
        </FadeInView>

        {/* Life event switch: moved here (bottom of My Career) so it
            doesn't crowd the primary holder content up top. Users who
            actually need it will scroll to find it. Copy updated to
            cover both layoff and voluntary departure ("no longer
            employed") since not everyone who leaves a job was fired. */}
        <FadeInView delay={260}>
          <AnimatedPressable
            style={hc.layoffBtn}
            scaleDown={0.98}
            onPress={() => router.push('/onboarding/mode-switch?to=seeker' as any)}
          >
            <Ionicons name="sync-outline" size={14} color="#B45309" />
            <Text style={hc.layoffBtnText}>
              I got laid off or am no longer employed. Switch to Job Search.
            </Text>
          </AnimatedPressable>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

// Holder My-Career stylesheet. scoped to avoid collisions with `d`.
const hc = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: 20 },

  // Skeleton placeholders
  skelHeader: { height: 80, borderRadius: 14, backgroundColor: '#EEF0F6' },
  skelCardTall: { height: 220, borderRadius: 18, backgroundColor: '#EEF0F6' },
  skelCard: { height: 140, borderRadius: 16, backgroundColor: '#EEF0F6' },

  // Identity row
  idRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    color: HOLDER_ACCENT, marginBottom: 2,
  },
  name:  { fontSize: 24, fontWeight: '800', color: colors.t1, marginBottom: 2 },
  role:  { fontSize: 14, fontWeight: '600', color: colors.t2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  meta: { fontSize: 12, color: colors.t3 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.t3 },
  photo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.s1 },
  photoPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.b1, borderStyle: 'dashed',
  },

  // Comp card
  compCard: {
    backgroundColor: '#0D1117',
    borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#21262D',
  },
  compEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.6,
    color: '#8B949E', marginBottom: 6,
  },
  compHeadline: { fontSize: 17, fontWeight: '700', color: '#F0F6FC', lineHeight: 22 },
  compSub: { fontSize: 13, color: '#C9D1D9', marginTop: 8, lineHeight: 19 },
  compEstValue: { fontWeight: '700', color: '#58A6FF' },

  pctTrack: {
    position: 'relative',
    height: 8, borderRadius: 4, backgroundColor: '#21262D',
    // Was marginTop: 18. the absolutely-positioned P-marker above
    // (top: -26) overlapped the 'Your estimated market value' line.
    // Bumped to 42 so the marker floats fully above the bar with
    // breathing room.
    marginTop: 42,
  },
  pctFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    borderRadius: 4, backgroundColor: '#58A6FF',
  },
  pctMarker: {
    position: 'absolute', top: -26, marginLeft: -18,
    backgroundColor: '#58A6FF', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  pctMarkerText: { fontSize: 10, fontWeight: '800', color: '#0D1117' },

  pctScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  pctTick: { alignItems: 'center' },
  pctTickPct: { fontSize: 9, fontWeight: '700', color: '#8B949E' },
  pctTickVal: { fontSize: 10, fontWeight: '600', color: '#C9D1D9', marginTop: 1 },

  compFoot: { fontSize: 10, color: '#6B7280', marginTop: 12, textAlign: 'right' },
  companyPremiumRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.25)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  companyPremiumText: { fontSize: 11, fontWeight: '700', color: '#C9D1D9' },

  // Sections
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    color: colors.t3, marginBottom: 10,
  },

  // Trajectory
  trajWrap: { gap: 14 },
  trajRow: { flexDirection: 'row', gap: 12 },
  trajRail: { alignItems: 'center', width: 14, paddingTop: 6 },
  trajDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.b1, borderWidth: 2, borderColor: colors.bg,
  },
  trajDotActive: { backgroundColor: HOLDER_ACCENT },
  trajLine: { flex: 1, width: 2, backgroundColor: colors.b1, marginTop: 4 },
  trajContent: { flex: 1, paddingBottom: 4 },
  trajRole: { fontSize: 15, fontWeight: '700', color: colors.t1 },
  trajCompany: { fontSize: 13, fontWeight: '600', color: colors.t2, marginTop: 1 },
  trajDate: { fontWeight: '400', color: colors.t3 },
  trajLocation: { fontSize: 12, color: colors.t3, marginTop: 1 },
  trajBullet: { fontSize: 12, color: colors.t2, marginTop: 5, lineHeight: 17 },

  // Skills
  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999, backgroundColor: HOLDER_ACCENT + '10',
    borderWidth: 1, borderColor: HOLDER_ACCENT + '25',
  },
  skillText: { fontSize: 12, fontWeight: '600', color: HOLDER_ACCENT },

  // Layoff switch
  layoffBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FCD34D',
  },
  layoffBtnText: { fontSize: 12, fontWeight: '700', color: '#78350F' },

  // Power duo (Raise Brief + Escape Hatch)
  powerDuo: { flexDirection: 'row', gap: 10 },
  powerCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 14, padding: 14, gap: 8,
  },
  powerCardLeft:  {},
  powerCardRight: {},
  powerIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  powerLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: colors.t1 },
  powerSub:   { fontSize: 12, color: colors.t2, lineHeight: 17 },

  // Tenure read card
  tenureCard: {
    backgroundColor: '#FAFAFC',
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 14, padding: 14,
  },
  tenureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tenureNum: { fontSize: 22, fontWeight: '800', color: colors.t1, letterSpacing: -0.4 },
  tenureLabel: { fontSize: 12, color: colors.t3, marginTop: 2 },
  tenureRight: { alignItems: 'flex-end', maxWidth: '55%' },
  tenureRightPct: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.4,
    color: HOLDER_ACCENT,
  },
  tenureRightSub: { fontSize: 11, color: colors.t2, marginTop: 3, textAlign: 'right' },

  // What to ask Dilly prompt cards
  promptCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.b1,
  },
  promptIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: HOLDER_ACCENT + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  promptText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.t1 },

  // Ask Dilly
  askCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: '#FAFAFC',
    borderWidth: 1, borderColor: colors.b1,
  },
  askIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: HOLDER_ACCENT + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  askTitle: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  askSub:   { fontSize: 12, color: colors.t2, marginTop: 2 },
});

// Dispatcher. isHolder gets the career dashboard, everyone else the
// original identity-facts profile. Keeping the two bodies in separate
// components preserves hook order when the mode flips mid-session.
export default function MyDillyProfileScreen() {
  const appMode = useAppMode();
  if (appMode === 'holder') return <HolderCareer />;
  return <SeekerProfileScreen />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.t1 },
  scroll: { paddingHorizontal: spacing.lg, gap: 16 },

  // Identity Card
  idCard: { borderRadius: 18, overflow: 'hidden' },
  idCardGradient: {
    backgroundColor: '#0D1117', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: '#21262D',
  },
  idCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  idCardBrand: { fontSize: 10, fontWeight: '800', letterSpacing: 3, color: CYAN, marginBottom: 6 },
  idCardName: { fontSize: 22, fontWeight: '800', color: '#F0F6FC', lineHeight: 26 },
  idCardCohort: { fontSize: 13, color: '#8B949E', marginTop: 4 },
  idCardSchool: { fontSize: 11, color: '#484F58', marginTop: 2 },
  idCardBottom: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
    marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#21262D',
  },
  idCardStat: { alignItems: 'center' },
  idCardStatNum: { fontSize: 18, fontWeight: '800', color: '#F0F6FC' },
  idCardStatLabel: { fontSize: 9, color: '#484F58', marginTop: 2, fontWeight: '600', letterSpacing: 0.5 },
  shareBtn: { marginLeft: 'auto', padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },

  // Talk to Dilly
  talkCard: {
    backgroundColor: COBALT + '08', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: COBALT + '25',
  },
  talkIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COBALT + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  talkPrompt: { fontSize: 14, fontWeight: '600', color: colors.t1, lineHeight: 19 },
  talkHint: { fontSize: 11, color: COBALT, marginTop: 2, fontWeight: '500' },

  // Section label
  sectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: colors.t3, marginBottom: 4 },
  citySection: { gap: 8 },

  // Profile growth meter. retention lever. Hidden once user hits 80+ facts.
  growthCard: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.indigo + '0a',
    borderWidth: 1,
    borderColor: colors.indigo + '33',
  },
  growthHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  growthLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.indigo,
  },
  growthCount: {},
  growthCountNum: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.t1,
    letterSpacing: -0.5,
  },
  growthCountUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.t3,
  },
  growthTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.indigo + '1a',
    overflow: 'hidden',
    marginBottom: 10,
  },
  growthFill: {
    height: '100%',
    backgroundColor: colors.indigo,
    borderRadius: 3,
  },
  growthSub: {
    fontSize: 12,
    color: colors.t2,
    lineHeight: 17,
    marginBottom: 12,
  },
  growthCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.indigo,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  growthCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  cityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.idim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.ibdr,
  },
  cityChipText: { fontSize: 12, fontWeight: '600', color: colors.t1 },
  addCityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.idim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.ibdr, borderStyle: 'dashed' as any,
  },
  cityInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
  },
  cityInput: {
    flex: 1, backgroundColor: colors.s1, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.t1,
  },
  cityAddBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.indigo, alignItems: 'center', justifyContent: 'center',
  },
  cityDropdown: {
    backgroundColor: colors.s1, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    marginTop: 4, overflow: 'hidden',
  },
  cityDropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  cityDropdownText: { fontSize: 13, color: colors.t1 },

  // Strengths Map
  strengthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  strengthCard: {
    width: (W - spacing.lg * 2 - 8) / 2, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  strengthIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  strengthName: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.t3 },
  strengthBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  strengthBadgeText: { fontSize: 10, fontWeight: '700' },

  // Expanded facts. marginTop keeps the category-grid chip and the
  // fact list visually distinct instead of mashed together.
  expandedFacts: {
    marginTop: 12,
    backgroundColor: colors.s1, borderRadius: 10, padding: 12, gap: 8,
    borderWidth: 1, borderColor: colors.b1,
  },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  factLabel: { fontSize: 12, fontWeight: '600', color: colors.t1 },
  factValue: { fontSize: 11, color: colors.t2, lineHeight: 16, marginTop: 1 },

  // Skills Cloud
  skillCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillTag: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COBALT + '10', borderWidth: 1, borderColor: COBALT + '20',
  },
  skillTagText: { fontWeight: '600', color: COBALT },

  // Nudge cards (horizontal scroll)
  nudgeCard: {
    width: 160, backgroundColor: colors.s1, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.b1, gap: 8,
  },
  nudgeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nudgeText: { fontSize: 12, fontWeight: '500', color: colors.t1, lineHeight: 17 },

  // Activity
  activityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s1, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.b1,
  },
  activityText: { fontSize: 12, color: colors.t2, fontWeight: '500' },

  // Milestones
  // Edit mode
  editSection: {
    backgroundColor: colors.s1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.b1, padding: spacing.lg, gap: 16,
    marginBottom: 8,
  },
  editPhotoBtn: { alignItems: 'center', gap: 8 },
  editPhotoImg: { width: 80, height: 80, borderRadius: 40 },
  // Grayed camera mold — rendered when the user has no photo yet.
  // Dashed border reads as "empty slot, add something here" per
  // standard photo-upload UX patterns. Slightly bigger than the
  // filled photo so the target feels tappable.
  editPhotoPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.s2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.b1,
    borderStyle: 'dashed',
  },
  editPhotoLabel: { fontSize: 12, fontWeight: '600', color: colors.indigo },
  editField: { gap: 4 },
  editFieldLabel: { fontSize: 11, fontWeight: '600', color: colors.t2 },
  editFieldInput: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.b1,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.t1,
  },

  milestoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s1, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.b1,
  },
  milestoneText: { fontSize: 12, color: colors.t2, fontWeight: '500' },

  // My Resumes
  resumeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.b1, marginBottom: 8,
  },
  resumeTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  resumeSub: { fontSize: 11, color: colors.t3, marginTop: 2 },
  resumeShareBtn: {
    padding: 6, borderRadius: 8, backgroundColor: COBALT + '10',
  },

  // Inline fact editor
  inlineEditor: {
    position: 'absolute',
    top: '30%',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.b1,
  },
  inlineEditorLabel: { fontSize: 12, fontWeight: '700', color: colors.t2, marginBottom: 8 },
  inlineEditorFieldLabel: { fontSize: 11, fontWeight: '600', color: colors.t3, marginBottom: 4, letterSpacing: 0.5 },
  inlineEditorLabelInput: {
    fontSize: 15, fontWeight: '600', color: colors.t1,
    borderWidth: 1, borderColor: colors.b1, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  inlineEditorInput: {
    fontSize: 15, color: colors.t1, lineHeight: 21,
    borderWidth: 1, borderColor: colors.b1, borderRadius: 10,
    padding: 12, minHeight: 60, textAlignVertical: 'top',
  },
  inlineEditorCancel: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, backgroundColor: colors.s2,
  },
  inlineEditorSave: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, backgroundColor: GOLD,
  },
});
