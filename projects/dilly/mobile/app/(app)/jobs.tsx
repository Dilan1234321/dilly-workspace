/**
 * Jobs Page -- fit narrative driven job matching.
 *
 * Build 89: Removed all S/G/B scoring. Jobs now show a fit narrative
 * (strengths, gaps, action steps) fetched on-demand when expanded.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Linking, RefreshControl, LayoutAnimation, Animated, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import DillyFooter from '../../components/DillyFooter';
import InlineToastView, { useInlineToast } from '../../components/InlineToast';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

const COBALT = '#1652F0';
const GREEN  = '#34C759';
const AMBER  = '#FF9F0A';
const CORAL  = '#FF453A';
const BLUE   = '#0A84FF';

// -- Types ------------------------------------------------------------------

interface Listing {
  id: string;
  title: string;
  company: string;
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
  cohort_requirements?: { cohort: string }[] | null;
  quality_score?: number;
  rank_score?: number;
  quick_glance?: string[];
  company_logo?: string | null;
}

interface FitNarrativeData {
  what_you_have: string;
  whats_missing: string;
  what_to_do: string;
  fit_color: 'green' | 'amber' | 'red';
}

type Tab = 'all' | 'internship' | 'entry_level' | 'full_time' | 'part_time' | 'other';

// -- Helpers ----------------------------------------------------------------

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

function fitColorHex(c?: string): string {
  if (c === 'green') return GREEN;
  if (c === 'amber') return AMBER;
  if (c === 'red') return CORAL;
  return GREEN;
}

// -- Skeleton Pulse Lines ---------------------------------------------------

function SkeletonLines() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={s.narrativeWrap}>
      {[0.9, 0.75, 0.6].map((widthFrac, i) => (
        <Animated.View
          key={i}
          style={[s.skeletonLine, { opacity, width: `${widthFrac * 100}%` }]}
        />
      ))}
    </View>
  );
}

// -- Fit Narrative Component ------------------------------------------------

function FitNarrative({ listing }: { listing: Listing }) {
  const [data, setData] = useState<FitNarrativeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      try {
        const res = await dilly.fetch('/jobs/fit-narrative', {
          method: 'POST',
          body: JSON.stringify({ job_id: listing.id }),
        });
        if (!res.ok) {
          if (res.status === 403) throw { status: 403 };
          throw new Error(`Server error ${res.status}`);
        }
        const json = await res.json();
        setData(json);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      } catch (e: any) {
        if (e?.status === 403 || e?.message?.includes('403')) {
          setError("You've used all your fit assessments this month.");
        } else {
          setError('Could not load fit narrative.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [listing.id, fadeAnim]);

  if (loading) return <SkeletonLines />;

  if (error) {
    return (
      <View style={s.narrativeWrap}>
        <Text style={[s.narrativeText, { color: colors.t3 }]}>{error}</Text>
      </View>
    );
  }

  if (!data) return null;

  const sections: { label: string; text: string; color: string }[] = [
    { label: 'WHAT YOU HAVE', text: data.what_you_have, color: GREEN },
    { label: "WHAT'S MISSING", text: data.whats_missing, color: data.whats_missing.toLowerCase().startsWith('nothing major') ? GREEN : AMBER },
    { label: 'WHAT TO DO', text: data.what_to_do, color: BLUE },
  ];

  return (
    <Animated.View style={[s.narrativeWrap, { opacity: fadeAnim }]}>
      {sections.map((sec, i) => (
        <View key={i} style={s.narrativeSection}>
          <Text style={[s.narrativeLabel, { color: sec.color }]}>{sec.label}</Text>
          <Text style={s.narrativeText}>{sec.text}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

// -- Job Card Component -----------------------------------------------------

function JobCard({ listing, expanded, onToggle, tailoredResumeId, narrativeCache, onNarrativeLoaded }: {
  listing: Listing;
  expanded: boolean;
  onToggle: () => void;
  tailoredResumeId?: string | null;
  narrativeCache?: FitNarrativeData | null;
  onNarrativeLoaded?: (jobId: string, data: FitNarrativeData) => void;
}) {
  const toast = useInlineToast();
  const [showFullDesc, setShowFullDesc] = useState(false);

  const loc = listing.location || [listing.location_city, listing.location_state].filter(Boolean).join(', ');
  const applyUrl = listing.apply_url || listing.url || '';
  const desc = listing.description || listing.description_preview || '';

  async function handleApply() {
    try {
      await dilly.post('/v2/internships/save', { internship_id: listing.id });
    } catch {}
    try {
      await dilly.fetch('/applications', {
        method: 'POST',
        body: JSON.stringify({
          company: listing.company,
          role: listing.title,
          status: 'applied',
          job_id: listing.id,
          job_url: applyUrl || listing.url || '',
          applied_at: new Date().toISOString().slice(0, 10),
          notes: `Applied via ${listing.source || 'Dilly'}. ${loc}`.trim(),
        }),
      });
      toast.show({ message: `${listing.company} added to your tracker!`, type: 'success' });
    } catch {
      toast.show({ message: 'Applied but could not save to tracker.' });
    }
    if (applyUrl) {
      Linking.openURL(applyUrl).catch(() => {
        toast.show({ message: 'Could not open link.' });
      });
    }
  }

  function handleAskDilly() {
    openDillyOverlay({
      isPaid: true,
      initialMessage: `I'm looking at the ${listing.title} role at ${listing.company}. Can you help me understand how well I fit and what I should work on to be competitive for this role?`,
    });
  }

  const dotColor = narrativeCache ? fitColorHex(narrativeCache.fit_color) : null;

  return (
    <>
    <AnimatedPressable style={s.jobCard} onPress={onToggle} scaleDown={0.985}>
      <View style={s.jobContent}>
        {/* Header */}
        <View style={s.jobHeader}>
          {listing.company_logo ? (
            <Image source={{ uri: listing.company_logo }} style={s.companyLogo} />
          ) : (
            <View style={s.companyLogoPlaceholder}>
              <Text style={s.companyLogoInitial}>{listing.company?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.jobTitle} numberOfLines={2}>{listing.title}</Text>
            <Text style={s.jobCompany}>{listing.company}</Text>
          </View>
          {dotColor && <View style={[s.fitDot, { backgroundColor: dotColor }]} />}
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
          {listing.work_mode ? (
            <View style={s.metaPill}>
              <Ionicons name="wifi-outline" size={10} color={colors.t3} />
              <Text style={s.metaText}>{listing.work_mode}</Text>
            </View>
          ) : null}
          {listing.posted_date ? (
            <Text style={s.metaDate}>{daysAgo(listing.posted_date)}</Text>
          ) : null}
        </View>

        {/* Expanded: Narrative + Quick Glance + Actions */}
        {expanded && (
          <View style={s.expandedSection}>
            {/* Fit Narrative */}
            <FitNarrative listing={listing} />

            {/* Quick Glance bullets */}
            {listing.quick_glance && listing.quick_glance.length > 0 && (
              <View style={s.quickGlance}>
                <Text style={s.quickGlanceLabel}>QUICK GLANCE</Text>
                {listing.quick_glance.map((b, i) => (
                  <View key={i} style={s.quickGlanceBullet}>
                    <View style={s.quickGlanceDot} />
                    <Text style={s.quickGlanceText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Full description (collapsible) */}
            {desc ? (
              <AnimatedPressable
                style={s.descToggle}
                onPress={() => setShowFullDesc(prev => !prev)}
                scaleDown={0.98}
              >
                <Ionicons name={showFullDesc ? 'chevron-up' : 'document-text-outline'} size={13} color={colors.t3} />
                <Text style={s.descToggleText}>{showFullDesc ? 'Hide description' : 'Full description'}</Text>
              </AnimatedPressable>
            ) : null}
            {showFullDesc && desc ? (
              <Text style={s.descFull}>{desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}</Text>
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
                    fresh: '1',
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
    <InlineToastView {...toast.props} />
    </>
  );
}

// -- Main Screen ------------------------------------------------------------

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userCities, setUserCities] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [tailoredResumes, setTailoredResumes] = useState<{ id: string; job_title: string; company: string }[]>([]);
  const [narrativeCache, setNarrativeCache] = useState<Record<string, FitNarrativeData>>({});

  const handleNarrativeLoaded = useCallback((jobId: string, data: FitNarrativeData) => {
    setNarrativeCache(prev => ({ ...prev, [jobId]: data }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, feedRes, resumesRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get(`/v2/internships/feed?tab=${tab}&limit=50&sort=rank`).catch(() => null),
        dilly.get('/generated-resumes').catch(() => null),
      ]);
      setTailoredResumes(Array.isArray(resumesRes) ? resumesRes : resumesRes?.resumes || []);

      // Load user's preferred cities for location filtering
      const cities: string[] = profileRes?.job_locations || [];
      setUserCities(cities);
      setSelectedCities(cities);

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

  // Filter listings by search and city
  const filtered = useMemo(() => {
    let result = listings;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) || l.company.toLowerCase().includes(q)
      );
    }

    // City filter (multi-select)
    if (selectedCities.length > 0) {
      // Strip ", ST" state suffix so "San Francisco, CA" matches location_city "San Francisco"
      const cityLower = selectedCities.map(c =>
        c.toLowerCase().trim().replace(/,\s*[a-z]{2}$/, '').trim()
      );
      result = result.filter(l => {
        const loc = (l.location || l.location_city || '').toLowerCase();
        const mode = (l.work_mode || '').toLowerCase();
        if (mode === 'remote' || loc.includes('remote')) return true;
        return cityLower.some(c => loc.includes(c) || c.includes(loc));
      });
    }

    return result;
  }, [listings, search, selectedCities]);

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
        <Text style={s.headerTitle}>Your Matches</Text>
        <Text style={s.headerSub}>Matched to your profile. Tap to see your fit.</Text>
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

      {/* Filters: type + city in one row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40, flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
        {/* Job type pills */}
        {([
          { key: 'all', label: 'All' },
          { key: 'internship', label: 'Internships' },
          { key: 'entry_level', label: 'Entry Level' },
          { key: 'full_time', label: 'Full Time' },
          { key: 'part_time', label: 'Part Time' },
        ] as { key: Tab; label: string }[]).map(t => (
          <AnimatedPressable
            key={t.key}
            style={[s.filterPill, tab === t.key && s.filterPillActive]}
            onPress={() => { setTab(t.key); setLoading(true); }}
            scaleDown={0.95}
          >
            <Text style={[s.filterPillText, tab === t.key && s.filterPillTextActive]}>{t.label}</Text>
          </AnimatedPressable>
        ))}

        {/* Divider */}
        {userCities.length > 0 && <View style={{ width: 1, backgroundColor: colors.b1, marginHorizontal: 2 }} />}

        {/* City pills */}
        {userCities.map(city => {
          const active = selectedCities.includes(city);
          return (
            <AnimatedPressable
              key={city}
              style={[s.filterPill, active && s.filterPillActive]}
              onPress={() => setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city])}
              scaleDown={0.95}
            >
              <Text style={[s.filterPillText, active && s.filterPillTextActive]}>{city.replace(/,\s*\w{2}$/, '')}</Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

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
                {search.trim()
                  ? `No jobs matching "${search}"`
                  : 'No jobs found for this filter'}
              </Text>
              <Text style={s.emptySub}>
                We are adding more jobs daily. Try a different filter or check back soon.
              </Text>
            </View>
          </FadeInView>
        )}

        {filtered.map((listing, i) => (
          <FadeInView key={listing.id || i} delay={Math.min(i * 40, 200)}>
            <JobCard
              listing={listing}
              expanded={expandedId === listing.id}
              narrativeCache={narrativeCache[listing.id] || null}
              onNarrativeLoaded={handleNarrativeLoaded}
              tailoredResumeId={
                tailoredResumes.find(r =>
                  r.company?.toLowerCase() === listing.company?.toLowerCase()
                  && r.job_title?.toLowerCase() === listing.title?.toLowerCase()
                )?.id || null
              }
              onToggle={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedId(expandedId === listing.id ? null : listing.id);
              }}
            />
          </FadeInView>
        ))}
        <DillyFooter />
      </ScrollView>
    </View>
  );
}

// -- Styles -----------------------------------------------------------------

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

  // Filter pills (unified for job type + city)
  filterPill: {
    paddingHorizontal: 10, height: 28, justifyContent: 'center', borderRadius: 14,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  filterPillActive: { backgroundColor: colors.t1, borderColor: colors.t1 },
  filterPillText: { fontSize: 11, fontWeight: '600', color: colors.t2 },
  filterPillTextActive: { color: '#fff' },

  // List
  listContent: { paddingHorizontal: spacing.lg, gap: 8, paddingTop: 2 },

  // Job Card
  jobCard: {
    flexDirection: 'row', borderRadius: radius.lg,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
    overflow: 'hidden',
  },
  jobContent: { flex: 1, padding: spacing.md, gap: 8 },
  companyLogo: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.s2 },
  companyLogoPlaceholder: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' },
  companyLogoInitial: { fontSize: 16, fontWeight: '700', color: colors.t3 },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: colors.t1, lineHeight: 20 },
  jobCompany: { fontSize: 13, color: colors.t2, marginTop: 2 },

  // Fit dot
  fitDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },

  // Meta
  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: colors.s3, borderWidth: 1, borderColor: colors.b1,
  },
  metaText: { fontSize: 10, color: colors.t3, fontWeight: '500' },
  metaDate: { fontSize: 10, color: colors.t3 },

  // Expanded section
  expandedSection: { gap: 12, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.b1 },

  // Fit Narrative
  narrativeWrap: { padding: 12, gap: 12 },
  narrativeSection: { gap: 4 },
  narrativeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  narrativeText: { fontSize: 13, color: colors.t1, lineHeight: 19 },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.s3 },

  // Quick Glance
  quickGlance: { gap: 6, marginTop: 4 },
  quickGlanceLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: colors.t3, marginBottom: 2 },
  quickGlanceBullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  quickGlanceDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COBALT, marginTop: 5 },
  quickGlanceText: { flex: 1, fontSize: 12, color: colors.t1, lineHeight: 17 },

  // Description
  descToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  descToggleText: { fontSize: 11, color: colors.t3, fontWeight: '500' },
  descFull: { fontSize: 12, color: colors.t2, lineHeight: 18 },

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
