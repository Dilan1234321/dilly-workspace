/**
 * Jobs — clean rebuild (build 352).
 *
 * The previous full Jobs page (2,600+ lines, complex animation stack,
 * collections, paywall, holder arena, fit narrative modals) was
 * crashing the iOS app to springboard on tap. The full version is
 * preserved at /mobile/_parked/jobs.full.tsx.txt for reference.
 *
 * This rebuild keeps the soul of the new UI — DillyNoticed
 * observation strip, hero match, confidence bands, fit-story
 * sentences under each card — but drops everything that was
 * structurally risky: no LayoutAnimation, no Animated.Value, no
 * SVG gradients, no react-native-reanimated, no nested ErrorBoundaries,
 * no SessionCache layer. Pure RN primitives + one fetch on mount.
 *
 * Re-adding collections / saved-jobs / fit-narrative modal is
 * deliberately out of scope for this rebuild. Those come back as
 * isolated features once this Jobs is stable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

// -- Types --------------------------------------------------------------------

interface Listing {
  id: string;
  title: string;
  company: string;
  location_city?: string;
  location_state?: string;
  location?: string;
  work_mode?: string;
  description_preview?: string;
  url?: string;
  apply_url?: string;
  posted_date?: string;
  remote?: boolean;
  rank_score?: number;
  quick_glance?: string[];
  cohort_requirements?: { cohort: string }[] | null;
}

interface Profile {
  first_name?: string;
  job_locations?: string[];
  cohorts?: string[];
  interests?: string[];
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

/** Compose an earned fit-story sentence. No mock scores, just observations
 *  that are actually true from the data. Returns '' if nothing genuine
 *  can be said (we refuse to fabricate warmth). */
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
  if (fresh === 'Today' || fresh === '1d ago') {
    parts.push('posted today so you are early');
  } else if (fresh && fresh.endsWith('d ago')) {
    const n = Number(fresh.replace('d ago', ''));
    if (!Number.isNaN(n) && n <= 7) parts.push('posted this week');
  }

  const userCohorts = new Set((profile?.cohorts || []).map(c => c.toLowerCase()));
  const jobCohorts = (job.cohort_requirements || []).map(c => c.cohort?.toLowerCase()).filter(Boolean);
  const overlap = jobCohorts.filter(c => userCohorts.has(c));
  if (overlap.length > 0) parts.push(`matches your ${overlap[0]} track`);

  if (parts.length === 0) return '';
  // Title-case the first letter of the first segment.
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return [first, ...parts.slice(1)].join(', ') + '.';
}

/** Rotating DillyNoticed observation strings. Derived from the data so
 *  the line feels earned instead of canned. Keeps to ~1–2 sentences. */
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

  if (lines.length === 0) {
    lines.push('Dilly is watching this feed for you. Check back anytime.');
  }
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

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [feedRes, profileRes] = await Promise.all([
        dilly.get('/v2/internships/feed?tab=all&limit=60&sort=rank').catch(() => null),
        dilly.get('/profile').catch(() => null),
      ]);
      const listings: Listing[] = Array.isArray(feedRes?.listings)
        ? feedRes.listings
        : Array.isArray(feedRes)
          ? feedRes
          : [];
      setJobs(listings);
      setProfile(profileRes && typeof profileRes === 'object' ? (profileRes as Profile) : null);
    } catch (e: any) {
      setError(e?.message || 'Could not load jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Split into confidence bands.
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

  const openJob = useCallback((job: Listing) => {
    const url = job.apply_url || job.url;
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg }]}>
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.surface.t2 }]}>
          Dilly is pulling fresh matches
        </Text>
      </View>
    );
  }

  if (error && jobs.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg }]}>
        <Text style={[styles.errorTitle, { color: theme.surface.t1 }]}>
          Couldn't reach the feed
        </Text>
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: theme.surface.t1 }]}>Jobs</Text>
            <Text style={[styles.pageSub, { color: theme.surface.t3 }]}>
              {jobs.length} {jobs.length === 1 ? 'match' : 'matches'} today
            </Text>
          </View>
          {/* Skills brush-up pill — two sides of the same coin. When a
              role reveals a gap, the user is one tap away from the
              curated library. */}
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

      {/* DillyNoticed observation strip */}
      {noticedLine ? (
        <View style={[styles.noticedStrip, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Ionicons name="sparkles" size={14} color={theme.accent} />
          <Text style={[styles.noticedEyebrow, { color: theme.accent }]}>DILLY NOTICED</Text>
          <Text style={[styles.noticedLine, { color: theme.surface.t1 }]}>{noticedLine}</Text>
        </View>
      ) : null}

      {/* Hero top match */}
      {hero ? (
        <HeroCard job={hero} profile={profile} onPress={() => openJob(hero)} theme={theme} />
      ) : null}

      {/* Strong matches band */}
      {strong.length > 1 ? (
        <Band
          label="STRONG MATCHES"
          subtitle="Your profile lines up well. Apply with confidence."
          jobs={strong.slice(1)}
          opacity={1}
          profile={profile}
          onPress={openJob}
          theme={theme}
        />
      ) : null}

      {/* Stretch band */}
      {stretch.length > 0 ? (
        <Band
          label="STRETCH ROLES"
          subtitle="Good fit if you frame it right. Dilly can help."
          jobs={stretch}
          opacity={0.88}
          profile={profile}
          onPress={openJob}
          theme={theme}
        />
      ) : null}

      {/* Worth knowing band */}
      {known.length > 0 ? (
        <Band
          label="WORTH KNOWING"
          subtitle="Not a direct match, but worth tracking."
          jobs={known.slice(0, 12)}
          opacity={0.72}
          profile={profile}
          onPress={openJob}
          theme={theme}
        />
      ) : null}

      {jobs.length === 0 ? (
        <View style={{ padding: 32, alignItems: 'center' }}>
          <Text style={[styles.errorTitle, { color: theme.surface.t1 }]}>
            No matches yet
          </Text>
          <Text style={[styles.errorBody, { color: theme.surface.t2 }]}>
            Dilly is still indexing your profile. Check back in a bit.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// -- Hero Card ----------------------------------------------------------------

function HeroCard({ job, profile, onPress, theme }: {
  job: Listing; profile: Profile | null; onPress: () => void; theme: ReturnType<typeof useResolvedTheme>;
}) {
  const story = buildFitStory(job, profile);
  const posted = daysAgo(job.posted_date);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.hero, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
    >
      <View style={styles.heroTop}>
        <Text style={[styles.heroEyebrow, { color: theme.accent }]}>TOP MATCH FOR YOU</Text>
        {posted ? <Text style={[styles.heroPosted, { color: theme.surface.t3 }]}>{posted}</Text> : null}
      </View>
      <Text style={[styles.heroTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{job.title}</Text>
      <Text style={[styles.heroCompany, { color: theme.surface.t2 }]} numberOfLines={1}>
        {job.company}{job.location_city ? ` · ${job.location_city}` : ''}
      </Text>
      {story ? (
        <Text style={[styles.heroStory, { color: theme.surface.t1 }]}>{story}</Text>
      ) : null}
      <View style={[styles.heroApply, { backgroundColor: theme.accent }]}>
        <Text style={styles.heroApplyText}>View this match</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

// -- Band ---------------------------------------------------------------------

function Band({ label, subtitle, jobs, opacity, profile, onPress, theme }: {
  label: string;
  subtitle: string;
  jobs: Listing[];
  opacity: number;
  profile: Profile | null;
  onPress: (j: Listing) => void;
  theme: ReturnType<typeof useResolvedTheme>;
}) {
  return (
    <View style={{ marginTop: 28, opacity }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={[styles.bandLabel, { color: theme.accent }]}>{label}</Text>
        <Text style={[styles.bandSub, { color: theme.surface.t3 }]}>{subtitle}</Text>
      </View>
      {jobs.map(j => (
        <JobCard key={j.id} job={j} profile={profile} onPress={() => onPress(j)} theme={theme} />
      ))}
    </View>
  );
}

// -- Job Card -----------------------------------------------------------------

function JobCard({ job, profile, onPress, theme }: {
  job: Listing; profile: Profile | null; onPress: () => void; theme: ReturnType<typeof useResolvedTheme>;
}) {
  const story = buildFitStory(job, profile);
  const posted = daysAgo(job.posted_date);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
    >
      <View style={styles.cardTopRow}>
        <Text style={[styles.cardTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{job.title}</Text>
        {posted ? <Text style={[styles.cardPosted, { color: theme.surface.t3 }]}>{posted}</Text> : null}
      </View>
      <Text style={[styles.cardCompany, { color: theme.surface.t2 }]} numberOfLines={1}>
        {job.company}{job.location_city ? ` · ${job.location_city}` : job.remote ? ' · Remote' : ''}
      </Text>
      {story ? (
        <Text style={[styles.cardStory, { color: theme.surface.t1 }]} numberOfLines={2}>{story}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 13 },
  errorTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  errorBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 11 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  headerRow: { paddingHorizontal: 20, marginBottom: 12 },
  pageTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  pageSub: { fontSize: 12, marginTop: 2 },
  brushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  brushBtnText: { fontSize: 11, fontWeight: '800' },

  noticedStrip: {
    marginHorizontal: 16,
    borderRadius: 13,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  noticedEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  noticedLine: { fontSize: 13, fontWeight: '600', flexShrink: 1, width: '100%', marginTop: 4 },

  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroPosted: { fontSize: 11, fontWeight: '600' },
  heroTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, lineHeight: 26 },
  heroCompany: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  heroStory: { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 12 },
  heroApply: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 14,
  },
  heroApplyText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  bandLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  bandSub: { fontSize: 12, marginTop: 2 },

  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', flex: 1, lineHeight: 20 },
  cardPosted: { fontSize: 11, fontWeight: '600' },
  cardCompany: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  cardStory: { fontSize: 12, fontStyle: 'italic', lineHeight: 17, marginTop: 8 },
});
