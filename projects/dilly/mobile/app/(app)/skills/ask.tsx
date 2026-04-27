import { safeBack } from '../../../lib/navigation';
/**
 * Skills - Ask page (build 354).
 *
 * Second pass. The first pass fetched trending once and filtered
 * client-side against the query, but trending is cross-cohort and
 * often small, so real queries like "sql window functions" came up
 * empty.
 *
 * New strategy:
 *   1. Detect cohort intent from the query. We have 22 cohort slugs
 *      and a handful of keywords per cohort; we score by keyword hit
 *      count and pick the top cohort.
 *   2. If a cohort matches with any confidence, fetch THAT cohort's
 *      full library (up to 100 videos) and filter/rank by keyword
 *      match against title + description.
 *   3. If no cohort matches, fetch trending + 2-3 catch-all cohorts
 *      and pool-filter against the query.
 *   4. If still empty, surface a soft empty state that routes the
 *      user to the top-guess cohort so the page is never dead.
 *
 * Results rank by: keyword hits in title (weight 3) + description
 * (weight 1) + quality_score. Max 30 results.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  Image, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import DillyLoadingState from '../../../components/DillyLoadingState';
import { FirstVisitCoach } from '../../../components/FirstVisitCoach';

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

// Slug → keyword triggers. Multi-word phrases weigh more (tokenize and
// match against the query). Tunable - add niches as we notice misses.
const COHORT_KEYWORDS: Record<string, string[]> = {
  'software-engineering-cs': [
    'software', 'engineer', 'programming', 'code', 'leetcode', 'algorithm',
    'system design', 'distributed', 'backend', 'frontend', 'dsa',
    'full stack', 'python', 'javascript', 'typescript', 'golang', 'rust',
  ],
  'data-science-analytics': [
    'data science', 'data', 'analytics', 'sql', 'window function', 'pandas',
    'ml', 'machine learning', 'statistics', 'regression', 'model',
    'tableau', 'power bi', 'etl', 'dbt',
  ],
  'cybersecurity-it': [
    'security', 'cyber', 'pentest', 'pen test', 'ctf', 'malware',
    'network security', 'blue team', 'red team', 'infosec', 'osint',
  ],
  'electrical-computer-engineering': [
    'electrical', 'circuit', 'embedded', 'fpga', 'vlsi', 'signal',
    'electronics', 'microcontroller', 'arduino',
  ],
  'mechanical-aerospace-engineering': [
    'mechanical', 'aerospace', 'cad', 'fea', 'solidworks', 'thermo',
    'fluid dynamics', 'ansys', 'propulsion', 'aircraft',
  ],
  'civil-environmental-engineering': [
    'civil engineering', 'structural', 'environmental engineering', 'geotechnical',
    'transportation engineering', 'hydrology',
  ],
  'chemical-biomedical-engineering': [
    'chemical engineering', 'biomedical', 'bioengineering', 'reactor',
    'unit operations', 'pharmacokinetics',
  ],
  'finance-accounting': [
    'finance', 'accounting', 'quant', 'trading', 'investment banking',
    'valuation', 'dcf', 'model', 'excel', 'cfa', 'cpa', 'lbo', 'ibd',
  ],
  'consulting-strategy': [
    'consulting', 'case interview', 'mbb', 'strategy', 'mckinsey',
    'bain', 'bcg', 'non target', 'non-target', 'case prep',
  ],
  'marketing-advertising': [
    'marketing', 'brand', 'advertising', 'seo', 'performance marketing',
    'growth marketing', 'content marketing', 'pr', 'copywriting',
  ],
  'management-operations': [
    'management', 'operations', 'supply chain', 'lean', 'six sigma',
    'product manager', 'project manager', 'product management',
    'pm interview',
  ],
  'entrepreneurship-innovation': [
    'startup', 'entrepreneur', 'founder', 'fundraise', 'pitch', 'yc',
    'venture', 'seed', 'series a', 'bootstrap',
  ],
  'economics-public-policy': [
    'economics', 'econ', 'public policy', 'policy', 'macro', 'micro',
    'game theory', 'market design',
  ],
  'healthcare-clinical': [
    'medicine', 'clinical', 'mcat', 'nursing', 'residency', 'usmle',
    'step 1', 'step 2', 'anatomy', 'pharmacology',
  ],
  'biotech-pharmaceutical': [
    'biotech', 'pharmaceutical', 'pharma', 'crispr', 'gene editing',
    'drug development', 'clinical trial',
  ],
  'life-sciences-research': [
    'biology', 'biochemistry', 'biochem', 'molecular', 'genetics',
    'research methods', 'lab techniques',
  ],
  'physical-sciences-math': [
    'physics', 'mathematics', 'calculus', 'linear algebra', 'differential',
    'quantum', 'chemistry', 'math',
  ],
  'law-government': [
    'law school', 'lsat', 'legal', 'attorney', 'government', 'politics',
  ],
  'media-communications': [
    'journalism', 'media', 'communications', 'film', 'video editing',
    'writing',
  ],
  'design-creative-arts': [
    'design', 'figma', 'ui', 'ux', 'ux research', 'design systems',
    'illustration', 'product design',
  ],
  'education-human-development': [
    'teaching', 'education', 'pedagogy', 'lesson plan', 'child development',
  ],
  'social-sciences-nonprofit': [
    'nonprofit', 'sociology', 'psychology', 'political science',
    'social work',
  ],
};

function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function detectCohort(query: string): { slug: string; score: number } | null {
  const q = ' ' + query.toLowerCase() + ' ';
  let best: { slug: string; score: number } | null = null;
  for (const [slug, keywords] of Object.entries(COHORT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(' ' + kw + ' ') || q.includes(' ' + kw + ',') ||
          q.includes(' ' + kw + '.') || q.includes(' ' + kw + '?') ||
          q.includes(kw + ' ')) {
        // Longer phrases are more discriminating.
        score += kw.split(/\s+/).length;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { slug, score };
  }
  return best;
}

function scoreVideo(v: Video, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = v.title.toLowerCase();
  const desc = (v.description || '').toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t)) score += 3;
    if (desc.includes(t))  score += 1;
  }
  return score + (v.quality_score || 0);
}

export default function AskScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  // `q` param lets other screens (e.g. My Dilly "Sharpen") deep-link
  // straight into a pre-run search. Example: /skills/ask?q=python.
  const { q: seedQueryRaw } = useLocalSearchParams<{ q?: string }>();
  const seedQuery = typeof seedQueryRaw === 'string' ? seedQueryRaw : '';
  const [query, setQuery] = useState(seedQuery);
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setSubmitted(trimmed);
    setLoading(true);
    setResults([]);
    try {
      const tokens = tokenize(trimmed);
      const detection = detectCohort(trimmed);
      setDetected(detection?.slug || null);

      // Pull from the detected cohort (full library up to 100) plus
      // trending (breadth). Merge + de-dupe + rank client-side.
      const sources: Promise<Video[]>[] = [];
      if (detection) {
        sources.push(
          dilly.get(`/skill-lab/videos?cohort=${detection.slug}&sort=best&limit=100`)
            .then(r => Array.isArray(r?.videos) ? r.videos : [])
            .catch(() => []),
        );
      }
      sources.push(
        dilly.get('/skill-lab/trending?limit=100')
          .then(r => Array.isArray(r?.videos) ? r.videos : [])
          .catch(() => []),
      );
      const pools = await Promise.all(sources);
      const seen = new Set<string>();
      const merged: Video[] = [];
      for (const pool of pools) {
        for (const v of pool) {
          if (!seen.has(v.id)) { seen.add(v.id); merged.push(v); }
        }
      }

      const ranked = merged
        .map(v => ({ v, s: scoreVideo(v, tokens) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.v)
        .slice(0, 30);

      // Fall back: if nothing matches the query but we detected a
      // cohort, show that cohort's top 10 so the page is never empty.
      if (ranked.length === 0 && detection && pools[0].length > 0) {
        setResults(pools[0].slice(0, 10));
      } else {
        setResults(ranked);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = useCallback(() => {
    runSearch(query);
  }, [query, runSearch]);

  // Auto-run search when we arrive with a `q` param (e.g. from the My
  // Dilly "Sharpen" action on a skill fact). Ref-gated so the user's
  // subsequent typing never re-triggers the seed search.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!seedQuery || !seedQuery.trim()) return;
    seededRef.current = true;
    runSearch(seedQuery);
  }, [seedQuery, runSearch]);

  const runExample = useCallback((ex: string) => {
    setQuery(ex);
    runSearch(ex);
  }, [runSearch]);

  const openCohort = useCallback(() => {
    if (detected) router.push(`/skills/cohort/${detected}`);
  }, [detected]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack('/(app)/skills')} hitSlop={12}>
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
          <TouchableOpacity onPress={() => { setQuery(''); setSubmitted(''); setResults([]); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.surface.t3} />
          </TouchableOpacity>
        ) : null}
      </View>

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

      {submitted && loading ? (
        <View style={{ paddingVertical: 40 }}>
          <DillyLoadingState
            mood="writing"
            accessory="pencil"
            messages={['Dilly is searching the library…', `Looking for "${submitted}"…`]}
          />
        </View>
      ) : null}

      <FirstVisitCoach
        id="skills_ask_v1"
        iconName="search"
        headline="Ask for anything you want to learn"
        subline="Write a full sentence. Dilly matches it to the curated library and sends you the best videos."
      />

      {submitted && !loading ? (
        <>
          {detected ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openCohort}
              style={[styles.detectedChip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
            >
              <Ionicons name="navigate" size={12} color={theme.accent} />
              <Text style={[styles.detectedChipText, { color: theme.accent }]}>
                Browse the full {detected.replace(/-/g, ' ')} cohort
              </Text>
              <Ionicons name="arrow-forward" size={12} color={theme.accent} />
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.resultsEyebrow, { color: theme.accent }]}>
            {results.length} match{results.length === 1 ? '' : 'es'}
          </Text>

          {results.length === 0 ? (
            <Text style={[styles.empty, { color: theme.surface.t2 }]}>
              Dilly couldn't find a curated video for that yet. Try rephrasing, or
              browse a cohort below.
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
                    {v.channel_title}{v.duration_sec ? ` · ${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}` : ''}
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

  detectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  detectedChipText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },

  resultsEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingHorizontal: 20,
    marginTop: 14,
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
