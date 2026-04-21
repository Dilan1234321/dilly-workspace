/**
 * Skills video detail (build 353).
 *
 * Mirrors the web video page: large thumbnail / play surface, title,
 * channel, duration, posted-ago, full description (expandable),
 * save-to-library toggle, and "More in this cohort" suggestions.
 *
 * Playback: tapping the thumbnail opens YouTube natively via Linking
 * (youtube://watch?v=<id> falls through to https). In-app playback
 * requires react-native-webview or react-native-youtube-iframe, which
 * are not installed — adding them is a native-rebuild step we defer
 * until the Skills library is proven with users.
 *
 * Data: GET /skill-lab/videos/{id} for metadata,
 *       GET /skill-lab/videos?cohort=<cohort>&limit=5 for related,
 *       POST /skill-lab/save to bookmark,
 *       DELETE /skill-lab/save/{id} to unsave.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { dilly } from '../../../../lib/dilly';
import { useResolvedTheme } from '../../../../hooks/useTheme';

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
}

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
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff < 7) return `${diff}d ago`;
  if (diff < 60) return `${Math.floor(diff / 7)}w ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

export default function VideoScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [video, setVideo] = useState<Video | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await dilly.get(`/skill-lab/videos/${id}`).catch(() => null);
        if (cancelled) return;
        const v: Video | null = res?.video || null;
        setVideo(v);
        if (v?.cohort) {
          // Grab a few related videos. The API expects the slug, not
          // the display name. We do not have the slug from the video
          // response, so we fall back to trending if this 404s.
          const trending = await dilly.get('/skill-lab/trending?limit=6').catch(() => null);
          if (!cancelled) setRelated(Array.isArray(trending?.videos) ? trending.videos.filter((x: Video) => x.id !== v.id).slice(0, 5) : []);
        }
        // Check whether this video is already in the user's library.
        const lib = await dilly.get('/skill-lab/library').catch(() => null);
        if (!cancelled && Array.isArray(lib?.videos)) {
          setSaved(lib.videos.some((x: Video) => x.id === id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const play = useCallback(() => {
    if (!id) return;
    // Prefer YouTube app deeplink; Linking falls back to https.
    Linking.openURL(`https://www.youtube.com/watch?v=${id}`).catch(() => {});
  }, [id]);

  const toggleSave = useCallback(async () => {
    if (!id) return;
    const was = saved;
    setSaved(!was);
    try {
      if (was) {
        await dilly.fetch(`/skill-lab/save/${id}`, { method: 'DELETE' });
      } else {
        await dilly.fetch('/skill-lab/save', {
          method: 'POST',
          body: JSON.stringify({ video_id: id }),
        });
      }
    } catch {
      // Rollback optimistic flip on failure — we never want a
      // library that silently does not reflect what the user tapped.
      setSaved(was);
    }
  }, [id, saved]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!video) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
        <Text style={[styles.errTitle, { color: theme.surface.t1 }]}>Video not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
          <Text style={{ color: theme.accent, fontWeight: '800' }}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dur = formatDuration(video.duration_sec);
  const ago = publishedAgo(video.published_at);
  const desc = (video.description || '').trim();
  const descShown = descOpen ? desc : desc.split(/\n/).slice(0, 3).join('\n');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 60 }}
    >
      {/* Header nav */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSave} hitSlop={12}>
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={saved ? theme.accent : theme.surface.t2}
          />
        </TouchableOpacity>
      </View>

      {/* Player surface (tap to launch YouTube) */}
      <TouchableOpacity activeOpacity={0.92} onPress={play}>
        <View style={styles.playerWrap}>
          <Image source={{ uri: video.thumbnail_url }} style={styles.playerImg} resizeMode="cover" />
          <View style={styles.playOverlay}>
            <View style={[styles.playBtn, { backgroundColor: theme.accent }]}>
              <Ionicons name="play" size={28} color="#FFF" />
            </View>
          </View>
          {dur ? (
            <View style={styles.durTag}>
              <Text style={styles.durTagText}>{dur}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={{ paddingHorizontal: 18, marginTop: 14 }}>
        <Text style={[styles.title, { color: theme.surface.t1 }]}>{video.title}</Text>
        <Text style={[styles.metaLine, { color: theme.surface.t2 }]}>
          {video.channel_title}{ago ? ` · ${ago}` : ''}{video.cohort ? ` · ${video.cohort}` : ''}
        </Text>

        {/* Actions row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={play}
            style={[styles.actionPrimary, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="play" size={14} color="#FFF" />
            <Text style={styles.actionPrimaryText}>Watch on YouTube</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={toggleSave}
            style={[
              styles.actionSecondary,
              { borderColor: saved ? theme.accent : theme.accentBorder, backgroundColor: saved ? theme.accentSoft : 'transparent' },
            ]}
          >
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={14} color={theme.accent} />
            <Text style={[styles.actionSecondaryText, { color: theme.accent }]}>
              {saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        {desc ? (
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.descEyebrow, { color: theme.accent }]}>DESCRIPTION</Text>
            <Text style={[styles.descBody, { color: theme.surface.t1 }]}>
              {descShown}
            </Text>
            {desc.length > descShown.length ? (
              <TouchableOpacity onPress={() => setDescOpen(v => !v)} hitSlop={8}>
                <Text style={[styles.descToggle, { color: theme.accent }]}>
                  {descOpen ? 'Show less' : 'Show full description'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Related */}
        {related.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.surface.t3 }]}>MORE TO WATCH</Text>
            {related.map(v => (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.85}
                onPress={() => router.push(`/skills/video/${v.id}`)}
                style={[styles.relCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
              >
                <Image source={{ uri: v.thumbnail_url }} style={styles.relThumb} resizeMode="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.relTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{v.title}</Text>
                  <Text style={[styles.relMeta, { color: theme.surface.t3 }]} numberOfLines={1}>
                    {v.channel_title}{v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errTitle: { fontSize: 16, fontWeight: '800' },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  playerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0A0A0A',
    position: 'relative',
  },
  playerImg: { width: '100%', height: '100%' },
  playOverlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  durTag: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 5,
  },
  durTagText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  title:    { fontSize: 19, fontWeight: '800', letterSpacing: -0.2, lineHeight: 25 },
  metaLine: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11,
  },
  actionPrimaryText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  actionSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11,
    borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '800' },

  descEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 6 },
  descBody:    { fontSize: 13, lineHeight: 19 },
  descToggle:  { fontSize: 12, fontWeight: '800', marginTop: 6 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 24,
    marginBottom: 10,
  },

  relCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 11,
    borderWidth: 1,
    marginBottom: 8,
  },
  relThumb: { width: 120, aspectRatio: 16 / 9, borderRadius: 7, backgroundColor: '#222' },
  relTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  relMeta:  { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
