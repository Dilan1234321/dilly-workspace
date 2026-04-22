/**
 * Dilly Skills — in-app home (build 353).
 *
 * Skills is a full in-app surface that mirrors everything
 * skills.hellodilly.com does: browse cohorts, ask a question, watch
 * videos, save to a library. The web version exists for desktop; on
 * mobile, Skills IS the app (two sides of the same coin).
 *
 * Header intent:
 *   Big Dilly logo (DillyFace, theme-accent) + "Skills" wordmark at
 *   the same size — reads as a co-branded product line. No back
 *   button; Skills is a destination, not a modal.
 *
 * Tabs:
 *   - Ask: /skills/ask — natural language search
 *   - Library: /skills/library — saved videos
 *   - Trending: /skills/trending — hot picks across all cohorts
 *   Browse 22 cohort cards (real backend slugs). Tap → cohort page.
 *
 * Data: none on this screen. Cohort list is static. Heavy data lives
 * on the cohort detail page.
 */

import { useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useResolvedTheme } from '../../../hooks/useTheme';
import { DillyFace } from '../../../components/DillyFace';
import { FirstVisitCoach } from '../../../components/FirstVisitCoach';

/** 22 backend cohort slugs — must stay in sync with
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
  { slug: 'entrepreneurship-innovation',      label: 'Entrepreneurship & Innovation', hint: 'Building from zero — product, capital, velocity.',  icon: 'rocket' },
  { slug: 'economics-public-policy',          label: 'Economics & Public Policy',     hint: 'Markets, incentives, institutions, evidence.',      icon: 'trending-up' },
  { slug: 'healthcare-clinical',              label: 'Healthcare & Clinical',         hint: 'Anatomy, clinical reasoning, the MCAT bar.',        icon: 'medkit' },
  { slug: 'biotech-pharmaceutical',           label: 'Biotech & Pharmaceutical',      hint: 'Molecules, pathways, trials, regulation.',          icon: 'fitness' },
  { slug: 'life-sciences-research',           label: 'Life Sciences & Research',      hint: 'From bench to insight — biology and the paper.',    icon: 'leaf' },
  { slug: 'physical-sciences-math',           label: 'Physical Sciences & Math',      hint: 'Physics, chemistry, the math that underwrites it.', icon: 'infinite' },
  { slug: 'law-government',                   label: 'Law & Government',              hint: 'Cases, briefs, process, institutional craft.',      icon: 'hammer' },
  { slug: 'media-communications',             label: 'Media & Communications',        hint: 'Narrative, reporting, the honest sentence.',        icon: 'newspaper' },
  { slug: 'design-creative-arts',             label: 'Design & Creative Arts',        hint: 'Systems, type, motion, taste as output.',           icon: 'color-palette' },
  { slug: 'education-human-development',      label: 'Education & Human Development', hint: 'Pedagogy, lesson design, the classroom craft.',     icon: 'school' },
  { slug: 'social-sciences-nonprofit',        label: 'Social Sciences & Nonprofit',   hint: 'People, institutions, mission-driven work.',        icon: 'heart-circle' },
];

export default function SkillsHomeScreen() {
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
          No back button — Skills is a destination. */}
      <View style={styles.header}>
        <DillyFace size={44} mood="happy" accessory="none" />
        <Text style={[styles.wordmark, { color: theme.surface.t1 }]}>Skills</Text>
      </View>

      <Text style={[styles.intro, { color: theme.surface.t2 }]}>
        Human-curated 15-min videos. No clickbait. Pick a cohort, ask for what
        you need, or open your library.
      </Text>

      {/* Ask / Library / Trending row — the three ways in. */}
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
          career public profile — the user can control visibility of
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
