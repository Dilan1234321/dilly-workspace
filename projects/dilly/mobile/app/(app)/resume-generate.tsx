import { safeBack } from '../../lib/navigation';
/**
 * Generate Resume - "The Forge"
 *
 * This is not a resume generator. It is a one-role, one-company
 * artifact builder. Every surface here reinforces: your profile
 * plus this specific job, forged into a resume that hits this
 * company's ATS bar.
 *
 * Differentiators (why the user pays for this):
 *   - JD strength meter during setup - instant signal that the
 *     quality of what they paste directly shapes what they get.
 *   - Narrated forge stages during generation, plus a live
 *     keyword ticker showing what Dilly just pulled out of the JD.
 *     The user watches the machine work.
 *   - ATS Readiness scorecard on the done screen: 4 axes (ATS
 *     parse, Keyword match, Profile depth, Role fit). Reads like
 *     an instrument panel, not a success message.
 *   - Keyword-highlighted preview: every token from the JD that
 *     landed in the resume lights up in indigo. The user sees
 *     the match, doesn't have to trust it.
 *   - Weakest-bullet spotlight: the one bullet that looks thinnest
 *     (no metrics, short, vague) is called out with a one-tap
 *     path into Dilly chat to strengthen it.
 *   - Same API contract (/resume/generate → /generated-resumes)
 *     and same deep-link viewId flow. Pure UI rewrite.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
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
import { FirstVisitCoach } from '../../components/FirstVisitCoach';
import FadeInView from '../../components/FadeInView';
import { DillyFeatureBanner } from '../../components/DillyFeatureBanner';
import { useSubscription } from '../../hooks/useSubscription';
import { useResolvedTheme } from '../../hooks/useTheme';
import { showToast } from '../../lib/globalToast';
import { emailResume } from '../../lib/mail';
import { findContactsAtCompany, saveContact } from '../../lib/contacts';

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

// Pull the first non-empty string from a list of profile shapes.
// Profiles can store the same data under different keys depending on
// when the row was created (transcript_school vs school_name etc.).
function _firstStr(...candidates: any[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number' && !Number.isNaN(c)) return String(c);
  }
  return '';
}

function _firstFromArr(arr: any): string {
  if (!Array.isArray(arr)) return '';
  for (const item of arr) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object') {
      // {label, number} for phones, {city} for locations, etc.
      const v = item.number || item.value || item.city || item.name || '';
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
}

/**
 * Fill empty contact + education fields with what Dilly already
 * knows about the user. The LLM's generation often leaves these
 * blank or generic (it doesn't know your phone number); pulling
 * them from /profile saves the user from re-typing every time.
 *
 * Existing non-empty values are preserved - we only fill blanks so
 * any deliberate edit the user already made is not overwritten.
 */
function hydrateFromProfile(
  sections: GeneratedSection[],
  profile: Record<string, any>,
): GeneratedSection[] {
  if (!profile || !sections.length) return sections;

  const profileEmail   = _firstStr(profile.email, profile.login_email);
  const profilePhone   = _firstStr(profile.phone, profile.phone_number) || _firstFromArr(profile.phones);
  const profileCity    = _firstFromArr(profile.job_locations) || _firstStr(profile.location, profile.city);
  const profileLinked  = _firstStr(profile.linkedin_url, profile.linkedin);
  const profileName    = _firstStr(profile.name, profile.full_name);
  const profileSchool  = _firstStr(profile.transcript_school, profile.school_name, profile.school);
  const profileMajor   = _firstStr(profile.transcript_major, profile.major) || _firstFromArr(profile.majors);
  const profileMinor   = _firstStr(profile.transcript_minor, profile.minor) || _firstFromArr(profile.minors);
  const profileGpa     = _firstStr(profile.transcript_gpa, profile.gpa);
  const profileGradYr  = _firstStr(profile.graduation_year, profile.grad_year);
  const profileGradStr = profileGradYr
    ? (profile.graduation_term ? `${profile.graduation_term} ${profileGradYr}` : `Expected ${profileGradYr}`)
    : '';

  return sections.map(s => {
    if (s.contact) {
      const c = s.contact;
      return {
        ...s,
        contact: {
          name:     c.name     || profileName,
          email:    c.email    || profileEmail,
          phone:    c.phone    || profilePhone,
          location: c.location || profileCity,
          linkedin: c.linkedin || profileLinked,
        },
      };
    }
    if (s.education) {
      const e = s.education;
      return {
        ...s,
        education: {
          ...e,
          university: e.university || profileSchool,
          major:      e.major      || profileMajor,
          minor:      e.minor      || profileMinor,
          gpa:        e.gpa        || profileGpa,
          graduation: e.graduation || profileGradStr,
          location:   e.location   || profileCity,
        },
      };
    }
    return s;
  });
}

// The forge stages the user sees during generation. Each dwells
// for ~3s; if the API comes back first, we jump to done.
const FORGE_STAGES = [
  { icon: 'document-text', text: 'Parsing the job description' },
  { icon: 'analytics', text: "Extracting what they're hiring for" },
  { icon: 'flash', text: 'Mining your profile for matches' },
  { icon: 'construct', text: 'Tailoring every bullet to this role' },
  { icon: 'shield-checkmark', text: 'Formatting for ATS parse' },
];

/** Common English stopwords we strip before keyword extraction. */
const STOP = new Set(['a','an','the','and','or','but','of','in','on','for','to','with','by','at','from','as','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','can','could','should','may','might','must','shall','this','that','these','those','we','you','your','our','their','they','it','its','i','he','she','his','her','them','who','what','which','when','where','why','how','so','if','then','than','just','more','most','some','any','all','each','every','no','not','only','own','same','such','other','new','will','up','out','over','about','into','through','during','before','after','above','below','between','against','both','few','here','there','now','ever','also','very','across','per','using','use','used','like','including','include','includes','included','etc','year','years','role','team','teams','work','working','works']);

/**
 * Pull likely-meaningful tokens out of a blob of text.
 * Words of len >= 3, not stopwords, alphanumeric, unique.
 * Used both to extract JD keywords and to match them in the
 * generated resume for highlighting.
 */
function tokenize(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const tokens = (raw || '').toLowerCase().match(/[a-z][a-z0-9+#.\-]{2,}/g) || [];
  for (const t of tokens) {
    const clean = t.replace(/^[.-]+|[.-]+$/g, '');
    if (clean.length < 3) continue;
    if (STOP.has(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/** Flatten a GeneratedSection[] into the text the resume displays. */
function resumeText(sections: GeneratedSection[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (s.contact) parts.push(Object.values(s.contact).filter(Boolean).join(' '));
    if (s.education) parts.push(Object.values(s.education).filter(Boolean).join(' '));
    if (s.experiences) for (const e of s.experiences) {
      parts.push([e.role, e.company, e.location, e.date].filter(Boolean).join(' '));
      if (e.bullets) for (const b of e.bullets) parts.push(typeof b === 'string' ? b : b.text);
    }
    if (s.projects) for (const p of s.projects) {
      parts.push([p.name, p.tech, p.date].filter(Boolean).join(' '));
      if (p.bullets) for (const b of p.bullets) parts.push(typeof b === 'string' ? b : b.text);
    }
    if (s.simple?.lines) parts.push(s.simple.lines.join(' '));
  }
  return parts.join(' ');
}

/** Find the "weakest" bullet - heuristic: short + no metrics/numbers. */
function findWeakestBullet(sections: GeneratedSection[]): { text: string; where: string } | null {
  const candidates: { text: string; where: string; score: number }[] = [];
  const hasMetric = (t: string) => /\d/.test(t);
  for (const s of sections) {
    if (s.experiences) for (const e of s.experiences) {
      if (!e.bullets) continue;
      for (const b of e.bullets) {
        const t = (typeof b === 'string' ? b : b.text) || '';
        if (t.trim().length < 20) continue;
        // Higher score = weaker. Short + no metric = weakest.
        const score = (hasMetric(t) ? 0 : 2) + Math.max(0, 120 - t.length) / 60;
        candidates.push({ text: t, where: `${e.role}${e.company ? ` at ${e.company}` : ''}`, score });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score > 1.5 ? { text: candidates[0].text, where: candidates[0].where } : null;
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: INDIGO, marginHorizontal: 3, marginTop: delay }, style]} />
  );
}

export default function ResumeGenerateScreen() {
  const insets = useSafeAreaInsets();
  // Full theme so the Forge flips with Customize Dilly. Minimum pass:
  // root surface + container bg respect the user's surface choice.
  const theme = useResolvedTheme();
  const { jobTitle: paramTitle, company: paramCompany, jd: paramJd, viewId } = useLocalSearchParams<{ jobTitle?: string; company?: string; jd?: string; viewId?: string }>();
  const [stage, setStage] = useState<Stage>(viewId ? 'done' : 'idle');
  const [generateError, setGenerateError] = useState<string>('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTitle, paramCompany, paramJd]);

  const [stageIdx, setStageIdx] = useState(0);
  const [sections, setSections] = useState<GeneratedSection[]>([]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [atsInfo, setAtsInfo] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [resumeUsage, setResumeUsage] = useState<{ used: number; limit: number; plan: string; unlimited: boolean } | null>(null);
  // Rolling keyword ticker during generation. We extract from the JD
  // up front and rotate through them so the loader feels alive.
  const [keywordTick, setKeywordTick] = useState(0);

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

  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const keywordTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inline edit: debounce-save the current sections to the backend so
  // the user's tweaks persist + the next PDF export reflects them.
  // 800ms keeps the PATCH traffic sane while still feeling live.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSectionsSave = useCallback((nextSections: GeneratedSection[]) => {
    if (!variantId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await dilly.fetch(`/generated-resumes/${variantId}`, {
          method: 'PATCH',
          body: JSON.stringify({ sections: nextSections }),
        });
      } catch {}
    }, 800);
  }, [variantId]);

  /** Apply an inline edit. `path` is a dotted accessor into the
   *  section - e.g. `education.major`, `experiences.0.role`,
   *  `experiences.0.bullets.2.text`. Safe against typos - an invalid
   *  path no-ops. */
  const handleFieldEdit = useCallback((sectionIdx: number, path: string, newValue: string) => {
    setSections(prev => {
      const next: GeneratedSection[] = JSON.parse(JSON.stringify(prev));
      const sec: any = next[sectionIdx];
      if (!sec) return prev;
      const parts = path.split('.');
      let node: any = sec;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const idx = Number(key);
        node = Number.isInteger(idx) ? node[idx] : node[key];
        if (node == null) return prev;
      }
      const last = parts[parts.length - 1];
      const li = Number(last);
      if (Number.isInteger(li)) node[li] = newValue;
      else node[last] = newValue;
      scheduleSectionsSave(next);
      return next;
    });
  }, [scheduleSectionsSave]);

  // Rotate the stage narration every 3s while generating.
  useEffect(() => {
    if (stage !== 'generating') { setStageIdx(0); return; }
    stageTimer.current = setInterval(() => {
      setStageIdx(s => Math.min(s + 1, FORGE_STAGES.length - 1));
    }, 3000);
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
  }, [stage]);

  // Rotate the keyword ticker every 700ms during generation.
  useEffect(() => {
    if (stage !== 'generating') { setKeywordTick(0); return; }
    keywordTimer.current = setInterval(() => {
      setKeywordTick(k => k + 1);
    }, 700);
    return () => {
      if (keywordTimer.current) clearInterval(keywordTimer.current);
    };
  }, [stage]);

  async function handleDownloadFormat(format: 'pdf' | 'docx') {
    try {
      if (!variantId) {
        showToast({ message: 'Give it a second and tap Download again.', type: 'info' });
        return;
      }

      const token = await dilly.tokenProvider.getToken();
      if (!token) throw new Error('Not signed in - please sign out and back in.');

      // Sanitize filename - no spaces or special chars so the file URI is valid
      const safeName = (profile.name || 'Resume')
        .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Resume';
      const safeCompany = (company || 'Company')
        .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Company';
      const filename = `${safeName}_${safeCompany}_Resume.${format}`;

      const { API_BASE } = require('../../lib/tokens') as any;
      const url = `${API_BASE}/generated-resumes/${variantId}/file?format=${format}`;

      // Fetch binary from the API directly - more reliable than downloadAsync
      // for authenticated requests across Expo SDK versions.
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json())?.detail || ''; } catch {}
        throw new Error(
          `Server error ${resp.status}${detail ? ': ' + detail : ''} - try again.`,
        );
      }

      // Validate content-type so we never write a JSON error page to disk as a PDF
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (format === 'pdf' && !ct.includes('pdf')) {
        throw new Error('Unexpected response from server - try again.');
      }

      // Acquire file system
      let FileSystem: any = null;
      try { FileSystem = require('expo-file-system/legacy'); } catch {
        try { const m: any = require('expo-file-system'); FileSystem = m?.default ?? m; } catch {}
      }
      if (!FileSystem?.writeAsStringAsync) {
        throw new Error('File system not available on this device.');
      }
      const cacheDir: string = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      if (!cacheDir) throw new Error('Device cache directory unavailable.');
      const destPath = cacheDir + filename;

      // Convert ArrayBuffer → base64 without stack-overflowing on large files
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const rem = bytes.length - i;
        base64 += B64[b0 >> 2];
        base64 += B64[((b0 & 3) << 4) | (b1 >> 4)];
        base64 += rem > 1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
        base64 += rem > 2 ? B64[b2 & 63] : '=';
      }
      await FileSystem.writeAsStringAsync(destPath, base64, { encoding: 'base64' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destPath, {
          mimeType: format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          UTI: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.wordprocessingml.document',
          dialogTitle: filename,
        });
      } else {
        showToast({ message: `Saved to ${destPath}`, type: 'success' });
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Could not download resume.');
    }
  }

  function handleDownload() {
    if (Platform.OS === 'ios') {
      try {
        const { ActionSheetIOS } = require('react-native');
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Export resume',
            message: 'PDF is best for most companies. DOCX for older ATS like Taleo or some Workday portals.',
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
    Alert.alert('Export resume', 'Choose a format', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'PDF', onPress: () => handleDownloadFormat('pdf') },
      { text: 'Word (DOCX)', onPress: () => handleDownloadFormat('docx') },
    ]);
  }

  const progressAnim = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressAnim.value * 100}%` }));

  // Refetch whenever viewId changes. resume-generate is registered as
  // a hidden tab route which means it does NOT unmount between
  // navigations. Before this fix the useEffect had [] deps so the
  // first viewId the user ever opened stayed cached forever - every
  // subsequent tap on a different resume in My Dilly rendered the
  // same content. Tying the effect to viewId (plus a small in-flight
  // guard to avoid double-fetches during the initial mount race)
  // makes each tap actually load the requested resume.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (viewId) {
          // Reset visible state before the fetch so the user doesn't
          // briefly see the prior resume's content while the new one
          // is in flight.
          setSections([]);
          setVariantId(null);
          setSaved(false);
          setStage('generating');
          const resume = await dilly.get(`/generated-resumes/${viewId}`);
          if (cancelled) return;
          if (resume) {
            setJobTitle(resume.job_title || '');
            setCompany(resume.company || '');
            setJd(resume.job_description || '');
            // Hydrate when reopening too - if the variant was saved
            // before profile data existed (e.g. user added phone after),
            // the empty fields fill in with the latest profile values.
            setSections(hydrateFromProfile(resume.sections || [], profile));
            setSaved(true);
            setVariantId(viewId);
            setStage('done');
          } else {
            setStage('idle');
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [viewId]);

  // One-shot profile + timer cleanup on mount (independent of viewId).
  useEffect(() => {
    (async () => {
      try {
        const profileRes = await dilly.get('/profile');
        setProfile(profileRes || {});
      } catch {}
      finally { setProfileLoaded(true); }
    })();
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
      if (keywordTimer.current) clearInterval(keywordTimer.current);
    };
  }, []);

  async function handleGenerate() {
    if (!jobTitle.trim() || !company.trim()) {
      showToast({ message: 'Please enter a job title and company.', type: 'info' });
      return;
    }
    if (!jd.trim()) {
      showToast({ message: 'Paste the job description so Dilly can tailor your resume for this role.', type: 'info' });
      return;
    }

    setStage('generating');
    setStageIdx(0);
    setSections([]);
    setVariantId(null);
    setSaved(false);
    setGenerateError('');
    progressAnim.value = 0;
    progressAnim.value = withTiming(0.95, { duration: 20000, easing: Easing.out(Easing.cubic) });

    try {
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

      if (!res.ok) {
        // 402 → global paywall wrapper already shows the modal. Just bail.
        if (res.status === 402) {
          setStage('idle');
          return;
        }
        let serverDetail = '';
        try {
          const d = await res.json();
          serverDetail = d?.detail?.message || d?.detail || d?.error || JSON.stringify(d).slice(0, 300);
        } catch {}
        throw new Error(serverDetail || 'The forge cooled off. Try again.');
      }

      const data = await res.json();

      if (data.not_ready) {
        setAtsInfo(data);
        setStage('not_ready');
        return;
      }

      const parsed: GeneratedSection[] = data.sections || [];
      if (parsed.length === 0) {
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

      // Hydrate empty contact/education fields with what Dilly already
      // knows from the user's profile. Saves the user from re-typing
      // their email, phone, school, GPA etc. when the LLM left them
      // blank or generic.
      const hydrated = hydrateFromProfile(parsed, profile);
      setSections(hydrated);
      setAtsInfo(data);
      progressAnim.value = withTiming(1, { duration: 400 });
      setStage('done');
      await saveVariant(hydrated);
    } catch (err: any) {
      const detail = String(err?.message || err?.toString?.() || 'Unknown error').slice(0, 400);
      setGenerateError(detail);
      setStage('error');
    }
  }

  async function saveVariant(sectionsToSave: GeneratedSection[]) {
    try {
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
    } catch {}
  }

  function handleReset() {
    setStage('idle');
    setSections([]);
    setVariantId(null);
    setSaved(false);
  }

  // Derived: JD quality meter for the setup screen.
  const jdLen = jd.trim().length;
  const jdQuality = useMemo(() =>
    jdLen === 0 ? { pct: 0, label: 'Empty', color: colors.t3 } :
    jdLen < 150 ? { pct: 20, label: 'Too thin', color: CORAL } :
    jdLen < 400 ? { pct: 55, label: 'Usable', color: AMBER } :
    jdLen < 900 ? { pct: 85, label: 'Strong detail', color: GREEN } :
                  { pct: 100, label: 'Full spec', color: GREEN }
  , [jdLen]);

  // Derived: JD keywords for the ticker + highlighting.
  const jdKeywords = useMemo(() => tokenize(jd).slice(0, 60), [jd]);
  const resumeTokens = useMemo(() => new Set(tokenize(resumeText(sections))), [sections]);
  const matchedKeywords = useMemo(
    () => jdKeywords.filter(k => resumeTokens.has(k)),
    [jdKeywords, resumeTokens],
  );

  const weakestBullet = useMemo(() => findWeakestBullet(sections), [sections]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* First-visit coach - Resume Forge. Version bumped to v2 to
          re-show the coach once per user with the ATS explainer.
          Most applicants have no idea what ATS means, and that's
          the entire point of the Forge, so we spell it out. */}
      {/* Coach id bumped to v3 to re-show for users who already
          saw v2 with the crowded long-subline version. New copy
          is shorter with tight first line + one-sentence ATS
          definition + one-sentence value prop. */}
      <FirstVisitCoach
        id="forge-v3"
        iconName="construct"
        headline="One resume, rebuilt per job."
        subline="ATS (Applicant Tracking System) is the software that reads resumes before any human does. Dilly writes bullets built to pass ATS and the recruiter."
      />

      <Header
        insetsTop={insets.top}
        usage={resumeUsage}
        onBack={() => {
          router.replace('/(app)/jobs' as any);
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stage === 'idle' && (
          <IdleSetup
            jobTitle={jobTitle} setJobTitle={setJobTitle}
            company={company} setCompany={setCompany}
            jd={jd} setJd={setJd}
            jdQuality={jdQuality}
            onGenerate={handleGenerate}
          />
        )}

        {stage === 'generating' && (
          <GeneratingPhase
            stageIdx={stageIdx}
            keywordTick={keywordTick}
            keywords={jdKeywords}
            jobTitle={jobTitle}
            company={company}
            progressStyle={progressStyle}
          />
        )}

        {stage === 'done' && (
          <DonePhase
            sections={sections}
            atsInfo={atsInfo}
            jobTitle={jobTitle}
            company={company}
            jd={jd}
            matchedKeywords={matchedKeywords}
            totalKeywords={jdKeywords.length}
            weakestBullet={weakestBullet}
            saved={saved}
            onDownload={handleDownload}
            onReset={handleReset}
            onEdit={handleFieldEdit}
            profileName={profile?.name || profile?.full_name || ''}
          />
        )}

        {stage === 'not_ready' && atsInfo && (
          <NotReadyPhase
            atsInfo={atsInfo}
            jobTitle={jobTitle}
            company={company}
            onReset={handleReset}
          />
        )}

        {stage === 'error' && (
          <ErrorPhase error={generateError} onRetry={handleReset} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Header                                                           */
/* ─────────────────────────────────────────────────────────────── */

function Header({ insetsTop, usage, onBack }: { insetsTop: number; usage: any; onBack: () => void }) {
  const theme = useResolvedTheme();
  const warn = !!usage && !usage.unlimited && (usage.limit - usage.used) <= 1;
  return (
    <View style={[styles.header, { paddingTop: insetsTop + spacing.sm, borderBottomColor: theme.surface.border }]}>
      <AnimatedPressable onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={theme.surface.t1} />
      </AnimatedPressable>
      <Text style={[styles.headerTitle, { color: theme.surface.t1 }]}>The Forge</Text>
      {usage && !usage.unlimited ? (
        <View style={[
          styles.usagePill,
          { backgroundColor: theme.surface.s2, borderColor: theme.surface.border },
          warn && { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
        ]}>
          <Ionicons name="flash" size={10} color={warn ? '#92400E' : theme.surface.t2} />
          <Text style={[styles.usageText, { color: theme.surface.t2 }, warn && { color: '#92400E' }]}>
            {Math.max(0, usage.limit - usage.used)} left
          </Text>
        </View>
      ) : (
        <View style={{ width: 36 }} />
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Idle / Setup                                                     */
/* ─────────────────────────────────────────────────────────────── */

function IdleSetup({ jobTitle, setJobTitle, company, setCompany, jd, setJd, jdQuality, onGenerate }: any) {
  const canGenerate = jobTitle.trim().length > 0 && company.trim().length > 0 && jd.trim().length >= 100;
  const { isPaid, loading: subLoading } = useSubscription();
  const showPowerDemo = !subLoading && !isPaid;
  const theme = useResolvedTheme();
  return (
    <FadeInView>
      {/* Free-tier nudge - banner only renders for starter users. */}
      <DillyFeatureBanner
        feature="The Forge"
        sub="You can set up the role for free. Forging the tailored resume unlocks with Dilly."
      />
      {/* Hero */}
      <View style={styles.hero}>
        <View style={[styles.heroRingOuter, { borderColor: theme.accentBorder }]}>
          <View style={[styles.heroRingInner, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Ionicons name="flame" size={28} color={theme.accent} />
          </View>
        </View>
        <Text style={[styles.heroKicker, { color: theme.accent }]}>FORGE</Text>
        <Text style={[styles.heroTitle, { color: theme.surface.t1 }]}>One role.{'\n'}One company.{'\n'}One resume.</Text>
        <Text style={[styles.heroSub, { color: theme.surface.t2 }]}>
          Not a template. Not a rewrite. Dilly reads the job you're applying to, mines your profile for the matches, and builds a resume from scratch, ATS-parsed and tailored to this specific opening.
        </Text>
        <View style={styles.heroProofRow}>
          <ProofChip icon="shield-checkmark" text="ATS-aware" />
          <ProofChip icon="key" text="Keyword-matched" />
          <ProofChip icon="person" text="From your profile" />
        </View>
      </View>

      {/* Power demo - free-tier only. Concrete specifics, not generic
          marketing. The goal is to make the user read "oh, this does
          things a template can't" before they tap and hit the paywall.
          Paid users skip this entirely. */}
      {showPowerDemo && (
        <>
          <Text style={[styles.sectionHeader, { color: theme.surface.t3 }]}>WHAT THE FORGE ACTUALLY DOES</Text>
          <View style={styles.powerGrid}>
            <PowerRow
              icon="scan"
              title="Detects the ATS"
              body="Greenhouse, Lever, Workday, Ashby, SmartRecruiters, iCIMS, SuccessFactors, Workable, Taleo, and more. Formatting rules switch per parser so your resume doesn't get mangled at the door."
            />
            <PowerRow
              icon="git-compare"
              title="Keyword-matches every bullet"
              body="Reads the JD, extracts the real keywords (not buzzwords), then checks your bullets against them. You see the match pct on the done screen with every matching word highlighted."
            />
            <PowerRow
              icon="person"
              title="Builds from your profile, not a template"
              body="Every bullet is a real thing you told Dilly. If you don't have proof for a JD requirement, Dilly flags it as a missing keyword instead of inventing one."
            />
            <PowerRow
              icon="analytics"
              title="Scores itself on 4 axes"
              body="ATS parse, keyword match, profile depth, role fit. Color-coded bars. You know before sending whether this resume is strong enough."
            />
            <PowerRow
              icon="flash"
              title="Calls out your weakest bullet"
              body="Dilly identifies the one bullet that's thinnest (short, no metrics, vague) and offers to strengthen it with you. One-tap path into chat."
            />
          </View>

          <View style={styles.powerStatRow}>
            <PowerStat n="~20s" label="Forge time" />
            <PowerStat n="11" label="ATSes tuned" />
            <PowerStat n="PDF + DOCX" label="Export formats" />
          </View>

          <View style={[styles.lockedBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Ionicons name="lock-closed" size={12} color={theme.accent} />
            <Text style={[styles.lockedBadgeText, { color: theme.accent }]}>
              Starter: setup + preview only.  Forging unlocks with Dilly.
            </Text>
          </View>
        </>
      )}

      <Text style={[styles.sectionHeader, { color: theme.surface.t3 }]}>THE JOB</Text>

      <View style={[styles.inputCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <FieldLabel text="Job Title" required />
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface.bg, color: theme.surface.t1, borderColor: theme.surface.border }]}
          placeholder="e.g. Senior Data Engineer"
          placeholderTextColor={theme.surface.t3}
          value={jobTitle}
          onChangeText={setJobTitle}
          autoCapitalize="words"
        />

        <FieldLabel text="Company" required top />
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface.bg, color: theme.surface.t1, borderColor: theme.surface.border }]}
          placeholder="e.g. Stripe"
          placeholderTextColor={theme.surface.t3}
          value={company}
          onChangeText={setCompany}
          autoCapitalize="words"
        />

        <View style={{ marginTop: 14 }}>
          <View style={styles.jdHeaderRow}>
            <FieldLabel text="Job Description" required inline />
            <View style={styles.jdQualityPill}>
              <View style={[styles.jdQualityDot, { backgroundColor: jdQuality.color }]} />
              <Text style={[styles.jdQualityText, { color: jdQuality.color }]}>{jdQuality.label}</Text>
            </View>
          </View>
          <TextInput
            style={[styles.input, styles.jdInput, { backgroundColor: theme.surface.bg, color: theme.surface.t1, borderColor: theme.surface.border }]}
            placeholder="Paste the full job description. The more detail, the sharper the resume."
            placeholderTextColor={theme.surface.t3}
            value={jd}
            onChangeText={setJd}
            multiline
            textAlignVertical="top"
          />
          <View style={[styles.jdQualityTrack, { backgroundColor: theme.surface.s2 }]}>
            <View style={[styles.jdQualityFill, { width: `${jdQuality.pct}%`, backgroundColor: jdQuality.color }]} />
          </View>
        </View>
      </View>

      <AnimatedPressable
        style={[styles.forgeBtn, { backgroundColor: theme.accent }, !canGenerate && { opacity: 0.35 }]}
        onPress={onGenerate}
        disabled={!canGenerate}
        scaleDown={0.97}
      >
        <Ionicons name="flame" size={18} color="#fff" />
        <Text style={styles.forgeBtnText}>Forge this resume</Text>
      </AnimatedPressable>

      <Text style={styles.forgeFootnote}>
        ~20 seconds. Saved automatically. You can forge another for a different role any time.
      </Text>
    </FadeInView>
  );
}

function ProofChip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.proofChip}>
      <Ionicons name={icon} size={11} color={INDIGO} />
      <Text style={styles.proofChipText}>{text}</Text>
    </View>
  );
}

function FieldLabel({ text, required, top, inline }: { text: string; required?: boolean; top?: boolean; inline?: boolean }) {
  return (
    <Text style={[styles.fieldLabel, { marginTop: top ? 14 : (inline ? 0 : 0), marginBottom: 6 }]}>
      {text}{required ? <Text style={{ color: CORAL }}> *</Text> : null}
    </Text>
  );
}

/** One row in the Forge power demo - icon bubble, title, one-liner. */
function PowerRow({ icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <View style={styles.powerRow}>
      <View style={styles.powerRowIcon}>
        <Ionicons name={icon} size={14} color={INDIGO} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.powerRowTitle}>{title}</Text>
        <Text style={styles.powerRowBody}>{body}</Text>
      </View>
    </View>
  );
}

/** One big-number stat tile in the stat row beneath the power grid. */
function PowerStat({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.powerStat}>
      <Text style={styles.powerStatN}>{n}</Text>
      <Text style={styles.powerStatLabel}>{label}</Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Generating                                                       */
/* ─────────────────────────────────────────────────────────────── */

function GeneratingPhase({ stageIdx, keywordTick, keywords, jobTitle, company, progressStyle }: any) {
  const theme = useResolvedTheme();
  const visibleKeyword = keywords.length > 0 ? keywords[keywordTick % keywords.length] : '…';
  return (
    <FadeInView>
      <View style={[styles.forgeCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <View style={[styles.forgeAnvil, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="flame" size={32} color={theme.accent} />
        </View>
        <Text style={[styles.forgeCardKicker, { color: theme.accent }]}>
          FORGING FOR {(company || '').toUpperCase()}
        </Text>
        <Text style={[styles.forgeCardRole, { color: theme.surface.t1 }]}>{jobTitle}</Text>

        {/* Stages */}
        <View style={styles.forgeStages}>
          {FORGE_STAGES.map((st, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <View key={i} style={styles.forgeStageRow}>
                <View style={[styles.forgeBullet, {
                  backgroundColor: done ? theme.accent : active ? theme.accent + '30' : theme.surface.s2,
                  borderColor: done || active ? theme.accent : theme.surface.border,
                }]}>
                  {done
                    ? <Ionicons name="checkmark" size={11} color="#fff" />
                    : active
                      ? <View style={[styles.forgePulse, { backgroundColor: theme.accent }]} />
                      : null}
                </View>
                <Text style={[styles.forgeStageText, {
                  color: done ? theme.surface.t2 : active ? theme.surface.t1 : theme.surface.t3,
                  fontWeight: active ? '700' : '500',
                }]}>
                  {st.text}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: theme.surface.s2 }]}>
          <Animated.View style={[styles.progressFill, { backgroundColor: theme.accent }, progressStyle]} />
        </View>

        {/* Keyword ticker - watch Dilly extract the JD */}
        <View style={[styles.kwTickerWrap, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <View style={[styles.kwTickerDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.kwTickerLabel, { color: theme.accent }]}>EXTRACTED</Text>
          <Text style={[styles.kwTickerWord, { color: theme.surface.t1 }]}>{visibleKeyword}</Text>
        </View>
      </View>
    </FadeInView>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Done                                                             */
/* ─────────────────────────────────────────────────────────────── */

function DonePhase({
  sections, atsInfo, jobTitle, company, jd,
  matchedKeywords, totalKeywords, weakestBullet,
  saved, onDownload, onReset, onEdit, profileName,
}: any) {
  const theme = useResolvedTheme();
  // Reverse-lookup: who do you already know at this company? Read-only
  // pull from iOS Contacts. Empty array if permission not granted -
  // we never prompt during reverse lookup. The whole card hides if
  // there are no matches, so it doesn't add visual noise for users
  // who have nothing in their contacts at this company.
  const [warmIntros, setWarmIntros] = useState<Array<{ id: string; name: string; email?: string; jobTitle?: string }>>([]);
  useEffect(() => {
    if (!company) return;
    findContactsAtCompany(company).then(setWarmIntros).catch(() => {});
  }, [company]);
  // Derived scorecard values. Prefer server-provided signals when
  // present; fall back to local heuristics so the panel never feels
  // empty. 4 axes:
  //   - ATS parse     (server ats_parse_score, else 85)
  //   - Keyword match (local matchedKeywords / totalKeywords, clamped)
  //   - Profile depth (server facts_used mapped, else 75)
  //   - Role fit      (keyword match × parse, soft blend)
  const atsParse = Math.max(0, Math.min(100, Math.round(atsInfo?.ats_parse_score ?? 85)));
  const localKwPct = totalKeywords > 0 ? Math.round((matchedKeywords.length / totalKeywords) * 100) : 0;
  const serverKwPct = Math.max(0, Math.min(100, Math.round(atsInfo?.keyword_coverage_pct ?? 0)));
  const kwMatch = serverKwPct || localKwPct;
  const factsUsed = Number(atsInfo?.facts_used) || 0;
  const profileDepth = Math.max(0, Math.min(100, factsUsed > 0 ? Math.min(100, 45 + factsUsed * 3) : 70));
  const roleFit = Math.round((atsParse * 0.35) + (kwMatch * 0.5) + (profileDepth * 0.15));

  const scorecard = {
    'ATS parse': atsParse,
    'Keyword match': kwMatch,
    'Profile depth': profileDepth,
    'Role fit': roleFit,
  };

  return (
    <FadeInView>
      {/* Forged headline - this is the moment */}
      <View style={styles.forgedHero}>
        <View style={[styles.forgedGlyph, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="ribbon" size={22} color={theme.accent} />
        </View>
        <Text style={[styles.forgedKicker, { color: theme.accent }]}>FORGED</Text>
        <Text style={[styles.forgedTitle, { color: theme.surface.t1 }]}>
          for {jobTitle}
          {'\n'}
          <Text style={{ color: theme.accent }}>at {company}</Text>
        </Text>
        {saved ? (
          <View style={[styles.savedStrip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Ionicons name="bookmark" size={11} color={theme.accent} />
            <Text style={[styles.savedStripText, { color: theme.accent }]}>Saved to your Resume Variants</Text>
          </View>
        ) : null}
      </View>

      {/* Scorecard - reads like a hiring rubric */}
      <Text style={[styles.sectionHeader, { color: theme.surface.t3 }]}>ATS READINESS</Text>
      <View style={[styles.scorecardCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        {Object.entries(scorecard).map(([label, value]) => (
          <ScoreRow key={label} label={label} value={value as number} />
        ))}
      </View>

      {/* Gaps / missing keyword warnings - only when present */}
      {atsInfo?.keyword_warning && Array.isArray(atsInfo?.missing_keywords) && atsInfo.missing_keywords.length > 0 && (
        <View style={[styles.warnCard, { backgroundColor: theme.surface.s1, borderColor: AMBER + '40' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="warning" size={14} color={AMBER} />
            <Text style={[styles.warnTitle, { color: theme.surface.t1 }]}>
              Missing some JD terms ({atsInfo.keyword_coverage_pct || 0}% match)
            </Text>
          </View>
          <Text style={[styles.warnBody, { color: theme.surface.t2 }]}>
            The JD asks for{' '}
            <Text style={{ fontWeight: '700', color: theme.surface.t1 }}>
              {(atsInfo.missing_keywords as string[]).slice(0, 4).join(', ')}
            </Text>
            {' '}(none of these are in your profile yet). If you actually have experience with them, tell Dilly and the next forge will include them.
          </Text>
          <AnimatedPressable
            style={[styles.warnCta, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
            onPress={() => openDillyOverlay({
              isPaid: true,
              initialMessage: `For my ${jobTitle} resume at ${company}, Dilly doesn't have enough about me for: ${(atsInfo.missing_keywords as string[]).slice(0, 5).join(', ')}. Ask me about each one so you can add them to my profile.`,
            })}
            scaleDown={0.97}
          >
            <Ionicons name="chatbubble" size={11} color={theme.accent} />
            <Text style={[styles.warnCtaText, { color: theme.accent }]}>Tell Dilly about these</Text>
          </AnimatedPressable>
        </View>
      )}

      {atsInfo?.readiness === 'gaps' && Array.isArray(atsInfo?.gaps) && atsInfo.gaps.length > 0 && (
        <View style={[styles.warnCard, { backgroundColor: theme.surface.s1, borderColor: AMBER + '40' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="alert-circle" size={14} color={AMBER} />
            <Text style={[styles.warnTitle, { color: theme.surface.t1 }]}>Gaps detected</Text>
          </View>
          {atsInfo.gaps.map((g: string, i: number) => (
            <Text key={i} style={[styles.warnBullet, { color: theme.surface.t2 }]}>• {g}</Text>
          ))}
        </View>
      )}

      {/* Weakest bullet spotlight - one bullet that could be stronger */}
      {weakestBullet && (
        <View style={[styles.weakestCard, { backgroundColor: theme.surface.s1, borderColor: AMBER + '40' }]}>
          <View style={styles.weakestKicker}>
            <Ionicons name="scan" size={11} color={AMBER} />
            <Text style={styles.weakestKickerText}>WEAKEST BULLET</Text>
          </View>
          <Text style={[styles.weakestWhere, { color: theme.surface.t3 }]}>{weakestBullet.where}</Text>
          <Text style={[styles.weakestText, { color: theme.surface.t1 }]}>"{weakestBullet.text}"</Text>
          <Text style={[styles.weakestWhy, { color: theme.surface.t2 }]}>
            This one could use a metric or a concrete outcome. Strong bullets pin a number or a named result.
          </Text>
          <AnimatedPressable
            style={[styles.weakestCta, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
            onPress={() => openDillyOverlay({
              isPaid: true,
              initialMessage: `In my resume for ${jobTitle} at ${company}, this bullet feels thin: "${weakestBullet.text}" (from ${weakestBullet.where}). Ask me the specifics (numbers, outcomes, what changed) so we can rewrite it with real impact.`,
            })}
            scaleDown={0.97}
          >
            <Ionicons name="sparkles" size={11} color={theme.accent} />
            <Text style={[styles.weakestCtaText, { color: theme.accent }]}>Strengthen with Dilly</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Resume preview with keyword highlighting */}
      <View style={styles.previewHeaderRow}>
        <Text style={[styles.sectionHeader, { color: theme.surface.t3 }]}>YOUR RESUME</Text>
        <Text style={[styles.previewHighlightLegend, { color: theme.surface.t3 }]}>
          <Text style={{ color: theme.accent, fontWeight: '800' }}>•</Text> JD match
        </Text>
      </View>
      {/* Affordance banner. Testers were missing the inline-edit
          capability entirely - the EditableText components look like
          static text until you tap them. A pencil + one-line hint
          right above the preview makes it obvious. */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 16, marginBottom: 8,
        paddingHorizontal: 12, paddingVertical: 9,
        borderRadius: 10,
        backgroundColor: theme.accentSoft,
        borderWidth: 1, borderColor: theme.accentBorder,
      }}>
        <Ionicons name="create-outline" size={14} color={theme.accent} />
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: theme.accent, lineHeight: 17 }}>
          Tap any field to edit it - your name, bullets, dates, anything.
        </Text>
      </View>
      <View style={[styles.previewCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        {sections.map((sec: GeneratedSection, si: number) => (
          <SectionView
            key={sec.key ?? si}
            section={sec}
            sectionIdx={si}
            matchedKeywords={matchedKeywords}
            onEdit={onEdit}
          />
        ))}
      </View>

      {/* Actions */}
      <AnimatedPressable style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: theme.accent }]} onPress={onDownload}>
        <Ionicons name="download" size={17} color="#fff" />
        <Text style={styles.actionBtnText}>Export · PDF or DOCX</Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={[styles.actionBtn, styles.actionBtnSecondary, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
        onPress={async () => {
          const result = await emailResume({
            company: company || 'this role',
            role: jobTitle,
            userName: profileName,
          });
          if (result === 'sent') showToast({ message: 'Draft opened in Mail. Attach the PDF if needed.', type: 'success' });
          else if (result === 'unavailable') showToast({ message: 'No mail account configured on this device.', type: 'info' });
        }}
      >
        <Ionicons name="mail" size={17} color={theme.accent} />
        <Text style={[styles.actionBtnText, { color: theme.accent }]}>Email this resume</Text>
      </AnimatedPressable>

      <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]} onPress={onReset}>
        <Ionicons name="flame" size={17} color={theme.accent} />
        <Text style={[styles.actionBtnText, { color: theme.accent }]}>Forge another</Text>
      </AnimatedPressable>

      {/* Warm-intros card - reverse contacts lookup. Shows up only when
          the user actually has someone in their phone at this company,
          turning the resume page into a "do you already know someone
          here?" prompt before the cold-apply flow. */}
      {warmIntros.length > 0 && (
        <View style={[styles.actionBtn, {
          flexDirection: 'column', alignItems: 'flex-start', gap: 10,
          backgroundColor: theme.surface.s1, borderColor: theme.accent, borderWidth: 1.5,
          padding: 14, marginTop: 8,
        }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons name="people" size={15} color={theme.accent} />
            <Text style={{ fontSize: 11, fontWeight: '900', color: theme.accent, letterSpacing: 1.2 }}>
              {warmIntros.length === 1 ? 'YOU KNOW SOMEONE HERE' : `${warmIntros.length} CONTACTS AT ${(company || '').toUpperCase()}`}
            </Text>
          </View>
          {warmIntros.slice(0, 3).map(c => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '900' }}>{c.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.surface.t1 }}>{c.name}</Text>
                {c.jobTitle ? <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{c.jobTitle}</Text> : null}
              </View>
            </View>
          ))}
          <Text style={{ fontSize: 11, color: theme.surface.t3, lineHeight: 16 }}>
            A short note before you apply usually beats a cold submission. Worth a 60-second message.
          </Text>
        </View>
      )}
    </FadeInView>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? GREEN : value >= 55 ? AMBER : CORAL;
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreValue, { color }]}>{value}</Text>
    </View>
  );
}

/** Tap-to-edit text. Renders a Text by default; on tap, swaps to a
 *  TextInput with autoFocus. Blur saves via onSave(newValue). Multi-
 *  line fields (bullets, description) pass multiline=true. */
function EditableText({
  value, onSave, style, multiline, placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  style: any;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (editing) {
    return (
      <TextInput
        autoFocus
        value={draft}
        onChangeText={setDraft}
        multiline={!!multiline}
        blurOnSubmit={!multiline}
        returnKeyType={multiline ? 'default' : 'done'}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onSubmitEditing={() => {
          if (!multiline) {
            setEditing(false);
            if (draft !== value) onSave(draft);
          }
        }}
        style={[style, { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 6, paddingHorizontal: 4 }]}
      />
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => setEditing(true)}>
      <Text style={style}>
        {value || <Text style={{ color: '#9CA3AF', fontStyle: 'italic' }}>{placeholder || 'Tap to edit'}</Text>}
      </Text>
    </TouchableOpacity>
  );
}


/** Renders a single resume section. Bullet/body text gets keyword
 *  tokens highlighted in indigo so the user sees the JD match.
 *  When `onEdit` is provided, every field becomes tap-to-edit. */
function SectionView({
  section, sectionIdx, matchedKeywords, onEdit,
}: {
  section: GeneratedSection;
  sectionIdx: number;
  matchedKeywords: string[];
  onEdit?: (sectionIdx: number, path: string, value: string) => void;
}) {
  const keywordSet = useMemo(() => new Set(matchedKeywords), [matchedKeywords]);
  const edit = (path: string) => (v: string) => onEdit && onEdit(sectionIdx, path, v);
  const editable = !!onEdit;

  return (
    <View style={styles.previewSection}>
      <Text style={styles.previewSectionLabel}>{section.label ?? section.key}</Text>

      {section.contact && (
        <View style={styles.previewEntry}>
          {editable ? (
            <>
              <EditableText style={styles.previewName} value={section.contact.name || ''} onSave={edit('contact.name')} placeholder="Your name" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <EditableText style={styles.previewEntryDates} value={section.contact.email || ''} onSave={edit('contact.email')} placeholder="email" />
                <Text style={styles.previewEntryDates}> · </Text>
                <EditableText style={styles.previewEntryDates} value={section.contact.phone || ''} onSave={edit('contact.phone')} placeholder="phone" />
                <Text style={styles.previewEntryDates}> · </Text>
                <EditableText style={styles.previewEntryDates} value={section.contact.location || ''} onSave={edit('contact.location')} placeholder="city" />
                <Text style={styles.previewEntryDates}> · </Text>
                <EditableText style={styles.previewEntryDates} value={section.contact.linkedin || ''} onSave={edit('contact.linkedin')} placeholder="linkedin" />
              </View>
            </>
          ) : (
            <>
              {!!section.contact.name && <Text style={styles.previewName}>{section.contact.name}</Text>}
              <Text style={styles.previewEntryDates}>
                {[section.contact.email, section.contact.phone, section.contact.location, section.contact.linkedin].filter(Boolean).join(' · ')}
              </Text>
            </>
          )}
        </View>
      )}

      {section.education && (
        <View style={styles.previewEntry}>
          {editable ? (
            <>
              <EditableText style={styles.previewEntryTitle} value={section.education.university || ''} onSave={edit('education.university')} placeholder="University" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <EditableText style={styles.previewEntryDates} value={section.education.major || ''} onSave={edit('education.major')} placeholder="major" />
                <Text style={styles.previewEntryDates}> · </Text>
                <EditableText style={styles.previewEntryDates} value={section.education.graduation || ''} onSave={edit('education.graduation')} placeholder="graduation" />
              </View>
              <EditableText style={styles.previewBullet} value={section.education.gpa ? `GPA: ${section.education.gpa}` : ''} onSave={(v) => edit('education.gpa')(v.replace(/^GPA:\s*/i, ''))} placeholder="GPA (optional)" />
            </>
          ) : (
            <>
              <Text style={styles.previewEntryTitle}>{section.education.university}</Text>
              <Text style={styles.previewEntryDates}>
                {[section.education.major, section.education.minor ? `Minor: ${section.education.minor}` : '', section.education.graduation].filter(Boolean).join(' · ')}
              </Text>
              {!!section.education.gpa && <Highlighted style={styles.previewBullet} text={`GPA: ${section.education.gpa}`} keywords={keywordSet} />}
              {!!section.education.honors && <Highlighted style={styles.previewBullet} text={section.education.honors} keywords={keywordSet} />}
            </>
          )}
        </View>
      )}

      {Array.isArray(section.experiences) && section.experiences.map((exp: any, ei: number) => (
        <View key={ei} style={styles.previewEntry}>
          {editable ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <EditableText style={styles.previewEntryTitle} value={exp.role || ''} onSave={edit(`experiences.${ei}.role`)} placeholder="Role" />
                <Text style={styles.previewEntryTitle}>, </Text>
                <EditableText style={styles.previewEntryTitle} value={exp.company || ''} onSave={edit(`experiences.${ei}.company`)} placeholder="Company" />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <EditableText style={styles.previewEntryDates} value={exp.date || ''} onSave={edit(`experiences.${ei}.date`)} placeholder="dates" />
                <Text style={styles.previewEntryDates}> · </Text>
                <EditableText style={styles.previewEntryDates} value={exp.location || ''} onSave={edit(`experiences.${ei}.location`)} placeholder="location" />
              </View>
              {Array.isArray(exp.bullets) && exp.bullets.map((b: any, bi: number) => (
                <View key={bi} style={{ flexDirection: 'row' }}>
                  <Text style={styles.previewBullet}>• </Text>
                  <View style={{ flex: 1 }}>
                    <EditableText
                      style={styles.previewBullet}
                      value={typeof b === 'string' ? b : (b.text || '')}
                      onSave={edit(typeof b === 'string' ? `experiences.${ei}.bullets.${bi}` : `experiences.${ei}.bullets.${bi}.text`)}
                      multiline
                      placeholder="Tap to add a bullet"
                    />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.previewEntryTitle}>
                {exp.role}{exp.company ? `, ${exp.company}` : ''}
              </Text>
              <Text style={styles.previewEntryDates}>{[exp.date, exp.location].filter(Boolean).join(' · ')}</Text>
              {Array.isArray(exp.bullets) && exp.bullets.map((b: any, bi: number) => (
                <Highlighted
                  key={bi}
                  style={styles.previewBullet}
                  text={`• ${typeof b === 'string' ? b : b.text}`}
                  keywords={keywordSet}
                />
              ))}
            </>
          )}
        </View>
      ))}

      {Array.isArray(section.projects) && section.projects.map((proj: any, pi: number) => (
        <View key={pi} style={styles.previewEntry}>
          {editable ? (
            <>
              <EditableText style={styles.previewEntryTitle} value={proj.name || ''} onSave={edit(`projects.${pi}.name`)} placeholder="Project name" />
              {Array.isArray(proj.bullets) && proj.bullets.map((b: any, bi: number) => (
                <View key={bi} style={{ flexDirection: 'row' }}>
                  <Text style={styles.previewBullet}>• </Text>
                  <View style={{ flex: 1 }}>
                    <EditableText
                      style={styles.previewBullet}
                      value={typeof b === 'string' ? b : (b.text || '')}
                      onSave={edit(typeof b === 'string' ? `projects.${pi}.bullets.${bi}` : `projects.${pi}.bullets.${bi}.text`)}
                      multiline
                      placeholder="Tap to add a bullet"
                    />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.previewEntryTitle}>{proj.name}</Text>
              <Text style={styles.previewEntryDates}>{[proj.tech, proj.date].filter(Boolean).join(' · ')}</Text>
              {Array.isArray(proj.bullets) && proj.bullets.map((b: any, bi: number) => (
                <Highlighted
                  key={bi}
                  style={styles.previewBullet}
                  text={`• ${typeof b === 'string' ? b : b.text}`}
                  keywords={keywordSet}
                />
              ))}
            </>
          )}
        </View>
      ))}

      {section.simple?.lines && (
        <View style={styles.previewEntry}>
          {section.simple.lines.map((line: string, li: number) => (
            editable ? (
              <EditableText
                key={li}
                style={styles.previewBullet}
                value={line}
                onSave={edit(`simple.lines.${li}`)}
                multiline
                placeholder="Tap to edit"
              />
            ) : (
              <Highlighted key={li} style={styles.previewBullet} text={line} keywords={keywordSet} />
            )
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Splits `text` on word boundaries and bolds any token whose
 * lowercased form is in `keywords`. Keyword matches render in
 * indigo so the JD overlap is visible at a glance.
 */
function Highlighted({ text, keywords, style }: { text: string; keywords: Set<string>; style: any }) {
  if (keywords.size === 0 || !text) {
    return <Text style={style}>{text}</Text>;
  }
  const parts = text.split(/(\W+)/);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const clean = part.toLowerCase().replace(/^[.-]+|[.-]+$/g, '');
        const isMatch = clean.length >= 3 && keywords.has(clean);
        if (isMatch) {
          return <Text key={i} style={{ color: INDIGO, fontWeight: '700' }}>{part}</Text>;
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Not ready                                                        */
/* ─────────────────────────────────────────────────────────────── */

function NotReadyPhase({ atsInfo, jobTitle, company, onReset }: any) {
  const theme = useResolvedTheme();
  return (
    <FadeInView>
      <View style={[styles.notReadyCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <View style={[styles.notReadyGlyph, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="hand-left" size={26} color={theme.accent} />
        </View>
        <Text style={[styles.notReadyKicker, { color: theme.accent }]}>DILLY WON'T INVENT</Text>
        <Text style={[styles.notReadyTitle, { color: theme.surface.t1 }]}>Tell Dilly more first.</Text>
        <Text style={[styles.notReadySub, { color: theme.surface.t2 }]}>
          {atsInfo.summary || "Dilly doesn't know enough about you to build an honest resume for this role yet. Fill the gaps, then forge again."}
        </Text>

        {Array.isArray(atsInfo.gaps) && atsInfo.gaps.length > 0 && (
          <View style={[styles.notReadyGapsBlock, { borderTopColor: theme.surface.border }]}>
            <Text style={[styles.notReadyGapsLabel, { color: theme.surface.t3 }]}>WHAT'S MISSING</Text>
            {atsInfo.gaps.map((g: string, i: number) => (
              <View key={i} style={styles.notReadyGapRow}>
                <View style={[styles.notReadyGapDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.notReadyGapText, { color: theme.surface.t2 }]}>{g}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {Array.isArray(atsInfo.tell_dilly_prompts) && atsInfo.tell_dilly_prompts.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { color: theme.surface.t3 }]}>FASTEST WAY TO FIX</Text>
          <View style={{ gap: 8 }}>
            {(atsInfo.tell_dilly_prompts as string[]).slice(0, 5).map((prompt, i) => (
              <AnimatedPressable
                key={i}
                style={[styles.promptRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                onPress={() => openDillyOverlay({ isPaid: true, initialMessage: prompt })}
                scaleDown={0.98}
              >
                <View style={[styles.promptDot, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                  <Ionicons name="chatbubble" size={11} color={theme.accent} />
                </View>
                <Text style={[styles.promptText, { color: theme.surface.t1 }]}>{prompt}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
              </AnimatedPressable>
            ))}
          </View>
        </>
      )}

      <AnimatedPressable
        style={[styles.actionBtn, styles.actionBtnSecondary, { marginTop: 14, backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
        onPress={() => openDillyOverlay({
          isPaid: true,
          initialMessage: `I tried to forge a resume for ${jobTitle} at ${company} but I'm not ready yet. Walk me through each gap one by one so I can tell you about them and build out my profile.`,
        })}
      >
        <Ionicons name="chatbubble" size={17} color={theme.accent} />
        <Text style={[styles.actionBtnText, { color: theme.accent }]}>Talk it through with Dilly</Text>
      </AnimatedPressable>
      <AnimatedPressable
        style={[styles.actionBtn, styles.actionBtnSecondary, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
        onPress={onReset}
      >
        <Ionicons name="refresh" size={17} color={theme.accent} />
        <Text style={[styles.actionBtnText, { color: theme.accent }]}>Try a different role</Text>
      </AnimatedPressable>
    </FadeInView>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Error                                                            */
/* ─────────────────────────────────────────────────────────────── */

function ErrorPhase({ error, onRetry }: { error: string; onRetry: () => void }) {
  const theme = useResolvedTheme();
  const onAccent = (() => {
    const hex = (theme.accent || '').replace('#', '');
    if (hex.length !== 6) return '#fff';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#0B1426' : '#FFFFFF';
  })();
  return (
    <FadeInView>
      <View style={[styles.errorCard, { backgroundColor: theme.surface.s1 }]}>
        <Ionicons name="alert-circle" size={32} color={AMBER} />
        <Text style={[styles.errorTitle, { color: theme.surface.t1 }]}>The forge cooled off.</Text>
        <Text style={[styles.errorSub, { color: theme.surface.t2 }]}>
          Something went sideways mid-generation. Usually a one-tap retry fixes it.
        </Text>
        {!!error && (
          <View style={[styles.errorDetailBlock, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}>
            <Text style={[styles.errorDetailLabel, { color: theme.surface.t3 }]}>ERROR DETAIL</Text>
            <Text style={[styles.errorDetailText, { color: theme.surface.t2 }]} selectable>{error}</Text>
          </View>
        )}
      </View>
      <AnimatedPressable style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: theme.accent }]} onPress={onRetry}>
        <Ionicons name="refresh" size={17} color={onAccent} />
        <Text style={[styles.actionBtnText, { color: onAccent }]}>Try again</Text>
      </AnimatedPressable>
    </FadeInView>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Styles                                                           */
/* ─────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.b1, backgroundColor: colors.bg,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.s1, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1.4, color: colors.t1 },
  usagePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
  },
  usageText: { fontSize: 11, fontWeight: '800', color: colors.t2, letterSpacing: 0.2 },

  content: { padding: spacing.lg, gap: spacing.md },

  // Section header
  sectionHeader: {
    fontFamily: 'Cinzel_700Bold', fontSize: 10, letterSpacing: 1.4,
    color: colors.t3, marginBottom: 10, marginTop: 4,
  },

  // Hero
  hero: { alignItems: 'center', paddingVertical: 18, marginBottom: 12 },
  heroRingOuter: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: INDIGO + '08',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroRingInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: INDIGO + '12', borderWidth: 1, borderColor: INDIGO + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  heroKicker: { fontSize: 10, fontWeight: '800', color: INDIGO, letterSpacing: 2.5, marginBottom: 8 },
  heroTitle: {
    fontFamily: 'Cinzel_700Bold', fontSize: 26, color: colors.t1,
    letterSpacing: -0.4, textAlign: 'center', lineHeight: 32, marginBottom: 12,
  },
  heroSub: {
    fontSize: 13, color: colors.t2, lineHeight: 20,
    textAlign: 'center', paddingHorizontal: 8, marginBottom: 14,
  },
  heroProofRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  proofChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '22',
  },
  proofChipText: { fontSize: 10, fontWeight: '700', color: INDIGO, letterSpacing: 0.3 },

  // Input card
  inputCard: {
    backgroundColor: colors.s1, borderRadius: 16,
    borderWidth: 1, borderColor: colors.b1, padding: 16,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.t2, letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 13, color: colors.t1,
  },
  jdInput: { minHeight: 140, paddingTop: 11, textAlignVertical: 'top' },
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

  forgeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 17,
    marginTop: 18,
    shadowColor: INDIGO, shadowOpacity: 0.22, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  forgeBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  forgeFootnote: { fontSize: 11, color: colors.t3, textAlign: 'center', marginTop: 12, fontStyle: 'italic', lineHeight: 16 },

  // Generating
  forgeCard: {
    backgroundColor: colors.s1, borderRadius: 18,
    borderWidth: 1, borderColor: colors.b1,
    padding: 24, alignItems: 'center',
  },
  forgeAnvil: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '28',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  forgeCardKicker: {
    fontSize: 10, fontWeight: '800', color: colors.t3, letterSpacing: 2,
  },
  forgeCardRole: {
    fontSize: 15, fontWeight: '800', color: colors.t1,
    marginTop: 4, marginBottom: 18, textAlign: 'center',
  },
  forgeStages: { gap: 10, width: '100%', marginBottom: 18 },
  forgeStageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  forgeBullet: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  forgePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: INDIGO },
  forgeStageText: { fontSize: 13, flex: 1 },

  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: colors.b1,
    overflow: 'hidden', width: '100%',
  },
  progressFill: { height: '100%', backgroundColor: INDIGO, borderRadius: 2 },

  kwTickerWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: colors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b1, width: '100%',
  },
  kwTickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  kwTickerLabel: { fontSize: 9, fontWeight: '800', color: colors.t3, letterSpacing: 1.2 },
  kwTickerWord: {
    flex: 1, fontFamily: 'Menlo', fontSize: 12, fontWeight: '700',
    color: INDIGO, textAlign: 'right',
  },

  // Done
  forgedHero: {
    alignItems: 'center', paddingVertical: 12,
    marginBottom: 14,
  },
  forgedGlyph: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: INDIGO + '12', borderWidth: 1, borderColor: INDIGO + '32',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  forgedKicker: { fontSize: 10, fontWeight: '800', color: INDIGO, letterSpacing: 2.8, marginBottom: 6 },
  forgedTitle: {
    fontFamily: 'Cinzel_700Bold', fontSize: 22, color: colors.t1,
    textAlign: 'center', lineHeight: 30, letterSpacing: -0.3,
  },
  savedStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 12,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '22',
  },
  savedStripText: { fontSize: 11, fontWeight: '700', color: INDIGO },

  // Scorecard
  scorecardCard: {
    backgroundColor: colors.s1, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 16, gap: 10,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreLabel: { fontSize: 12, color: colors.t2, fontWeight: '700', width: 96 },
  scoreTrack: { flex: 1, height: 6, backgroundColor: colors.b1, borderRadius: 3, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreValue: { fontSize: 13, fontWeight: '800', width: 34, textAlign: 'right' },

  // Warnings
  warnCard: {
    backgroundColor: AMBER + '08', borderRadius: 12,
    borderWidth: 1, borderColor: AMBER + '30',
    padding: 14, marginBottom: 12, gap: 8,
  },
  warnTitle: { fontSize: 12, fontWeight: '800', color: AMBER, letterSpacing: 0.2 },
  warnBody: { fontSize: 12, color: colors.t2, lineHeight: 18 },
  warnBullet: { fontSize: 12, color: colors.t2, lineHeight: 17 },
  warnCta: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginTop: 2,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '22',
  },
  warnCtaText: { fontSize: 11, fontWeight: '800', color: INDIGO },

  // Weakest bullet spotlight
  weakestCard: {
    backgroundColor: colors.s1, borderRadius: 12,
    borderWidth: 1, borderColor: AMBER + '35',
    padding: 14, marginBottom: 14,
  },
  weakestKicker: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  weakestKickerText: { fontSize: 10, fontWeight: '800', color: AMBER, letterSpacing: 1.2 },
  weakestWhere: { fontSize: 11, fontWeight: '700', color: colors.t3, marginBottom: 6 },
  weakestText: {
    fontSize: 13, color: colors.t1, fontStyle: 'italic',
    lineHeight: 19, marginBottom: 8,
  },
  weakestWhy: { fontSize: 12, color: colors.t2, lineHeight: 17, marginBottom: 10 },
  weakestCta: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '22',
  },
  weakestCtaText: { fontSize: 11, fontWeight: '800', color: INDIGO },

  // Preview
  previewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewHighlightLegend: { fontSize: 10, color: colors.t3, fontWeight: '600', marginBottom: 10 },
  previewCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: colors.b1,
    padding: 18, marginBottom: 16,
  },
  previewSection: { marginBottom: 14 },
  previewSectionLabel: {
    fontSize: 10, fontWeight: '900', color: INDIGO,
    letterSpacing: 1.8, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: INDIGO + '25',
    paddingBottom: 4,
  },
  previewEntry: { marginBottom: 10 },
  previewName: {
    fontSize: 16, fontWeight: '800', color: colors.t1,
    textAlign: 'center', marginBottom: 2,
  },
  previewEntryTitle: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  previewEntryDates: { fontSize: 11, color: colors.t3, marginTop: 2, marginBottom: 4 },
  previewBullet: { fontSize: 12, color: colors.t2, lineHeight: 18, marginTop: 2 },

  // Actions
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 15, marginTop: 10,
  },
  actionBtnPrimary: {
    backgroundColor: INDIGO,
    shadowColor: INDIGO, shadowOpacity: 0.2, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  actionBtnSecondary: {
    backgroundColor: colors.s1, borderWidth: 1, borderColor: INDIGO + '40',
  },
  actionBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Not ready
  notReadyCard: {
    backgroundColor: colors.s1, borderRadius: 18,
    borderWidth: 1, borderColor: colors.b1,
    padding: 22, alignItems: 'center', marginBottom: 14,
  },
  notReadyGlyph: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: INDIGO + '12', borderWidth: 1, borderColor: INDIGO + '30',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  notReadyKicker: { fontSize: 10, fontWeight: '800', color: INDIGO, letterSpacing: 2, marginBottom: 8 },
  notReadyTitle: {
    fontFamily: 'Cinzel_700Bold', fontSize: 22, color: colors.t1,
    marginBottom: 8, textAlign: 'center', letterSpacing: -0.3,
  },
  notReadySub: { fontSize: 13, color: colors.t2, lineHeight: 19, textAlign: 'center' },
  notReadyGapsBlock: { marginTop: 16, alignSelf: 'stretch', gap: 6 },
  notReadyGapsLabel: { fontSize: 10, fontWeight: '800', color: colors.t3, letterSpacing: 1.2, marginBottom: 4 },
  notReadyGapRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  notReadyGapDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: INDIGO, marginTop: 6 },
  notReadyGapText: { fontSize: 13, color: colors.t2, lineHeight: 19, flex: 1 },

  promptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  promptDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: INDIGO + '15', alignItems: 'center', justifyContent: 'center',
  },
  promptText: { fontSize: 13, color: colors.t1, flex: 1, lineHeight: 18 },

  // Error
  errorCard: {
    backgroundColor: colors.s1, borderRadius: 16,
    borderWidth: 1, borderColor: colors.b1,
    padding: 22, alignItems: 'center',
  },
  errorTitle: {
    fontFamily: 'Cinzel_700Bold', fontSize: 18,
    color: colors.t1, marginTop: 10, letterSpacing: -0.2,
  },
  errorSub: { fontSize: 13, color: colors.t2, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  errorDetailBlock: {
    width: '100%', marginTop: 14, padding: 10,
    borderRadius: 8, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.b1,
  },
  errorDetailLabel: {
    fontSize: 10, fontWeight: '800', color: colors.t3,
    letterSpacing: 1.2, marginBottom: 4,
  },
  errorDetailText: { fontSize: 11, color: colors.t2, fontFamily: 'Menlo' },

  // ── Forge power demo (free-tier only) ─────────────────────────
  powerGrid: {
    gap: 10,
    backgroundColor: colors.s1,
    borderWidth: 1, borderColor: colors.b1,
    borderRadius: 14, padding: 14,
  },
  powerRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  powerRowIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: INDIGO + '12', borderWidth: 1, borderColor: INDIGO + '28',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  powerRowTitle: { fontSize: 13, fontWeight: '800', color: colors.t1, letterSpacing: -0.1 },
  powerRowBody:  { fontSize: 12, color: colors.t2, lineHeight: 17, marginTop: 2 },

  powerStatRow: {
    flexDirection: 'row', gap: 8, marginTop: 10,
  },
  powerStat: {
    flex: 1, alignItems: 'center', gap: 3,
    backgroundColor: INDIGO + '08',
    borderWidth: 1, borderColor: INDIGO + '22',
    borderRadius: 12, paddingVertical: 12,
  },
  powerStatN: { fontSize: 16, fontWeight: '900', color: INDIGO, letterSpacing: -0.4 },
  powerStatLabel: { fontSize: 10, fontWeight: '700', color: colors.t3, letterSpacing: 0.2 },

  lockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', marginTop: 12, marginBottom: 2,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: INDIGO + '10', borderWidth: 1, borderColor: INDIGO + '22',
  },
  lockedBadgeText: { fontSize: 11, fontWeight: '700', color: INDIGO },
});
