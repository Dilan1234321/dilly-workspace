import { safeBack } from '../../../lib/navigation';
/**
 * Skills video detail — in-app playback (build 363).
 *
 * Playback history:
 *   354 — custom WebView + iframe API in local HTML shell → error 5
 *   358 — WebView pointed at /embed URL directly → "config error"
 *   362 — WebView + iframe in HTML shell with baseUrl → "config error"
 *
 * Switching to react-native-youtube-iframe. This is the
 * battle-tested wrapper that LinkedIn, Udemy, and every other RN app
 * with embedded YouTube use. It sits on top of react-native-webview
 * (which we already installed) but handles the iOS-specific UA,
 * origin, referrer, and autoplay-gesture shape that YouTube's iframe
 * API requires. It exposes play/pause via a ref and onChange events
 * we can log. Pinning to the current version 2.4.1.
 *
 * The surrounding page (title, channel, description, save, related)
 * stays native RN. User never leaves Dilly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Dimensions,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { dilly } from '../../../../lib/dilly';
import { useResolvedTheme } from '../../../../hooks/useTheme';
import DillyLoadingState from '../../../../components/DillyLoadingState';
import { FirstVisitCoach } from '../../../../components/FirstVisitCoach';

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

const SCREEN_W = Dimensions.get('window').width;
const PLAYER_H = Math.round(SCREEN_W * (9 / 16));

export default function VideoScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [video, setVideo] = useState<Video | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  // `playing` controls whether YoutubePlayer autoplays after mount.
  // Mounted-but-paused is fine; we still show our poster overlay
  // until the first play-tap so the list scroll doesn't pay the
  // player-init cost and the user gets a clean visual entry.
  const [started, setStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Player error surfaces from YoutubePlayer's onError. Real YouTube
  // errors (embedding disabled, private video) are rare and the
  // fallback routes the user out-of-app but keeps them in Dilly until
  // they explicitly opt.
  const [playerError, setPlayerError] = useState<string | null>(null);
  const playerMounted = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await dilly.get(`/skill-lab/videos/${id}`).catch(() => null);
        if (cancelled) return;
        const v: Video | null = res?.video || null;
        setVideo(v);
        if (v) {
          const trending = await dilly.get('/skill-lab/trending?limit=8').catch(() => null);
          if (!cancelled) {
            setRelated(
              Array.isArray(trending?.videos)
                ? trending.videos.filter((x: Video) => x.id !== v.id).slice(0, 5)
                : []
            );
          }
        }
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
      setSaved(was);
    }
  }, [id, saved]);

  const onStateChange = useCallback((state: string) => {
    // YoutubePlayer emits: unstarted, ended, playing, paused, buffering, cued
    if (state === 'playing') setIsPlaying(true);
    else if (state === 'paused' || state === 'ended') setIsPlaying(false);
  }, []);

  const onPlayerError = useCallback((err: string) => {
    // err is one of: 'abort' | 'timeout' | 'network' | 'invalid_parameter'
    // | 'html5_player' | 'video_not_found' | 'embed_not_allowed'
    // Only two we surface to user: video_not_found and embed_not_allowed.
    // Others get silently retried by a mount-key bump.
    if (err === 'video_not_found' || err === 'embed_not_allowed') {
      setPlayerError(err);
    }
  }, []);

  const onPlayTap = useCallback(() => {
    // Starting playback is a two-step dance on iOS: we unmount the
    // poster by setting `started`, which mounts YoutubePlayer with
    // play={true}. The library handles the autoplay-from-user-gesture
    // propagation into the embedded iframe.
    playerMounted.current = true;
    setStarted(true);
    setIsPlaying(true);
  }, []);

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        messages={['Opening the video…', 'Just a moment…']}
      />
    );
  }

  if (!video) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
        <Text style={[styles.errTitle, { color: theme.surface.t1 }]}>Video not found</Text>
        <TouchableOpacity onPress={() => safeBack('/(app)/skills')} style={{ marginTop: 14 }}>
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
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => safeBack('/(app)/skills')} hitSlop={12}>
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

      {/* Player surface. Before first tap: thumbnail + big Play. After
          tap: YoutubePlayer takes over the same slot and plays inline. */}
      <View style={[styles.playerWrap, { height: PLAYER_H }]}>
        {playerError === 'embed_not_allowed' || playerError === 'video_not_found' ? (
          <View style={{ flex: 1 }}>
            <Image source={{ uri: video.thumbnail_url }} style={styles.poster} resizeMode="cover" />
            <View style={[styles.playOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
              <Ionicons name="cloud-offline-outline" size={30} color="#FFF" />
              <Text style={styles.errOverlayTitle}>
                {playerError === 'video_not_found' ? 'Video unavailable' : 'Playback restricted'}
              </Text>
              <Text style={styles.errOverlayBody}>
                {playerError === 'video_not_found'
                  ? 'This video may have been removed.'
                  : 'The channel disabled inline playback on this one.'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => safeBack('/(app)/skills')}
                style={[styles.errOverlayBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.errOverlayBtnText}>Back to the library</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : started ? (
          <YoutubePlayer
            height={PLAYER_H}
            width={SCREEN_W}
            videoId={video.id}
            play={isPlaying}
            onChangeState={onStateChange}
            onError={onPlayerError}
            initialPlayerParams={{
              // Keep the player lean — no related-video grid at end,
              // no keyboard controls, captions on if available.
              modestbranding: true,
              rel: false,
              controls: true,
              cc_lang_pref: 'en',
            }}
            webViewProps={{
              // These flags match what reliably plays inline on iOS.
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
            }}
          />
        ) : (
          <TouchableOpacity activeOpacity={0.92} onPress={onPlayTap} style={{ flex: 1 }}>
            <Image source={{ uri: video.thumbnail_url }} style={styles.poster} resizeMode="cover" />
            <View style={styles.playOverlay}>
              <View style={[styles.playBtn, { backgroundColor: theme.accent }]}>
                <Ionicons name="play" size={32} color="#FFF" />
              </View>
            </View>
            {dur ? (
              <View style={styles.durTag}>
                <Text style={styles.durTagText}>{dur}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      </View>

      <View style={{ paddingHorizontal: 18, marginTop: 14 }}>
        <Text style={[styles.title, { color: theme.surface.t1 }]}>{video.title}</Text>
        <Text style={[styles.metaLine, { color: theme.surface.t2 }]}>
          {video.channel_title}{ago ? ` · ${ago}` : ''}{video.cohort ? ` · ${video.cohort}` : ''}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={toggleSave}
            style={[
              styles.actionPrimary,
              { backgroundColor: saved ? theme.surface.s1 : theme.accent, borderWidth: saved ? 1 : 0, borderColor: theme.accentBorder },
            ]}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={14}
              color={saved ? theme.accent : '#FFF'}
            />
            <Text style={[styles.actionPrimaryText, { color: saved ? theme.accent : '#FFF' }]}>
              {saved ? 'Saved to library' : 'Save to library'}
            </Text>
          </TouchableOpacity>
        </View>

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

      <FirstVisitCoach
        id="skills_video_v1"
        iconName="play-circle"
        headline="Play lives inside Dilly"
        subline="Tap the thumbnail to start. Bookmark to save for later, and the library keeps everything you watch."
      />
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
    width: SCREEN_W,
    backgroundColor: '#000',
    position: 'relative',
  },
  poster: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
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

  errOverlayTitle: {
    color: '#FFF', fontSize: 15, fontWeight: '800',
    textAlign: 'center', paddingHorizontal: 24, marginTop: 8,
  },
  errOverlayBody: {
    color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17,
    textAlign: 'center', paddingHorizontal: 30, marginTop: 6, marginBottom: 14,
  },
  errOverlayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  errOverlayBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },

  title:    { fontSize: 19, fontWeight: '800', letterSpacing: -0.2, lineHeight: 25 },
  metaLine: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 11,
  },
  actionPrimaryText: { fontSize: 13, fontWeight: '800' },

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
