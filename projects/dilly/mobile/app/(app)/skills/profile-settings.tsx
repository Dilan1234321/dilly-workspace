/**
 * Public Learning Profile settings (build 358).
 *
 * Mirrors the "manage what's on your public profile" surface that
 * already exists for the career profile, but scoped to Dilly Skills.
 * The user controls what appears at skills.hellodilly.com/s/<slug>.
 *
 * Controls (all persisted under web_profile_settings.learning_*):
 *   - learning_profile_visible  : overall on/off (also exposed in
 *                                  Settings so both entries stay in sync)
 *   - learning_show_stats       : Invested / Videos / Fields / Receipts
 *   - learning_show_why         : "Why they're learning" — aim + industry
 *   - learning_show_mastery     : "Skills in motion" — per-cohort breakdown
 *   - learning_show_library     : the list of saved videos
 *   - hidden_video_ids          : per-video hide list (tap a saved video
 *                                  to add/remove it)
 *
 * We read/write the entire web_profile_settings blob via the existing
 * PATCH /profile endpoint so we don't need new backend routes. Save is
 * debounced. The career Public Profile and this Learning Profile share
 * the same blob, so we are careful to merge instead of overwrite.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity,
  ActivityIndicator, Image, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import DillyLoadingState from '../../../components/DillyLoadingState';

interface SavedVideo {
  id: string;
  title: string;
  channel_title: string;
  duration_sec: number;
  thumbnail_url: string;
  cohort?: string;
}

interface WebSettings {
  learning_profile_visible?: boolean;
  learning_show_stats?: boolean;
  learning_show_why?: boolean;
  learning_show_mastery?: boolean;
  learning_show_library?: boolean;
  hidden_video_ids?: string[];
  // other keys from the shared blob are preserved but not surfaced here.
  [k: string]: unknown;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LearningProfileSettingsScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [settings, setSettings] = useState<WebSettings>({});
  const [slug, setSlug] = useState<string>('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const rawSettingsRef = useRef<WebSettings>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load profile + library
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profRes, libRes] = await Promise.all([
          dilly.get('/profile').catch(() => null),
          dilly.get('/skill-lab/library').catch(() => null),
        ]);
        if (cancelled) return;
        const prof: any = profRes || {};
        const ws: WebSettings = (prof.web_profile_settings as WebSettings) || {};
        rawSettingsRef.current = ws;
        setSettings({
          learning_profile_visible: ws.learning_profile_visible !== false,
          learning_show_stats:      ws.learning_show_stats      !== false,
          learning_show_why:        ws.learning_show_why        !== false,
          learning_show_mastery:    ws.learning_show_mastery    !== false,
          learning_show_library:    ws.learning_show_library    !== false,
          hidden_video_ids:         Array.isArray(ws.hidden_video_ids) ? ws.hidden_video_ids : [],
        });
        setSlug(prof.readable_slug || '');
        setSavedVideos(Array.isArray(libRes?.videos) ? (libRes.videos as SavedVideo[]) : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced save. Merges back into the ORIGINAL web_profile_settings
  // blob so we never clobber hidden_fact_ids, section toggles, etc.
  const persist = useCallback((next: WebSettings) => {
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const merged = { ...rawSettingsRef.current, ...next };
      rawSettingsRef.current = merged;
      try {
        await dilly.fetch('/profile', {
          method: 'PATCH',
          body: JSON.stringify({ web_profile_settings: merged }),
        });
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 500);
  }, []);

  const setFlag = useCallback(<K extends keyof WebSettings>(key: K, value: WebSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, [persist]);

  const toggleVideoHidden = useCallback((videoId: string) => {
    setSettings(prev => {
      const current = new Set(prev.hidden_video_ids || []);
      if (current.has(videoId)) current.delete(videoId);
      else current.add(videoId);
      const next = { ...prev, hidden_video_ids: Array.from(current) };
      persist(next);
      return next;
    });
  }, [persist]);

  const hiddenVideoIds = useMemo(
    () => new Set(settings.hidden_video_ids || []),
    [settings.hidden_video_ids],
  );

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        messages={['Opening your learning profile…', 'Loading your saved videos…']}
      />
    );
  }

  const profileUrl = slug ? `https://skills.hellodilly.com/s/${slug}` : '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>PUBLIC LEARNING PROFILE</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]}>What the world sees</Text>
          {profileUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(profileUrl)}>
              <Text style={[styles.urlLink, { color: theme.accent }]}>{`skills.hellodilly.com/s/${slug}`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {saveState === 'saving' ? (
          <Text style={[styles.saveHint, { color: theme.surface.t3 }]}>saving…</Text>
        ) : saveState === 'saved' ? (
          <Text style={[styles.saveHint, { color: theme.accent }]}>saved</Text>
        ) : null}
      </View>

      {/* Visibility master */}
      <View style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <RowToggle
          label="Public learning profile"
          hint={settings.learning_profile_visible
            ? 'Your profile is visible to anyone with the link.'
            : 'Your profile is hidden. Only you can see it.'}
          value={settings.learning_profile_visible !== false}
          onToggle={v => setFlag('learning_profile_visible', v)}
          theme={theme}
        />
      </View>

      {/* Section toggles — only matter when the master is on */}
      {settings.learning_profile_visible !== false ? (
        <>
          <SectionTitle theme={theme} text="SECTIONS" />
          <View style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            <RowToggle
              label="Stats at a glance"
              hint="Invested minutes · videos · fields · receipts"
              value={settings.learning_show_stats !== false}
              onToggle={v => setFlag('learning_show_stats', v)}
              theme={theme}
            />
            <Divider theme={theme} />
            <RowToggle
              label="Why I'm learning this"
              hint="Your aim + target industry"
              value={settings.learning_show_why !== false}
              onToggle={v => setFlag('learning_show_why', v)}
              theme={theme}
            />
            <Divider theme={theme} />
            <RowToggle
              label="Skills in motion"
              hint="Per-cohort mastery chips"
              value={settings.learning_show_mastery !== false}
              onToggle={v => setFlag('learning_show_mastery', v)}
              theme={theme}
            />
            <Divider theme={theme} />
            <RowToggle
              label="My saved library"
              hint="The list of videos you've saved"
              value={settings.learning_show_library !== false}
              onToggle={v => setFlag('learning_show_library', v)}
              theme={theme}
            />
          </View>

          {/* Per-video visibility. Only matters when the library is shown. */}
          {settings.learning_show_library !== false ? (
            <>
              <SectionTitle theme={theme} text="WHICH VIDEOS" />
              <Text style={[styles.sectionSub, { color: theme.surface.t2 }]}>
                Tap a video to hide it from your public profile. Hidden videos stay
                in your library.
              </Text>

              {savedVideos.length === 0 ? (
                <View style={[styles.emptyWrap, { borderColor: theme.surface.border }]}>
                  <Ionicons name="bookmark-outline" size={28} color={theme.surface.t3} />
                  <Text style={[styles.emptyTitle, { color: theme.surface.t1 }]}>Nothing saved yet</Text>
                  <Text style={[styles.emptyBody, { color: theme.surface.t2 }]}>
                    Save videos from Dilly Skills and they'll appear here with a toggle.
                  </Text>
                </View>
              ) : (
                savedVideos.map(v => {
                  const hidden = hiddenVideoIds.has(v.id);
                  return (
                    <TouchableOpacity
                      key={v.id}
                      activeOpacity={0.85}
                      onPress={() => toggleVideoHidden(v.id)}
                      style={[
                        styles.videoRow,
                        { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                        hidden && { opacity: 0.55 },
                      ]}
                    >
                      <Image source={{ uri: v.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.vTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{v.title}</Text>
                        <Text style={[styles.vMeta, { color: theme.surface.t3 }]} numberOfLines={1}>
                          {v.channel_title}{v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ''}
                        </Text>
                      </View>
                      <View style={[
                        styles.visBadge,
                        hidden
                          ? { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }
                          : { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
                      ]}>
                        <Ionicons
                          name={hidden ? 'eye-off' : 'eye'}
                          size={12}
                          color={hidden ? theme.surface.t3 : theme.accent}
                        />
                        <Text style={[
                          styles.visBadgeText,
                          { color: hidden ? theme.surface.t3 : theme.accent },
                        ]}>{hidden ? 'HIDDEN' : 'PUBLIC'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          ) : null}

          {/* Helpful CTAs at the bottom */}
          <View style={{ paddingHorizontal: 20, marginTop: 30, gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => profileUrl ? Linking.openURL(profileUrl) : null}
              style={[styles.cta, { backgroundColor: theme.accent }]}
            >
              <Ionicons name="open-outline" size={14} color="#FFF" />
              <Text style={styles.ctaText}>View public learning profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!profileUrl) return;
                Alert.alert('Share link', profileUrl);
              }}
              style={[styles.ctaGhost, { borderColor: theme.accentBorder }]}
            >
              <Ionicons name="share-outline" size={14} color={theme.accent} />
              <Text style={[styles.ctaGhostText, { color: theme.surface.t1 }]}>Share link</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={[styles.hiddenHint, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Ionicons name="lock-closed" size={18} color={theme.accent} />
          <Text style={[styles.hiddenHintText, { color: theme.surface.t2 }]}>
            Your learning profile is off. Flip the toggle above when you're ready to
            make it public.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── UI primitives ───────────────────────────────────────────────────────────

function RowToggle({ label, hint, value, onToggle, theme }: {
  label: string; hint?: string; value: boolean; onToggle: (v: boolean) => void;
  theme: ReturnType<typeof useResolvedTheme>;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={[styles.rowLabel, { color: theme.surface.t1 }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.rowHint, { color: theme.surface.t3 }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.surface.s2, true: theme.accent }}
      />
    </View>
  );
}

function SectionTitle({ theme, text }: { theme: ReturnType<typeof useResolvedTheme>; text: string }) {
  return (
    <Text style={[styles.sectionTitle, { color: theme.accent }]}>{text}</Text>
  );
}

function Divider({ theme }: { theme: ReturnType<typeof useResolvedTheme> }) {
  return <View style={[styles.divider, { backgroundColor: theme.surface.border }]} />;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingBottom: 18,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  urlLink: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  saveHint:{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 6 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 8,
  },
  sectionSub:  {
    fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 12,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 13, borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  rowHint:  { fontSize: 12, fontWeight: '500', marginTop: 3, lineHeight: 16 },
  divider:  { height: 1, marginHorizontal: 14 },

  videoRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    padding: 10,
    borderWidth: 1, borderRadius: 12,
  },
  thumb: { width: 110, aspectRatio: 16 / 9, borderRadius: 7, backgroundColor: '#222' },
  vTitle:{ fontSize: 13, fontWeight: '700', lineHeight: 17 },
  vMeta: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  visBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
    marginLeft: 6,
  },
  visBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },

  emptyWrap: {
    alignItems: 'center',
    marginHorizontal: 16, padding: 26,
    borderWidth: 1, borderRadius: 13,
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  emptyBody:  { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 5 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12,
  },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  ctaGhost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1,
  },
  ctaGhostText: { fontSize: 13, fontWeight: '800' },

  hiddenHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: 12,
  },
  hiddenHintText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
});
