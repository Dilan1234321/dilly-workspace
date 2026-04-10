/**
 * Jobs Page — cohort-filtered job matching with S/G/B score comparison.
 *
 * Build 88: Complete rewrite. Shows jobs filtered by user's cohorts.
 * Each job has per-cohort S/G/B requirements. The user sees how their
 * scores stack up against each matching cohort requirement.
 *
 * Key UX decisions:
 * - Only shows jobs for cohorts the user has on their profile
 * - Multi-cohort jobs (e.g. quant finance = Data Science + Finance) only
 *   appear if the user has ALL required cohorts
 * - Readiness: Ready (all dims met), Almost (1 gap <=15), Gap (2+ gaps)
 * - "Apply" adds to tracker + opens URL
 * - "Ask Dilly" opens the AI coach with gap context
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Alert, Linking, RefreshControl, LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { parseCohortScores, type CohortScore } from '../../lib/cohorts';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

const COBALT = '#1652F0';
const GREEN  = '#34C759';
const AMBER  = '#FF9F0A';
const CORAL  = '#FF453A';
const BLUE   = '#0A84FF';

// ── Types ────────────────────────────────────────────────────────────────────

interface CohortReq {
  cohort: string;
  smart: number;
  grit: number;
  build: number;
}

interface Listing {
  id: string;
  title: string;
  company: string;
  // Backend returns location_city/location_state, not a single location string
  location_city?: string;
  location_state?: string;
  location?: string;
  work_mode?: string;
  description?: string;
  description_preview?: string;
  url?: string;
  apply_url?: string;
  posted_date?: string;
  source?: string;
  job_type?: string;
  remote?: boolean;
  cohort_requirements?: CohortReq[] | null;
  primary_cohort?: string;
  required_smart?: number | null;
  required_grit?: number | null;
  required_build?: number | null;
  quality_score?: number;
  readiness?: 'ready' | 'almost' | 'gap';
  rank_score?: number;
  cohort_readiness?: any[];
  cohort_matches?: { cohort: string; smart_gap: number; grit_gap: number; build_gap: number; met: boolean }[];
}

type Tab = 'all' | 'internship' | 'entry_level';
type ReadinessFilter = 'all' | 'ready' | 'almost' | 'gap';

// ── Helpers ──────────────────────────────────────────────────────────────────

function readinessColor(r: string): string {
  return r === 'ready' ? GREEN : r === 'almost' ? AMBER : CORAL;
}

function readinessLabel(r: string): string {
  return r === 'ready' ? 'Ready' : r === 'almost' ? 'Almost' : 'Gap';
}

function daysAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return '1d ago';
  if (diff <= 30) return `${diff}d ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

function computeReadiness(
  listing: Listing,
  userScores: Record<string, CohortScore>,
): { readiness: 'ready' | 'almost' | 'gap'; matches: Listing['cohort_matches'] } {
  const matches: NonNullable<Listing['cohort_matches']> = [];
  let totalGaps = 0;
  let maxSingleGap = 0;

  const reqs = Array.isArray(listing.cohort_requirements) ? listing.cohort_requirements : [];

  if (reqs.length > 0) {
    for (const req of reqs) {
      if (!req || !req.cohort) continue;
      const userCohort = userScores[req.cohort];
      if (!userCohort) continue;

      const sg = Math.max(0, (req.smart || 0) - userCohort.smart);
      const gg = Math.max(0, (req.grit || 0) - userCohort.grit);
      const bg = Math.max(0, (req.build || 0) - userCohort.build);
      const gaps = (sg > 0 ? 1 : 0) + (gg > 0 ? 1 : 0) + (bg > 0 ? 1 : 0);
      totalGaps += gaps;
      maxSingleGap = Math.max(maxSingleGap, sg, gg, bg);

      matches.push({ cohort: req.cohort, smart_gap: sg, grit_gap: gg, build_gap: bg, met: gaps === 0 });
    }
  } else if (listing.required_smart != null) {
    // Fallback: use flat required_smart/grit/build fields with the user's primary cohort
    const primary = Object.values(userScores)[0];
    if (primary) {
      const sg = Math.max(0, (listing.required_smart || 0) - primary.smart);
      const gg = Math.max(0, (listing.required_grit || 0) - primary.grit);
      const bg = Math.max(0, (listing.required_build || 0) - primary.build);
      const gaps = (sg > 0 ? 1 : 0) + (gg > 0 ? 1 : 0) + (bg > 0 ? 1 : 0);
      totalGaps = gaps;
      maxSingleGap = Math.max(sg, gg, bg);
      matches.push({ cohort: primary.cohort_id, smart_gap: sg, grit_gap: gg, build_gap: bg, met: gaps === 0 });
    }
  }

  // Use backend-computed readiness if available, otherwise compute
  if (listing.readiness && matches.length === 0) {
    return { readiness: listing.readiness as any, matches: [] };
  }

  let readiness: 'ready' | 'almost' | 'gap' = 'gap';
  if (totalGaps === 0) readiness = 'ready';
  else if (totalGaps <= 1 && maxSingleGap <= 15) readiness = 'almost';

  return { readiness, matches };
}

// ── Simple Dim Row (no comparison, just user's score) ───────────────────────

function DimRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.scoreBarRow}>
      <Text style={s.scoreBarLabel}>{label.charAt(0)}</Text>
      <View style={s.scoreBarTrack}>
        <View style={[s.scoreBarFill, { width: `${Math.min(100, value)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.scoreBarNum, { color }]}>{Math.round(value)}</Text>
    </View>
  );
}

// ── Score Bar Component ─────────────────────────────────────────────────────

function ScoreBar({ label, required, yours, color }: {
  label: string; required: number; yours: number; color: string;
}) {
  const gap = required - yours;
  const met = gap <= 0;
  return (
    <View style={s.scoreBarRow}>
      <Text style={s.scoreBarLabel}>{label}</Text>
      <View style={s.scoreBarTrack}>
        <View style={[s.scoreBarFill, {
          width: `${Math.min(100, yours)}%`,
          backgroundColor: met ? GREEN : gap <= 15 ? AMBER : CORAL,
        }]} />
        <View style={[s.scoreBarReq, { left: `${Math.min(100, required)}%` }]} />
      </View>
      <Text style={[s.scoreBarNum, { color: met ? GREEN : CORAL }]}>{Math.round(yours)}</Text>
      <Text style={s.scoreBarSlash}>/</Text>
      <Text style={s.scoreBarReqNum}>{Math.round(required)}</Text>
    </View>
  );
}

// ── Job Card Component ──────────────────────────────────────────────────────

function JobCard({ listing, userScores, expanded, onToggle, activeCohortId }: {
  listing: Listing;
  userScores: Record<string, CohortScore>;
  expanded: boolean;
  onToggle: () => void;
  activeCohortId?: string | null;
}) {
  const { readiness, matches } = computeReadiness(listing, userScores);
  const rColor = readinessColor(readiness);

  const loc = listing.location || [listing.location_city, listing.location_state].filter(Boolean).join(', ');
  const applyUrl = listing.apply_url || listing.url || '';
  const desc = listing.description || listing.description_preview || '';

  // Pick the user's cohort to compare against this job.
  // Priority: active filter > job's primary cohort > user's primary (first by level sort)
  const primaryUserCohort = Object.values(userScores).sort((a, b) => {
    const lo: Record<string, number> = { primary: 0, major: 1, minor: 2, interest: 3 };
    return (lo[a.level] ?? 9) - (lo[b.level] ?? 9);
  })[0];
  const compareWith = activeCohortId ? userScores[activeCohortId]
    : (listing.primary_cohort && userScores[listing.primary_cohort])
    ? userScores[listing.primary_cohort]
    : primaryUserCohort;
  const hasRealScores = listing.required_smart != null && listing.required_smart > 0;
  const reqSmart = hasRealScores ? Number(listing.required_smart) : 0;
  const reqGrit = hasRealScores ? Number(listing.required_grit) : 0;
  const reqBuild = hasRealScores ? Number(listing.required_build) : 0;

  async function handleApply() {
    try {
      await dilly.post('/v2/internships/save', { internship_id: listing.id });
    } catch {}
    if (applyUrl) {
      Linking.openURL(applyUrl).catch(() => {
        Alert.alert('Could not open link', applyUrl);
      });
    }
  }

  function handleAskDilly() {
    const gapSummary = (matches || [])
      .filter(m => !m.met)
      .map(m => {
        const gaps = [];
        if (m.smart_gap > 0) gaps.push(`Smart -${Math.round(m.smart_gap)}`);
        if (m.grit_gap > 0) gaps.push(`Grit -${Math.round(m.grit_gap)}`);
        if (m.build_gap > 0) gaps.push(`Build -${Math.round(m.build_gap)}`);
        return `${m.cohort}: ${gaps.join(', ')}`;
      })
      .join('. ');
    openDillyOverlay({
      isPaid: true,
      initialMessage: `I'm looking at the ${listing.title} role at ${listing.company}. My gaps: ${gapSummary || 'none'}. What should I work on to close these gaps and be competitive for this role?`,
    });
  }

  return (
    <AnimatedPressable style={s.jobCard} onPress={onToggle} scaleDown={0.985}>
      {/* Accent bar */}
      <View style={[s.jobAccent, { backgroundColor: rColor }]} />

      <View style={s.jobContent}>
        {/* Header */}
        <View style={s.jobHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.jobTitle} numberOfLines={2}>{listing.title}</Text>
            <Text style={s.jobCompany}>{listing.company}</Text>
          </View>
          <View style={[s.readinessBadge, { backgroundColor: rColor + '15', borderColor: rColor + '30' }]}>
            <View style={[s.readinessDot, { backgroundColor: rColor }]} />
            <Text style={[s.readinessText, { color: rColor }]}>{readinessLabel(readiness)}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={s.jobMeta}>
          {loc ? (
            <View style={s.metaPill}>
              <Ionicons name="location-outline" size={10} color={colors.t3} />
              <Text style={s.metaText}>{loc}</Text>
            </View>
          ) : null}
          {listing.job_type === 'internship' && (
            <View style={[s.metaPill, { backgroundColor: COBALT + '10', borderColor: COBALT + '20' }]}>
              <Text style={[s.metaText, { color: COBALT }]}>Internship</Text>
            </View>
          )}
          {listing.posted_date ? (
            <Text style={s.metaDate}>{daysAgo(listing.posted_date)}</Text>
          ) : null}
        </View>

        {/* Cohort match pills */}
        {matches && matches.length > 0 && (
          <View style={s.cohortMatchRow}>
            {matches.map(m => (
              <View key={m.cohort} style={[s.cohortMatchPill, {
                backgroundColor: m.met ? GREEN + '12' : CORAL + '12',
                borderColor: m.met ? GREEN + '25' : CORAL + '25',
              }]}>
                <Ionicons name={m.met ? 'checkmark' : 'arrow-up'} size={10} color={m.met ? GREEN : CORAL} />
                <Text style={[s.cohortMatchText, { color: m.met ? GREEN : CORAL }]} numberOfLines={1}>
                  {m.cohort.replace(/ & .*$/, '')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Expanded: Score comparison + actions */}
        {expanded && (
          <View style={s.expandedSection}>
            {/* S/G/B comparison: your scores vs job requirements */}
            {compareWith && hasRealScores && (
              <View style={s.cohortScoreBlock}>
                <Text style={s.cohortScoreLabel}>YOUR FIT: {compareWith.display_name || compareWith.cohort_id}</Text>
                <ScoreBar label="S" required={reqSmart} yours={compareWith.smart} color={BLUE} />
                <ScoreBar label="G" required={reqGrit} yours={compareWith.grit} color={AMBER} />
                <ScoreBar label="B" required={reqBuild} yours={compareWith.build} color={GREEN} />
              </View>
            )}
            {compareWith && !hasRealScores && (
              <View style={s.cohortScoreBlock}>
                <Text style={s.cohortScoreLabel}>YOUR SCORES: {compareWith.display_name || compareWith.cohort_id}</Text>
                <DimRow label="Smart" value={compareWith.smart} color={BLUE} />
                <DimRow label="Grit" value={compareWith.grit} color={AMBER} />
                <DimRow label="Build" value={compareWith.build} color={GREEN} />
              </View>
            )}

            {/* Description preview */}
            {desc ? (
              <Text style={s.descPreview} numberOfLines={4}>
                {desc.replace(/\s+/g, ' ').slice(0, 300)}
              </Text>
            ) : null}

            {/* Action buttons */}
            <View style={s.actionRow}>
              <AnimatedPressable style={s.applyBtn} onPress={handleApply} scaleDown={0.97}>
                <Ionicons name="send" size={14} color="#fff" />
                <Text style={s.applyBtnText}>Apply</Text>
              </AnimatedPressable>
              <AnimatedPressable style={s.dillyBtn} onPress={handleAskDilly} scaleDown={0.97}>
                <Ionicons name="sparkles" size={14} color={COBALT} />
                <Text style={s.dillyBtnText}>Ask Dilly</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={s.tailorBtn}
                onPress={() => router.push({
                  pathname: '/(app)/resume-generate',
                  params: {
                    jobTitle: listing.title || '',
                    company: listing.company || '',
                    jd: desc.slice(0, 2000),
                  },
                })}
                scaleDown={0.97}
              >
                <Ionicons name="sparkles" size={14} color={colors.t2} />
                <Text style={s.tailorBtnText}>Tailor</Text>
              </AnimatedPressable>
            </View>
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cohortScores, setCohortScores] = useState<CohortScore[]>([]);
  const [activeCohortFilter, setActiveCohortFilter] = useState<string | null>(null);

  // Build a lookup map of user's cohort scores
  const userScoresMap = useMemo(() => {
    const map: Record<string, CohortScore> = {};
    for (const c of cohortScores) map[c.cohort_id] = c;
    return map;
  }, [cohortScores]);

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, feedRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get(`/v2/internships/feed?tab=${tab}&limit=50&sort=rank`).catch(() => null),
      ]);

      // Parse cohort scores — only show user's chosen cohorts (major/minor/primary)
      // NOT all interest-level background entries
      const parsed = parseCohortScores(profileRes?.cohort_scores); // filters interest
      const explicitCohorts: string[] | null = Array.isArray(profileRes?.cohorts) && profileRes.cohorts.length > 0
        ? profileRes.cohorts : null;
      if (explicitCohorts) {
        const filtered = parsed.filter(c => explicitCohorts.includes(c.cohort_id));
        setCohortScores(filtered.length > 0 ? filtered : parsed);
      } else {
        setCohortScores(parsed);
      }

      setListings(feedRes?.listings || []);
    } catch {}
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Filter listings by search, cohort, and readiness
  const filtered = useMemo(() => {
    let result = listings;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) || l.company.toLowerCase().includes(q)
      );
    }

    // Cohort filter — if a cohort is selected, prefer jobs that match it
    // but still show all jobs (most don't have cohort_requirements populated yet).
    // Jobs with matching cohort_requirements are sorted first.
    if (activeCohortFilter) {
      result = [...result].sort((a, b) => {
        const aMatch = (a.cohort_requirements || []).some(r => r.cohort === activeCohortFilter) ? 0 : 1;
        const bMatch = (b.cohort_requirements || []).some(r => r.cohort === activeCohortFilter) ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    // Readiness filter
    if (readinessFilter !== 'all') {
      result = result.filter(l => {
        const { readiness } = computeReadiness(l, userScoresMap);
        return readiness === readinessFilter;
      });
    }

    return result;
  }, [listings, search, activeCohortFilter, readinessFilter, userScoresMap]);

  // Stats
  const stats = useMemo(() => {
    let ready = 0, almost = 0, gap = 0;
    for (const l of listings) {
      const { readiness } = computeReadiness(l, userScoresMap);
      if (readiness === 'ready') ready++;
      else if (readiness === 'almost') almost++;
      else gap++;
    }
    return { ready, almost, gap, total: listings.length };
  }, [listings, userScoresMap]);

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COBALT} />
        <Text style={s.loadingText}>Finding jobs for you...</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Jobs for You</Text>
        <Text style={s.headerSub}>{stats.total} opportunities</Text>
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={colors.t3} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by title or company"
            placeholderTextColor={colors.t3}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <AnimatedPressable onPress={() => setSearch('')} scaleDown={0.9} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.t3} />
            </AnimatedPressable>
          )}
        </View>
      </View>

      {/* Cohort filter pills */}
      {cohortScores.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }} contentContainerStyle={s.filterRow}>
          <AnimatedPressable
            style={[s.filterPill, !activeCohortFilter && s.filterPillActive]}
            onPress={() => setActiveCohortFilter(null)}
            scaleDown={0.95}
          >
            <Text style={[s.filterPillText, !activeCohortFilter && s.filterPillTextActive]}>All</Text>
          </AnimatedPressable>
          {cohortScores.map(c => (
            <AnimatedPressable
              key={c.cohort_id}
              style={[s.filterPill, activeCohortFilter === c.cohort_id && s.filterPillActive]}
              onPress={() => setActiveCohortFilter(activeCohortFilter === c.cohort_id ? null : c.cohort_id)}
              scaleDown={0.95}
            >
              <Text style={[s.filterPillText, activeCohortFilter === c.cohort_id && s.filterPillTextActive]} numberOfLines={1}>
                {c.display_name.replace(/ & .*$/, '')}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      )}

      {/* Readiness + Type filter row */}
      <View style={s.tabRow}>
        {/* Type tabs */}
        {(['all', 'internship', 'entry_level'] as Tab[]).map(t => (
          <AnimatedPressable
            key={t}
            style={[s.tabPill, tab === t && s.tabPillActive]}
            onPress={() => { setTab(t); setLoading(true); }}
            scaleDown={0.95}
          >
            <Text style={[s.tabPillText, tab === t && s.tabPillTextActive]}>
              {t === 'all' ? 'All' : t === 'internship' ? 'Internships' : 'Entry Level'}
            </Text>
          </AnimatedPressable>
        ))}
        <View style={{ flex: 1 }} />
        {/* Readiness chips */}
        {stats.ready > 0 && (
          <AnimatedPressable
            style={[s.readyChip, readinessFilter === 'ready' && { backgroundColor: GREEN + '20' }]}
            onPress={() => setReadinessFilter(readinessFilter === 'ready' ? 'all' : 'ready')}
            scaleDown={0.95}
          >
            <View style={[s.readyDot, { backgroundColor: GREEN }]} />
            <Text style={[s.readyChipText, { color: GREEN }]}>{stats.ready}</Text>
          </AnimatedPressable>
        )}
      </View>

      {/* Job listings */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COBALT} />}
      >
        {filtered.length === 0 && !loading && (
          <FadeInView>
            <View style={s.emptyCard}>
              <Ionicons name="briefcase-outline" size={40} color={colors.t3} />
              <Text style={s.emptyTitle}>
                {cohortScores.length === 0
                  ? 'Add cohorts to see matching jobs'
                  : search.trim()
                  ? `No jobs matching "${search}"`
                  : 'No jobs found for this filter'}
              </Text>
              <Text style={s.emptySub}>
                {cohortScores.length === 0
                  ? 'Go to your Profile and add the fields you want to work in.'
                  : "We're adding more jobs daily. Try a different filter or check back soon."}
              </Text>
            </View>
          </FadeInView>
        )}

        {filtered.map((listing, i) => (
          <FadeInView key={listing.id || i} delay={Math.min(i * 40, 200)}>
            <JobCard
              listing={listing}
              userScores={userScoresMap}
              expanded={expandedId === listing.id}
              activeCohortId={activeCohortFilter}
              onToggle={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedId(expandedId === listing.id ? null : listing.id);
              }}
            />
          </FadeInView>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingText: { fontSize: 14, color: colors.t2, marginTop: 12 },

  // Header
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 2 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.t1, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: colors.t3, marginTop: 2 },

  // Search
  searchRow: { paddingHorizontal: spacing.lg, paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.t1, padding: 0 },

  // Filter pills — compact rounded rectangles, not pills
  filterRow: { paddingHorizontal: spacing.lg, gap: 6, paddingBottom: 4, height: 32 },
  filterPill: {
    paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
    height: 28, justifyContent: 'center' as const,
  },
  filterPillActive: { backgroundColor: COBALT, borderColor: COBALT },
  filterPillText: { fontSize: 11, fontWeight: '600', color: colors.t2 },
  filterPillTextActive: { color: '#fff' },

  // Tab row
  tabRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  tabPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  tabPillActive: { backgroundColor: colors.t1, borderColor: colors.t1 },
  tabPillText: { fontSize: 11, fontWeight: '600', color: colors.t3 },
  tabPillTextActive: { color: colors.bg },
  readyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  readyDot: { width: 6, height: 6, borderRadius: 3 },
  readyChipText: { fontSize: 11, fontWeight: '700' },

  // List
  listContent: { paddingHorizontal: spacing.lg, gap: 8, paddingTop: 2 },

  // Job Card
  jobCard: {
    flexDirection: 'row', borderRadius: radius.lg,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
    overflow: 'hidden',
  },
  jobAccent: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  jobContent: { flex: 1, padding: spacing.md, gap: 8 },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: colors.t1, lineHeight: 20 },
  jobCompany: { fontSize: 13, color: colors.t2, marginTop: 2 },
  readinessBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  readinessDot: { width: 6, height: 6, borderRadius: 3 },
  readinessText: { fontSize: 11, fontWeight: '700' },

  // Meta
  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: colors.s3, borderWidth: 1, borderColor: colors.b1,
  },
  metaText: { fontSize: 10, color: colors.t3, fontWeight: '500' },
  metaDate: { fontSize: 10, color: colors.t3 },

  // Cohort match pills
  cohortMatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cohortMatchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  cohortMatchText: { fontSize: 10, fontWeight: '600' },

  // Expanded section
  expandedSection: { gap: 12, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.b1 },
  cohortScoreBlock: { gap: 6, marginBottom: 8 },
  cohortScoreLabel: { fontSize: 11, fontWeight: '700', color: colors.t2, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Score bars
  scoreBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 20 },
  scoreBarLabel: { width: 14, fontSize: 11, fontWeight: '700', color: colors.t3, textAlign: 'center' },
  scoreBarTrack: {
    flex: 1, height: 6, backgroundColor: colors.s3, borderRadius: 3,
    overflow: 'hidden', position: 'relative',
  },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  scoreBarReq: { position: 'absolute', top: -2, width: 2, height: 10, backgroundColor: colors.t1, borderRadius: 1 },
  scoreBarNum: { width: 24, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  scoreBarSlash: { fontSize: 10, color: colors.t3 },
  scoreBarReqNum: { width: 24, fontSize: 11, color: colors.t3 },

  // Description
  descPreview: { fontSize: 12, color: colors.t2, lineHeight: 17 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  applyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: radius.xl, backgroundColor: COBALT,
  },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  dillyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: radius.xl,
    backgroundColor: COBALT + '10', borderWidth: 1, borderColor: COBALT + '25',
  },
  dillyBtnText: { fontSize: 13, fontWeight: '600', color: COBALT },
  tailorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.xl,
    backgroundColor: colors.s3, borderWidth: 1, borderColor: colors.b1,
  },
  tailorBtnText: { fontSize: 12, fontWeight: '600', color: colors.t2 },

  // Empty state
  emptyCard: {
    alignItems: 'center', padding: 24, gap: 10, marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.t1, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.t2, textAlign: 'center', lineHeight: 19 },
});
