import { safeBack } from '../../lib/navigation';
/**
 * Public Profile settings — dedicated management screen.
 *
 * Mirrors /skills/profile-settings in structure. Settings tab used to
 * toggle the public career profile inline; per product direction, the
 * Public profile row now pushes to this full-page editor so users can
 * control visibility, sections, and per-fact shows/hides in one place.
 *
 * Controls, all persisted through existing backend endpoints:
 *   - public_profile_visible         (PATCH /profile) — master toggle
 *   - web_profile_settings.sections  (PATCH /profile) — which sections
 *                                     render on the public page
 *   - web_profile_settings.hidden_fact_ids (POST
 *     /profile/web/hide-fact | show-fact) — atomic per-fact toggle
 *
 * We do NOT duplicate the learning-profile toggles here — those live
 * at /skills/profile-settings. The Settings tab links to both pages.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity,
  Linking, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import DillyLoadingState from '../../components/DillyLoadingState';

interface MemoryItem {
  id: string;
  category?: string;
  label?: string;
  value?: string;
}

interface WebSections {
  strengths?: boolean;
  skills?: boolean;
  experience?: boolean;
  projects?: boolean;
  looking_for?: boolean;
  education?: boolean;
  [k: string]: boolean | undefined;
}

interface WebProfileSettings {
  sections?: WebSections;
  hidden_fact_ids?: string[];
  [k: string]: unknown;  // other keys (e.g. learning_*) preserved via merge
}

/** Categories that are never surfaced on the public profile.
 *  Keeping the list in sync with the backend's PRIVATE_ALWAYS set in
 *  api/routers/profile.py so the editor doesn't show toggles for
 *  things that will never render. */
const PRIVATE_ALWAYS = new Set([
  'challenge', 'concern', 'weakness', 'fear', 'personal',
  'contact', 'phone', 'email_address',
  'areas_for_improvement', 'life_context',
]);

const SECTION_DEFS = [
  { key: 'strengths',    label: 'What I Bring',         hint: 'Strengths Dilly has observed in you' },
  { key: 'skills',       label: 'Skills',               hint: 'Technical + soft skills' },
  { key: 'experience',   label: 'Experience',           hint: 'Roles you\'ve held' },
  { key: 'projects',     label: 'Projects',             hint: 'Things you\'ve built or shipped' },
  { key: 'looking_for',  label: 'What I\'m Looking For', hint: 'Goals, target roles, industries' },
  { key: 'education',    label: 'Education',            hint: 'School and major' },
] as const;

const PRETTY_CATEGORY: Record<string, string> = {
  skill_unlisted: 'Technical Skill',
  soft_skill: 'Soft Skill',
  technical_skill: 'Technical Skill',
  skill: 'Skill',
  achievement: 'Achievement',
  project_detail: 'Project',
  project: 'Project',
  experience: 'Experience',
  education: 'Education',
  goal: 'Goal',
  interest: 'Interest',
  career_interest: 'Career Interest',
  strength: 'Strength',
  personality: 'Personality',
};

export default function PublicProfileSettingsScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [sections, setSections] = useState<WebSections>({});
  const [hiddenFactIds, setHiddenFactIds] = useState<string[]>([]);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [slug, setSlug] = useState<string>('');
  const [prefix, setPrefix] = useState<'s' | 'p'>('s');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Keep the full original web_profile_settings blob around so our
  // saves merge rather than clobber other keys (learning_profile_*,
  // hidden_video_ids from the Skills editor, etc).
  const rawSettingsRef = useRef<WebProfileSettings>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prof, surface] = await Promise.all([
          dilly.get('/profile').catch(() => null),
          dilly.get('/memory').catch(() => null),
        ]);
        if (cancelled) return;
        const p: any = prof || {};
        const ws: WebProfileSettings = (p.web_profile_settings as WebProfileSettings) || {};
        rawSettingsRef.current = ws;
        setVisible(p.public_profile_visible !== false);
        setSections(ws.sections || {});
        setHiddenFactIds(Array.isArray(ws.hidden_fact_ids) ? ws.hidden_fact_ids : []);
        const facts = (surface as any)?.items;
        if (Array.isArray(facts)) setItems(facts as MemoryItem[]);
        // Slug + prefix for the view/share URL.
        const ut = (p.user_type || 'student') as string;
        setPrefix(ut === 'general' || ut === 'professional' ? 'p' : 's');
        if (p.readable_slug) setSlug(p.readable_slug);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const profileUrl = slug ? `https://hellodilly.com/${prefix}/${slug}` : '';

  /** Immediate save — no debounce. Every switch writes right away so
   *  the public page updates the moment the user flips it. */
  const saveMaster = useCallback(async (v: boolean) => {
    setSaveState('saving');
    setVisible(v);
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ public_profile_visible: v }),
      });
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }, []);

  const saveSections = useCallback(async (next: WebSections) => {
    setSaveState('saving');
    setSections(next);
    const merged: WebProfileSettings = {
      ...rawSettingsRef.current,
      sections: next,
      hidden_fact_ids: hiddenFactIds,
    };
    rawSettingsRef.current = merged;
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ web_profile_settings: merged }),
      });
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }, [hiddenFactIds]);

  const toggleFact = useCallback(async (fact: MemoryItem, makePublic: boolean) => {
    if (!fact.id) return;
    // Optimistic.
    const nextHidden = makePublic
      ? hiddenFactIds.filter(id => id !== fact.id)
      : [...hiddenFactIds.filter(id => id !== fact.id), fact.id];
    setHiddenFactIds(nextHidden);
    setSaveState('saving');
    try {
      const res: any = await dilly.post(
        makePublic ? '/profile/web/show-fact' : '/profile/web/hide-fact',
        { fact_id: fact.id },
      );
      if (Array.isArray(res?.hidden_fact_ids)) setHiddenFactIds(res.hidden_fact_ids);
      setSaveState('saved');
    } catch {
      // Revert.
      setHiddenFactIds(hiddenFactIds);
      setSaveState('idle');
    }
  }, [hiddenFactIds]);

  const showableItems = useMemo(
    () => items.filter(f => !PRIVATE_ALWAYS.has((f.category || '').toLowerCase())),
    [items],
  );

  if (loading) {
    return (
      <DillyLoadingState
        insetTop={insets.top}
        messages={['Opening your public profile…', 'Loading your facts…']}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 80 }}
    >
      {/* Header — back arrow, eyebrow + title, slug line. */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack('/(app)/my-dilly-profile')} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>PUBLIC PROFILE</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]}>What the world sees</Text>
          {profileUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(profileUrl)}>
              <Text style={[styles.urlLink, { color: theme.accent }]}>{`hellodilly.com/${prefix}/${slug}`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {saveState === 'saving' ? (
          <Text style={[styles.saveHint, { color: theme.surface.t3 }]}>saving…</Text>
        ) : saveState === 'saved' ? (
          <Text style={[styles.saveHint, { color: theme.accent }]}>saved</Text>
        ) : null}
      </View>

      {/* Master visibility toggle. */}
      <View style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <RowToggle
          label="Public profile"
          hint={visible
            ? 'Your profile is visible to anyone with the link.'
            : 'Your profile is hidden. Only you can see it.'}
          value={visible}
          onToggle={saveMaster}
          theme={theme}
        />
      </View>

      {visible ? (
        <>
          {/* Sections */}
          <SectionTitle theme={theme} text="SECTIONS" />
          <View style={[styles.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            {SECTION_DEFS.map((sec, i) => (
              <View key={sec.key}>
                {i > 0 ? <Divider theme={theme} /> : null}
                <RowToggle
                  label={sec.label}
                  hint={sec.hint}
                  value={sections[sec.key] !== false}
                  onToggle={v => saveSections({ ...sections, [sec.key]: v })}
                  theme={theme}
                />
              </View>
            ))}
          </View>

          {/* Per-fact visibility. */}
          <SectionTitle theme={theme} text="WHICH FACTS" />
          <Text style={[styles.sectionSub, { color: theme.surface.t2 }]}>
            Tap a fact to hide it from your public profile. Hidden facts stay in
            your Dilly profile — only the public page is affected.
          </Text>

          {showableItems.length === 0 ? (
            <View style={[styles.emptyWrap, { borderColor: theme.surface.border }]}>
              <Ionicons name="person-circle-outline" size={28} color={theme.surface.t3} />
              <Text style={[styles.emptyTitle, { color: theme.surface.t1 }]}>No public-eligible facts yet</Text>
              <Text style={[styles.emptyBody, { color: theme.surface.t2 }]}>
                Keep talking to Dilly and they'll appear here as Dilly learns them.
              </Text>
            </View>
          ) : (
            showableItems.map(fact => {
              const isHidden = hiddenFactIds.includes(fact.id);
              const prettyCat = PRETTY_CATEGORY[(fact.category || '').toLowerCase()] || fact.category || 'Fact';
              return (
                <TouchableOpacity
                  key={fact.id}
                  activeOpacity={0.85}
                  onPress={() => toggleFact(fact, isHidden /* make public if currently hidden */)}
                  style={[
                    styles.factRow,
                    { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                    isHidden && { opacity: 0.55 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.factLabel, { color: theme.surface.t1 }]} numberOfLines={1}>
                      {fact.label || fact.value || '(unlabeled)'}
                    </Text>
                    <Text style={[styles.factCat, { color: theme.surface.t3 }]} numberOfLines={1}>
                      {prettyCat}
                    </Text>
                  </View>
                  <View style={[
                    styles.visBadge,
                    isHidden
                      ? { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }
                      : { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
                  ]}>
                    <Ionicons
                      name={isHidden ? 'eye-off' : 'eye'}
                      size={12}
                      color={isHidden ? theme.surface.t3 : theme.accent}
                    />
                    <Text style={[
                      styles.visBadgeText,
                      { color: isHidden ? theme.surface.t3 : theme.accent },
                    ]}>{isHidden ? 'HIDDEN' : 'PUBLIC'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {/* CTAs */}
          {profileUrl ? (
            <View style={{ paddingHorizontal: 20, marginTop: 30, gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => Linking.openURL(profileUrl)}
                style={[styles.cta, { backgroundColor: theme.accent }]}
              >
                <Ionicons name="open-outline" size={14} color="#FFF" />
                <Text style={styles.ctaText}>View public profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => Share.share({ message: profileUrl })}
                style={[styles.ctaGhost, { borderColor: theme.accentBorder }]}
              >
                <Ionicons name="share-outline" size={14} color={theme.accent} />
                <Text style={[styles.ctaGhostText, { color: theme.surface.t1 }]}>Share link</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.hiddenHint, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Ionicons name="lock-closed" size={18} color={theme.accent} />
          <Text style={[styles.hiddenHintText, { color: theme.surface.t2 }]}>
            Your public profile is off. Flip the toggle above when you're ready to
            make it public.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── UI primitives ───────────────────────────────────────────────────────────

function RowToggle({ label, hint, value, onToggle, theme }: {
  label: string; hint?: string; value: boolean; onToggle: (v: boolean) => void;
  theme: ReturnType<typeof useResolvedTheme>;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={[styles.rowLabel, { color: theme.surface.t1 }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.rowHint, { color: theme.surface.t3 }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.surface.s2, true: theme.accent }}
      />
    </View>
  );
}

function SectionTitle({ theme, text }: { theme: ReturnType<typeof useResolvedTheme>; text: string }) {
  return <Text style={[styles.sectionTitle, { color: theme.accent }]}>{text}</Text>;
}

function Divider({ theme }: { theme: ReturnType<typeof useResolvedTheme> }) {
  return <View style={[styles.divider, { backgroundColor: theme.surface.border }]} />;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingBottom: 18,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title:   { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  urlLink: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  saveHint:{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 6 },

  sectionTitle: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 8,
  },
  sectionSub: {
    fontSize: 12, paddingHorizontal: 20, lineHeight: 17, marginBottom: 12,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 13, borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  rowHint:  { fontSize: 12, fontWeight: '500', marginTop: 3, lineHeight: 16 },
  divider:  { height: 1, marginHorizontal: 14 },

  factRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    padding: 12,
    borderWidth: 1, borderRadius: 12,
  },
  factLabel: { fontSize: 13, fontWeight: '700' },
  factCat:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 3, textTransform: 'uppercase' },
  visBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
    marginLeft: 8,
  },
  visBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },

  emptyWrap: {
    alignItems: 'center',
    marginHorizontal: 16, padding: 26,
    borderWidth: 1, borderRadius: 13,
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  emptyBody:  { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 5 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12,
  },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  ctaGhost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1,
  },
  ctaGhostText: { fontSize: 13, fontWeight: '800' },

  hiddenHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: 12,
  },
  hiddenHintText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
});
