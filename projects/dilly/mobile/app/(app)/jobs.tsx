/**
 * Jobs — second rebuild pass (build 353).
 *
 * Build 352 stabilized the structure (DillyNoticed strip, hero, bands,
 * fit stories). This pass adds back the product-power features the
 * user called out: company logos, fit narratives, tailor-a-resume,
 * apply-with-tracking, Ask Dilly. Each is additive — the stable
 * 352 skeleton is preserved.
 *
 * Key design decisions:
 *   - Company logo uses the server-provided URL, then falls back to a
 *     Google favicon derived from company_website, then an initial tile.
 *     No crash on broken URLs; Image's onError flips us to the tile.
 *   - Tap a card to expand. Expanded state reveals the fit narrative
 *     (/jobs/fit-narrative) plus three actions: Apply, Ask Dilly,
 *     Tailor resume. Cards collapse on second tap.
 *   - Fit narrative is lazy-loaded only when a card is expanded. One
 *     in-flight request per job, cached in component state so expanding
 *     again is free.
 *   - Apply path writes to /v2/internships/save + /applications, then
 *     opens the listing's apply URL. Fully non-blocking; failed tracker
 *     saves do not stop the apply.
 *   - Tailor opens /resume-generate with the job pre-populated.
 *   - Ask Dilly seeds the chat overlay with a prompt about this role.
 *
 * Intentionally still no LayoutAnimation, no Animated.Value, no
 * session cache, no collection sheets. Expand/collapse uses a simple
 * state flip; RN handles the relayout naturally.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import DillyLoadingState from '../../components/DillyLoadingState';

// -- Types --------------------------------------------------------------------

interface Listing {
  id: string;
  title: string;
  company: string;
  location_city?: string;
  location_state?: string;
  location?: string;
  work_mode?: string;
  description?: string;
  description_preview?: string;
  url?: string;
  apply_url?: string;
  posted_date?: string;
  remote?: boolean;
  rank_score?: number;
  quick_glance?: string[];
  cohort_requirements?: { cohort: string }[] | null;
  company_logo?: string | null;
  company_website?: string | null;
  source?: string;
}

interface Profile {
  first_name?: string;
  job_locations?: string[];
  cohorts?: string[];
  interests?: string[];
}

interface FitNarrative {
  what_you_have?: string;
  whats_missing?: string;
  what_to_do?: string;
  fit_color?: 'green' | 'amber' | 'red';
}

type Band = 'strong' | 'stretch' | 'known';

// -- Helpers ------------------------------------------------------------------

function daysAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return '1d ago';
  if (diff <= 30) return `${diff}d ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

function bandFor(score: number): Band {
  if (score >= 72) return 'strong';
  if (score >= 45) return 'stretch';
  return 'known';
}

function domainToFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

function companyLogoUrl(
  companyName: string | undefined,
  serverLogoUrl: string | null | undefined,
  companyWebsite: string | null | undefined,
): string | null {
  if (serverLogoUrl) return serverLogoUrl;
  if (companyWebsite) {
    try {
      const cleaned = companyWebsite
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .split('?')[0];
      if (cleaned) return domainToFaviconUrl(cleaned);
    } catch { /* fall through */ }
  }
  if (!companyName) return null;
  const slug = companyName
    .toLowerCase()
    .replace(/\binc\.?|\bllc\.?|\bco\.?|\bcorp\.?|\bltd\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  if (!slug) return null;
  return domainToFaviconUrl(`${slug}.com`);
}

function buildFitStory(job: Listing, profile: Profile | null): string {
  const parts: string[] = [];
  const userCities = (profile?.job_locations || []).map(c => c.toLowerCase());
  const jobCity = (job.location_city || '').toLowerCase();
  if (jobCity && userCities.includes(jobCity)) {
    parts.push(`In ${job.location_city}, where you already want to be`);
  } else if (job.remote || (job.work_mode || '').toLowerCase().includes('remote')) {
    parts.push('Remote, so location is off the table');
  }
  const fresh = daysAgo(job.posted_date);
  if (fresh === 'Today' || fresh === '1d ago') parts.push('posted today so you are early');
  else if (fresh && fresh.endsWith('d ago')) {
    const n = Number(fresh.replace('d ago', ''));
    if (!Number.isNaN(n) && n <= 7) parts.push('posted this week');
  }
  const userCohorts = new Set((profile?.cohorts || []).map(c => c.toLowerCase()));
  const jobCohorts = (job.cohort_requirements || []).map(c => c.cohort?.toLowerCase()).filter(Boolean);
  const overlap = jobCohorts.filter(c => userCohorts.has(c));
  if (overlap.length > 0) parts.push(`matches your ${overlap[0]} track`);
  if (parts.length === 0) return '';
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return [first, ...parts.slice(1)].join(', ') + '.';
}

function buildNoticedLines(jobs: Listing[], profile: Profile | null): string[] {
  const lines: string[] = [];
  if (!jobs.length) return lines;
  const fresh = jobs.filter(j => {
    const fa = daysAgo(j.posted_date);
    return fa === 'Today' || fa === '1d ago';
  }).length;
  if (fresh >= 3) lines.push(`${fresh} of these roles hit the board in the last 24 hours.`);
  const top = jobs.slice(0, 20);
  const companyCount = new Map<string, number>();
  top.forEach(j => companyCount.set(j.company, (companyCount.get(j.company) || 0) + 1));
  const [heavyCompany, heavyCount] = [...companyCount.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  if (heavyCompany && heavyCount >= 3) {
    lines.push(`${heavyCompany} is hiring across ${heavyCount} roles your profile touches.`);
  }
  const userCities = (profile?.job_locations || []).map(c => c.toLowerCase());
  if (userCities.length) {
    const inCity = jobs.filter(j => userCities.includes((j.location_city || '').toLowerCase())).length;
    if (inCity >= 2) lines.push(`${inCity} matches are in the cities you told Dilly you want.`);
  }
  if (lines.length === 0) lines.push('Dilly is watching this feed for you. Check back anytime.');
  return lines;
}

// -- Screen -------------------------------------------------------------------

export default function JobsScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Listing[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeIndex, setNoticeIndex] = useState(0);

  // Per-job expand state. Exactly one expanded at a time keeps the
  // feed scannable; tapping a second job collapses the first.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Per-job cached fit narratives (keyed by job id). Populated lazily
  // the first time a job expands.
  const [narratives, setNarratives] = useState<Record<string, FitNarrative | { __loading: true } | { __error: string }>>({});

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [feedRes, profileRes] = await Promise.all([
        dilly.get('/v2/internships/feed?tab=all&limit=60&sort=rank').catch(() => null),
        dilly.get('/profile').catch(() => null),
      ]);
      const listings: Listing[] = Array.isArray(feedRes?.listings)
        ? feedRes.listings
        : Array.isArray(feedRes) ? feedRes : [];
      setJobs(listings);
      setProfile(profileRes && typeof profileRes === 'object' ? (profileRes as Profile) : null);
    } catch (e: any) {
      setError(e?.message || 'Could not load jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const { strong, stretch, known, hero } = useMemo(() => {
    const strong: Listing[] = [];
    const stretch: Listing[] = [];
    const known: Listing[] = [];
    jobs.forEach(j => {
      const score = Number(j.rank_score ?? 50);
      const b = bandFor(score);
      if (b === 'strong') strong.push(j);
      else if (b === 'stretch') stretch.push(j);
      else known.push(j);
    });
    return { strong, stretch, known, hero: strong[0] || jobs[0] || null };
  }, [jobs]);

  const noticed = useMemo(() => buildNoticedLines(jobs, profile), [jobs, profile]);
  useEffect(() => {
    if (noticed.length <= 1) return;
    const id = setInterval(() => setNoticeIndex(i => (i + 1) % noticed.length), 6000);
    return () => clearInterval(id);
  }, [noticed.length]);

  // Lazy fit-narrative fetch. Called when a card is expanded for the
  // first time. Subsequent expands hit cache.
  const ensureNarrative = useCallback(async (job: Listing) => {
    setNarratives(prev => {
      if (prev[job.id]) return prev;
      return { ...prev, [job.id]: { __loading: true } };
    });
    try {
      const res = await dilly.fetch('/jobs/fit-narrative', {
        method: 'POST',
        body: JSON.stringify({ job_id: job.id }),
      });
      if (!res?.ok) {
        // 402/403 are handled globally (paywall) or mean "quota hit".
        setNarratives(prev => ({ ...prev, [job.id]: { __error: res?.status === 403 ? 'quota' : 'unavailable' } }));
        return;
      }
      const json = await res.json();
      setNarratives(prev => ({ ...prev, [job.id]: json as FitNarrative }));
    } catch {
      setNarratives(prev => ({ ...prev, [job.id]: { __error: 'unavailable' } }));
    }
  }, []);

  const toggleExpanded = useCallback((job: Listing) => {
    setExpandedId(current => {
      if (current === job.id) return null;
      // Fire-and-forget narrative fetch. No await — the card expands
      // immediately and shows a skeleton while the request is in flight.
      ensureNarrative(job);
      return job.id;
    });
  }, [ensureNarrative]);

  const apply = useCallback(async (job: Listing) => {
    const applyUrl = job.apply_url || job.url || '';
    // Save to saved + applications tracker (both best-effort).
    dilly.post('/v2/internships/save', { internship_id: job.id }).catch(() => {});
    dilly.fetch('/applications', {
      method: 'POST',
      body: JSON.stringify({
        company: job.company,
        role: job.title,
        status: 'applied',
        job_id: job.id,
        job_url: applyUrl,
        applied_at: new Date().toISOString().slice(0, 10),
        notes: `Applied via ${job.source || 'Dilly'}.`,
      }),
    }).catch(() => {});
    if (applyUrl) Linking.openURL(applyUrl).catch(() => {});
  }, []);

  const askDilly = useCallback((job: Listing) => {
    openDillyOverlay({
      initialMessage: `I'm looking at the ${job.title} role at ${job.company}. Can you help me understand how well I fit and what I should work on to be competitive for this role?`,
    });
  }, []);

  const tailorResume = useCallback((job: Listing) => {
    const desc = (job.description || job.description_preview || '').slice(0, 2000);
    router.push({
      pathname: '/resume-generate',
      params: {
        jobTitle: job.title || '',
        company: job.company || '',
        jd: desc,
        fresh: '1',
      },
    });
  }, []);

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        mood="writing"
        accessory="pencil"
        messages={[
          'Dilly is pulling fresh matches…',
          'Reading new postings…',
          'Checking your profile against today\'s roles…',
          'Almost ready…',
        ]}
      />
    );
  }

  if (error && jobs.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg }]}>
        <Text style={[styles.errorTitle, { color: theme.surface.t1 }]}>Couldn't reach the feed</Text>
        <Text style={[styles.errorBody, { color: theme.surface.t2 }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: theme.accent }]}
          onPress={() => { setLoading(true); loadData(); }}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const noticedLine = noticed[noticeIndex] || '';
  const cardActions = {
    onExpand:  toggleExpanded,
    onApply:   apply,
    onAsk:     askDilly,
    onTailor:  tailorResume,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: theme.surface.t1 }]}>Jobs</Text>
            <Text style={[styles.pageSub, { color: theme.surface.t3 }]}>
              {jobs.length} {jobs.length === 1 ? 'match' : 'matches'} today
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/skills')}
            style={[styles.brushBtn, { borderColor: theme.accentBorder, backgroundColor: theme.surface.s1 }]}
          >
            <Ionicons name="sparkles" size={13} color={theme.accent} />
            <Text style={[styles.brushBtnText, { color: theme.surface.t1 }]}>Brush up</Text>
          </TouchableOpacity>
        </View>
      </View>

      {noticedLine ? (
        <View style={[styles.noticedStrip, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Ionicons name="sparkles" size={14} color={theme.accent} />
          <Text style={[styles.noticedEyebrow, { color: theme.accent }]}>DILLY NOTICED</Text>
          <Text style={[styles.noticedLine, { color: theme.surface.t1 }]}>{noticedLine}</Text>
        </View>
      ) : null}

      {hero ? (
        <HeroCard
          job={hero}
          profile={profile}
          theme={theme}
          expanded={expandedId === hero.id}
          narrative={narratives[hero.id]}
          {...cardActions}
        />
      ) : null}

      {strong.length > 1 ? (
        <BandSection label="STRONG MATCHES" subtitle="Your profile lines up well. Apply with confidence."
          jobs={strong.slice(1)} opacity={1}
          profile={profile} theme={theme} expandedId={expandedId} narratives={narratives} actions={cardActions}
        />
      ) : null}

      {stretch.length > 0 ? (
        <BandSection label="STRETCH ROLES" subtitle="Good fit if you frame it right. Dilly can help."
          jobs={stretch} opacity={0.88}
          profile={profile} theme={theme} expandedId={expandedId} narratives={narratives} actions={cardActions}
        />
      ) : null}

      {known.length > 0 ? (
        <BandSection label="WORTH KNOWING" subtitle="Not a direct match, but worth tracking."
          jobs={known.slice(0, 12)} opacity={0.72}
          profile={profile} theme={theme} expandedId={expandedId} narratives={narratives} actions={cardActions}
        />
      ) : null}

      {jobs.length === 0 ? (
        <View style={{ padding: 32, alignItems: 'center' }}>
          <Text style={[styles.errorTitle, { color: theme.surface.t1 }]}>No matches yet</Text>
          <Text style={[styles.errorBody, { color: theme.surface.t2 }]}>
            Dilly is still indexing your profile. Check back in a bit.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// -- Company Logo -------------------------------------------------------------

function CompanyLogo({ job, size, theme }: { job: Listing; size: number; theme: ReturnType<typeof useResolvedTheme> }) {
  const [broken, setBroken] = useState(false);
  const url = broken ? null : companyLogoUrl(job.company, job.company_logo, job.company_website);

  if (!url) {
    const initial = (job.company || '?').charAt(0).toUpperCase();
    return (
      <View style={{
        width: size, height: size, borderRadius: size * 0.2,
        backgroundColor: theme.accentSoft,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: theme.accentBorder,
      }}>
        <Text style={{ fontSize: size * 0.42, fontWeight: '800', color: theme.accent }}>{initial}</Text>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.2, overflow: 'hidden', backgroundColor: '#FFF' }}>
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => setBroken(true)}
      />
    </View>
  );
}

// -- Hero Card ----------------------------------------------------------------

interface CardActions {
  onExpand: (j: Listing) => void;
  onApply:  (j: Listing) => void;
  onAsk:    (j: Listing) => void;
  onTailor: (j: Listing) => void;
}

interface CardCommonProps {
  job: Listing;
  profile: Profile | null;
  theme: ReturnType<typeof useResolvedTheme>;
  expanded: boolean;
  narrative: FitNarrative | { __loading: true } | { __error: string } | undefined;
  onExpand: (j: Listing) => void;
  onApply:  (j: Listing) => void;
  onAsk:    (j: Listing) => void;
  onTailor: (j: Listing) => void;
}

function HeroCard(props: CardCommonProps) {
  const { job, profile, theme, expanded } = props;
  const story = buildFitStory(job, profile);
  const posted = daysAgo(job.posted_date);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => props.onExpand(job)}
      style={[styles.hero, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
    >
      <View style={styles.heroTop}>
        <Text style={[styles.heroEyebrow, { color: theme.accent }]}>TOP MATCH FOR YOU</Text>
        {posted ? <Text style={[styles.heroPosted, { color: theme.surface.t3 }]}>{posted}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 8 }}>
        <CompanyLogo job={job} size={44} theme={theme} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{job.title}</Text>
          <Text style={[styles.heroCompany, { color: theme.surface.t2 }]} numberOfLines={1}>
            {job.company}{job.location_city ? ` · ${job.location_city}` : ''}
          </Text>
        </View>
      </View>
      {story ? <Text style={[styles.heroStory, { color: theme.surface.t1 }]}>{story}</Text> : null}

      {expanded ? <ExpandedDetails {...props} /> : (
        <View style={[styles.heroApply, { backgroundColor: theme.accent }]}>
          <Text style={styles.heroApplyText}>See the fit</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// -- Band ---------------------------------------------------------------------

function BandSection({ label, subtitle, jobs, opacity, profile, theme, expandedId, narratives, actions }: {
  label: string;
  subtitle: string;
  jobs: Listing[];
  opacity: number;
  profile: Profile | null;
  theme: ReturnType<typeof useResolvedTheme>;
  expandedId: string | null;
  narratives: Record<string, FitNarrative | { __loading: true } | { __error: string }>;
  actions: CardActions;
}) {
  return (
    <View style={{ marginTop: 28, opacity }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={[styles.bandLabel, { color: theme.accent }]}>{label}</Text>
        <Text style={[styles.bandSub, { color: theme.surface.t3 }]}>{subtitle}</Text>
      </View>
      {jobs.map(j => (
        <JobCard
          key={j.id}
          job={j}
          profile={profile}
          theme={theme}
          expanded={expandedId === j.id}
          narrative={narratives[j.id]}
          {...actions}
        />
      ))}
    </View>
  );
}

// -- Job Card -----------------------------------------------------------------

function JobCard(props: CardCommonProps) {
  const { job, profile, theme, expanded } = props;
  const story = buildFitStory(job, profile);
  const posted = daysAgo(job.posted_date);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => props.onExpand(job)}
      style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <CompanyLogo job={job} size={32} theme={theme} />
        <View style={{ flex: 1 }}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{job.title}</Text>
            {posted ? <Text style={[styles.cardPosted, { color: theme.surface.t3 }]}>{posted}</Text> : null}
          </View>
          <Text style={[styles.cardCompany, { color: theme.surface.t2 }]} numberOfLines={1}>
            {job.company}{job.location_city ? ` · ${job.location_city}` : job.remote ? ' · Remote' : ''}
          </Text>
        </View>
      </View>
      {story ? <Text style={[styles.cardStory, { color: theme.surface.t1 }]} numberOfLines={expanded ? 0 : 2}>{story}</Text> : null}
      {expanded ? <ExpandedDetails {...props} /> : null}
    </TouchableOpacity>
  );
}

// -- Expanded Details (fit narrative + actions) -------------------------------

function ExpandedDetails({ job, theme, narrative, onApply, onAsk, onTailor }: CardCommonProps) {
  const loading = narrative && (narrative as any).__loading;
  const errored = narrative && (narrative as any).__error;
  const data: FitNarrative | null = (narrative && !loading && !errored) ? (narrative as FitNarrative) : null;

  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      <Text style={[styles.narrativeEyebrow, { color: theme.accent }]}>WHAT DILLY SEES</Text>

      {loading ? (
        <View style={styles.narrativeSkel}>
          <View style={[styles.skelLine, { backgroundColor: theme.surface.s2, width: '90%' }]} />
          <View style={[styles.skelLine, { backgroundColor: theme.surface.s2, width: '75%' }]} />
          <View style={[styles.skelLine, { backgroundColor: theme.surface.s2, width: '82%' }]} />
        </View>
      ) : null}

      {errored === 'quota' ? (
        <Text style={[styles.narrativeErr, { color: theme.surface.t2 }]}>
          You've used all your fit assessments for now. Try again later or upgrade for unlimited.
        </Text>
      ) : null}

      {errored === 'unavailable' ? (
        <Text style={[styles.narrativeErr, { color: theme.surface.t2 }]}>
          Dilly couldn't pull the fit narrative for this one. Try refreshing.
        </Text>
      ) : null}

      {data ? (
        <View style={{ gap: 10 }}>
          {data.what_you_have ? (
            <NarrativeRow label="What you have" body={data.what_you_have} color="#34C759" theme={theme} />
          ) : null}
          {data.whats_missing ? (
            <NarrativeRow label="What's missing" body={data.whats_missing} color="#FF9F0A" theme={theme} />
          ) : null}
          {data.what_to_do ? (
            <NarrativeRow label="What to do" body={data.what_to_do} color={theme.accent} theme={theme} />
          ) : null}
        </View>
      ) : null}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={(e) => { e.stopPropagation?.(); onApply(job); }}
          style={[styles.actionPrimary, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="open-outline" size={14} color="#FFF" />
          <Text style={styles.actionPrimaryText}>Apply</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={(e) => { e.stopPropagation?.(); onAsk(job); }}
          style={[styles.actionSecondary, { borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]}
        >
          <Ionicons name="sparkles" size={14} color={theme.accent} />
          <Text style={[styles.actionSecondaryText, { color: theme.accent }]}>Ask Dilly</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={(e) => { e.stopPropagation?.(); onTailor(job); }}
          style={[styles.actionSecondary, { borderColor: theme.surface.border }]}
        >
          <Ionicons name="document-text-outline" size={14} color={theme.surface.t2} />
          <Text style={[styles.actionSecondaryText, { color: theme.surface.t2 }]}>Tailor resume</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Split a backend-returned narrative string into bullet-sized
 *  points. Priority:
 *    1. Explicit newlines (backend sometimes returns multi-line).
 *    2. Sentences (split on .  !  ? followed by space/end).
 *    3. Fall back to the whole string as a single bullet.
 *  Strips leading bullet characters the backend may have added so we
 *  do not render double bullets. */
function toBullets(body: string): string[] {
  const s = (body || '').trim();
  if (!s) return [];
  // Prefer explicit line breaks.
  let parts = s.split(/\r?\n+/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    // Split on sentence boundaries. Keeps the punctuation on each bullet
    // so it reads like a real sentence.
    parts = s
      .split(/(?<=[.!?])\s+/)
      .map(p => p.trim())
      .filter(Boolean);
  }
  return parts.map(p => p.replace(/^[\-\*•·◦▪▫]+\s*/, '').trim()).filter(Boolean);
}

function NarrativeRow({ label, body, color, theme }: { label: string; body: string; color: string; theme: ReturnType<typeof useResolvedTheme> }) {
  const bullets = toBullets(body);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text style={[styles.narrativeLabel, { color }]}>{label.toUpperCase()}</Text>
      </View>
      {bullets.map((b, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={[styles.bulletDot, { color }]}>•</Text>
          <Text style={[styles.narrativeBody, { color: theme.surface.t1 }]}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 13 },
  errorTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  errorBody:  { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  retryBtn:   { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 11 },
  retryText:  { color: '#fff', fontWeight: '700', fontSize: 13 },

  headerRow: { paddingHorizontal: 20, marginBottom: 12 },
  pageTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  pageSub:   { fontSize: 12, marginTop: 2 },
  brushBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  brushBtnText: { fontSize: 11, fontWeight: '800' },

  noticedStrip: { marginHorizontal: 16, borderRadius: 13, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  noticedEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  noticedLine:    { fontSize: 13, fontWeight: '600', flexShrink: 1, width: '100%', marginTop: 4 },

  hero: { marginHorizontal: 16, marginTop: 16, padding: 18, borderRadius: 16, borderWidth: 1 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroPosted:  { fontSize: 11, fontWeight: '600' },
  heroTitle:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, lineHeight: 26 },
  heroCompany: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  heroStory:   { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 12 },
  heroApply:   { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, marginTop: 14 },
  heroApplyText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  bandLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  bandSub:   { fontSize: 12, marginTop: 2 },

  card: { marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 13, borderWidth: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle:   { fontSize: 15, fontWeight: '800', flex: 1, lineHeight: 20 },
  cardPosted:  { fontSize: 11, fontWeight: '600' },
  cardCompany: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  cardStory:   { fontSize: 12, fontStyle: 'italic', lineHeight: 17, marginTop: 8 },

  narrativeEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  narrativeSkel:    { gap: 6 },
  skelLine:         { height: 10, borderRadius: 4 },
  narrativeErr:     { fontSize: 12, lineHeight: 18 },
  narrativeLabel:   { fontSize: 9,  fontWeight: '900', letterSpacing: 1.2 },
  narrativeBody:    { fontSize: 13, lineHeight: 19, flex: 1 },
  bulletRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 3 },
  bulletDot:        { fontSize: 14, lineHeight: 19, fontWeight: '900' },

  actionPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  actionPrimaryText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  actionSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 12, fontWeight: '800' },
});
