import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useResolvedTheme } from '../../hooks/useTheme';
import { CERTIFICATIONS, type Certification } from '../../data/certifications';
import type { AppMode } from '../../lib/appMode';

const SAVED_KEY = 'cert_saved_ids_v1';
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

function whyFits(cert: Certification, cohortSlug: string | null, appMode: AppMode): string {
  const cohortLabel = cohortSlug
    ? (COHORT_LABELS[cohortSlug] ?? cohortSlug.replace(/-/g, ' '))
    : 'your field';

  const map: Record<AppMode, Record<Certification['level'], string>> = {
    student: {
      entry:        `Great first credential in ${cohortLabel} — strong on a new-grad resume.`,
      intermediate: `Challenging cert for ${cohortLabel} — stands out before graduation.`,
      advanced:     `Ambitious choice in ${cohortLabel} — plan for post-graduation.`,
    },
    seeker: {
      entry:        `Fast skill signal for ${cohortLabel} roles — shows employers you're ready.`,
      intermediate: `Strong differentiator in ${cohortLabel} — ahead of most candidates.`,
      advanced:     `Top-tier ${cohortLabel} cert — commands premium roles.`,
    },
    holder: {
      entry:        `Quick credential refresh in ${cohortLabel} — often required for promotion.`,
      intermediate: `Closes a common skill gap for ${cohortLabel} professionals.`,
      advanced:     `Gold-standard in ${cohortLabel} — opens senior doors.`,
    },
  };

  return map[appMode][cert.level];
}

interface Props {
  cohortSlug: string | null;
  appMode: AppMode;
}

export function CertificationsSection({ cohortSlug, appMode }: Props) {
  const theme = useResolvedTheme();
  const [filter, setFilter] = useState<FilterMode>('free');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY)
      .then(raw => { if (raw) setSavedIds(new Set(JSON.parse(raw))); })
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
        Earn a credential — free options first.
      </Text>

      {/* Filter chips */}
      <View style={styles.chips}>
        {(['free', 'all', 'paid'] as FilterMode[]).map(f => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              activeOpacity={0.8}
              onPress={() => setFilter(f)}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: theme.accent }
                  : { borderColor: theme.accentBorder, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFF' : theme.surface.t2 }]}>
                {f === 'free' ? 'Free' : f === 'paid' ? 'Paid' : 'All'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Cert cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardRow}
      >
        {filtered.map(cert => (
          <CertCard
            key={cert.id}
            cert={cert}
            saved={savedIds.has(cert.id)}
            whyText={whyFits(cert, cohortSlug, appMode)}
            theme={theme}
            onStart={() => openCert(cert.url)}
            onSave={() => toggleSave(cert.id)}
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
  whyText: string;
  theme: any;
  onStart: () => void;
  onSave: () => void;
}

function CertCard({ cert, saved, whyText, theme, onStart, onSave }: CardProps) {
  return (
    <View style={[cardStyles.root, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      {/* Header row: provider + cost badge */}
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

      {/* Cert name */}
      <Text style={[cardStyles.name, { color: theme.surface.t1 }]} numberOfLines={3}>
        {cert.name}
      </Text>

      {/* Time + level row */}
      <View style={cardStyles.metaRow}>
        <Ionicons name="time-outline" size={12} color={theme.surface.t3} />
        <Text style={[cardStyles.meta, { color: theme.surface.t3 }]}>{cert.time_label}</Text>
        <Text style={[cardStyles.levelDot, { color: theme.surface.t3 }]}>•</Text>
        <Text style={[cardStyles.meta, { color: theme.surface.t3 }]}>
          {cert.level === 'entry' ? 'Entry' : cert.level === 'intermediate' ? 'Intermediate' : 'Advanced'}
        </Text>
      </View>

      {/* Why-this-fits */}
      <Text style={[cardStyles.why, { color: theme.surface.t2 }]} numberOfLines={2}>
        {whyText}
      </Text>

      {/* Actions */}
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
});
