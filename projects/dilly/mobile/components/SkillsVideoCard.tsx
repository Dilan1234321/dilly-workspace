/**
 * SkillsVideoCard - inline card shown under any Dilly AI message that
 * mentions a YouTube video. Tap opens the in-app Skills player
 * (/skills/video/<id>) so the user never leaves Dilly.
 *
 * Data:
 *   - Thumbnail always comes from YouTube's standard URL
 *     (hqdefault.jpg) so we don't need a backend round-trip.
 *   - Title/channel come from /skill-lab/videos/<id> if the video is
 *     in Dilly's curated library. If it isn't, we render a neutral
 *     "Video" label - the card still works, it just doesn't pretend
 *     to have library metadata it doesn't have.
 */

import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useResolvedTheme } from '../hooks/useTheme';
import { dilly } from '../lib/dilly';

interface Meta {
  title?: string;
  channel_title?: string;
  duration_sec?: number;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SkillsVideoCard({ videoId }: { videoId: string }) {
  const theme = useResolvedTheme();
  const [meta, setMeta] = useState<Meta | null>(null);

  // Best-effort metadata load. A 404 here (video not in the curated
  // library) is fine - the card still renders with the thumbnail
  // and a generic label. No loading spinner to avoid jank in the
  // chat scroll view.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dilly.get(`/skill-lab/videos/${videoId}`).catch(() => null);
        if (!cancelled && res?.video) setMeta(res.video as Meta);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const title = meta?.title || 'Watch this in Dilly Skills';
  const sub = [meta?.channel_title, meta?.duration_sec ? formatDuration(meta.duration_sec) : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push(`/skills/video/${videoId}`)}
      style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}
    >
      <View style={{ position: 'relative' }}>
        <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
        <View style={[styles.playBadge, { backgroundColor: theme.accent }]}>
          <Ionicons name="play" size={14} color="#FFF" />
        </View>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>DILLY SKILLS</Text>
        <Text style={[styles.title, { color: theme.surface.t1 }]} numberOfLines={2}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.sub, { color: theme.surface.t3 }]} numberOfLines={1}>{sub}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.surface.t3} style={{ marginRight: 10 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: 110,
    aspectRatio: 16 / 9,
    backgroundColor: '#222',
  },
  playBadge: {
    position: 'absolute',
    right: 6, bottom: 6,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { fontSize: 9,  fontWeight: '900', letterSpacing: 1.2 },
  title:   { fontSize: 13, fontWeight: '800', marginTop: 3, lineHeight: 17 },
  sub:     { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
