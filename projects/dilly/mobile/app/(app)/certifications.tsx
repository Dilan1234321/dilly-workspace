/**
 * Certifications — dedicated browse + search screen.
 *
 * Replaces the small recommended-strip on Skills with a full library
 * the user can search, filter, and save from. Ships with the existing
 * 66-cert dataset (mobile/data/certifications.ts) plus structured
 * filters.
 *
 * "Natural language" search: no LLM cost. Tokenize the user's query,
 * score each cert against (name + provider + cohort labels + level +
 * cost) using token-overlap + substring matching. Handles casual
 * queries like "free aws cert", "cheap data analyst", "advanced
 * security under 50 hours" without any LLM call. Genuinely complex
 * conversational asks ("what should I take if I'm interested in
 * fintech but have no quant background") are out of scope here —
 * those should go to the AI chat.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useResolvedTheme } from '../../hooks/useTheme';
import { CERTIFICATIONS, type Certification } from '../../data/certifications';
import { DillyFace } from '../../components/DillyFace';
import FadeInView from '../../components/FadeInView';

const SAVED_KEY = 'cert_saved_ids_v1';
const COMPLETED_KEY = 'cert_completed_ids_v1';

const COHORT_LABELS: Record<string, string> = {
  'finance-accounting': 'Finance',
  'data-science-analytics': 'Data Science',
  'software-engineering-cs': 'Software Engineering',
  'consulting-strategy': 'Consulting',
  'marketing-advertising': 'Marketing',
  'management-operations': 'Management',
  'cybersecurity-it': 'Cybersecurity',
  'entrepreneurship-innovation': 'Entrepreneurship',
  'economics-public-policy': 'Economics',
  'healthcare-clinical': 'Healthcare',
  'biotech-pharmaceutical': 'Biotech',
  'life-sciences-research': 'Life Sciences',
  'physical-sciences-math': 'Physical Sciences',
  'law-government': 'Law',
  'media-communications': 'Media',
  'design-creative-arts': 'Design',
  'education-human-development': 'Education',
  'social-sciences-nonprofit': 'Social Sciences',
  'electrical-computer-engineering': 'Electrical Engineering',
  'mechanical-aerospace-engineering': 'Mechanical Engineering',
  'civil-environmental-engineering': 'Civil Engineering',
  'chemical-biomedical-engineering': 'Chemical Engineering',
  'general': 'General',
};

type CostFilter = 'all' | 'free' | 'paid';
type LevelFilter = 'all' | 'entry' | 'intermediate' | 'advanced';
type SortMode = 'recommended' | 'time_asc' | 'time_desc' | 'cost_asc';

// Build a denormalized search blob per cert ONCE for fuzzy matching.
// Lowercased so token comparison is case-insensitive.
function searchBlobFor(cert: Certification): string {
  const cohorts = cert.cohorts.map(c => COHORT_LABELS[c] || c).join(' ');
  return [
    cert.name,
    cert.provider,
    cohorts,
    cert.level,
    cert.is_free ? 'free no cost zero' : 'paid',
    cert.cost_label,
    cert.time_label,
    cert.persona_fit.join(' '),
    `${cert.est_hours} hours`,
  ].join(' ').toLowerCase();
}

// Cheap natural-language scoring — no LLM. Token-overlap with
// substring fallback. Returns 0 = no match, higher = stronger match.
// Handles casual phrasing because we tokenize on whitespace and
// match each word against the blob.
function scoreCert(cert: Certification, query: string): number {
  if (!query.trim()) return 0;
  const blob = searchBlobFor(cert);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const tok of tokens) {
    if (blob.includes(tok)) {
      // Bigger boost when the token starts a word (more "intentional" match).
      score += blob.includes(' ' + tok) || blob.startsWith(tok) ? 3 : 1;
    }
  }
  // Bonus when the query exactly matches the cert name (common case).
  if (cert.name.toLowerCase().includes(query.toLowerCase())) score += 5;
  return score;
}

export default function CertificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [query, setQuery] = useState('');
  const [costFilter, setCostFilter] = useState<CostFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [cohortFilter, setCohortFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortMode>('recommended');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([
          AsyncStorage.getItem(SAVED_KEY),
          AsyncStorage.getItem(COMPLETED_KEY),
        ]);
        if (s) setSavedIds(new Set(JSON.parse(s)));
        if (c) setCompletedIds(new Set(JSON.parse(c)));
      } catch {}
    })();
  }, []);

  // Cohorts that have at least one cert (drives the dropdown options).
  const availableCohorts = useMemo(() => {
    const set = new Set<string>();
    for (const c of CERTIFICATIONS) for (const co of c.cohorts) set.add(co);
    return Array.from(set).sort((a, b) => (COHORT_LABELS[a] || a).localeCompare(COHORT_LABELS[b] || b));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    let pool = CERTIFICATIONS.slice();
    // Structured filters
    if (costFilter === 'free')  pool = pool.filter(c => c.is_free);
    if (costFilter === 'paid')  pool = pool.filter(c => !c.is_free);
    if (levelFilter !== 'all')  pool = pool.filter(c => c.level === levelFilter);
    if (cohortFilter !== 'all') pool = pool.filter(c => c.cohorts.includes(cohortFilter));
    // Search scoring (only when there's a query)
    if (q) {
      const scored = pool
        .map(c => ({ c, s: scoreCert(c, q) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s);
      return scored.map(x => x.c);
    }
    // Sort modes
    if (sort === 'time_asc')  pool.sort((a, b) => a.est_hours - b.est_hours);
    if (sort === 'time_desc') pool.sort((a, b) => b.est_hours - a.est_hours);
    if (sort === 'cost_asc')  pool.sort((a, b) => Number(b.is_free) - Number(a.is_free));
    return pool;
  }, [query, costFilter, levelFilter, cohortFilter, sort]);

  async function toggleSave(certId: string) {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(certId)) next.delete(certId); else next.add(certId);
      AsyncStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }
  async function toggleCompleted(certId: string) {
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (next.has(certId)) next.delete(certId); else next.add(certId);
      AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface.bg }}>
      {/* Sticky header — search + filters stay at top */}
      <View style={{
        paddingTop: insets.top + 6,
        paddingHorizontal: 16, paddingBottom: 10,
        backgroundColor: theme.surface.bg,
        borderBottomWidth: 1, borderBottomColor: theme.surface.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.surface.t1} />
          </TouchableOpacity>
          <DillyFace size={30} mood="curious" />
          <Text style={{
            fontFamily: theme.type.display,
            fontSize: 22, fontWeight: '800',
            color: theme.surface.t1, letterSpacing: 0.4,
          }}>
            Certifications
          </Text>
        </View>

        {/* Search bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: theme.surface.s1,
          borderColor: theme.surface.border, borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 12, paddingVertical: 10,
        }}>
          <Ionicons name="search" size={16} color={theme.surface.t3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder='Search — try "free aws", "data analyst", "cheap & fast"'
            placeholderTextColor={theme.surface.t3}
            style={{ flex: 1, fontSize: 14, color: theme.surface.t1, fontFamily: theme.type.body }}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color={theme.surface.t3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter pills row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: 10, paddingRight: 8 }}
        >
          <FilterPill
            label={costFilter === 'all' ? 'All cost' : costFilter === 'free' ? 'Free only' : 'Paid only'}
            active={costFilter !== 'all'}
            onPress={() => setCostFilter(costFilter === 'all' ? 'free' : costFilter === 'free' ? 'paid' : 'all')}
            icon="cash-outline"
            theme={theme}
          />
          <FilterPill
            label={levelFilter === 'all' ? 'All levels' : levelFilter[0].toUpperCase() + levelFilter.slice(1)}
            active={levelFilter !== 'all'}
            onPress={() => setLevelFilter(levelFilter === 'all' ? 'entry' : levelFilter === 'entry' ? 'intermediate' : levelFilter === 'intermediate' ? 'advanced' : 'all')}
            icon="trophy-outline"
            theme={theme}
          />
          <FilterPill
            label={cohortFilter === 'all' ? 'All fields' : (COHORT_LABELS[cohortFilter] || cohortFilter)}
            active={cohortFilter !== 'all'}
            onPress={() => {
              const idx = availableCohorts.indexOf(cohortFilter);
              const next = idx === -1 ? availableCohorts[0] : (idx === availableCohorts.length - 1 ? 'all' : availableCohorts[idx + 1]);
              setCohortFilter(next);
            }}
            icon="layers-outline"
            theme={theme}
          />
          <FilterPill
            label={
              sort === 'recommended' ? 'Recommended'
              : sort === 'time_asc' ? 'Quickest first'
              : sort === 'time_desc' ? 'Most depth first'
              : 'Cheapest first'
            }
            active={sort !== 'recommended'}
            onPress={() => {
              const order: SortMode[] = ['recommended', 'time_asc', 'time_desc', 'cost_asc'];
              const idx = order.indexOf(sort);
              setSort(order[(idx + 1) % order.length]);
            }}
            icon="swap-vertical"
            theme={theme}
          />
        </ScrollView>
      </View>

      {/* Result list */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 400); }} tintColor={theme.accent} />}
      >
        <Text style={{ fontSize: 11, color: theme.surface.t3, marginBottom: 10 }}>
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          {query ? ` for "${query}"` : ''}
        </Text>

        {filtered.length === 0 && (
          <View style={{ padding: 24, alignItems: 'center', gap: 10 }}>
            <Ionicons name="search-outline" size={32} color={theme.surface.t3} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1 }}>No matches.</Text>
            <Text style={{ fontSize: 12, color: theme.surface.t2, textAlign: 'center' }}>
              Try a broader search or clear the filters.
            </Text>
          </View>
        )}

        <View style={{ gap: 10 }}>
          {filtered.map((cert, i) => {
            const saved = savedIds.has(cert.id);
            const completed = completedIds.has(cert.id);
            const cohortChip = (cert.cohorts[0] && (COHORT_LABELS[cert.cohorts[0]] || cert.cohorts[0])) || 'General';
            return (
              <FadeInView key={cert.id} delay={Math.min(i * 30, 240)}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => WebBrowser.openBrowserAsync(cert.url).catch(() => {})}
                  style={{
                    backgroundColor: theme.surface.s1,
                    borderColor: completed ? '#86EFAC' : theme.surface.border,
                    borderWidth: 1, borderRadius: 14,
                    padding: 14,
                  }}
                >
                  {/* Top row: provider + level + cost */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.4, color: theme.surface.t3 }} numberOfLines={1}>
                      {cert.provider}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <View style={{
                        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
                        backgroundColor: cert.is_free ? '#DCFCE7' : '#FEF3C7',
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: cert.is_free ? '#15803D' : '#92400E' }}>
                          {cert.cost_label}
                        </Text>
                      </View>
                      <View style={{
                        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
                        backgroundColor: theme.surface.s2,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.surface.t2, textTransform: 'capitalize' }}>
                          {cert.level}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={{
                    fontSize: 15, fontWeight: '800', color: theme.surface.t1,
                    fontFamily: theme.type.body, lineHeight: 19,
                  }}>
                    {cert.name}
                  </Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="time-outline" size={11} color={theme.surface.t3} />
                      <Text style={{ fontSize: 11, color: theme.surface.t2 }}>{cert.time_label}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: theme.surface.t3 }}>·</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="layers-outline" size={11} color={theme.surface.t3} />
                      <Text style={{ fontSize: 11, color: theme.surface.t2 }}>{cohortChip}</Text>
                    </View>
                  </View>

                  {/* Action row */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={(e) => { e.stopPropagation?.(); WebBrowser.openBrowserAsync(cert.url).catch(() => {}); }}
                      style={{
                        flex: 1, backgroundColor: theme.accent,
                        paddingVertical: 9, borderRadius: 8,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      <Ionicons name="open-outline" size={13} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>Open</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={(e) => { e.stopPropagation?.(); toggleSave(cert.id); }}
                      style={{
                        paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8,
                        backgroundColor: saved ? theme.accent : theme.surface.s2,
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                      }}
                    >
                      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={13} color={saved ? '#FFF' : theme.surface.t2} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: saved ? '#FFF' : theme.surface.t2 }}>
                        {saved ? 'Saved' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={(e) => { e.stopPropagation?.(); toggleCompleted(cert.id); }}
                      style={{
                        paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8,
                        backgroundColor: completed ? '#15803D' : theme.surface.s2,
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                      }}
                    >
                      <Ionicons name={completed ? 'checkmark-circle' : 'checkmark-circle-outline'} size={13} color={completed ? '#FFF' : theme.surface.t2} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: completed ? '#FFF' : theme.surface.t2 }}>
                        {completed ? 'Done' : 'Done?'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </FadeInView>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function FilterPill({ label, active, onPress, icon, theme }: any) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 11, paddingVertical: 7,
        borderRadius: 18,
        backgroundColor: active ? theme.accent : theme.surface.s1,
        borderWidth: 1,
        borderColor: active ? theme.accent : theme.surface.border,
      }}
    >
      <Ionicons name={icon} size={11} color={active ? '#FFF' : theme.surface.t2} />
      <Text style={{
        fontSize: 12, fontWeight: '700',
        color: active ? '#FFF' : theme.surface.t1,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
