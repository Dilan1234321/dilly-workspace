/**
 * Skills video detail — in-app playback (build 354).
 *
 * Videos play INSIDE Dilly. No tab switch, no Safari handoff. The
 * player is YouTube's official iframe API loaded through a local
 * HTML shell and rendered in a react-native-webview. The surrounding
 * page (title, channel, description, save, related) is native RN.
 *
 * Why iframe + WebView instead of a direct video URL: YouTube
 * encrypts its video streams; the iframe is the only supported,
 * compliant playback path. It handles ads, captions, HDR, and all
 * the format negotiation for us.
 *
 * Why not expo-av or expo-video: neither can play YouTube streams
 * (ToS + DRM). WebView + iframe is the accepted pattern.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Dimensions, Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
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

/** HTML shell hosting YouTube's iframe API (not the plain /embed URL).
 *  The API exposes error codes (2/5/100/101/150) so we can detect
 *  when a video refuses to embed and post a message back to RN to
 *  show a graceful fallback instead of YouTube's "Video playback
 *  configuration error" overlay.
 *
 *  Autoplay is deliberately OFF. iOS WebView autoplay requires the
 *  original user gesture to propagate into the nested <iframe>, which
 *  does not always happen — so autoplay triggered the "playback
 *  configuration error" the user saw. Letting the iframe render its
 *  own play button is the robust path; the user already tapped the
 *  big Dilly play button so one more tap is acceptable and reliable. */
function buildPlayerHtml(videoId: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
      #player { position: fixed; inset: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      // Load the official YouTube iframe API, then instantiate a
      // player bound to the #player div. We use the API (not a
      // plain embed URL) so we can listen for onError and tell the
      // React Native host when a video refuses to embed.
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);

      function post(type, detail) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, detail: detail }));
        }
      }

      window.onYouTubeIframeAPIReady = function () {
        try {
          new YT.Player('player', {
            videoId: '${videoId}',
            playerVars: {
              playsinline: 1,
              rel: 0,
              modestbranding: 1,
              fs: 1,
            },
            events: {
              onReady: function () { post('ready'); },
              onError: function (e) { post('error', e && e.data); },
            },
          });
        } catch (err) {
          post('error', 'init');
        }
      };
    </script>
  </body>
</html>`;
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
  const [playing, setPlaying] = useState(false);
  // Player error surfaces only when YouTube refuses to embed this
  // specific video (error codes 101/150 from the iframe API). We show
  // a soft fallback with a one-tap "open in YouTube" rather than a
  // hard failure.
  const [playerError, setPlayerError] = useState<string | null>(null);

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
      {/* Header nav — Skills never leaves the app. Back goes to the
          cohort / list that sent us here. */}
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

      {/* Player surface. Before first tap: show the thumbnail with a
          big Play button. On tap: swap in the WebView with the iframe
          player. This delays the WebView mount until the user opts in,
          so the list scroll doesn't pay a WebView cost on every
          render, and it matches Google's own pattern of a
          poster-to-player flip. */}
      <View style={styles.playerWrap}>
        {playerError ? (
          // Fallback surface when YouTube refuses to embed (errors
          // 101 / 150 from the iframe API). Thumbnail stays so the
          // page still reads well; one-tap escape to the YouTube
          // app is below. Preserves the Dilly chrome — user stays
          // in the app unless they explicitly opt out.
          <View style={{ flex: 1 }}>
            <Image source={{ uri: video.thumbnail_url }} style={styles.player} resizeMode="cover" />
            <View style={[styles.playOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <Text style={styles.errOverlayTitle}>This video can't play inline</Text>
              <Text style={styles.errOverlayBody}>
                The channel disabled embedded playback. You can still watch it in YouTube.
              </Text>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${video.id}`).catch(() => {})}
                style={[styles.errOverlayBtn, { backgroundColor: theme.accent }]}
              >
                <Ionicons name="open-outline" size={14} color="#FFF" />
                <Text style={styles.errOverlayBtnText}>Open in YouTube</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : playing ? (
          <WebView
            source={{ html: buildPlayerHtml(video.id) }}
            style={styles.player}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            startInLoadingState
            originWhitelist={['*']}
            onMessage={(ev) => {
              try {
                const msg = JSON.parse(ev.nativeEvent.data);
                if (msg?.type === 'error') {
                  // YT iframe error codes: 2 (invalid parameter),
                  // 5 (HTML5 player error), 100 (video removed /
                  // private), 101/150 (embedding disabled by owner).
                  setPlayerError(String(msg.detail || 'unknown'));
                }
              } catch {
                // ignore non-JSON messages from the player page
              }
            }}
            renderLoading={() => (
              <View style={[styles.playerLoading, { backgroundColor: '#000' }]}>
                <ActivityIndicator color="#FFF" />
              </View>
            )}
          />
        ) : (
          <TouchableOpacity activeOpacity={0.92} onPress={() => setPlaying(true)} style={{ flex: 1 }}>
            <Image source={{ uri: video.thumbnail_url }} style={styles.player} resizeMode="cover" />
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

        {/* Action row — Save is the big one. No "Watch on YouTube" —
            we explicitly do not want the user leaving Dilly. */}
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

const SCREEN_W = Dimensions.get('window').width;

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
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  player: { flex: 1 },
  playerLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    textAlign: 'center', paddingHorizontal: 24,
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
