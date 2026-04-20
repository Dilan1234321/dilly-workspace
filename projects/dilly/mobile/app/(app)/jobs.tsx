/**
 * Jobs Page. revolutionary, AI-first job discovery UI.
 *
 * Replaces the boring list with a layered, cinematic experience:
 *   1. "Dilly is scanning" live-activity pulse (convinces the user the AI is
 *      actively working on their behalf)
 *   2. Hero spotlight card for the top match (gradient aura, animated fit
 *      ring, plain-language "why this is #1 for you")
 *   3. Stacked bold cards with animated entrance, fit gauges, and "why this
 *      matched" chips right on the surface
 *   4. Dilly speech bubble on every card with a one-liner reasoning the
 *      match (pre-loaded narrative gets promoted to the front, no need to
 *      expand to see value)
 *   5. Single "Refine" sheet replaces filter sprawl
 *
 * This is the Jobs page Dilly actually deserves. It reflects Dilly's core
 * promise: not a job board, a career intelligence system.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Linking, RefreshControl, LayoutAnimation, Animated, Image, Modal,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Dimensions, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { DillyFace } from '../../components/DillyFace';
import DillyFooter from '../../components/DillyFooter';
import InlineToastView, { useInlineToast } from '../../components/InlineToast';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { useAppMode } from '../../hooks/useAppMode';
import { useSituationCopy } from '../../hooks/useSituationCopy';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useSubscription } from '../../hooks/useSubscription';
import { FirstVisitCoach } from '../../components/FirstVisitCoach';
import { openPaywall } from '../../hooks/usePaywall';
import { useCachedFetch, getCached } from '../../lib/sessionCache';

const COBALT = '#1652F0';
const GREEN  = '#34C759';
const AMBER  = '#FF9F0A';
const CORAL  = '#FF453A';
const BLUE   = '#0A84FF';
const VIOLET = '#6C5CE7';
const INK    = '#0E0E18';

const SCREEN_W = Dimensions.get('window').width;

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
  // Set by the server from the companies.website column. Much more
  // reliable than deriving a logo URL from the company name.
  company_website?: string | null;
}

interface FitNarrativeData {
  what_you_have: string;
  whats_missing: string;
  what_to_do: string;
  fit_color: 'green' | 'amber' | 'red';
}

type Tab = 'all' | 'internship' | 'entry_level' | 'full_time' | 'part_time' | 'other';

interface CollectionJob { job_id: string; title: string; company: string; url?: string; added_at?: string; }
interface Collection { id: string; name: string; jobs: CollectionJob[]; created_at?: string; updated_at?: string; }

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

/**
 * Build a best-effort logo URL. Priority order:
 *   1. Server-provided logo_url (most reliable. scraper captured it)
 *   2. Server-provided website → extract domain → Google favicon
 *   3. Guess from company name → domain → Google favicon (messiest fallback)
 *
 * Why Google favicon and not Clearbit: Clearbit deprecated their free
 * logo API in late 2024 and most derived URLs now 404. Google's s2
 * favicon service (https://www.google.com/s2/favicons?domain=X&sz=128)
 * is free, reliable, backfills for virtually every real domain, and
 * returns at most 128x128 which is plenty for our 28-48px icon slots.
 *
 * The <Image> falls back to an initial tile if the URL 404s, so a broken
 * guess just degrades to the placeholder. no crash, no broken image.
 */
function _domainToFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

function companyLogoUrl(
  companyName: string | undefined,
  serverLogoUrl: string | null | undefined,
  companyWebsite: string | null | undefined,
): string | null {
  // 1. Real logo URL from the server.
  if (serverLogoUrl) return serverLogoUrl;

  // 2. Real website → strip protocol + www + path → Google favicon.
  if (companyWebsite) {
    try {
      const cleaned = companyWebsite
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .split('?')[0];
      if (cleaned) return _domainToFaviconUrl(cleaned);
    } catch {}
  }

  // 3. Last-ditch guess from the company name.
  if (!companyName) return null;
  const slug = companyName
    .toLowerCase()
    .replace(/\binc\.?|\bllc\.?|\bco\.?|\bcorp\.?|\bltd\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  if (!slug) return null;
  return _domainToFaviconUrl(`${slug}.com`);
}

/** Company logo with graceful fallback. Tries the server-provided URL
 *  first, then derives from the company website (server-populated), then
 *  from the company name, then the initial-letter tile. */
function CompanyLogo({ companyName, logoUrl, companyWebsite, size, borderRadius, initialColor, initialBg, initialBorder }: {
  companyName: string | undefined;
  logoUrl: string | null | undefined;
  companyWebsite?: string | null | undefined;
  size: number;
  borderRadius?: number;
  initialColor?: string;
  initialBg?: string;
  initialBorder?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = companyLogoUrl(companyName, logoUrl, companyWebsite);
  const radius = borderRadius ?? Math.round(size / 5);
  const initial = (companyName?.[0] || '?').toUpperCase();
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.s2 }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: initialBg || VIOLET + '12',
      borderWidth: 1, borderColor: initialBorder || VIOLET + '25',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: Math.round(size * 0.42), fontWeight: '800', color: initialColor || VIOLET }}>{initial}</Text>
    </View>
  );
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

function FitNarrative({ listing, preloaded }: { listing: Listing; preloaded?: FitNarrativeData | null }) {
  const [data, setData] = useState<FitNarrativeData | null>(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(preloaded ? 1 : 0)).current;
  const fetched = useRef(!!preloaded);
  // Theme-aware colors so the narrative panel respects dark mode even
  // though module-level StyleSheet is frozen at light values.
  const theme = useResolvedTheme();

  // Free-tier check: /jobs/fit-narrative returns 402 for starter users.
  // Calling it on every job expansion fires the global paywall every
  // single tap — terrible UX. Instead we check the plan client-side
  // and render a marketing teaser without ever hitting the endpoint.
  const { isPaid, loading: subLoading } = useSubscription();

  useEffect(() => {
    // If a preloaded narrative was provided by the parent (warmed cache
    // on Jobs tab mount for the top 3 jobs), skip the fetch entirely -
    // the card expands with content already visible.
    if (preloaded) {
      setData(preloaded);
      setLoading(false);
      fetched.current = true;
      return;
    }
    // Free-tier short-circuit: never call the paid endpoint. Teaser
    // renders immediately, no network, no global paywall trigger.
    if (!subLoading && !isPaid) {
      setLoading(false);
      fetched.current = true;
      return;
    }
    if (fetched.current) return;
    // Wait for subscription state to resolve before firing so we
    // don't accidentally call the paid endpoint during the brief
    // loading window.
    if (subLoading) return;
    fetched.current = true;

    (async () => {
      try {
        const res = await dilly.fetch('/jobs/fit-narrative', {
          method: 'POST',
          body: JSON.stringify({ job_id: listing.id }),
        });
        if (!res.ok) {
          if (res.status === 403) throw { status: 403 };
          // 402 is handled globally by the paywall wrapper. Just
          // bail silently — don't render "Server error 402".
          if (res.status === 402) throw { status: 402, silent: true };
          throw new Error('Fit narrative unavailable.');
        }
        const json = await res.json();
        setData(json);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      } catch (e: any) {
        if (e?.status === 403 || e?.message?.includes('403')) {
          setError("You've used all your fit assessments this month.");
        } else if (e?.status === 402) {
          // Server gave us 402 (race with subscription state). Fall
          // through to the same teaser the client-side short-circuit
          // renders — no inline error, no duplicate paywall.
        } else {
          setError('Could not load fit narrative.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [listing.id, fadeAnim, preloaded, isPaid, subLoading]);

  if (loading) return <SkeletonLines />;

  // Free-tier teaser card. Renders when the user is on Starter AND
  // a preloaded narrative wasn't provided. This is the "sell it"
  // surface — same intent as a paywall but in-line so tapping a
  // second job doesn't re-open the full-screen paywall modal.
  if (!isPaid && !data) {
    return (
      <View style={[s.narrativeWrap, {
        borderWidth: 1,
        borderColor: theme.accent + '30',
        backgroundColor: theme.accentSoft,
        borderRadius: 12,
        padding: 14,
        gap: 10,
      }]}>
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: theme.accent }}>
          WHAT DILLY SEES ON THIS JOB
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: theme.surface.t1, letterSpacing: -0.2, lineHeight: 20 }}>
          What you have. What's missing. What to do.
        </Text>
        <Text style={{ fontSize: 12, color: theme.surface.t2, lineHeight: 18 }}>
          Dilly reads every bullet in this job, checks it against everything in your profile, and tells you the honest read. No score. No fluff. Just the three things you need to know before you apply.
        </Text>
        <AnimatedPressable
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 6, backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 11,
            marginTop: 4,
          }}
          scaleDown={0.97}
          onPress={() => openPaywall({
            surface: 'Fit Reads',
            promise: "Dilly tells you what you have, what's missing, and what to do for every job you care about.",
          })}
        >
          <Ionicons name="sparkles" size={13} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
            Unlock fit reads with Dilly
          </Text>
        </AnimatedPressable>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.narrativeWrap}>
        <Text style={[s.narrativeBulletText, { color: colors.t3 }]}>{error}</Text>
      </View>
    );
  }

  if (!data) return null;

  // Split paragraphs into bullet points
  const toBullets = (text: string): string[] => {
    // If already has bullet markers, split on those
    if (text.includes('- ') || text.includes('* ')) {
      return text.split(/[-*]\s+/).map(s => s.trim()).filter(s => s.length > 0);
    }
    // Split by sentences
    return text.split(/\.\s+/).map(s => s.trim().replace(/\.$/, '')).filter(s => s.length > 5);
  };

  const haveBullets = toBullets(data.what_you_have).slice(0, 3);
  const missingBullets = toBullets(data.whats_missing).slice(0, 3);
  const nothingMissing = data.whats_missing.toLowerCase().startsWith('nothing major');

  // Colors for the narrative are NEUTRAL. no green/amber/red signal.
  // "What you have" / "What's missing" are just the structure of the
  // read, not a readiness verdict.
  const LABEL_COLOR = VIOLET;
  const BULLET_DOT = VIOLET;

  return (
    <Animated.View style={[s.narrativeWrap, { opacity: fadeAnim, backgroundColor: 'transparent', borderColor: 'transparent' }]}>
      <View style={s.narrativeColumns}>
        {/* Left: What you have */}
        <View style={s.narrativeCol}>
          <Text style={[s.narrativeLabel, { color: LABEL_COLOR }]}>WHAT YOU HAVE</Text>
          {haveBullets.map((b, i) => (
            <View key={i} style={s.narrativeBulletRow}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BULLET_DOT, marginTop: 7 }} />
              <Text style={[s.narrativeBulletText, { color: theme.surface.t1 }]}>{b}</Text>
            </View>
          ))}
        </View>

        {/* Right: What's missing (or "nothing major") */}
        <View style={s.narrativeCol}>
          <Text style={[s.narrativeLabel, { color: LABEL_COLOR }]}>WHAT'S MISSING</Text>
          {nothingMissing ? (
            <View style={s.narrativeBulletRow}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BULLET_DOT, marginTop: 7 }} />
              <Text style={[s.narrativeBulletText, { color: theme.surface.t1 }]}>Nothing major</Text>
            </View>
          ) : missingBullets.map((b, i) => (
            <View key={i} style={s.narrativeBulletRow}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BULLET_DOT, marginTop: 7 }} />
              <Text style={[s.narrativeBulletText, { color: theme.surface.t1 }]}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* What to do. full width */}
      <View style={{ marginTop: 8 }}>
        <Text style={[s.narrativeLabel, { color: LABEL_COLOR }]}>WHAT TO DO</Text>
        <Text style={[s.narrativeBulletText, { color: theme.surface.t1, marginTop: 2 }]}>{data.what_to_do}</Text>
      </View>
    </Animated.View>
  );
}

// -- Dilly Scan Pulse -------------------------------------------------------
// Shows "Dilly is scanning for you" with a live-activity ring. Signals that
// the system is actively working on the user's behalf. not a static list.

function DillyScanPulse({ totalJobs, matchesFound, title, sub }: {
  totalJobs: number;
  matchesFound: number;
  title?: string;
  sub?: string;
}) {
  const theme = useResolvedTheme();
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const ringRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    ).start();
    Animated.loop(
      Animated.timing(ringRotate, { toValue: 1, duration: 4000, useNativeDriver: true, easing: Easing.linear }),
    ).start();
  }, [pulseAnim, ringRotate]);

  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const opacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const rotate = ringRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={scan.wrap}>
      {/* Ambient animated rings. Colored from the user's accent so
          the pulse, ring, and core all follow Customize Dilly. */}
      <View style={scan.orbWrap}>
        <Animated.View style={[scan.orbPulse, { backgroundColor: theme.accent, transform: [{ scale }], opacity }]} />
        <Animated.View style={[scan.orbRing, { borderColor: theme.accent, transform: [{ rotate }] }]} />
        <View style={[scan.orbCore, { backgroundColor: theme.accent, shadowColor: theme.accent }]}>
          <Ionicons name="sparkles" size={14} color="#fff" />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={scan.title}>{title || 'Dilly is scanning the market'}</Text>
        <Text style={scan.sub}>
          {sub || `${matchesFound} match${matchesFound === 1 ? '' : 'es'} surfaced from ${totalJobs.toLocaleString()} live roles`}
        </Text>
      </View>
    </View>
  );
}

// FitRing removed: Dilly no longer shows ready/stretch/close indicators.
// The job card now speaks for itself via Dilly's single-line read.

// -- Why Matched Chips ------------------------------------------------------
// Surfaces the top 2-3 reasons the job matched. built from job metadata and
// the user's profile. Immediate "oh, this makes sense" signal.

function WhyMatchedChips({ listing, userCities, userPath }: { listing: Listing; userCities: string[]; userPath: string }) {
  const chips: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }[] = [];

  // Remote?
  const mode = (listing.work_mode || '').toLowerCase();
  const locStr = (listing.location || listing.location_city || '').toLowerCase();
  if (mode === 'remote' || locStr.includes('remote') || listing.remote) {
    chips.push({ icon: 'globe-outline', label: 'Remote', color: VIOLET });
  }

  // City match
  const matchedCity = userCities.find(c => locStr.includes(c.toLowerCase().split(',')[0]));
  if (matchedCity && !chips.some(c => c.label === 'Remote')) {
    chips.push({ icon: 'location', label: matchedCity.split(',')[0], color: COBALT });
  }

  // Job type
  if (listing.job_type === 'internship') {
    chips.push({ icon: 'school-outline', label: 'Internship', color: AMBER });
  } else if (listing.job_type === 'entry_level') {
    chips.push({ icon: 'rocket-outline', label: 'Entry level', color: GREEN });
  }

  // Path-specific
  if (userPath === 'dropout') {
    chips.push({ icon: 'hammer-outline', label: 'No degree', color: GREEN });
  }

  // Cap at 3
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {chips.slice(0, 3).map((ch, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
            backgroundColor: ch.color + '14', borderWidth: 1, borderColor: ch.color + '30',
          }}
        >
          <Ionicons name={ch.icon} size={10} color={ch.color} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: ch.color }}>{ch.label}</Text>
        </View>
      ))}
    </View>
  );
}

// Dilly's read. ONE powerful sentence. Never cut off, never truncated.
// Pull the sharpest single sentence out of the fit narrative. If nothing
// useful has come back yet (narrative still loading), show a stable
// placeholder that doesn't promise anything Dilly hasn't earned.

function _oneLineRead(narrative: FitNarrativeData | null | undefined, listing: Listing): string {
  if (!narrative) {
    return `Tap to see why ${listing.company || 'this role'} could work for you.`;
  }
  // Prefer what_you_have. the sharpest "you have X" sentence is the
  // most powerful for the user to see first. Fall back to what_to_do.
  const pickSentence = (text: string | undefined): string => {
    if (!text) return '';
    // Split on sentence boundaries, pick first non-empty sentence with
    // real content (≥ 25 chars, contains a verb-ish word).
    const parts = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (p.length >= 25) return p.endsWith('.') ? p : p + '.';
    }
    return parts[0] || '';
  };
  const best = pickSentence(narrative.what_you_have) || pickSentence(narrative.what_to_do);
  if (best) return best;
  return `Worth a look at ${listing.company || 'this role'}.`;
}

function DillyVoiceBubble({ narrative, listing }: { narrative: FitNarrativeData | null | undefined; listing: Listing }) {
  const theme = useResolvedTheme();
  return (
    <View style={bub.wrap}>
      <View style={bub.avatar}>
        <Ionicons name="sparkles" size={10} color="#fff" />
      </View>
      <View style={[bub.bubble, { backgroundColor: VIOLET + '14', borderColor: VIOLET + '33' }]}>
        <Text style={[bub.text, { color: theme.surface.t1 }]}>{_oneLineRead(narrative, listing)}</Text>
      </View>
    </View>
  );
}

// -- Hero Spotlight Card ----------------------------------------------------
// The top match gets theatrical treatment: full-bleed gradient, giant fit
// ring, Dilly's read in plain language. This is the job card as movie
// poster. Tapping expands into the full fit narrative flow.

function HeroJobCard({ listing, narrative, onPress, onApply, isSaved, onBookmark, isHolder }: {
  listing: Listing;
  narrative?: FitNarrativeData | null;
  onPress: () => void;
  onApply: () => void;
  isSaved: boolean;
  onBookmark: () => void;
  // Holders see a benchmark badge + "Save to Market Watch" instead of
  // "TOP MATCH FOR YOU" and an Apply CTA.
  isHolder?: boolean;
}) {
  const scaleIn = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleIn, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [scaleIn, opacity]);

  // No more color-by-fit. Violet is the Dilly brand; we keep it as a
  // neutral accent that isn't tied to readiness signaling.
  const loc = listing.location || [listing.location_city, listing.location_state].filter(Boolean).join(', ');
  const readLine = _oneLineRead(narrative, listing);

  return (
    <Animated.View style={{ opacity, transform: [{ scale: scaleIn }] }}>
      <TouchableOpacity activeOpacity={0.95} onPress={onPress} style={hero.card}>
        {/* Gradient aura. pure Dilly brand color, not a fit indicator. */}
        <View style={[hero.aura, { backgroundColor: VIOLET + '20' }]} />
        <View style={[hero.auraInner, { backgroundColor: VIOLET + '30' }]} />

        {/* Top row: TOP MATCH badge + bookmark */}
        <View style={hero.topRow}>
          <View style={hero.topBadge}>
            <View style={[hero.badgeDot, { backgroundColor: VIOLET }]} />
            <Text style={hero.topBadgeText}>
              {isHolder ? 'MARKET BENCHMARK' : 'TOP MATCH FOR YOU'}
            </Text>
          </View>
          <TouchableOpacity onPress={onBookmark} hitSlop={10}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Title + company */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 14 }}>
          <CompanyLogo
            companyName={listing.company}
            logoUrl={listing.company_logo}
            companyWebsite={listing.company_website}
            size={48}
            borderRadius={12}
            initialColor="#fff"
            initialBg="rgba(255,255,255,0.12)"
            initialBorder="rgba(255,255,255,0.22)"
          />
          <View style={{ flex: 1 }}>
            <Text style={hero.title} numberOfLines={2}>{listing.title}</Text>
            <Text style={hero.company} numberOfLines={1}>{listing.company}</Text>
            {loc ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.7)" />
                <Text style={hero.loc} numberOfLines={1}>{loc}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* One-line read. For holders it's a market benchmark tone
            ("here's what this role expects") instead of a match tone
            ("here's why you'd be a fit"). */}
        <View style={hero.narrativeBox}>
          <View style={hero.narrativeHeader}>
            <Ionicons name="sparkles" size={12} color={VIOLET} />
            <Text style={[hero.narrativeLabel, { color: VIOLET }]}>
              {isHolder ? 'MARKET READ' : "DILLY'S READ"}
            </Text>
          </View>
          <Text style={hero.narrativeText}>
            {isHolder
              ? `${listing.company} is hiring for this role right now. Tap to see what they want.`
              : readLine}
          </Text>
        </View>

        {/* CTA row. mode-aware. Holders see "Save to Watch" + "See
            what they want" (benchmarking). Seekers see the classic
            "Apply now" + "See full fit" (applying). */}
        <View style={hero.ctaRow}>
          {isHolder ? (
            <TouchableOpacity onPress={onBookmark} activeOpacity={0.9} style={[hero.ctaPrimary, { backgroundColor: '#fff' }]}>
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={14} color={INK} />
              <Text style={[hero.ctaPrimaryText, { color: INK }]}>
                {isSaved ? 'Watching' : 'Save to Watch'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onApply} activeOpacity={0.9} style={[hero.ctaPrimary, { backgroundColor: '#fff' }]}>
              <Ionicons name="send" size={14} color={INK} />
              <Text style={[hero.ctaPrimaryText, { color: INK }]}>Apply now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={hero.ctaSecondary}>
            <Text style={hero.ctaSecondaryText}>
              {isHolder ? 'See what they want' : 'See full fit'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// -- Job Card Component -----------------------------------------------------

function JobCard({ listing, expanded, onToggle, tailoredResumeId, narrativeCache, onNarrativeLoaded, onBookmark, isSaved, userCities, userPath, index, isHolder }: {
  listing: Listing;
  expanded: boolean;
  onToggle: () => void;
  tailoredResumeId?: string | null;
  narrativeCache?: FitNarrativeData | null;
  onNarrativeLoaded?: (jobId: string, data: FitNarrativeData) => void;
  onBookmark?: (listing: Listing) => void;
  isSaved?: boolean;
  userCities: string[];
  userPath: string;
  index: number;
  // Holder mode hides the Apply button. they're benchmarking, not
  // applying. A Save to Watch (bookmark) covers the "I'm tracking
  // this" intent instead.
  isHolder?: boolean;
}) {
  const toast = useInlineToast();
  // Theme-aware colors. The module-level StyleSheet at the bottom of
  // this file is frozen at module load with whatever palette was active
  // then, so it doesn't repaint on dark/light flip. We inline-override
  // the hot styles (card bg, border, text colors, expanded section
  // divider) so the job card actually respects the current theme —
  // including the expanded view users see when they tap a job.
  const theme = useResolvedTheme();

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

  return (
    <>
    <AnimatedPressable
      style={[
        s.jobCard,
        expanded && s.jobCardExpanded,
        // Theme overrides — makes the card respect dark mode even
        // though the module-level StyleSheet is frozen at light.
        { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
      ]}
      onPress={onToggle}
      scaleDown={0.985}
    >
      {/* No colored fit rail. Dilly doesn't rank jobs as ready/stretch
          anymore. Card layout is clean, one-line read carries the signal. */}
      <View style={s.jobContent}>
        {/* Header: logo + title/company + bookmark */}
        <View style={s.jobHeader}>
          <CompanyLogo
            companyName={listing.company}
            logoUrl={listing.company_logo}
            companyWebsite={listing.company_website}
            size={44}
            borderRadius={10}
          />
          <View style={{ flex: 1 }}>
            <Text style={[s.jobTitle, { color: theme.surface.t1 }]} numberOfLines={2}>{listing.title}</Text>
            <Text style={[s.jobCompany, { color: theme.surface.t2 }]}>{listing.company}</Text>
            {loc ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
                <Ionicons name="location-outline" size={10} color={theme.surface.t3} />
                <Text style={{ fontSize: 11, color: theme.surface.t3 }} numberOfLines={1}>{loc}</Text>
                {listing.posted_date ? (
                  <>
                    <Text style={{ fontSize: 11, color: theme.surface.t3, marginHorizontal: 4 }}>•</Text>
                    <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{daysAgo(listing.posted_date)}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
          {/* Bookmark only. No fit ring, no ready/stretch label. Dilly
              doesn't tell users if they're "ready" for a job anymore.
              The one-line read below does all the work. */}
          <AnimatedPressable
            onPress={(e: any) => { e?.stopPropagation?.(); onBookmark?.(listing); }}
            scaleDown={0.85}
            hitSlop={10}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? theme.accent : theme.surface.t3} />
          </AnimatedPressable>
        </View>

        {/* Holders are benchmarking the market, not being pitched on
            "how you fit." Both the chips and Dilly's voice bubble are
            seeker/student-only. Holders get a cleaner card. */}
        {!isHolder && (
          <>
            <WhyMatchedChips listing={listing} userCities={userCities} userPath={userPath} />
            <DillyVoiceBubble narrative={narrativeCache} listing={listing} />
          </>
        )}

        {/* Expanded: Narrative + Quick Glance + Actions */}
        {expanded && (
          <View style={[s.expandedSection, { borderTopColor: theme.surface.border }]}>
            {/* Fit Narrative */}
            {/* FitNarrative is a "how you match this job" explainer.
                For holders we skip it entirely. they're scanning the
                market, not being sold on fit. Wrapped in a local
                ErrorBoundary so a render error in one card's narrative
                can't blank the entire jobs page. */}
            {!isHolder && (
              <ErrorBoundary surface="this read" resetKey={listing.id}>
                {/* preloaded must be the SINGLE entry for this listing,
                    not the whole cache dict. Previously we passed the
                    whole Record<string, FitNarrativeData>, which the
                    child stored as `data` and then tried to render as
                    if it were a single narrative. The shape mismatch
                    hit the ErrorBoundary and surfaced as "narratives
                    don't load" in user testing. */}
                <FitNarrative
                  listing={listing}
                  preloaded={narrativeCache?.[listing.id] || null}
                />
              </ErrorBoundary>
            )}

            {/* Quick Glance bullets. Flush with the card background.
                borderColor 'transparent' removes the panel feel and lets
                the bullets read as part of the expanded card rather
                than a nested panel. */}
            {listing.quick_glance && listing.quick_glance.length > 0 && (
              <View style={[s.quickGlance, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
                <Text style={[s.quickGlanceLabel, { color: theme.surface.t3 }]}>QUICK GLANCE</Text>
                {listing.quick_glance.map((b, i) => (
                  <View key={i} style={s.quickGlanceBullet}>
                    <View style={[s.quickGlanceDot, { backgroundColor: theme.accent }]} />
                    <Text style={[s.quickGlanceText, { color: theme.surface.t1 }]}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Full description toggle removed per product direction:
                expanded card now shows only the fit narrative + quick
                glance + apply/ask/tailor actions. The full job text was
                creating a wall of scraped HTML that made cards feel
                like a listing page instead of a decision surface. If
                the user wants the real description they hit Apply and
                see it on the employer's site. */}

            {/* Action buttons */}
            <View style={s.actionRow}>
              {isHolder ? (
                // Holders benchmark, they don't apply. "Save to Watch"
                // replaces the primary CTA and uses the same collections
                // primitive under the hood.
                <AnimatedPressable
                  style={[s.applyBtn, { backgroundColor: theme.accent }]}
                  onPress={(e: any) => { e?.stopPropagation?.(); onBookmark?.(listing); }}
                  scaleDown={0.97}
                >
                  <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={14} color="#fff" />
                  <Text style={s.applyBtnText}>{isSaved ? 'Watching' : 'Save to Watch'}</Text>
                </AnimatedPressable>
              ) : (
                <AnimatedPressable style={[s.applyBtn, { backgroundColor: theme.accent }]} onPress={handleApply} scaleDown={0.97}>
                  <Ionicons name="send" size={14} color="#fff" />
                  <Text style={s.applyBtnText}>Apply</Text>
                </AnimatedPressable>
              )}
              <AnimatedPressable
                style={[s.dillyBtn, { borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]}
                onPress={handleAskDilly}
                scaleDown={0.97}
              >
                <Ionicons name="sparkles" size={14} color={theme.accent} />
                <Text style={[s.dillyBtnText, { color: theme.accent }]}>Ask Dilly</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[s.tailorBtn, { borderColor: theme.surface.border }]}
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
                <Ionicons name="sparkles" size={14} color={theme.surface.t2} />
                <Text style={[s.tailorBtnText, { color: theme.surface.t2 }]}>Tailor</Text>
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

// ── Market Radar ────────────────────────────────────────────────────────
// Holder-only card rendered above the listings. Powered by
// /holder/market-radar: shows the user's current role, estimated
// market value + percentile, active listings count, and 3 ladder /
// adjacent roles with comp deltas vs where they are today.

function formatUsdRadar(n: number | null | undefined): string {
  if (n == null || !isFinite(n as number)) return '-';
  const v = Number(n);
  if (v >= 1000) return '$' + Math.round(v / 1000).toLocaleString() + 'K';
  return '$' + v.toLocaleString();
}
function formatDeltaUsd(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? '$' + Math.round(abs / 1000) + 'K' : '$' + abs.toLocaleString();
  return (n >= 0 ? '+' : '-') + s;
}

function MarketRadarCard({ radar }: {
  radar: {
    current: { role: string; estimated_wage: number | null; estimated_percentile: number | null;
               p25: number | null; p50: number | null; p75: number | null;
               market_count: number | null };
    ladder: Array<{ move: string; label: string; p50: number; estimated_wage: number;
                    delta_usd: number; delta_pct: number }>;
    active_market: { total: number | null; window: string };
  };
}) {
  // Defensive: backend can return a partial shape during warm-up or
  // when a holder's role hasn't been resolved yet. Accessing
  // radar.current.role on an undefined `current` was a real source
  // of the jobs-tab white screen of doom. Fall through to null.
  const cur = radar?.current ?? null;
  const ladder = Array.isArray(radar?.ladder) ? radar.ladder : [];
  const active = radar?.active_market?.total;

  if (!cur) return null;
  if (!cur.role && ladder.length === 0 && active == null) return null;

  return (
    <View style={mr.card}>
      {/* Header row: eyebrow + market count */}
      <View style={mr.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={mr.eyebrow}>YOUR ROLE RADAR</Text>
          {cur.role ? (
            <Text style={mr.roleText} numberOfLines={1}>{cur.role}</Text>
          ) : null}
        </View>
        {active != null ? (
          <View style={mr.marketPill}>
            <View style={mr.livePulse} />
            <Text style={mr.marketPillText}>
              {active.toLocaleString()} hiring
            </Text>
          </View>
        ) : null}
      </View>

      {/* Current comp line */}
      {cur.estimated_wage != null ? (
        <View style={mr.currentLine}>
          <Text style={mr.currentValue}>{formatUsdRadar(cur.estimated_wage)}</Text>
          <Text style={mr.currentSub}>
            your estimated market value · P{cur.estimated_percentile ?? '--'}
          </Text>
        </View>
      ) : null}

      {/* Ladder */}
      {ladder.length > 0 ? (
        <View style={mr.ladderWrap}>
          {ladder.slice(0, 3).map((row, i) => {
            const positive = row.delta_usd >= 0;
            return (
              <View
                key={`${row.label}-${i}`}
                style={[mr.ladderRow, i === ladder.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={mr.ladderMove}>{row.move.toUpperCase()}</Text>
                  <Text style={mr.ladderLabel} numberOfLines={1}>{row.label}</Text>
                </View>
                <Text style={mr.ladderValue}>{formatUsdRadar(row.estimated_wage)}</Text>
                <View
                  style={[
                    mr.deltaPill,
                    { backgroundColor: positive ? '#0F2B22' : '#2B1414',
                      borderColor:     positive ? '#1F6B4F' : '#6B1F1F' },
                  ]}
                >
                  <Text style={[mr.deltaText, { color: positive ? '#4ADE80' : '#F87171' }]}>
                    {formatDeltaUsd(row.delta_usd)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={mr.foot}>
        BLS OES (May 2024) · national average · excludes geo + company premium
      </Text>
    </View>
  );
}

const mr = StyleSheet.create({
  card: {
    backgroundColor: '#0D1117',
    borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#21262D',
    marginBottom: 14,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.6,
    color: '#8B949E', marginBottom: 4,
  },
  roleText: { fontSize: 16, fontWeight: '700', color: '#F0F6FC' },
  marketPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0F2B22',
    borderWidth: 1, borderColor: '#1F6B4F',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  livePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  marketPillText: { fontSize: 11, fontWeight: '700', color: '#4ADE80' },

  currentLine: { marginTop: 14, marginBottom: 6 },
  currentValue: { fontSize: 26, fontWeight: '800', color: '#58A6FF', letterSpacing: -0.5 },
  currentSub: { fontSize: 11, color: '#8B949E', marginTop: 2 },

  ladderWrap: {
    marginTop: 14,
    borderTopWidth: 1, borderTopColor: '#21262D',
    paddingTop: 4,
  },
  ladderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1A1F26',
  },
  ladderMove: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.2,
    color: '#8B949E',
  },
  ladderLabel: { fontSize: 13, fontWeight: '600', color: '#F0F6FC', marginTop: 1 },
  ladderValue: { fontSize: 13, fontWeight: '700', color: '#C9D1D9' },
  deltaPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
    minWidth: 54, alignItems: 'center',
  },
  deltaText: { fontSize: 11, fontWeight: '800' },

  foot: { fontSize: 10, color: '#6B7280', marginTop: 10, textAlign: 'right' },
});


// -- Main Screen ------------------------------------------------------------

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  // User-chosen theme — container bg, header typography, refresh
  // tint all read from here so Customize paints this tab too.
  const theme = useResolvedTheme();
  // Pull the current plan so the Jobs first-visit coach mark only
  // fires for paid users (their version is substantively different:
  // they can chat with Dilly about any job, generate tailored
  // resumes, and see fit narratives — none of which the starter
  // tier has). Starter users would see promises that don't apply.
  const { isPaid: _isPaid } = useSubscription();
  // Filter pill theme overrides. Module-level StyleSheet froze the
  // bg/border/text at light values, so we apply these on top of the
  // base style at each call site. Active uses the current accent so
  // the selected filter matches the user's picked color.
  const fpBase = { backgroundColor: theme.surface.s2, borderColor: theme.surface.border };
  const fpActive = { backgroundColor: theme.accent, borderColor: theme.accent };
  const fpText = { color: theme.surface.t2 };
  const fpTextActive = { color: '#FFFFFF' };
  // Career mode reshapes this whole tab: jobholders see a market
  // benchmark (no apply CTAs, "The Market" framing); seekers see the
  // classic apply-focused feed.
  const appMode = useAppMode();
  const isHolder = appMode === 'holder';
  // Per-situation copy for the empty-state message when no jobs match.
  const situationCopy = useSituationCopy();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tabs, setTabs] = useState<Set<Tab>>(new Set(['all']));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userCities, setUserCities] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [tailoredResumes, setTailoredResumes] = useState<{ id: string; job_title: string; company: string }[]>([]);
  const [narrativeCache, setNarrativeCache] = useState<Record<string, FitNarrativeData>>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCollections, setShowCollections] = useState(false);
  const [showCollectionPicker, setShowCollectionPicker] = useState<Listing | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  // Fit-narrative usage ticker (X / Y this month). null while loading.
  const [narrativeUsage, setNarrativeUsage] = useState<{ used: number; limit: number; plan: string; unlimited: boolean } | null>(null);
  // User's chosen onboarding path. drives which extra filters show
  // (e.g. 'No degree required' appears only for dropouts).
  const [userPath, setUserPath] = useState<string>('');
  // Student flag — drives the jobs-page filter constraint. Students
  // see ONLY internships + entry-level roles (product rule:
  // don't show them jobs they can't realistically land yet). Derived
  // from profile.user_type or profile.is_student — either works.
  const [isStudent, setIsStudent] = useState<boolean>(false);
  const [noDegreeFilter, setNoDegreeFilter] = useState<boolean>(false);
  // Path-specific filters: H-1B sponsor (international_grad) +
  // fair-chance (formerly_incarcerated). Opt-in, default off.
  const [h1bFilter, setH1bFilter] = useState<boolean>(false);
  const [fairChanceFilter, setFairChanceFilter] = useState<boolean>(false);
  // Remote-only filter. universal (anyone can tap) AND pre-selected
  // for users on the rural_remote_only path.
  const [remoteOnlyFilter, setRemoteOnlyFilter] = useState<boolean>(false);
  // Holder-only: the Market Radar card (role ladder + comp deltas).
  // Session-cached via lib/sessionCache so tapping between The Market
  // and other tabs doesn't refetch on every return, and so flipping
  // mode in Settings doesn't blank the card out. The radar fetch is
  // still skipped entirely for non-holders.
  type MarketRadarData = {
    current: { role: string; estimated_wage: number | null; estimated_percentile: number | null;
               p25: number | null; p50: number | null; p75: number | null;
               market_count: number | null };
    ladder: Array<{ move: string; label: string; p50: number; estimated_wage: number;
                    delta_usd: number; delta_pct: number }>;
    active_market: { total: number | null; window: string };
  };
  const marketRadarCached = useCachedFetch<MarketRadarData>(
    'holder:market-radar',
    async () => {
      if (!isHolder) return null;
      const res = await dilly.fetch('/holder/market-radar');
      return res?.ok ? await res.json() : null;
    },
    { ttlMs: 60_000 },
  );
  // Always read through the cache helper so non-holders never trip on
  // a leftover entry from a previous session.
  const marketRadar = isHolder
    ? (marketRadarCached.data ?? getCached<MarketRadarData>('holder:market-radar') ?? null)
    : null;

  const handleNarrativeLoaded = useCallback((jobId: string, data: FitNarrativeData) => {
    setNarrativeCache(prev => ({ ...prev, [jobId]: data }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      // When the 'no degree' filter pill is active (dropouts only), pass
      // no_degree=true to the feed so the server filters to jobs that
      // welcome candidates without a degree.
      const ndParam = noDegreeFilter ? '&no_degree=true' : '';
      const h1bParam = h1bFilter ? '&h1b_sponsor=true' : '';
      const fcParam = fairChanceFilter ? '&fair_chance=true' : '';
      const remoteParam = remoteOnlyFilter ? '&remote_only=true' : '';
      const [profileRes, feedRes, resumesRes, collectionsRes, usageRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        // When multiple types are selected, fetch all and filter client-side.
        // When only one non-'all' type is selected, pass it to the server for efficiency.
        // limit=100 matches what users realistically scroll through on
        // one session; if they want more, the feed paginates. Previously
        // capped at 50, which contradicted the weekly brief's count.
        dilly.get(`/v2/internships/feed?tab=${tabs.has('all') || tabs.size > 1 ? 'all' : [...tabs][0] || 'all'}&limit=100&sort=rank${ndParam}${h1bParam}${fcParam}${remoteParam}`).catch(() => null),
        dilly.get('/generated-resumes').catch(() => null),
        dilly.get('/collections').catch(() => null),
        dilly.get('/jobs/fit-narrative/usage').catch(() => null),
      ]);
      setTailoredResumes(Array.isArray(resumesRes) ? resumesRes : resumesRes?.resumes || []);
      setCollections(collectionsRes?.collections || []);
      if (usageRes && typeof usageRes === 'object') {
        setNarrativeUsage({
          used: Number((usageRes as any).used) || 0,
          limit: Number((usageRes as any).limit) || 0,
          plan: String((usageRes as any).plan || 'starter'),
          unlimited: !!(usageRes as any).unlimited,
        });
      }

      // Load user's preferred cities for location filtering. Cities are
      // shown as tappable chips but DEFAULT TO UNSELECTED. users can
      // opt in rather than having their feed silently narrowed. This
      // was a common confusion point: "why are there only jobs in NYC?"
      const cities: string[] = profileRes?.job_locations || [];
      setUserCities(cities);
      // Only preserve previously-selected cities; don't auto-select new ones.
      setSelectedCities(prev => prev.filter(c => cities.includes(c)));

      // Save the user's onboarding path so we can conditionally render
      // path-specific filters (like "No degree required" for dropouts).
      const pathRaw = ((profileRes as any)?.user_path || '').toString().toLowerCase();
      setUserPath(pathRaw);
      // Student lock: if profile says student, force the filters
      // to internship+entry-level only. The user can still pick
      // between them but can't see full-time or part-time roles —
      // product rule ("don't show them what they can't realistically
      // land yet").
      const userType = String((profileRes as any)?.user_type || '').toLowerCase();
      const studentFlag = !!(profileRes as any)?.is_student || (userType !== 'general' && userType !== 'professional' && userType !== '');
      setIsStudent(studentFlag);
      if (studentFlag) {
        setTabs(prev => {
          // Clamp any state that selected 'all'/'full_time'/'part_time'/'other'.
          const allowed: Tab[] = ['internship', 'entry_level'];
          const next = new Set<Tab>(Array.from(prev).filter(t => allowed.includes(t)));
          if (next.size === 0) next.add('internship');
          // CRITICAL: return the SAME reference if the filtered set has
          // identical contents. Otherwise we create a new Set on every
          // fetchData call, which is a dependency of the useEffect that
          // fires fetchData → infinite refresh loop. This matched the
          // "jobs page keeps refreshing, doesn't stop" bug. Equality is
          // size + subset check since Tab is a simple string union.
          if (next.size === prev.size && Array.from(next).every(t => prev.has(t))) {
            return prev;
          }
          return next;
        });
      }
      // Path-specific filter presets on first load. All opt-OUT — the
      // user can toggle any of these off the moment they see the result.
      // Only fires when userCities is empty (we don't want to steamroll
      // a user who already has locations selected).
      //
      //   rural_remote_only — remote is their whole premise
      //   parent_returning  — flex / remote is commonly the #1 ask
      //   neurodivergent    — remote reduces sensory + commute friction
      //   disabled_professional — same reasoning, plus access is often better remote
      //
      // trades_to_white_collar gets the no_degree preset since the
      // trades path usually has no 4-year degree either. Feeds into
      // the same backend flag as dropout uses.
      if (userCities.length === 0) {
        const remotePresetPaths = new Set([
          'rural_remote_only', 'parent_returning', 'neurodivergent', 'disabled_professional',
        ]);
        if (remotePresetPaths.has(pathRaw) && !remoteOnlyFilter) {
          setRemoteOnlyFilter(true);
        }
        if (pathRaw === 'trades_to_white_collar' && !noDegreeFilter) {
          setNoDegreeFilter(true);
        }
      }

      setListings(feedRes?.listings || []);
    } catch {}
    finally { setLoading(false); }
  }, [tabs, noDegreeFilter, h1bFilter, fairChanceFilter, remoteOnlyFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fit-narrative preload DISABLED. Previously this fired 3 Haiku
  // LLM calls per session on mount to warm the top-3 job cards. Cost:
  // ~$0.012/session × many sessions/day. The cards still load on
  // demand when the user taps to expand, using the same /jobs/fit-
  // narrative endpoint with a 7-day server-side cache, so the cost
  // has been moved from "every session for every user" to "only the
  // specific cards people actually tap." Preserving the ref so the
  // rest of the file doesn't error; setting it true so the block
  // below never enters.
  const preloadedRef = useRef(true);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Filter listings by search and city
  const filtered = useMemo(() => {
    let result = listings;

    // Student hard filter: internships + entry-level only, no matter
    // what the server returned. Defense in depth — tab pills already
    // hide Full/Part Time but we never want a slipped full-time role
    // to reach a student's feed.
    if (isStudent) {
      result = result.filter(l => {
        const jt = (l.job_type || '').toLowerCase();
        return jt === 'internship' || jt === 'entry_level';
      });
    }

    // Powerful multi-token search. Splits the query on whitespace and
    // requires ALL tokens to match at least one searchable field. Lets
    // the user type natural phrases like "remote python san francisco"
    // and narrow progressively. Matches title, company, location, work
    // mode, job type, AND description (so searching "react" finds jobs
    // that mention React in the JD even if it's not in the title).
    if (search.trim()) {
      const tokens = search.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
      if (tokens.length > 0) {
        result = result.filter(l => {
          const haystack = [
            l.title,
            l.company,
            l.location,
            l.location_city,
            l.location_state,
            l.work_mode,
            l.job_type,
            l.description_preview,
            l.description,
          ].filter(Boolean).join(' ').toLowerCase();
          return tokens.every(t => haystack.includes(t));
        });
      }
    }

    // Job type multi-select filter (client-side when we fetched tab=all)
    if (!tabs.has('all') && tabs.size >= 1) {
      result = result.filter(l => {
        const jt = (l.job_type || '').toLowerCase();
        return tabs.has(jt as Tab);
      });
    }

    // City filter (multi-select)
    if (selectedCities.length > 0) {
      const cityLower = selectedCities.map(c => c.toLowerCase().trim());
      result = result.filter(l => {
        const loc = (l.location || l.location_city || '').toLowerCase();
        const mode = (l.work_mode || '').toLowerCase();
        if (mode === 'remote' || loc.includes('remote')) return true;
        return cityLower.some(c => loc.includes(c));
      });
    }

    return result;
  }, [listings, search, selectedCities, tabs, isStudent]);

  // Check if a job is in any collection
  const savedJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of collections) for (const j of c.jobs || []) ids.add(j.job_id);
    return ids;
  }, [collections]);

  async function createCollection(name: string) {
    try {
      const res = await dilly.fetch('/collections', { method: 'POST', body: JSON.stringify({ name }) });
      if (res.ok) {
        const data = await res.json();
        setCollections(prev => [...prev, data.collection]);
        return data.collection as Collection;
      }
    } catch {}
    return null;
  }

  async function addToCollection(collectionId: string, listing: Listing) {
    try {
      await dilly.fetch(`/collections/${collectionId}/jobs`, {
        method: 'POST',
        body: JSON.stringify({ job_id: listing.id, title: listing.title, company: listing.company, url: listing.url || '' }),
      });
      setCollections(prev => prev.map(c =>
        c.id === collectionId
          ? { ...c, jobs: [...c.jobs, { job_id: listing.id, title: listing.title, company: listing.company, url: listing.url }] }
          : c
      ));
    } catch {}
  }

  async function removeFromCollection(collectionId: string, jobId: string) {
    try {
      await dilly.fetch(`/collections/${collectionId}/jobs/${jobId}`, { method: 'DELETE' });
      setCollections(prev => prev.map(c =>
        c.id === collectionId ? { ...c, jobs: c.jobs.filter(j => j.job_id !== jobId) } : c
      ));
    } catch {}
  }

  async function deleteCollection(collectionId: string) {
    Alert.alert('Delete collection?', 'The jobs inside will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await dilly.fetch(`/collections/${collectionId}`, { method: 'DELETE' });
          setCollections(prev => prev.filter(c => c.id !== collectionId));
        } catch {}
      }},
    ]);
  }

  async function renameCollection(collectionId: string) {
    const col = collections.find(c => c.id === collectionId);
    Alert.prompt?.('Rename collection', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: async (name?: string) => {
        if (!name?.trim()) return;
        try {
          await dilly.fetch(`/collections/${collectionId}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
          setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, name: name.trim() } : c));
        } catch {}
      }},
    ], 'plain-text', col?.name || '');
  }

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }]}>
        <DillyFace size={110} />
        <Text style={{ color: colors.t1, fontSize: 17, fontWeight: '800', marginTop: 24, letterSpacing: -0.3 }}>
          Scanning the market for you
        </Text>
        <Text style={{ color: colors.t3, fontSize: 12, fontWeight: '500', marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
          Dilly is sifting thousands of roles and ranking the ones that actually fit you.
        </Text>
      </View>
    );
  }

  // Top match and the rest. hero card + stacked cards pattern.
  const topMatch = filtered[0];
  const restMatches = filtered.slice(1);

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}>
      {/* First-visit coach — paid users only. Their version of this
          tab is materially different: fit narratives, ask-Dilly chat
          on any job, tailored resume generation. Starter users get
          the teaser flow and would find the coach's promises
          misleading, so we gate with `disabled={!_isPaid}`. */}
      <FirstVisitCoach
        id="jobs-paid-v1"
        iconName="briefcase"
        headline="Every job here, read against you."
        subline="Tap any job for a fit read. Ask Dilly anything. Tailor a resume in one tap."
        disabled={!_isPaid}
      />

      {/* Header. mode-aware framing. Holders see a market benchmark
          ("The Market"), seekers see the classic "your next move" feed. */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerEyebrow, { color: theme.accent, fontFamily: theme.type.body }]}>
              {isHolder ? 'THE MARKET · YOUR FIELD' : 'DILLY JOBS'}
            </Text>
            <Text style={[s.headerTitle, {
              color: theme.surface.t1,
              fontFamily: theme.type.display,
              fontWeight: theme.type.heroWeight,
              letterSpacing: theme.type.heroTracking,
            }]}>
              {isHolder ? "What your role is worth right now." : 'Your next move.'}
            </Text>
            <Text style={[s.headerSub, { color: theme.surface.t3, fontFamily: theme.type.body }]}>
              {isHolder
                ? 'Benchmarks, new titles, roles hiring this week. Not a to-do list.'
                : 'Ranked by fit. Powered by everything Dilly knows about you.'}
            </Text>
          </View>
          {narrativeUsage && !narrativeUsage.unlimited && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
              backgroundColor: (narrativeUsage.limit - narrativeUsage.used) <= 3 ? '#FEF3C7' : colors.s2,
              borderWidth: 1,
              borderColor: (narrativeUsage.limit - narrativeUsage.used) <= 3 ? '#F59E0B' : colors.b1,
            }}>
              <Ionicons
                name="sparkles"
                size={11}
                color={(narrativeUsage.limit - narrativeUsage.used) <= 3 ? '#92400E' : colors.t3}
              />
              <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: (narrativeUsage.limit - narrativeUsage.used) <= 3 ? '#92400E' : colors.t2,
              }}>
                {Math.max(0, narrativeUsage.limit - narrativeUsage.used)} fits
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Dilly scanning pulse — holder-only now. Seekers and students
          said the scan banner felt like noise on top of the actual
          job feed below, so we removed it for them. Holders keep
          the "tracking your market" framing since their Jobs tab IS
          a market-watch surface, not an apply feed. */}
      {isHolder && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: 14 }}>
          <DillyScanPulse
            totalJobs={Math.max(listings.length * 23, 1200)}
            matchesFound={filtered.length}
            title="Dilly is tracking your market"
            sub={`${filtered.length} role${filtered.length === 1 ? '' : 's'} like yours hiring from ${Math.max(listings.length * 23, 1200).toLocaleString()} live postings`}
          />
        </View>
      )}

      {/* Powerful search: accepts natural-language queries like
          "remote Python jobs" or "AI research in SF". The front-end
          splits the query into space-separated tokens and ALL must
          match (AND). Each token matches title OR company OR location
          OR description. This replaces the old 2-field substring
          match with something that feels like a real search engine. */}
      <View style={s.searchRow}>
        <View style={[s.searchBox, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}>
          <Ionicons name="search" size={16} color={theme.accent} />
          <TextInput
            style={[s.searchInput, { color: theme.surface.t1 }]}
            placeholder="Search jobs, companies, skills, cities..."
            placeholderTextColor={theme.surface.t3}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <AnimatedPressable onPress={() => setSearch('')} scaleDown={0.9} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.t3} />
            </AnimatedPressable>
          )}
        </View>
      </View>

      {/* Filters row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40, flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
        {/* Collections bookmark */}
        <AnimatedPressable onPress={() => setShowCollections(true)} scaleDown={0.9} hitSlop={6}
          style={{ width: 32, height: 28, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bookmark" size={18} color={theme.accent} />
        </AnimatedPressable>

        {/* 'No degree required' pill. FIRST, most visible. Shown for
            paths where degree gating is the #1 thing users hit:
            dropout (they literally don't have the degree) and
            trades_to_white_collar (coming from fields where degrees
            were never the credential). For trades users this is
            auto-enabled on first load above. */}
        {(userPath === 'dropout' || userPath === 'trades_to_white_collar') && (
          <AnimatedPressable
            style={[s.filterPill, fpBase, noDegreeFilter && fpActive]}
            onPress={() => { setNoDegreeFilter(v => !v); setLoading(true); }}
            scaleDown={0.95}
          >
            <Text style={[s.filterPillText, fpText,noDegreeFilter && fpTextActive]}>No degree required</Text>
          </AnimatedPressable>
        )}

        {/* International grad. H-1B sponsor filter. Same "#1 thing they
            open the app for" priority as the dropout pill. */}
        {userPath === 'international_grad' && (
          <AnimatedPressable
            style={[s.filterPill, fpBase, h1bFilter && fpActive]}
            onPress={() => { setH1bFilter(v => !v); setLoading(true); }}
            scaleDown={0.95}
          >
            <Text style={[s.filterPillText, fpText,h1bFilter && fpTextActive]}>Sponsors H-1B</Text>
          </AnimatedPressable>
        )}

        {/* Formerly incarcerated + refugee. fair-chance filter.
            Showing it for refugees too since many refugee-hire programs
            overlap with fair-chance employer lists. */}
        {(userPath === 'formerly_incarcerated' || userPath === 'refugee') && (
          <AnimatedPressable
            style={[s.filterPill, fpBase, fairChanceFilter && fpActive]}
            onPress={() => { setFairChanceFilter(v => !v); setLoading(true); }}
            scaleDown={0.95}
          >
            <Text style={[s.filterPillText, fpText,fairChanceFilter && fpTextActive]}>Fair chance</Text>
          </AnimatedPressable>
        )}

        {/* Remote only. universal pill. Anyone can use it, pre-selected
            for rural_remote_only users on their first load. */}
        <AnimatedPressable
          style={[s.filterPill, fpBase, remoteOnlyFilter && fpActive]}
          onPress={() => { setRemoteOnlyFilter(v => !v); setLoading(true); }}
          scaleDown={0.95}
        >
          <Text style={[s.filterPillText, fpText,remoteOnlyFilter && fpTextActive]}>Remote only</Text>
        </AnimatedPressable>

        {/* Job type pills. multi-select. Tapping 'All' clears other
            selections. Tapping a specific type toggles it; if all specific
            types are deselected, falls back to 'All'. */}
        {(((isStudent
          ? [
              // Students: ONLY internships + entry level. No All / Full / Part.
              { key: 'internship', label: 'Internships' },
              { key: 'entry_level', label: 'Entry Level' },
            ]
          : [
              { key: 'all', label: 'All' },
              { key: 'internship', label: 'Internships' },
              { key: 'entry_level', label: 'Entry Level' },
              { key: 'full_time', label: 'Full Time' },
              { key: 'part_time', label: 'Part Time' },
            ]) as { key: Tab; label: string }[])).map(t => {
          const active = tabs.has(t.key);
          return (
            <AnimatedPressable
              key={t.key}
              style={[s.filterPill, fpBase, active && fpActive]}
              onPress={() => {
                setTabs(prev => {
                  const next = new Set(prev);
                  if (t.key === 'all') {
                    // Tapping All clears everything and selects only All
                    return new Set(['all'] as Tab[]);
                  }
                  // Toggle the specific type
                  next.delete('all');
                  if (next.has(t.key)) {
                    next.delete(t.key);
                  } else {
                    next.add(t.key);
                  }
                  // If nothing left, fall back to All
                  if (next.size === 0) return new Set(['all'] as Tab[]);
                  return next;
                });
                setLoading(true);
              }}
              scaleDown={0.95}
            >
              <Text style={[s.filterPillText, fpText,active && fpTextActive]}>{t.label}</Text>
            </AnimatedPressable>
          );
        })}

      </ScrollView>

      {/* CITIES. dedicated second row so users clearly see they can
          narrow by city, and defaults to NONE selected so the feed is
          never silently capped to a city the user doesn't realize is
          active. Add-city affordance routes to profile where locations
          are edited. */}
      {userCities.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 40, flexGrow: 0, marginTop: 6 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: spacing.lg, alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}>
            <Ionicons name="location-outline" size={12} color={colors.t3} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.t3, letterSpacing: 1 }}>CITIES</Text>
          </View>
          {userCities.map(city => {
            const active = selectedCities.includes(city);
            return (
              <AnimatedPressable
                key={city}
                style={[s.filterPill, fpBase, active && fpActive]}
                onPress={() => setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city])}
                scaleDown={0.95}
              >
                <Text style={[s.filterPillText, fpText,active && fpTextActive]}>{city.replace(/,\s*\w{2}$/, '')}</Text>
              </AnimatedPressable>
            );
          })}
          <AnimatedPressable
            style={[s.filterPill, fpBase, { borderStyle: 'dashed', borderColor: theme.accent + '50' }]}
            onPress={() => router.push('/(app)/my-dilly-profile' as any)}
            scaleDown={0.95}
          >
            <Text style={[s.filterPillText, fpText, { color: theme.accent, fontWeight: '700' }]}>+ Edit</Text>
          </AnimatedPressable>
        </ScrollView>
      )}

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
              {/* Empty-state copy tailored to the active filter so it
                  doesn't feel like the app is just broken. Remote-only
                  is the single most common filter to go empty, and
                  "still loading the feed" was misleading — the feed is
                  loaded, just no remote jobs made it through. */}
              <Text style={s.emptyTitle}>
                {search.trim()
                  ? `No jobs matching "${search}"`
                  : remoteOnlyFilter
                    ? 'No fully-remote jobs in your pool yet'
                    : situationCopy.empty_jobs}
              </Text>
              <Text style={s.emptySub}>
                {remoteOnlyFilter
                  ? 'Turn off Remote only to see hybrid and in-person roles, or check back as Dilly adds new postings.'
                  : 'We are adding more jobs daily. Try a different filter or check back soon.'}
              </Text>
              {remoteOnlyFilter ? (
                <AnimatedPressable
                  style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.accent }}
                  onPress={() => setRemoteOnlyFilter(false)}
                  scaleDown={0.97}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Turn off Remote only</Text>
                </AnimatedPressable>
              ) : null}
            </View>
          </FadeInView>
        )}

        {/* Holder-only Market Radar. comp benchmark + role ladder at
            the top of the list. Hidden for seekers/students. Fails
            silent when the endpoint is still warming up (empty state
            returns null above). */}
        {isHolder && marketRadar && <MarketRadarCard radar={marketRadar} />}

        {/* Hero spotlight. the #1 match gets cinematic treatment. This
            is the first thing the user sees after the header: a poster,
            not a list item. */}
        {topMatch && (
          <View style={{ marginBottom: 14 }}>
            <HeroJobCard
              listing={topMatch}
              narrative={narrativeCache[topMatch.id] || null}
              isSaved={savedJobIds.has(topMatch.id)}
              isHolder={isHolder}
              onBookmark={() => setShowCollectionPicker(topMatch)}
              onApply={async () => {
                try { await dilly.post('/v2/internships/save', { internship_id: topMatch.id }); } catch {}
                const url = topMatch.apply_url || topMatch.url || '';
                if (url) Linking.openURL(url).catch(() => {});
              }}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedId(expandedId === topMatch.id ? null : topMatch.id);
              }}
            />
            {/* Expanded hero view. full fit narrative inline. Holders
                don't see this (benchmarking, not matching); the tap
                still expands the card, it just won't render the
                fit-breakdown component. */}
            {expandedId === topMatch.id && !isHolder && (
              <View style={[s.jobCard, { marginTop: 8 }]}>
                <View style={s.jobContent}>
                  <View style={s.expandedSection}>
                    {/* Local boundary so a bad narrative payload can't
                        blank the whole jobs tab. Without this, one
                        malformed fit-narrative response would crash
                        JobsScreen at render and leave the user on a
                        blank page — which matched the intermittent
                        'jobs page goes blank' reports. */}
                    <ErrorBoundary surface="this read" resetKey={topMatch.id}>
                      <FitNarrative listing={topMatch} preloaded={narrativeCache[topMatch.id] || null} />
                    </ErrorBoundary>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* "Up next for you" rail separator. signals the hierarchy */}
        {restMatches.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.b1 }} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.t3, letterSpacing: 1.2 }}>
              {isHolder ? 'ALSO HIRING IN YOUR FIELD' : 'UP NEXT FOR YOU'}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.b1 }} />
          </View>
        )}

        {restMatches.map((listing, i) => (
          <FadeInView key={listing.id || i} delay={Math.min(i * 40, 200)}>
            <JobCard
              listing={listing}
              index={i}
              userCities={userCities}
              userPath={userPath}
              isHolder={isHolder}
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
              onBookmark={(l) => setShowCollectionPicker(l)}
              isSaved={savedJobIds.has(listing.id)}
            />
          </FadeInView>
        ))}
        <DillyFooter />
      </ScrollView>

      {/* ── Collection Picker Modal (when bookmark tapped on a job) ── */}
      <Modal visible={!!showCollectionPicker} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.t1 }}>Save to Collection</Text>
              <TouchableOpacity onPress={() => setShowCollectionPicker(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.t3} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {collections.map(c => {
                const isIn = c.jobs?.some(j => j.job_id === showCollectionPicker?.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderColor: colors.b1 }}
                    onPress={() => {
                      if (!showCollectionPicker) return;
                      if (isIn) removeFromCollection(c.id, showCollectionPicker.id);
                      else addToCollection(c.id, showCollectionPicker);
                    }}
                  >
                    <Ionicons name={isIn ? 'checkbox' : 'square-outline'} size={20} color={isIn ? COBALT : colors.t3} />
                    <Text style={{ flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '600', color: colors.t1 }}>{c.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.t3 }}>{c.jobs?.length || 0}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* New collection. instant create + save + close.
                  Tapping Add immediately closes the modal, creates the
                  collection, and saves the current job into it. No lingering
                  popup, no "created! now tap it to save" dance. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <TextInput
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.b1, fontSize: 14, color: colors.t1, backgroundColor: colors.s1 }}
                  value={newCollectionName}
                  onChangeText={setNewCollectionName}
                  placeholder="New collection name"
                  placeholderTextColor={colors.t3}
                  returnKeyType="done"
                  onSubmitEditing={async () => {
                    const name = newCollectionName.trim();
                    if (!name) return;
                    const pending = showCollectionPicker;
                    setNewCollectionName('');
                    setShowCollectionPicker(null);
                    const col = await createCollection(name);
                    if (col && pending) addToCollection(col.id, pending);
                  }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    const name = newCollectionName.trim();
                    if (!name) return;
                    const pending = showCollectionPicker;
                    setNewCollectionName('');
                    setShowCollectionPicker(null);
                    const col = await createCollection(name);
                    if (col && pending) addToCollection(col.id, pending);
                  }}
                  style={{ backgroundColor: COBALT, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Collections List Modal (header button) ── */}
      <Modal visible={showCollections} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.t1 }}>My Collections</Text>
              <TouchableOpacity onPress={() => setShowCollections(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.t3} />
              </TouchableOpacity>
            </View>

            {collections.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Ionicons name="bookmark-outline" size={36} color={colors.t3} />
                <Text style={{ fontSize: 14, color: colors.t3, marginTop: 8 }}>No collections yet</Text>
                <Text style={{ fontSize: 12, color: colors.t3, marginTop: 4 }}>Tap the bookmark icon on any job to start saving</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {collections.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderColor: colors.b1 }}
                    /* Tap opens the collection's own screen (rename + remove
                       live there). Long-press still deletes from here so
                       power users can clean up without an extra navigation. */
                    onPress={() => { setShowCollections(false); router.push(`/(app)/collection/${c.id}`); }}
                    onLongPress={() => deleteCollection(c.id)}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="bookmark" size={16} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.t1 }}>{c.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.t3, marginTop: 2 }}>{c.jobs?.length || 0} job{(c.jobs?.length || 0) !== 1 ? 's' : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.t3} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Create new */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <TextInput
                style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.b1, fontSize: 14, color: colors.t1, backgroundColor: colors.s1 }}
                value={newCollectionName}
                onChangeText={setNewCollectionName}
                placeholder="Create new collection"
                placeholderTextColor={colors.t3}
                returnKeyType="done"
                onSubmitEditing={async () => {
                  if (!newCollectionName.trim()) return;
                  await createCollection(newCollectionName.trim());
                  setNewCollectionName('');
                }}
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!newCollectionName.trim()) return;
                  await createCollection(newCollectionName.trim());
                  setNewCollectionName('');
                }}
                style={{ backgroundColor: COBALT, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// -- Styles -----------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingText: { fontSize: 14, color: colors.t2, marginTop: 12 },

  // Header
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 6 },
  headerEyebrow: {
    fontSize: 10, fontWeight: '900', color: VIOLET, letterSpacing: 1.8, marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30, fontWeight: '900', color: colors.t1, letterSpacing: -1,
    lineHeight: 34,
  },
  headerSub: { fontSize: 13, color: colors.t3, marginTop: 4, lineHeight: 18 },

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
  // Breathing room between the cities filter row and the first job card.
  // Previously jobs bumped up against the filter chips, making the layout
  // feel cramped.
  listContent: { paddingHorizontal: spacing.lg, gap: 8, paddingTop: 18 },

  // Job Card. now has a colored rail on the left representing fit.
  jobCard: {
    flexDirection: 'row', borderRadius: radius.lg,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 2,
  },
  jobCardExpanded: {
    borderColor: COBALT + '40',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    backgroundColor: '#fff',
  },
  jobRail: { width: 4, alignSelf: 'stretch' },
  jobContent: { flex: 1, padding: spacing.md, gap: 8 },
  companyLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.s2 },
  companyLogoPlaceholder: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' },
  companyLogoInitial: { fontSize: 18, fontWeight: '800', color: colors.t3 },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  jobTitle: { fontSize: 15, fontWeight: '800', color: colors.t1, lineHeight: 20, letterSpacing: -0.2 },
  jobCompany: { fontSize: 13, color: colors.t2, marginTop: 2, fontWeight: '600' },

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
  narrativeWrap: { padding: 12, gap: 8 },
  narrativeColumns: { flexDirection: 'row', gap: 12 },
  narrativeCol: { flex: 1, gap: 6 },
  narrativeLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  narrativeBulletRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  narrativeBulletText: { flex: 1, fontSize: 11, color: colors.t1, lineHeight: 16 },
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

// ── Dilly Scan Pulse styles ─────────────────────────────────────────────
const scan = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: INK,
    borderRadius: 16,
    overflow: 'hidden',
  },
  orbWrap: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  orbPulse: {
    position: 'absolute', width: 36, height: 36, borderRadius: 18,
    backgroundColor: VIOLET,
  },
  orbRing: {
    position: 'absolute', width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: VIOLET,
    borderRightColor: 'transparent', borderBottomColor: 'transparent',
  },
  orbCore: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: VIOLET,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: VIOLET, shadowOpacity: 0.8, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  title: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: -0.1 },
  sub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '500' },
});

// ── Hero Job Card styles ────────────────────────────────────────────────
const hero = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: INK,
    padding: 18,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 240,
    shadowColor: VIOLET,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  aura: {
    position: 'absolute',
    top: -60, right: -80,
    width: 220, height: 220, borderRadius: 110,
  },
  auraInner: {
    position: 'absolute',
    bottom: -100, left: -60,
    width: 260, height: 260, borderRadius: 130,
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 1,
  },
  topBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  topBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  title: { fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.3, lineHeight: 24 },
  company: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' },
  loc: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  narrativeBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  narrativeHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  narrativeLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  narrativeText: {
    fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 18, fontWeight: '500',
  },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  ctaPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
  },
  ctaPrimaryText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },
  ctaSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  ctaSecondaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ── Dilly voice bubble styles ───────────────────────────────────────────
const bub = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  avatar: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: VIOLET,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: VIOLET, shadowOpacity: 0.5, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  bubble: {
    flex: 1,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12,
    borderTopLeftRadius: 4,
    backgroundColor: VIOLET + '0E',
    borderWidth: 1,
    borderColor: VIOLET + '22',
  },
  text: { fontSize: 12, color: colors.t1, lineHeight: 17, fontWeight: '500' },
});
