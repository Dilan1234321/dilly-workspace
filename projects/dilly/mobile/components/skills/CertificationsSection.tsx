import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Dimensions, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useResolvedTheme } from '../../hooks/useTheme';
import { CERTIFICATIONS, type Certification } from '../../data/certifications';
import type { AppMode } from '../../lib/appMode';
import { dilly } from '../../lib/dilly';

const SAVED_KEY = 'cert_saved_ids_v1';
const COMPLETED_KEY = 'cert_completed_ids_v1';
const CARD_W = Dimensions.get('window').width * 0.78;

type FilterMode = 'free' | 'all' | 'paid';

const COHORT_LABELS: Record<string, string> = {
  'finance-accounting': 'Finance & Accounting',
  'data-science-analytics': 'Data Science & Analytics',
  'software-engineering-cs': 'Software Engineering',
  'consulting-strategy': 'Consulting & Strategy',
  'marketing-advertising': 'Marketing',
  'management-operations': 'Management & Operations',
  'cybersecurity-it': 'Cybersecurity',
  'entrepreneurship-innovation': 'Entrepreneurship',
  'economics-public-policy': 'Economics',
  'healthcare-clinical': 'Healthcare',
  'biotech-pharmaceutical': 'Biotech & Pharma',
  'life-sciences-research': 'Life Sciences',
  'physical-sciences-math': 'Physical Sciences',
  'law-government': 'Law & Government',
  'media-communications': 'Media & Communications',
  'design-creative-arts': 'Design & Creative Arts',
  'education-human-development': 'Education',
  'social-sciences-nonprofit': 'Social Sciences',
  'electrical-computer-engineering': 'Electrical Engineering',
  'mechanical-aerospace-engineering': 'Mechanical Engineering',
  'civil-environmental-engineering': 'Civil Engineering',
  'chemical-biomedical-engineering': 'Chemical Engineering',
};

// Honest, derivation-only description. No LLM call. Three signals
// shape the verdict: cohort match, persona match, and effort vs payoff.
// When the cert genuinely doesn't fit, we say so instead of forcing
// generic praise - recommendations the user can trust > recommendations
// that always sound positive.
function describeCert(cert: Certification, cohortSlug: string | null, appMode: AppMode): string {
  const cohortLabel = cohortSlug
    ? (COHORT_LABELS[cohortSlug] ?? cohortSlug.replace(/-/g, ' '))
    : 'your field';

  const cohortMatch = !cohortSlug
    || cert.cohorts.includes(cohortSlug)
    || cert.cohorts.includes('general');
  const personaMatch = cert.persona_fit.includes(appMode);
  const heavy = cert.est_hours >= 150;
  const expensive = !cert.is_free;

  if (!cohortMatch && !personaMatch) {
    return `Built for a different field and stage than yours. Skip unless you are pivoting hard.`;
  }
  if (!cohortMatch) {
    return `Recognized credential, but not the one ${cohortLabel} hiring managers look for. Worth it only if you are broadening into another field.`;
  }
  if (!personaMatch) {
    if (appMode === 'student') return `Designed for working professionals. Not wrong for a student, but the payoff lands later.`;
    if (appMode === 'holder') return `Aimed at people earlier in their career. Useful only if it covers a real gap for you.`;
    return `Aimed at a different career stage. Worth it only if the skill set genuinely matches what you need next.`;
  }

  if (heavy && expensive) {
    return `Real time and money commitment (${cert.time_label}, ${cert.cost_label}). Only worth it if you are committed to ${cohortLabel} long-term.`;
  }
  if (heavy) {
    return `Big time investment (${cert.time_label}) but free. Pays off when you are sure ${cohortLabel} is the path.`;
  }
  if (expensive) {
    return `Costs money, but ${cohortLabel} recruiters know the name. A real signal you went past the basics.`;
  }
  if (cert.level === 'entry') {
    return `Low-cost signal that you are serious about ${cohortLabel}. Quick to finish, easy to put on a resume.`;
  }
  if (cert.level === 'intermediate') {
    return `Solid skill stamp for ${cohortLabel} that does not cost money. Most candidates skip it, so doing it stands out.`;
  }
  return `Top-tier ${cohortLabel} cert. Heavy lift but unlocks senior doors when paired with experience.`;
}

interface Props {
  cohortSlug: string | null;
  appMode: AppMode;
}

export function CertificationsSection({ cohortSlug, appMode }: Props) {
  const theme = useResolvedTheme();
  const [filter, setFilter] = useState<FilterMode>('free');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY)
      .then(raw => { if (raw) setSavedIds(new Set(JSON.parse(raw))); })
      .catch(() => {});
    AsyncStorage.getItem(COMPLETED_KEY)
      .then(raw => { if (raw) setCompletedIds(new Set(JSON.parse(raw))); })
      .catch(() => {});
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // Mark a cert as completed: persist locally so the badge sticks
  // across sessions, and POST a profile_facts achievement so it
  // shows up under My Dilly's Achievements category and feeds into
  // resume generation. Best-effort - if the network call fails, the
  // local badge still shows so the user is not blocked.
  const markCompleted = useCallback((cert: Certification) => {
    if (completedIds.has(cert.id)) return;
    setCompletedIds(prev => {
      const next = new Set(prev);
      next.add(cert.id);
      AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
    const isoDate = new Date().toISOString().slice(0, 10);
    dilly.fetch('/memory/items', {
      method: 'POST',
      body: JSON.stringify({
        category: 'achievement',
        label: cert.name.slice(0, 80),
        value: `${cert.provider} certification, completed ${isoDate}.`.slice(0, 400),
      }),
    })
      .then(() => Alert.alert('Added to your profile', `${cert.name} is now on your Dilly profile under Achievements.`))
      .catch(() => Alert.alert('Saved locally', 'We marked this complete on your device. It will sync to your profile next time you are online.'));
  }, [completedIds]);

  const openCert = useCallback(async (url: string) => {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  }, []);

  const filtered = CERTIFICATIONS
    .filter(c => {
      if (filter === 'free') return c.is_free;
      if (filter === 'paid') return !c.is_free;
      return true;
    })
    .sort((a, b) => {
      // Cohort match ranks first
      const aInCohort = cohortSlug && (a.cohorts.includes(cohortSlug) || a.cohorts.includes('general'));
      const bInCohort = cohortSlug && (b.cohorts.includes(cohortSlug) || b.cohorts.includes('general'));
      if (aInCohort && !bInCohort) return -1;
      if (!aInCohort && bInCohort) return 1;
      // Persona match ranks second
      const aPersona = a.persona_fit.includes(appMode);
      const bPersona = b.persona_fit.includes(appMode);
      if (aPersona && !bPersona) return -1;
      if (!aPersona && bPersona) return 1;
      // Free first within same tier
      if (a.is_free && !b.is_free) return -1;
      if (!a.is_free && b.is_free) return 1;
      return 0;
    })
    .slice(0, 20);

  if (filtered.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={[styles.sectionLabel, { color: theme.surface.t3 }]}>
        RECOMMENDED CERTIFICATIONS
      </Text>
      <Text style={[styles.subtitle, { color: theme.surface.t2 }]}>
        Earn a credential - free options first.
      </Text>

      {/* Filter chips. Pressable (not TouchableOpacity) + zero press
          delay so taps land instantly even while the parent ScrollView
          is mid-scroll/momentum. Generous hitSlop because the chip
          padding is tight. */}
      <View style={styles.chips}>
        {(['free', 'all', 'paid'] as FilterMode[]).map(f => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              unstable_pressDelay={0}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.chip,
                active
                  ? { backgroundColor: theme.accent }
                  : { borderColor: theme.accentBorder, borderWidth: 1 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFF' : theme.surface.t2 }]}>
                {f === 'free' ? 'Free' : f === 'paid' ? 'Paid' : 'All'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Cert cards. keyboardShouldPersistTaps so a tap landing on a
          chip while the horizontal row is still decelerating fires
          immediately instead of being eaten as a scroll-stop tap. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardRow}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.map(cert => (
          <CertCard
            key={cert.id}
            cert={cert}
            saved={savedIds.has(cert.id)}
            completed={completedIds.has(cert.id)}
            whyText={describeCert(cert, cohortSlug, appMode)}
            theme={theme}
            onStart={() => openCert(cert.url)}
            onSave={() => toggleSave(cert.id)}
            onComplete={() => markCompleted(cert)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── CertCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  cert: Certification;
  saved: boolean;
  completed: boolean;
  whyText: string;
  theme: any;
  onStart: () => void;
  onSave: () => void;
  onComplete: () => void;
}

function CertCard({ cert, saved, completed, whyText, theme, onStart, onSave, onComplete }: CardProps) {
  return (
    <View style={[cardStyles.root, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      <View style={cardStyles.headerRow}>
        <Text style={[cardStyles.provider, { color: theme.surface.t3 }]} numberOfLines={1}>
          {cert.provider}
        </Text>
        <View style={[
          cardStyles.costBadge,
          cert.is_free
            ? { backgroundColor: theme.accentSoft }
            : { backgroundColor: theme.surface.bg, borderWidth: 1, borderColor: theme.surface.border },
        ]}>
          <Text style={[cardStyles.costText, { color: cert.is_free ? theme.accent : theme.surface.t2 }]}>
            {cert.cost_label}
          </Text>
        </View>
      </View>

      <Text style={[cardStyles.name, { color: theme.surface.t1 }]} numberOfLines={3}>
        {cert.name}
      </Text>

      <View style={cardStyles.metaRow}>
        <Ionicons name="time-outline" size={12} color={theme.surface.t3} />
        <Text style={[cardStyles.meta, { color: theme.surface.t3 }]}>{cert.time_label}</Text>
        <Text style={[cardStyles.levelDot, { color: theme.surface.t3 }]}>•</Text>
        <Text style={[cardStyles.meta, { color: theme.surface.t3 }]}>
          {cert.level === 'entry' ? 'Entry' : cert.level === 'intermediate' ? 'Intermediate' : 'Advanced'}
        </Text>
      </View>

      {/* Honest description - lengthened to 4 lines so the verdict
          actually fits without truncation. */}
      <Text style={[cardStyles.why, { color: theme.surface.t2 }]} numberOfLines={4}>
        {whyText}
      </Text>

      <View style={cardStyles.actions}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onStart}
          style={[cardStyles.startBtn, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="arrow-forward-circle" size={14} color="#FFF" />
          <Text style={cardStyles.startText}>Start cert</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onSave}
          style={[
            cardStyles.saveBtn,
            { borderColor: theme.accentBorder, borderWidth: 1 },
            saved && { backgroundColor: theme.accentSoft },
          ]}
          hitSlop={6}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={theme.accent}
          />
        </TouchableOpacity>
      </View>

      {/* Mark as completed - separate row so it does not crowd the
          primary Start CTA. Once tapped it locks in (re-tapping does
          nothing) and writes an Achievement to the Dilly profile. */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onComplete}
        disabled={completed}
        style={[
          cardStyles.completeBtn,
          { borderColor: completed ? theme.accent : theme.accentBorder },
          completed && { backgroundColor: theme.accentSoft },
        ]}
      >
        <Ionicons
          name={completed ? 'checkmark-circle' : 'checkmark-circle-outline'}
          size={14}
          color={theme.accent}
        />
        <Text style={[cardStyles.completeText, { color: theme.accent }]}>
          {completed ? 'On your profile' : 'I completed this'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    marginTop: 32,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 20,
    marginBottom: 14,
    lineHeight: 18,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardRow: {
    paddingHorizontal: 16,
    gap: 12,
    paddingRight: 20,
  },
});

const cardStyles = StyleSheet.create({
  root: {
    width: CARD_W,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  provider: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  costBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  costText: {
    fontSize: 11,
    fontWeight: '700',
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
  },
  levelDot: {
    fontSize: 11,
  },
  why: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  startText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  saveBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  completeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
