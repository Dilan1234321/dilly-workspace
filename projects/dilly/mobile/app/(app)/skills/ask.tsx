/**
 * Skills — Ask page.
 *
 * Mirrors the web /ask: natural-language search with eight example
 * prompts. Backend does not currently expose a dedicated search
 * endpoint, so we query the trending list and filter client-side by
 * keyword match against title + description + cohort. Good enough for
 * launch; swap to a real endpoint when it ships.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';

interface Video {
  id: string;
  title: string;
  description?: string;
  channel_title: string;
  cohort: string;
  duration_sec: number;
  thumbnail_url: string;
  quality_score?: number;
}

const EXAMPLES = [
  "I'm a sophomore trying to get into quant finance",
  'How do I learn system design from scratch',
  'Preparing for a product management interview',
  'CRISPR and gene editing fundamentals',
  'I want to break into consulting from a non-target',
  'SQL window functions with real examples',
  'UX research methods for a capstone project',
  'MCAT biochemistry review',
];

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function scoreMatch(video: Video, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = (video.title + ' ' + (video.description || '') + ' ' + video.cohort + ' ' + video.channel_title).toLowerCase();
  let hits = 0;
  for (const t of tokens) if (haystack.includes(t)) hits++;
  // Multiply by quality so higher-signal videos bubble up in ties.
  return hits + (video.quality_score || 0);
}

export default function AskScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [pool, setPool] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  // Lazy load a trending pool the first time the user submits. We pull
  // 100 so the client-side filter has breadth.
  const ensurePool = useCallback(async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    try {
      const res = await dilly.get('/skill-lab/trending?limit=100').catch(() => null);
      setPool(Array.isArray(res?.videos) ? res.videos : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setSubmitted(trimmed);
    ensurePool();
  }, [query, ensurePool]);

  const results = useMemo(() => {
    if (!submitted) return [];
    const tokens = tokenize(submitted);
    return pool
      .map(v => ({ v, s: scoreMatch(v, tokens) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.v);
  }, [submitted, pool]);

  const runExample = useCallback((ex: string) => {
    setQuery(ex);
    setSubmitted(ex);
    ensurePool();
  }, [ensurePool]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>ASK</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]}>
            Describe what you want to learn
          </Text>
        </View>
      </View>

      <Text style={[styles.intro, { color: theme.surface.t2 }]}>
        Plain words. Full sentences. Dilly matches it against the curated library.
      </Text>

      {/* Input */}
      <View style={[styles.inputWrap, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
        <Ionicons name="search" size={16} color={theme.surface.t3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          placeholder="e.g. SQL window functions with real examples"
          placeholderTextColor={theme.surface.t3}
          style={[styles.input, { color: theme.surface.t1 }]}
          autoCapitalize="none"
          autoCorrect
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => { setQuery(''); setSubmitted(''); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.surface.t3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Examples (only when no query submitted) */}
      {!submitted ? (
        <>
          <Text style={[styles.sectionTitle, { color: theme.surface.t3 }]}>SOME EXAMPLES</Text>
          <View style={styles.exGrid}>
            {EXAMPLES.map(ex => (
              <TouchableOpacity
                key={ex}
                activeOpacity={0.85}
                onPress={() => runExample(ex)}
                style={[styles.exCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
              >
                <Ionicons name="sparkles" size={13} color={theme.accent} />
                <Text style={[styles.exText, { color: theme.surface.t1 }]}>{ex}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {/* Results */}
      {submitted && loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : null}

      {submitted && !loading ? (
        <>
          <Text style={[styles.resultsEyebrow, { color: theme.accent }]}>
            {results.length} match{results.length === 1 ? '' : 'es'}
          </Text>
          {results.length === 0 ? (
            <Text style={[styles.empty, { color: theme.surface.t2 }]}>
              Dilly couldn't find a curated video for that yet. Try rephrasing, or
              browse a cohort.
            </Text>
          ) : (
            results.map(v => (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.85}
                onPress={() => router.push(`/skills/video/${v.id}`)}
                style={[styles.resCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
              >
                <Image source={{ uri: v.thumbnail_url }} style={styles.resThumb} resizeMode="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.resTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{v.title}</Text>
                  <Text style={[styles.resMeta, { color: theme.surface.t3 }]} numberOfLines={1}>
                    {v.channel_title}{v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },

  intro: {
    fontSize: 13,
    paddingHorizontal: 20,
    lineHeight: 19,
    marginBottom: 16,
  },

  inputWrap: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    marginTop: 26,
    marginBottom: 10,
  },

  exGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    gap: 8,
  },
  exCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
  },
  exText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  resultsEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingHorizontal: 20,
    marginTop: 22,
    marginBottom: 10,
  },
  resCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  resThumb: { width: 120, aspectRatio: 16 / 9, borderRadius: 7, backgroundColor: '#222' },
  resTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  resMeta:  { fontSize: 11, fontWeight: '600', marginTop: 3 },

  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
    lineHeight: 19,
  },
});
