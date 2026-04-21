/**
 * Skills cohort detail (build 353).
 *
 * Mirrors the web cohort page:
 *   - "Start here" — first 5 high-quality videos as a guided path
 *   - "The rest of the library" — sort (Best/Newest) + length filter
 *     (≤15m / ≤45m / Any)
 *
 * Fetches from the existing FastAPI endpoint
 *   GET /skill-lab/videos?cohort=<slug>&sort=&limit=&max_duration_min=
 *
 * Each video renders as a card with thumbnail, title, channel, and
 * duration. Tap → /skills/video/[id] which handles playback.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { dilly } from '../../../../lib/dilly';
import { useResolvedTheme } from '../../../../hooks/useTheme';

// Slug → display name. Must stay in sync with the Skills home page
// and the backend _SLUG_TO_COHORT.
const SLUG_TO_TITLE: Record<string, string> = {
  'software-engineering-cs':          'Software Engineering & CS',
  'data-science-analytics':           'Data Science & Analytics',
  'cybersecurity-it':                 'Cybersecurity & IT',
  'electrical-computer-engineering':  'Electrical & Computer Engineering',
  'mechanical-aerospace-engineering': 'Mechanical & Aerospace Engineering',
  'civil-environmental-engineering':  'Civil & Environmental Engineering',
  'chemical-biomedical-engineering':  'Chemical & Biomedical Engineering',
  'finance-accounting':               'Finance & Accounting',
  'consulting-strategy':              'Consulting & Strategy',
  'marketing-advertising':            'Marketing & Advertising',
  'management-operations':            'Management & Operations',
  'entrepreneurship-innovation':      'Entrepreneurship & Innovation',
  'economics-public-policy':          'Economics & Public Policy',
  'healthcare-clinical':              'Healthcare & Clinical',
  'biotech-pharmaceutical':           'Biotech & Pharmaceutical',
  'life-sciences-research':           'Life Sciences & Research',
  'physical-sciences-math':           'Physical Sciences & Math',
  'law-government':                   'Law & Government',
  'media-communications':             'Media & Communications',
  'design-creative-arts':             'Design & Creative Arts',
  'education-human-development':      'Education & Human Development',
  'social-sciences-nonprofit':        'Social Sciences & Nonprofit',
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

export default function CohortScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const title = SLUG_TO_TITLE[slug as string] || 'Cohort';

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>('best');
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>('any');

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const params = new URLSearchParams({ cohort: String(slug), sort, limit: '60' });
      if (lengthFilter === 'short')   params.set('max_duration_min', '15');
      if (lengthFilter === 'medium')  params.set('max_duration_min', '45');
      const res = await dilly.get(`/skill-lab/videos?${params.toString()}`).catch(() => null);
      setVideos(Array.isArray(res?.videos) ? res.videos : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug, sort, lengthFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // Top 5 of best-sorted as "Start here" — only when we aren't applying
  // filters (those change the intended ordering).
  const startHere = useMemo(() => {
    if (sort !== 'best' || lengthFilter !== 'any') return [];
    return videos.slice(0, 5);
  }, [videos, sort, lengthFilter]);

  const rest = useMemo(() => {
    if (startHere.length === 0) return videos;
    return videos.slice(5);
  }, [videos, startHere]);

  const openVideo = useCallback((v: Video) => {
    router.push({ pathname: `/skills/video/${v.id}`, params: { cohort: String(slug) } });
  }, [slug]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>COHORT</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]} numberOfLines={2}>{title}</Text>
          <Text style={[styles.meta, { color: theme.surface.t3 }]}>
            {videos.length} {videos.length === 1 ? 'video' : 'videos'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <>
          {/* Start here (curated path) */}
          {startHere.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.surface.t3 }]}>START HERE</Text>
              {startHere.map((v, i) => (
                <VideoRow
                  key={v.id}
                  video={v}
                  step={i + 1}
                  theme={theme}
                  onPress={() => openVideo(v)}
                />
              ))}
            </>
          ) : null}

          {/* Filters */}
          <Text style={[styles.sectionTitle, { color: theme.surface.t3, marginTop: 24 }]}>
            THE REST OF THE LIBRARY
          </Text>
          <View style={styles.filterRow}>
            <FilterPill label="Best"   active={sort === 'best'}   onPress={() => setSort('best')}   theme={theme} />
            <FilterPill label="Newest" active={sort === 'newest'} onPress={() => setSort('newest')} theme={theme} />
            <View style={{ width: 10 }} />
            <FilterPill label="≤15m" active={lengthFilter === 'short'}  onPress={() => setLengthFilter(lengthFilter === 'short' ? 'any' : 'short')}   theme={theme} />
            <FilterPill label="≤45m" active={lengthFilter === 'medium'} onPress={() => setLengthFilter(lengthFilter === 'medium' ? 'any' : 'medium')} theme={theme} />
            <FilterPill label="Any"  active={lengthFilter === 'any'}    onPress={() => setLengthFilter('any')}    theme={theme} />
          </View>

          {rest.length === 0 ? (
            <Text style={[styles.empty, { color: theme.surface.t3 }]}>
              No videos match these filters. Try widening the length.
            </Text>
          ) : (
            rest.map(v => (
              <VideoRow key={v.id} video={v} theme={theme} onPress={() => openVideo(v)} />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

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

function VideoRow({ video, step, theme, onPress }: {
  video: Video; step?: number; theme: ReturnType<typeof useResolvedTheme>; onPress: () => void;
}) {
  const durLabel = formatDuration(video.duration_sec);
  const ago = publishedAgo(video.published_at);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.videoCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
    >
      <View style={{ position: 'relative' }}>
        <Image
          source={{ uri: video.thumbnail_url }}
          style={styles.thumb}
          resizeMode="cover"
        />
        {durLabel ? (
          <View style={styles.durTag}>
            <Text style={styles.durTagText}>{durLabel}</Text>
          </View>
        ) : null}
        {step ? (
          <View style={[styles.stepTag, { backgroundColor: theme.accent }]}>
            <Text style={styles.stepTagText}>{step}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 12 }}>
        <Text style={[styles.vTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[styles.vMeta, { color: theme.surface.t3 }]} numberOfLines={1}>
          {video.channel_title}{ago ? ` · ${ago}` : ''}
        </Text>
        {video.quality_score && video.quality_score >= 0.8 ? (
          <View style={[styles.signalBadge, { borderColor: theme.accentBorder }]}>
            <Ionicons name="sparkles" size={10} color={theme.accent} />
            <Text style={[styles.signalBadgeText, { color: theme.accent }]}>high signal</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  meta:    { fontSize: 11, fontWeight: '600', marginTop: 3 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    marginTop: 6,
    marginBottom: 10,
  },

  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 12, fontWeight: '700' },

  videoCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#222' },
  durTag: {
    position: 'absolute',
    right: 8, bottom: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
  },
  durTagText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  stepTag: {
    position: 'absolute',
    left: 8, top: 8,
    width: 24, height: 24,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTagText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  vTitle: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  vMeta:  { fontSize: 11, fontWeight: '600', marginTop: 4 },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  signalBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },

  empty: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
