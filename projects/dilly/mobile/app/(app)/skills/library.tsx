import { safeBack } from '../../../lib/navigation';
/**
 * Skills library - the user's saved videos.
 *
 * Mirrors the web /library: chronological list of saved videos, empty
 * state when there are none. Fetches from /skill-lab/library (auth
 * required by backend; if unauthenticated we render a soft prompt).
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

interface SavedVideo {
  id: string;
  title: string;
  channel_title: string;
  duration_sec: number;
  thumbnail_url: string;
  cohort?: string;
  published_at?: string | null;
  saved_at?: string | null;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LibraryScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await dilly.get('/skill-lab/library').catch((e: any) => {
        if (e?.status === 401) { setError('sign-in'); return null; }
        setError('unavailable');
        return null;
      });
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
        <TouchableOpacity onPress={() => safeBack('/(app)/skills')} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>YOUR LIBRARY</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]}>Saved for later</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40 }}>
          <DillyLoadingState messages={['Opening your library…']} />
        </View>
      ) : error === 'sign-in' ? (
        <EmptyState
          theme={theme}
          title="Sign in to see your library"
          body="Save videos across any cohort and come back to them later."
        />
      ) : videos.length === 0 ? (
        <EmptyState
          theme={theme}
          title="Nothing saved yet"
          body="Tap the bookmark on any Skills video to keep a running list of what you're learning."
        />
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
                {v.channel_title}
                {v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      <FirstVisitCoach
        id="skills_library_v1"
        iconName="bookmark"
        headline="Everything you save lives here"
        subline="Tap the bookmark on any video to keep it. Sorted by most recent save - your receipt of what you're learning."
      />
    </ScrollView>
  );
}

function EmptyState({ theme, title, body }: {
  theme: ReturnType<typeof useResolvedTheme>;
  title: string; body: string;
}) {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <Ionicons name="bookmark-outline" size={36} color={theme.surface.t3} />
      <Text style={[styles.emptyTitle, { color: theme.surface.t1 }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.surface.t2 }]}>{body}</Text>
    </View>
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

  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  emptyBody:  { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6, paddingHorizontal: 24 },
});
