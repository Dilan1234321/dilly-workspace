/**
 * Skills - Trending.
 * Hot curated videos across every cohort. Simple ranked list.
 * Backed by GET /skill-lab/trending?limit=.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import DillyLoadingState from '../../../components/DillyLoadingState';
import { FirstVisitCoach } from '../../../components/FirstVisitCoach';

interface Video {
  id: string;
  title: string;
  channel_title: string;
  cohort: string;
  duration_sec: number;
  thumbnail_url: string;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TrendingScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await dilly.get('/skill-lab/trending?limit=40').catch(() => null);
      setVideos(Array.isArray(res?.videos) ? res.videos : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>TRENDING</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]}>What's hot right now</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40 }}>
          <DillyLoadingState messages={['Pulling trending picks…']} />
        </View>
      ) : videos.length === 0 ? (
        <Text style={[styles.empty, { color: theme.surface.t2 }]}>
          Nothing to show yet. The library is being seeded - check back soon.
        </Text>
      ) : (
        videos.map(v => (
          <TouchableOpacity
            key={v.id}
            activeOpacity={0.85}
            onPress={() => router.push(`/skills/video/${v.id}`)}
            style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
          >
            <Image source={{ uri: v.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.vTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{v.title}</Text>
              <Text style={[styles.vMeta, { color: theme.surface.t3 }]} numberOfLines={1}>
                {v.channel_title}{v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ''}
              </Text>
              {v.cohort ? (
                <Text style={[styles.vCohort, { color: theme.accent }]} numberOfLines={1}>{v.cohort}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))
      )}

      <FirstVisitCoach
        id="skills_trending_v1"
        iconName="flame"
        headline="What's moving across the library"
        subline="A cross-cohort view of the highest-signal videos right now. Useful when you don't know what to learn next."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  thumb: { width: 120, aspectRatio: 16 / 9, borderRadius: 7, backgroundColor: '#222' },
  vTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  vMeta:  { fontSize: 11, fontWeight: '600', marginTop: 3 },
  vCohort:{ fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginTop: 4 },

  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
    paddingTop: 20,
    lineHeight: 19,
  },
});
