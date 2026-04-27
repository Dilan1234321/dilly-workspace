/**
 * Skills cohort page - redesigned (build 355).
 *
 * The first pass looked like a list with a filter bar on top. Too
 * clinical. This redesign is magazine-like:
 *
 *   - Hero: big cohort title, short tagline from a static map, video
 *     + channel count, a warm accent-tinted background so each cohort
 *     feels like a distinct destination.
 *   - "Start here" is now a horizontal carousel of full-bleed cards
 *     with step numbers. Feels like a curated playlist.
 *   - Filters move into a sticky-looking chip row under "The library",
 *     horizontally scrollable so they don't wrap.
 *   - Video cards use a bigger title (15pt, weight 800), cleaner
 *     spacing, duration chip on the thumbnail, and a slim "high signal"
 *     badge that doesn't dominate.
 *
 * Data source is unchanged: GET /skill-lab/videos?cohort=&sort=&max_duration_min=.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { dilly } from '../../../../lib/dilly';
import { useResolvedTheme } from '../../../../hooks/useTheme';
import DillyLoadingState from '../../../../components/DillyLoadingState';
import { FirstVisitCoach } from '../../../../components/FirstVisitCoach';

interface CohortMeta {
  title: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Slug → display name + short editorial tagline. Taglines are
 *  single-sentence, imperative when possible, brand voice. */
const COHORTS: Record<string, CohortMeta> = {
  'software-engineering-cs':          { title: 'Software Engineering & CS',        tagline: 'Build systems that scale.',                         icon: 'code-slash' },
  'data-science-analytics':           { title: 'Data Science & Analytics',         tagline: 'Make numbers speak.',                              icon: 'stats-chart' },
  'cybersecurity-it':                 { title: 'Cybersecurity & IT',               tagline: 'Defend what matters; break what should break.',   icon: 'shield-checkmark' },
  'electrical-computer-engineering':  { title: 'Electrical & Computer Engineering',tagline: 'Signal, circuit, silicon - the metal layer.',      icon: 'hardware-chip' },
  'mechanical-aerospace-engineering': { title: 'Mechanical & Aerospace Engineering',tagline: 'Solids, fluids, the discipline of flight.',       icon: 'airplane' },
  'civil-environmental-engineering':  { title: 'Civil & Environmental Engineering',tagline: 'The built world.',                                 icon: 'business' },
  'chemical-biomedical-engineering':  { title: 'Chemical & Biomedical Engineering',tagline: 'Reactions, devices, the life sciences.',           icon: 'flask' },
  'finance-accounting':               { title: 'Finance & Accounting',             tagline: 'Modeling, valuation, financial reasoning.',        icon: 'cash' },
  'consulting-strategy':              { title: 'Consulting & Strategy',            tagline: 'Structure, synthesis, the whiteboard.',            icon: 'analytics' },
  'marketing-advertising':            { title: 'Marketing & Advertising',          tagline: 'Positioning, distribution, demand.',               icon: 'megaphone' },
  'management-operations':            { title: 'Management & Operations',          tagline: 'Teams, process, the operating cadence.',           icon: 'people' },
  'entrepreneurship-innovation':      { title: 'Entrepreneurship & Innovation',    tagline: 'Building from zero.',                              icon: 'rocket' },
  'economics-public-policy':          { title: 'Economics & Public Policy',        tagline: 'Markets, incentives, evidence.',                   icon: 'trending-up' },
  'healthcare-clinical':              { title: 'Healthcare & Clinical',            tagline: 'Anatomy, clinical reasoning, the MCAT bar.',       icon: 'medkit' },
  'biotech-pharmaceutical':           { title: 'Biotech & Pharmaceutical',         tagline: 'Molecules, trials, regulation.',                   icon: 'fitness' },
  'life-sciences-research':           { title: 'Life Sciences & Research',         tagline: 'From bench to insight.',                           icon: 'leaf' },
  'physical-sciences-math':           { title: 'Physical Sciences & Math',         tagline: 'The math that underwrites everything.',            icon: 'infinite' },
  'law-government':                   { title: 'Law & Government',                 tagline: 'Cases, briefs, institutional craft.',              icon: 'hammer' },
  'media-communications':             { title: 'Media & Communications',           tagline: 'The honest sentence.',                             icon: 'newspaper' },
  'design-creative-arts':             { title: 'Design & Creative Arts',           tagline: 'Taste as output.',                                 icon: 'color-palette' },
  'education-human-development':      { title: 'Education & Human Development',    tagline: 'The classroom craft.',                             icon: 'school' },
  'social-sciences-nonprofit':        { title: 'Social Sciences & Nonprofit',      tagline: 'Mission-driven work.',                             icon: 'heart-circle' },
};

interface Video {
  id: string;
  title: string;
  description?: string;
  channel_id?: string;
  channel_title: string;
  cohort: string;
  duration_sec: number;
  view_count?: number;
  published_at?: string | null;
  thumbnail_url: string;
  quality_score?: number;
  language?: string;
}

type Sort = 'best' | 'newest';
type LengthFilter = 'any' | 'short' | 'medium';

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function publishedAgo(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 60) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

const SCREEN_W = Dimensions.get('window').width;
const STARTHERE_CARD_W = SCREEN_W * 0.72;

export default function CohortScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const meta = (slug && COHORTS[slug as string]) || { title: 'Cohort', tagline: '', icon: 'ellipse' as keyof typeof Ionicons.glyphMap };

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>('best');
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>('any');

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const params = new URLSearchParams({ cohort: String(slug), sort, limit: '60' });
      if (lengthFilter === 'short')  params.set('max_duration_min', '15');
      if (lengthFilter === 'medium') params.set('max_duration_min', '45');
      const res = await dilly.get(`/skill-lab/videos?${params.toString()}`).catch(() => null);
      // Defensive: drop any items missing the bare-minimum fields we
      // dereference unconditionally during render. Bad rows from the
      // API previously crashed the cohort screen with "undefined is
      // not an object" inside the videos.map().
      const raw: any[] = Array.isArray(res?.videos) ? res.videos : [];
      const safe: Video[] = raw.filter(v =>
        v && typeof v === 'object' && typeof v.id === 'string' && typeof v.title === 'string'
      );
      setVideos(safe);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug, sort, lengthFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const startHere = useMemo(() => {
    // Only show the curated path on the default view so changing
    // filters doesn't yank the ordering out from under the user.
    if (sort !== 'best' || lengthFilter !== 'any') return [];
    return videos.slice(0, 5);
  }, [videos, sort, lengthFilter]);

  const rest = useMemo(() => {
    if (startHere.length === 0) return videos;
    return videos.slice(5);
  }, [videos, startHere]);

  const uniqueChannels = useMemo(() => {
    const set = new Set(videos.map(v => v.channel_id || v.channel_title).filter(Boolean));
    return set.size;
  }, [videos]);

  const openVideo = useCallback((v: Video) => {
    router.push({ pathname: `/skills/video/${v.id}`, params: { cohort: String(slug) } });
  }, [slug]);

  if (loading && videos.length === 0) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        mood="writing"
        accessory="pencil"
        messages={[
          `Opening ${meta.title}…`,
          'Pulling the curated list…',
          'Almost ready…',
        ]}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* Hero - tinted backdrop the full width of the screen. The
          accent is muted (accentSoft) so the cohort feels like a
          destination but doesn't shout. Icon, title, tagline,
          counts - nothing else competes. */}
      <View style={[styles.hero, { backgroundColor: theme.accentSoft, paddingTop: insets.top + 8 }]}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={theme.surface.t1} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>

        <View style={styles.heroIconRow}>
          <View style={[styles.heroIconBg, { backgroundColor: theme.accent }]}>
            <Ionicons name={meta.icon} size={24} color="#FFF" />
          </View>
          <Text style={[styles.heroEyebrow, { color: theme.accent }]}>COHORT</Text>
        </View>

        <Text style={[styles.heroTitle, { color: theme.surface.t1 }]} numberOfLines={2}>
          {meta.title}
        </Text>
        {meta.tagline ? (
          <Text style={[styles.heroTagline, { color: theme.surface.t2 }]}>{meta.tagline}</Text>
        ) : null}

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatNum, { color: theme.surface.t1 }]}>{videos.length}</Text>
            <Text style={[styles.heroStatLabel, { color: theme.surface.t3 }]}>videos</Text>
          </View>
          <View style={[styles.heroStatDivider, { backgroundColor: theme.accentBorder }]} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatNum, { color: theme.surface.t1 }]}>{uniqueChannels}</Text>
            <Text style={[styles.heroStatLabel, { color: theme.surface.t3 }]}>channels</Text>
          </View>
          <View style={[styles.heroStatDivider, { backgroundColor: theme.accentBorder }]} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatNum, { color: theme.surface.t1 }]}>100%</Text>
            <Text style={[styles.heroStatLabel, { color: theme.surface.t3 }]}>curated</Text>
          </View>
        </View>
      </View>

      {/* Skills <-> Jobs cross-link. Closes the loop "I am learning
          this skill -> here are the jobs in my feed that need it" so
          the user can swing straight from a video into an apply tap.
          Same pattern as the JobCard skill-gap pill in reverse. */}
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => router.push('/(app)/jobs')}
        style={[styles.crosslinkCard, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}
      >
        <View style={[styles.crosslinkIcon, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="briefcase" size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.crosslinkTitle, { color: theme.surface.t1 }]}>
            Jobs that need these skills
          </Text>
          <Text style={[styles.crosslinkSub, { color: theme.surface.t2 }]}>
            See the openings in your feed that ask for {meta.title} skills.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.accent} />
      </TouchableOpacity>

      {/* Start here - horizontal carousel */}
      {startHere.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>START HERE</Text>
            <Text style={[styles.sectionSub, { color: theme.surface.t2 }]}>
              A curated path for someone starting out.
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          >
            {startHere.map((v, i) => (
              <StartHereCard
                key={v.id}
                video={v}
                step={i + 1}
                theme={theme}
                onPress={() => openVideo(v)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* The library */}
      <View style={[styles.sectionHeader, { marginTop: startHere.length > 0 ? 24 : 20 }]}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>THE LIBRARY</Text>
        <Text style={[styles.sectionSub, { color: theme.surface.t2 }]}>
          Every video in this cohort, sortable and filterable.
        </Text>
      </View>

      {/* Sticky-looking filter chip scroller */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 2 }}
      >
        <FilterPill label="Best"   active={sort === 'best'}   onPress={() => setSort('best')}   theme={theme} />
        <FilterPill label="Newest" active={sort === 'newest'} onPress={() => setSort('newest')} theme={theme} />
        <View style={{ width: 8 }} />
        <FilterPill label="≤15m" active={lengthFilter === 'short'}  onPress={() => setLengthFilter(lengthFilter === 'short' ? 'any' : 'short')}   theme={theme} />
        <FilterPill label="≤45m" active={lengthFilter === 'medium'} onPress={() => setLengthFilter(lengthFilter === 'medium' ? 'any' : 'medium')} theme={theme} />
        <FilterPill label="Any"  active={lengthFilter === 'any'}    onPress={() => setLengthFilter('any')}    theme={theme} />
      </ScrollView>

      {rest.length === 0 ? (
        <Text style={[styles.empty, { color: theme.surface.t3 }]}>
          No videos match these filters. Try widening the length.
        </Text>
      ) : (
        <View style={{ marginTop: 14 }}>
          {rest.map(v => (
            <LibraryRow key={v.id} video={v} theme={theme} onPress={() => openVideo(v)} />
          ))}
        </View>
      )}

      <FirstVisitCoach
        id="skills_cohort_v1"
        iconName="layers"
        headline="One cohort, one curated list"
        subline="Start here is the warm-up path. Below it, every video in this cohort - filter by length or sort by newest."
      />
    </ScrollView>
  );
}

// -- Start Here carousel card -------------------------------------------------

function StartHereCard({ video, step, theme, onPress }: {
  video: Video; step: number; theme: ReturnType<typeof useResolvedTheme>; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.shCard,
        {
          width: STARTHERE_CARD_W,
          backgroundColor: theme.surface.s1,
          borderColor: theme.surface.border,
        },
      ]}
    >
      <View style={{ position: 'relative' }}>
        {video?.thumbnail_url ? (
          <Image source={{ uri: video.thumbnail_url }} style={styles.shThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.shThumb, { backgroundColor: theme.surface.s2 }]} />
        )}
        <View style={[styles.shStep, { backgroundColor: theme.accent }]}>
          <Text style={styles.shStepText}>{step}</Text>
        </View>
        {video.duration_sec ? (
          <View style={styles.durTag}>
            <Text style={styles.durTagText}>{formatDuration(video.duration_sec)}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 12 }}>
        <Text style={[styles.shTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[styles.shMeta, { color: theme.surface.t3 }]} numberOfLines={1}>{video.channel_title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// -- Library row (used below Start Here) --------------------------------------

function LibraryRow({ video, theme, onPress }: {
  video: Video; theme: ReturnType<typeof useResolvedTheme>; onPress: () => void;
}) {
  const ago = publishedAgo(video.published_at);
  const dur = formatDuration(video.duration_sec);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.libRow}>
      <View style={styles.libThumbWrap}>
        {video?.thumbnail_url ? (
          <Image source={{ uri: video.thumbnail_url }} style={styles.libThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.libThumb, { backgroundColor: theme.surface.s2 }]} />
        )}
        {dur ? (
          <View style={styles.durTag}>
            <Text style={styles.durTagText}>{dur}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.libTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[styles.libMeta, { color: theme.surface.t3 }]} numberOfLines={1}>
          {video.channel_title}{ago ? ` · ${ago}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// -- Filter pill --------------------------------------------------------------

function FilterPill({ label, active, onPress, theme }: {
  label: string; active: boolean; onPress: () => void; theme: ReturnType<typeof useResolvedTheme>;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.filterPill,
        active
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { borderColor: theme.accentBorder },
      ]}
    >
      <Text style={[styles.filterPillText, { color: active ? '#FFF' : theme.surface.t1 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  // Skills <-> Jobs cross-link card
  crosslinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  crosslinkIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  crosslinkTitle: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  crosslinkSub: { fontSize: 12, fontWeight: '500', lineHeight: 16, marginTop: 2 },

  // Hero
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  heroIconBg: {
    width: 40, height: 40, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle:   { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  heroTagline: { fontSize: 14, fontWeight: '600', marginTop: 6, lineHeight: 19 },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 0,
  },
  heroStat: { alignItems: 'flex-start', flex: 1 },
  heroStatNum:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroStatLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
  heroStatDivider: { width: 1, height: 30, marginHorizontal: 14 },

  // Sections
  sectionHeader: { paddingHorizontal: 20, marginTop: 22, marginBottom: 12 },
  sectionTitle:  { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  sectionSub:    { fontSize: 12, fontWeight: '600', marginTop: 3, lineHeight: 17 },

  // Start here cards
  shCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shThumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#222' },
  shStep: {
    position: 'absolute', top: 10, left: 10,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  shStepText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  shTitle:    { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  shMeta:     { fontSize: 11, fontWeight: '600', marginTop: 4 },

  // Duration tag (shared)
  durTag: {
    position: 'absolute', right: 8, bottom: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
  },
  durTagText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  // Filter chips
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 12, fontWeight: '700' },

  // Library rows (clean horizontal layout, not full-bleed cards so
  // the list scrolls faster and feels editorial rather than feed-y).
  libRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  libThumbWrap: { width: 148, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: '#222' },
  libThumb: { width: '100%', height: '100%' },
  libTitle: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  libMeta:  { fontSize: 11, fontWeight: '600', marginTop: 4 },
  signal: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999, borderWidth: 1,
    marginTop: 6,
  },
  signalText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },

  empty: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
