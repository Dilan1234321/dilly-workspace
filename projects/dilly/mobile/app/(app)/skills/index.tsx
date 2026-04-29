/**
 * Dilly Skills - in-app home (build 401).
 *
 * Skills is a full in-app surface that mirrors everything
 * skills.hellodilly.com does: browse cohorts, ask a question, watch
 * videos, save to a library. The web version exists for desktop; on
 * mobile, Skills IS the app (two sides of the same coin).
 *
 * Header intent:
 *   Big Dilly logo (DillyFace, theme-accent) + "Skills" wordmark at
 *   the same size - reads as a co-branded product line. No back
 *   button; Skills is a destination, not a modal.
 *
 * Tabs:
 *   - Ask: /skills/ask - natural language search
 *   - Library: /skills/library - saved videos
 *   - Trending: /skills/trending - hot picks across all cohorts
 *   Browse 22 cohort cards (real backend slugs). Tap → cohort page.
 *
 * Data: none on this screen. Cohort list is static. Heavy data lives
 * on the cohort detail page.
 *
 * Feature flag: SKILLS_RECOMMENDED_FIRST_ENABLED
 *   OFF (default) → LibraryLanding  - the original 22-cohort grid
 *   ON            → FeedLanding     - personalised hero + queue + cohort
 *                                     strip, with full library behind a
 *                                     "Browse full library" modal at bottom
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Modal, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useResolvedTheme } from '../../../hooks/useTheme';
import { DillyFace } from '../../../components/DillyFace';
import { FirstVisitCoach } from '../../../components/FirstVisitCoach';
import { dilly } from '../../../lib/dilly';
import { SKILLS_RECOMMENDED_FIRST_ENABLED, SKILLS_PERSONA_AWARE } from '../../../lib/featureFlags';
import { getAppMode, type AppMode } from '../../../lib/appMode';
import { CertificationsSection } from '../../../components/skills/CertificationsSection';

/** 22 backend cohort slugs - must stay in sync with
 *  projects/dilly/api/routers/skill_lab.py `_SLUG_TO_COHORT`.
 *  Hints are the brand-voice taglines, not marketing. */
interface Cohort { slug: string; label: string; hint: string; icon: any; }

const COHORTS: Cohort[] = [
  { slug: 'software-engineering-cs',          label: 'Software Engineering & CS',     hint: 'Languages, systems, algorithms, shipping.',         icon: 'code-slash' },
  { slug: 'data-science-analytics',           label: 'Data Science & Analytics',      hint: 'Stats, ML, SQL, and asking the right question.',    icon: 'stats-chart' },
  { slug: 'cybersecurity-it',                 label: 'Cybersecurity & IT',            hint: 'Threats, hardening, networking, response.',         icon: 'shield-checkmark' },
  { slug: 'electrical-computer-engineering',  label: 'Electrical & Computer Eng',     hint: 'Circuits, signals, embedded, the metal layer.',     icon: 'hardware-chip' },
  { slug: 'mechanical-aerospace-engineering', label: 'Mechanical & Aerospace Eng',    hint: 'Solids, fluids, thermo, the discipline of flight.', icon: 'airplane' },
  { slug: 'civil-environmental-engineering',  label: 'Civil & Environmental Eng',     hint: 'Structures, water, transport, the built world.',    icon: 'business' },
  { slug: 'chemical-biomedical-engineering',  label: 'Chemical & Biomedical Eng',     hint: 'Reactions, unit ops, devices, life sciences.',      icon: 'flask' },
  { slug: 'finance-accounting',               label: 'Finance & Accounting',          hint: 'Modeling, valuation, audit, financial reasoning.',  icon: 'cash' },
  { slug: 'consulting-strategy',              label: 'Consulting & Strategy',         hint: 'Structure, synthesis, winning the whiteboard.',     icon: 'analytics' },
  { slug: 'marketing-advertising',            label: 'Marketing & Advertising',       hint: 'Brand, performance, content, demand.',              icon: 'megaphone' },
  { slug: 'management-operations',            label: 'Management & Operations',       hint: 'Teams, process, execution, the operating cadence.', icon: 'people' },
  { slug: 'entrepreneurship-innovation',      label: 'Entrepreneurship & Innovation', hint: 'Building from zero - product, capital, velocity.',  icon: 'rocket' },
  { slug: 'economics-public-policy',          label: 'Economics & Public Policy',     hint: 'Markets, incentives, institutions, evidence.',      icon: 'trending-up' },
  { slug: 'healthcare-clinical',              label: 'Healthcare & Clinical',         hint: 'Anatomy, clinical reasoning, the MCAT bar.',        icon: 'medkit' },
  { slug: 'biotech-pharmaceutical',           label: 'Biotech & Pharmaceutical',      hint: 'Molecules, pathways, trials, regulation.',          icon: 'fitness' },
  { slug: 'life-sciences-research',           label: 'Life Sciences & Research',      hint: 'From bench to insight - biology and the paper.',    icon: 'leaf' },
  { slug: 'physical-sciences-math',           label: 'Physical Sciences & Math',      hint: 'Physics, chemistry, the math that underwrites it.', icon: 'infinite' },
  { slug: 'law-government',                   label: 'Law & Government',              hint: 'Cases, briefs, process, institutional craft.',      icon: 'hammer' },
  { slug: 'media-communications',             label: 'Media & Communications',        hint: 'Narrative, reporting, the honest sentence.',        icon: 'newspaper' },
  { slug: 'design-creative-arts',             label: 'Design & Creative Arts',        hint: 'Systems, type, motion, taste as output.',           icon: 'color-palette' },
  { slug: 'education-human-development',      label: 'Education & Human Development', hint: 'Pedagogy, lesson design, the classroom craft.',     icon: 'school' },
  { slug: 'social-sciences-nonprofit',        label: 'Social Sciences & Nonprofit',   hint: 'People, institutions, mission-driven work.',        icon: 'heart-circle' },
];

// ─── Feed types ───────────────────────────────────────────────────────────────

interface FeedVideo {
  id: string;
  title: string;
  duration_sec: number;
  thumbnail_url: string;
  cohort: string;
  quality_score: number;
  reason?: string;
}

interface FeedData {
  hero: FeedVideo | null;
  queue: FeedVideo[];
  cohort_slug: string | null;
  user_cohort: string | null;
  cohort_preview: FeedVideo[];
}

// ─── Shared helper ────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Persona copy - subhead / section label / empty state per AppMode ────────

// Subhead copy is the page's "this is yours" signal. The user told
// Dilly about their cohort, their target role, the jobs they applied
// to - and Skills should read like a result of that, not a generic
// library. Each subhead names the inputs Dilly used so the page feels
// alive and tied to the rest of the app.
const PERSONA_COPY: Record<AppMode, { subhead: string; sectionLabel: string; emptyState: string }> = {
  student: {
    subhead: 'Picked for you from your major, target jobs, and what your cohort is hiring for right now.',
    sectionLabel: 'YOUR STUDENT SKILL LAB',
    emptyState: "No picks yet - add your major and graduation year to unlock your skill queue.",
  },
  seeker: {
    subhead: 'Picked for you from your target role, the jobs you saved, and the skill gaps Dilly noticed in your profile.',
    sectionLabel: 'YOUR JOB SEARCH SKILL LAB',
    emptyState: "No picks yet - complete your target role to unlock tailored recommendations.",
  },
  holder: {
    subhead: 'Picked for you from your current role, where your field is heading, and the moves your AI Arena flagged.',
    sectionLabel: 'YOUR CAREER SKILL LAB',
    emptyState: "No picks yet - add your current role and growth goals to see what to learn.",
  },
};

const GENERIC_COPY = {
  subhead: "Picked for you from your profile and what your cohort is hiring for.",
  sectionLabel: 'YOUR SKILL LAB TODAY',
  emptyState: 'No recommendations yet. Finish setting up your profile and check back.',
};

// ─── Root export - thin flag gate, no hooks ───────────────────────────────────

export default function SkillsHomeScreen() {
  if (SKILLS_RECOMMENDED_FIRST_ENABLED) return <FeedLanding />;
  return <LibraryLanding />;
}

// ─── LibraryLanding - original 22-cohort grid (unchanged logic) ───────────────

function LibraryLanding() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();

  const goCohort = useCallback((slug: string) => {
    router.push(`/skills/cohort/${slug}`);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 120 }}
    >
      {/* Big co-branded header: DillyFace + "Skills" at the same size.
          No back button - Skills is a destination. */}
      <View style={styles.header}>
        <DillyFace size={44} mood="happy" accessory="none" eyeBoost={1.5} />
        <Text style={[styles.wordmark, { color: theme.surface.t1 }]}>Skills</Text>
      </View>

      <Text style={[styles.intro, { color: theme.surface.t2 }]}>
        Human-curated 15-min videos. No clickbait. Pick a cohort, ask for what
        you need, or open your library.
      </Text>

      {/* Ask / Library / Trending row - the three ways in. */}
      <View style={styles.pillsRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/skills/ask')}
          style={[styles.askPill, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="sparkles" size={15} color="#FFF" />
          <Text style={styles.askPillText}>Ask for what you need</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.pillsRow, { marginTop: 10 }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/skills/library')}
          style={[styles.subPill, { borderColor: theme.accentBorder }]}
        >
          <Ionicons name="bookmark" size={15} color={theme.accent} />
          <Text style={[styles.subPillText, { color: theme.surface.t1 }]}>Your library</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/skills/trending')}
          style={[styles.subPill, { borderColor: theme.accentBorder }]}
        >
          <Ionicons name="flame" size={15} color={theme.accent} />
          <Text style={[styles.subPillText, { color: theme.surface.t1 }]}>Trending</Text>
        </TouchableOpacity>
      </View>
      {/* Public learning profile entry point. Same tier as the
          career public profile - the user can control visibility of
          their learning receipt directly from Skills. */}
      <View style={[styles.pillsRow, { marginTop: 10 }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/skills/profile-settings')}
          style={[styles.subPill, { borderColor: theme.accentBorder, flex: 1 }]}
        >
          <Ionicons name="person-circle" size={15} color={theme.accent} />
          <Text style={[styles.subPillText, { color: theme.surface.t1 }]}>Public learning profile</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.surface.t3, marginTop: 28 }]}>BY COHORT</Text>
      <View style={styles.grid}>
        {COHORTS.map(c => (
          <TouchableOpacity
            key={c.slug}
            activeOpacity={0.85}
            onPress={() => goCohort(c.slug)}
            style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
          >
            <Ionicons name={c.icon} size={22} color={theme.accent} />
            <Text style={[styles.cardTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{c.label}</Text>
            <Text style={[styles.cardHint, { color: theme.surface.t3 }]} numberOfLines={2}>{c.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.footer, { color: theme.surface.t3 }]}>
        Save what helps, revisit when you want, build a receipt of what you've learned.
      </Text>

      {/* First-visit intro. Fires once per install; dismiss persists
          in AsyncStorage so it never annoys a returning user. */}
      <FirstVisitCoach
        id="skills_home_v1"
        iconName="sparkles"
        headline="Dilly Skills is your library"
        subline="Curated 15-min videos. Pick a cohort, ask for what you need, or open your library."
      />
    </ScrollView>
  );
}

// ─── FeedLanding - recommendation-first surface ───────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const COHORT_CARD_W = SCREEN_W * 0.44;

function FeedLanding() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('student');

  const copy = SKILLS_PERSONA_AWARE ? PERSONA_COPY[appMode] : GENERIC_COPY;

  useEffect(() => {
    try {
      const { donateActivity, ACTIVITY_SKILLS } = require('../../../lib/siriDonations');
      donateActivity?.(ACTIVITY_SKILLS);
    } catch {}
    // Minimum 3.5s loading dwell so the DillyFace + "Picking what to
    // learn next" copy actually registers. Real fetches usually
    // complete in <500ms, which made the loading state flash through
    // and feel like nothing was thinking.
    const minLoadingMs = 3500;
    const startedAt = Date.now();
    (dilly as any).get('/skill-lab/feed')
      .then((data: FeedData) => {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, minLoadingMs - elapsed);
        setTimeout(() => {
          setFeed(data);
          try {
            const { indexSkills } = require('../../../lib/spotlight');
            const items: any[] = [];
            if (data?.hero) items.push({ id: String(data.hero.id), title: data.hero.title || 'Skill' });
            (data?.queue || []).forEach((v: any) => items.push({ id: String(v.id), title: v.title || 'Skill' }));
            if (items.length) indexSkills?.(items);
          } catch {}
          setLoading(false);
        }, wait);
      })
      .catch(() => {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, minLoadingMs - elapsed);
        setTimeout(() => {
          setFeed({ hero: null, queue: [], cohort_slug: null, user_cohort: null, cohort_preview: [] });
          setLoading(false);
        }, wait);
      });

    (dilly as any).get('/profile')
      .then((profile: any) => setAppMode(getAppMode(profile)))
      .catch(() => {});
  }, []);

  // Loading screen renders WITHOUT the page header so the user sees a
  // clean "Dilly is picking" moment instead of double-stacking the
  // "Skills" wordmark on top of the loading face. Header reappears
  // once the feed lands.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface.bg, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <DillyFace size={88} mood="curious" accessory="glasses" />
        <Text style={{ marginTop: 16, fontSize: 13, fontWeight: '600', color: theme.surface.t2, letterSpacing: 0.3 }}>
          Picking what to learn next…
        </Text>
        <Text style={{ marginTop: 4, fontSize: 11, color: theme.surface.t3, textAlign: 'center', maxWidth: 260, lineHeight: 16 }}>
          Dilly is reading your profile and matching skills tuned to your trajectory.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.surface.bg }}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header - same co-brand as LibraryLanding */}
        <View style={styles.header}>
          <DillyFace size={44} mood="happy" accessory="none" />
          <Text style={[styles.wordmark, { color: theme.surface.t1 }]}>Skills</Text>
        </View>

        {/* Certifications entry — pinned to the top of Skills so the
            full searchable library is one tap away. Browse, search,
            filter, save, mark complete. */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/(app)/certifications' as any)}
          style={{
            marginHorizontal: 0,
            marginBottom: 14,
            backgroundColor: theme.accent,
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            shadowColor: theme.accent,
            shadowOpacity: 0.18,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <View style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: '#FFFFFF22',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="ribbon" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 }}>
              Browse certifications
            </Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFCC', marginTop: 1 }}>
              Search, filter, save the ones recruiters in your field actually look for.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#FFFFFFCC" />
        </TouchableOpacity>

        <Text style={[feedStyles.subhead, { color: theme.surface.t2 }]}>{copy.subhead}</Text>

        {!feed?.hero ? (
          <View style={feedStyles.emptyWrap}>
            <Text style={[feedStyles.emptyText, { color: theme.surface.t2 }]}>
              {copy.emptyState}
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setBrowseOpen(true)}
              style={[feedStyles.browseBtn, { borderColor: theme.accentBorder }]}
            >
              <Ionicons name="grid-outline" size={16} color={theme.accent} />
              <Text style={[feedStyles.browseBtnText, { color: theme.surface.t1 }]}>Browse full library</Text>
              <Ionicons name="chevron-forward" size={13} color={theme.surface.t3} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Hero card ── */}
            <Text style={[styles.sectionTitle, { color: theme.surface.t3, marginTop: 6 }]}>{copy.sectionLabel}</Text>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[feedStyles.heroCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
              onPress={() => router.push(`/skills/video/${feed.hero!.id}`)}
            >
              <Image
                source={{ uri: feed.hero.thumbnail_url }}
                style={feedStyles.heroBanner}
                resizeMode="cover"
              />
              <View style={feedStyles.heroBody}>
                <Text style={[feedStyles.heroTitle, { color: theme.surface.t1 }]} numberOfLines={2}>
                  {feed.hero.title}
                </Text>
                <View style={feedStyles.heroMeta}>
                  <View style={[feedStyles.durationChip, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[feedStyles.durationText, { color: theme.accent }]}>
                      {fmtDuration(feed.hero.duration_sec)}
                    </Text>
                  </View>
                  {feed.hero.reason ? (
                    <Text
                      style={[feedStyles.reasonText, { color: theme.surface.t2 }]}
                      numberOfLines={1}
                    >
                      {feed.hero.reason}
                    </Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>

            {/* ── Up next queue ── */}
            {feed.queue.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.surface.t3, marginTop: 28 }]}>UP NEXT</Text>
                {feed.queue.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    activeOpacity={0.88}
                    style={[feedStyles.queueCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                    onPress={() => router.push(`/skills/video/${v.id}`)}
                  >
                    <Image
                      source={{ uri: v.thumbnail_url }}
                      style={feedStyles.queueThumb}
                      resizeMode="cover"
                    />
                    <View style={feedStyles.queueBody}>
                      <Text
                        style={[feedStyles.queueTitle, { color: theme.surface.t1 }]}
                        numberOfLines={2}
                      >
                        {v.title}
                      </Text>
                      {v.reason ? (
                        <Text
                          style={[feedStyles.queueReason, { color: theme.surface.t2 }]}
                          numberOfLines={1}
                        >
                          {v.reason}
                        </Text>
                      ) : null}
                      <Text style={[feedStyles.queueDuration, { color: theme.surface.t3 }]}>
                        {fmtDuration(v.duration_sec)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* ── Explore your cohort ── */}
            {feed.cohort_slug && feed.cohort_preview.length > 0 && (
              <>
                <View style={feedStyles.sectionRow}>
                  <Text style={[styles.sectionTitle, { color: theme.surface.t3 }]}>
                    EXPLORE YOUR COHORT
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push(`/skills/cohort/${feed.cohort_slug}`)}
                    hitSlop={8}
                  >
                    <Text style={[feedStyles.seeAll, { color: theme.accent }]}>See all</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={feedStyles.cohortRow}
                >
                  {feed.cohort_preview.slice(0, 8).map(v => (
                    <TouchableOpacity
                      key={v.id}
                      activeOpacity={0.88}
                      style={[feedStyles.cohortCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                      onPress={() => router.push(`/skills/video/${v.id}`)}
                    >
                      <Image
                        source={{ uri: v.thumbnail_url }}
                        style={feedStyles.cohortThumb}
                        resizeMode="cover"
                      />
                      <Text
                        style={[feedStyles.cohortTitle, { color: theme.surface.t1 }]}
                        numberOfLines={2}
                      >
                        {v.title}
                      </Text>
                      <Text style={[feedStyles.cohortDuration, { color: theme.surface.t3 }]}>
                        {fmtDuration(v.duration_sec)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── Browse full library ── */}
            <TouchableOpacity
              activeOpacity={0.88}
              style={[feedStyles.browseBtn, { borderColor: theme.accentBorder, marginTop: 32 }]}
              onPress={() => setBrowseOpen(true)}
            >
              <Ionicons name="grid-outline" size={16} color={theme.accent} />
              <Text style={[feedStyles.browseBtnText, { color: theme.surface.t1 }]}>Browse full library</Text>
              <Ionicons name="chevron-forward" size={13} color={theme.surface.t3} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Recommended Certifications ── */}
        {!loading && (
          <CertificationsSection
            cohortSlug={feed?.cohort_slug ?? null}
            appMode={appMode}
          />
        )}
      </ScrollView>

      {/* ── Full library modal - all 22 cohorts ── */}
      <Modal
        visible={browseOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setBrowseOpen(false)}
      >
        <View style={[feedStyles.modalRoot, { backgroundColor: theme.surface.bg }]}>
          <View style={[feedStyles.modalHeader, { borderBottomColor: theme.surface.border }]}>
            <Text style={[feedStyles.modalTitle, { color: theme.surface.t1 }]}>Full Library</Text>
            <TouchableOpacity onPress={() => setBrowseOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.surface.t2} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={feedStyles.modalContent}>
            <View style={styles.grid}>
              {COHORTS.map(c => (
                <TouchableOpacity
                  key={c.slug}
                  activeOpacity={0.85}
                  onPress={() => {
                    setBrowseOpen(false);
                    router.push(`/skills/cohort/${c.slug}`);
                  }}
                  style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                >
                  <Ionicons name={c.icon} size={22} color={theme.accent} />
                  <Text style={[styles.cardTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{c.label}</Text>
                  <Text style={[styles.cardHint, { color: theme.surface.t3 }]} numberOfLines={2}>{c.hint}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  wordmark: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.1,
    lineHeight: 48,
  },
  intro: {
    fontSize: 13,
    paddingHorizontal: 20,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 20,
  },

  pillsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },
  askPill: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  askPillText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  subPill: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  subPillText: { fontWeight: '800', fontSize: 13 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    marginBottom: 10,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    gap: 8,
  },
  card: {
    width: '48.5%',
    borderRadius: 13,
    borderWidth: 1,
    padding: 14,
    minHeight: 114,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', marginTop: 8, lineHeight: 17 },
  cardHint:  { fontSize: 11, fontWeight: '600', marginTop: 4, lineHeight: 15 },

  footer: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 32,
    lineHeight: 16,
  },
});

const feedStyles = StyleSheet.create({
  subhead: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginTop: 2,
    marginBottom: 16,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },

  // Hero card
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  heroBanner: {
    width: '100%',
    height: 190,
    backgroundColor: '#111',
  },
  heroBody: {
    padding: 14,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
    marginBottom: 10,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  durationChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },

  // Queue cards
  queueCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'hidden',
  },
  queueThumb: {
    width: 100,
    height: 68,
    backgroundColor: '#111',
  },
  queueBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
    marginBottom: 3,
  },
  queueReason: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
    marginBottom: 3,
  },
  queueDuration: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Cohort section
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
    marginTop: 28,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: '700',
  },
  cohortRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  cohortCard: {
    width: COHORT_CARD_W,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cohortThumb: {
    width: '100%',
    height: 88,
    backgroundColor: '#111',
  },
  cohortTitle: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    padding: 8,
    paddingBottom: 2,
  },
  cohortDuration: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },

  // Browse button
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 13,
    borderWidth: 1,
  },
  browseBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },

  // Library modal
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalContent: {
    paddingTop: 16,
    paddingBottom: 60,
  },
});
