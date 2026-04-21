/**
 * Dilly Skills — in-app companion to skills.hellodilly.com.
 *
 * Dilly and Dilly Skills are two sides of the same coin: Dilly tells
 * the user what to work on; Skills is the curated library where they
 * go learn it. This screen is the mobile surface that keeps users
 * inside the brand when Chapter prescribes "learn financial modeling"
 * or Jobs suggests "brush up on SQL window functions."
 *
 * Content mirrors the web at https://skills.hellodilly.com — same
 * fields, same roles, same tone. Tapping a field / role / ask opens
 * the corresponding web page in the user's browser for now. When a
 * native library API ships we swap to in-app video playback without
 * changing this shell.
 *
 * Intentionally zero network-dependent; renders instantly. The content
 * is static because Skills is a curated library, not an algorithmic
 * feed.
 */

import { useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useResolvedTheme } from '../../../hooks/useTheme';

const SKILLS_HOST = 'https://skills.hellodilly.com';

interface Card {
  id: string;      // URL slug
  label: string;
  hint: string;
  icon: any;
}

// Roles — 11 live on the Skills site as of this build. Each points
// to /industry/<slug>. Taglines echo the brand voice on the web
// (short imperative, not marketing fluff).
const ROLES: Card[] = [
  { id: 'software-engineer', label: 'Software Engineer',  hint: 'Ship 10x more with AI as your pair.',                        icon: 'code-slash' },
  { id: 'data-scientist',    label: 'Data Scientist',     hint: 'SQL, models, and the craft of asking the right question.', icon: 'stats-chart' },
  { id: 'product-manager',   label: 'Product Manager',    hint: 'Ruthless prioritization, clear writing, user truth.',      icon: 'compass' },
  { id: 'designer',          label: 'Designer',           hint: 'Systems, type, motion, and why good taste is a skill.',    icon: 'color-palette' },
  { id: 'marketer',          label: 'Marketer',           hint: 'Positioning, distribution, and what actually compounds.',  icon: 'megaphone' },
  { id: 'consultant',        label: 'Consultant',         hint: 'Frameworks that survive contact with real clients.',       icon: 'briefcase' },
  { id: 'investment-banker', label: 'Investment Banker',  hint: 'Modeling, decks, and the bar for junior work.',            icon: 'cash' },
  { id: 'quant',             label: 'Quant',              hint: 'Pricing, risk, and the math that moves money.',            icon: 'infinite' },
  { id: 'cybersecurity',     label: 'Cybersecurity',      hint: 'Offensive thinking, defense, and the right mindset.',      icon: 'shield-checkmark' },
  { id: 'mechanical-eng',    label: 'Mechanical Eng',     hint: 'CAD, FEA, manufacturing, and the realities of hardware.',  icon: 'cog' },
  { id: 'biomed-eng',        label: 'Biomed Eng',         hint: 'Where engineering meets the body and the regulation.',     icon: 'pulse' },
];

// Fields — 10 populated + 12 listed = 22 total. We show all 22 so the
// browse feels deep, grayed state for unpopulated ones.
interface FieldCard extends Card { populated: boolean; }
const FIELDS: FieldCard[] = [
  { id: 'software-engineering-cs', label: 'Software Engineering & CS',         hint: 'Languages, frameworks, algorithms, shipping.',          icon: 'code-working',   populated: true },
  { id: 'marketing-advertising',   label: 'Marketing & Advertising',           hint: 'Brand, performance, content, and the craft of demand.', icon: 'megaphone',      populated: true },
  { id: 'data-science-analytics',  label: 'Data Science & Analytics',          hint: 'Stats, ML, SQL, and the art of making numbers speak.',  icon: 'stats-chart',    populated: true },
  { id: 'cybersecurity-it',        label: 'Cybersecurity & IT',                hint: 'Threats, hardening, networking, incident response.',    icon: 'shield',         populated: true },
  { id: 'finance-accounting',      label: 'Finance & Accounting',              hint: 'Modeling, valuation, audit, and financial reasoning.',  icon: 'cash',           populated: true },
  { id: 'consulting-strategy',     label: 'Consulting & Strategy',             hint: 'Structure, synthesis, and winning the whiteboard.',     icon: 'analytics',      populated: true },
  { id: 'electrical-computer-eng', label: 'Electrical & Computer Engineering', hint: 'Circuits, signals, embedded, and the metal layer.',     icon: 'hardware-chip',  populated: true },
  { id: 'mechanical-aerospace',    label: 'Mechanical & Aerospace Engineering',hint: 'Solids, fluids, thermo, and the disciplines of flight.', icon: 'airplane',      populated: true },
  { id: 'civil-environmental',     label: 'Civil & Environmental Engineering', hint: 'Structures, water, transport, and the built world.',    icon: 'business',       populated: true },
  { id: 'chemical-biomedical',     label: 'Chemical & Biomedical Engineering', hint: 'Reactions, unit ops, devices, and the life sciences.',  icon: 'flask',          populated: true },
  { id: 'product-design',          label: 'Product & Design',                  hint: 'Figma, systems, research, and taste as output.',         icon: 'color-palette',  populated: false },
  { id: 'media-journalism',        label: 'Media & Journalism',                hint: 'Narrative, reporting, and the honest sentence.',        icon: 'newspaper',      populated: false },
  { id: 'law',                     label: 'Law',                               hint: 'Reading cases, writing briefs, thinking like counsel.', icon: 'hammer',         populated: false },
  { id: 'medicine-nursing',        label: 'Medicine & Nursing',                hint: 'Anatomy, clinical reasoning, the MCAT bar.',            icon: 'medkit',         populated: false },
  { id: 'education',               label: 'Education',                         hint: 'Pedagogy, lesson design, and the classroom craft.',     icon: 'school',         populated: false },
  { id: 'psychology-behavior',     label: 'Psychology & Behavior',             hint: 'Cognition, therapy, and the sciences of people.',       icon: 'heart-circle',   populated: false },
  { id: 'government-policy',       label: 'Government & Policy',               hint: 'Political economy, process, and institutional craft.',  icon: 'flag',           populated: false },
  { id: 'architecture',            label: 'Architecture',            hint: 'Form, structure, codes, and the discipline of space.', icon: 'layers',         populated: false },
  { id: 'sustainability',          label: 'Sustainability',          hint: 'Energy, materials, and what it takes to decarbonize.', icon: 'leaf',           populated: false },
  { id: 'hardware-robotics',       label: 'Hardware & Robotics',     hint: 'Controls, sensing, actuation, and physical systems.',  icon: 'construct',      populated: false },
  { id: 'agriculture-food',        label: 'Agriculture & Food Systems', hint: 'From farm to fork, science through supply chain.',  icon: 'nutrition',      populated: false },
  { id: 'art-film-music',          label: 'Art, Film & Music',       hint: 'Craft, taste, production, and the discipline of beauty.', icon: 'musical-notes', populated: false },
];

export default function SkillsScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();

  const openRole  = useCallback((r: Card)      => { Linking.openURL(`${SKILLS_HOST}/industry/${r.id}`).catch(() => {}); }, []);
  const openField = useCallback((f: FieldCard) => { Linking.openURL(`${SKILLS_HOST}/cohort/${f.id}`).catch(() => {}); }, []);
  const openAsk   = useCallback(()             => { Linking.openURL(`${SKILLS_HOST}/ask`).catch(() => {}); }, []);
  const openLib   = useCallback(()             => { Linking.openURL(`${SKILLS_HOST}/library`).catch(() => {}); }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 40 }}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>DILLY SKILLS</Text>
          <Text style={[styles.pageTitle, { color: theme.surface.t1 }]}>Learn something today</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.intro, { color: theme.surface.t2 }]}>
        Human-curated 15-min videos. No clickbait, no 30-minute ramble. Pick a role
        or field, or just ask for what you need.
      </Text>

      {/* Ask + Library */}
      <View style={styles.asksRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={openAsk}
          style={[styles.askBtn, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="sparkles" size={15} color="#FFF" />
          <Text style={styles.askBtnText}>Ask for what you need</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={openLib}
          style={[styles.libBtn, { borderColor: theme.accentBorder }]}
        >
          <Ionicons name="bookmark" size={15} color={theme.accent} />
          <Text style={[styles.libBtnText, { color: theme.surface.t1 }]}>Library</Text>
        </TouchableOpacity>
      </View>

      {/* By Role */}
      <Text style={[styles.sectionTitle, { color: theme.surface.t3 }]}>BY ROLE</Text>
      <View style={styles.grid}>
        {ROLES.map(r => (
          <TouchableOpacity
            key={r.id}
            activeOpacity={0.85}
            onPress={() => openRole(r)}
            style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
          >
            <Ionicons name={r.icon} size={22} color={theme.accent} />
            <Text style={[styles.cardTitle, { color: theme.surface.t1 }]} numberOfLines={1}>{r.label}</Text>
            <Text style={[styles.cardHint, { color: theme.surface.t3 }]} numberOfLines={2}>{r.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* By Field */}
      <Text style={[styles.sectionTitle, { color: theme.surface.t3, marginTop: 24 }]}>BY FIELD</Text>
      <View style={styles.grid}>
        {FIELDS.map(f => (
          <TouchableOpacity
            key={f.id}
            activeOpacity={f.populated ? 0.85 : 0.6}
            onPress={() => openField(f)}
            style={[
              styles.card,
              { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
              !f.populated && { opacity: 0.55 },
            ]}
          >
            <Ionicons name={f.icon} size={22} color={f.populated ? theme.accent : theme.surface.t3} />
            <Text style={[styles.cardTitle, { color: theme.surface.t1 }]} numberOfLines={1}>{f.label}</Text>
            <Text style={[styles.cardHint, { color: theme.surface.t3 }]} numberOfLines={2}>{f.hint}</Text>
            {!f.populated ? (
              <Text style={[styles.soonTag, { color: theme.surface.t3 }]}>Coming soon</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.footer, { color: theme.surface.t3 }]}>
        Save what helps, revisit when you want, build a receipt of what you've learned.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  pageTitle: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  intro: { fontSize: 13, paddingHorizontal: 24, textAlign: 'center', lineHeight: 19, marginBottom: 18 },

  asksRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  askBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  askBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  libBtn: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  libBtnText: { fontWeight: '800', fontSize: 13 },

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
    minHeight: 112,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', marginTop: 8 },
  cardHint:  { fontSize: 11, fontWeight: '600', marginTop: 4, lineHeight: 15 },
  soonTag:   { fontSize: 9,  fontWeight: '800', letterSpacing: 1, marginTop: 6 },

  footer: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 32,
    lineHeight: 16,
  },
});
