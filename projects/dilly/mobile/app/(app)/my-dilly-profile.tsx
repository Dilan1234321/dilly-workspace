import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  LayoutAnimation, UIManager, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../lib/auth';
import { colors, spacing, radius } from '../../lib/tokens';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

// ── Types ────────────────────────────────────────────────────────────────────

interface FactItem {
  id: string;
  category: string;
  label: string;
  value: string;
  confidence: string;
  created_at: string;
  source: string;
}

interface MemorySurface {
  narrative: string | null;
  narrative_updated_at: string | null;
  narrative_updated_relative?: string;
  items: FactItem[];
  grouped: Record<string, FactItem[]>;
}

// ── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  achievement:          { icon: 'trophy',             label: 'Achievements',        color: colors.gold },
  goal:                 { icon: 'flag',               label: 'Goals',               color: colors.green },
  target_company:       { icon: 'business',           label: 'Target Companies',    color: colors.blue },
  skill_unlisted:       { icon: 'code-slash',         label: 'Unlisted Skills',     color: colors.blue },
  project_detail:       { icon: 'construct',          label: 'Project Details',     color: colors.green },
  motivation:           { icon: 'heart',              label: 'Motivations',         color: '#FF6B8A' },
  personality:          { icon: 'person',             label: 'Personality',         color: colors.indigo },
  soft_skill:           { icon: 'people',             label: 'Soft Skills',         color: colors.indigo },
  hobby:                { icon: 'football',           label: 'Hobbies & Interests', color: colors.amber },
  life_context:         { icon: 'home',               label: 'Life Context',        color: colors.amber },
  company_culture_pref: { icon: 'storefront',         label: 'Culture Preferences', color: colors.gold },
  strength:             { icon: 'trending-up',        label: 'Strengths',           color: colors.green },
  weakness:             { icon: 'trending-down',      label: 'Weaknesses',          color: colors.coral },
  challenge:            { icon: 'warning',            label: 'Challenges',          color: colors.coral },
  concern:              { icon: 'help-circle',        label: 'Concerns',            color: colors.amber },
  availability:         { icon: 'time',               label: 'Availability',        color: colors.blue },
  deadline:             { icon: 'calendar',           label: 'Deadlines',           color: colors.coral },
  interview:            { icon: 'mic',                label: 'Interviews',          color: colors.gold },
  rejection:            { icon: 'close-circle',       label: 'Rejections',          color: colors.coral },
  preference:           { icon: 'options',            label: 'Preferences',         color: colors.indigo },
  mentioned_but_not_done: { icon: 'checkbox-outline', label: 'To Do',              color: colors.amber },
  person_to_follow_up:  { icon: 'call',               label: 'Follow Up',           color: colors.green },
};

// Display order
const CATEGORY_ORDER = [
  'achievement', 'goal', 'target_company',
  'skill_unlisted', 'project_detail',
  'motivation', 'personality', 'soft_skill',
  'hobby', 'life_context', 'company_culture_pref',
  'strength', 'weakness', 'challenge',
  'concern', 'availability', 'deadline',
  'interview', 'rejection', 'preference',
  'mentioned_but_not_done', 'person_to_follow_up',
];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function MyDillyProfileScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MemorySurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/memory');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  function toggleCategory(cat: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => prev === cat ? null : cat);
  }

  function addFact(category: string) {
    const cfg = CATEGORY_CONFIG[category] || { label: category };
    Alert.prompt(
      `Add to ${cfg.label}`,
      'What should Dilly know?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (text?: string) => {
            const value = (text || '').trim();
            if (!value) return;
            try {
              const res = await apiFetch('/memory/items', {
                method: 'POST',
                body: JSON.stringify({
                  category,
                  label: value.slice(0, 50),
                  value: value,
                  source: 'profile',
                  confidence: 'high',
                }),
              });
              if (res.ok) {
                // Refresh the data
                fetchData();
              }
            } catch {}
          },
        },
      ],
      'plain-text',
      '',
    );
  }

  async function deleteFact(id: string) {
    Alert.alert('Remove fact', 'Dilly will forget this. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await apiFetch(`/memory/items/${id}`, { method: 'DELETE' });
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setData(prev => {
              if (!prev) return prev;
              const items = prev.items.filter(i => i.id !== id);
              const grouped: Record<string, FactItem[]> = {};
              for (const item of items) {
                if (!grouped[item.category]) grouped[item.category] = [];
                grouped[item.category].push(item);
              }
              return { ...prev, items, grouped };
            });
          } catch {}
        },
      },
    ]);
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const totalFacts = data?.items?.length ?? 0;
  const sessionCount = new Set(data?.items?.map(i => (i as any).conv_id).filter(Boolean)).size;

  const orderedCategories = CATEGORY_ORDER.filter(
    cat => data?.grouped?.[cat]?.length
  );

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>MY DILLY PROFILE</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Narrative Card ─────────────────────────────────────────── */}
        <View style={s.narrativeCard}>
          <View style={s.narrativeHeader}>
            <Ionicons name="sparkles" size={14} color={colors.gold} />
            <Text style={s.narrativeTitle}>What Dilly Knows</Text>
            {data?.narrative_updated_relative && (
              <Text style={s.narrativeAge}>{data.narrative_updated_relative}</Text>
            )}
          </View>
          {data?.narrative ? (
            <Text style={s.narrativeText}>{data.narrative}</Text>
          ) : (
            <View style={s.narrativeEmpty}>
              <Text style={s.narrativeEmptyText}>
                Chat with Dilly to start building your profile. The more you talk, the better Dilly knows you.
              </Text>
            </View>
          )}
        </View>

        {/* ── Fact Categories ────────────────────────────────────────── */}
        {orderedCategories.length > 0 ? (
          <>
            <Text style={s.sectionEyebrow}>WHAT DILLY KNOWS ABOUT YOU</Text>

            {orderedCategories.map(cat => {
              const cfg = CATEGORY_CONFIG[cat] || { icon: 'ellipse', label: cat, color: colors.t2 };
              const facts = data!.grouped[cat];
              const isOpen = expanded === cat;

              return (
                <View key={cat} style={s.categoryCard}>
                  <TouchableOpacity
                    style={s.categoryHeader}
                    onPress={() => toggleCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.categoryIcon, { backgroundColor: cfg.color + '18' }]}>
                      <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                    </View>
                    <Text style={s.categoryName}>{cfg.label}</Text>
                    <View style={s.categoryCount}>
                      <Text style={s.categoryCountText}>{facts.length}</Text>
                    </View>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.t3}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={s.factsContainer}>
                      {facts.map((fact, i) => (
                        <View
                          key={fact.id}
                          style={[s.factRow, s.factRowBorder]}
                        >
                          <View style={s.factContent}>
                            <Text style={s.factLabel}>{fact.label}</Text>
                            <Text style={s.factValue}>{fact.value}</Text>
                            <Text style={s.factMeta}>
                              {fact.confidence === 'high' ? 'High confidence' : fact.confidence === 'low' ? 'Low confidence' : 'Medium confidence'}
                              {fact.source !== 'voice' ? ` · ${fact.source}` : ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => deleteFact(fact.id)}
                            hitSlop={12}
                            style={s.factDelete}
                          >
                            <Ionicons name="close" size={14} color={colors.t3} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {/* Add fact button */}
                      <TouchableOpacity
                        style={s.addFactRow}
                        onPress={() => addFact(cat)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add-circle-outline" size={15} color={cfg.color} />
                        <Text style={[s.addFactText, { color: cfg.color }]}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <View style={s.emptyState}>
            <Ionicons name="chatbubbles-outline" size={44} color={colors.t3} style={{ marginBottom: 14 }} />
            <Text style={s.emptyTitle}>Your profile is empty</Text>
            <Text style={s.emptyText}>
              Every time you chat with Dilly, it learns about you — your goals, skills, interests, and more. The more you talk, the more personalized your experience becomes.
            </Text>
            <TouchableOpacity
              style={s.emptyCta}
              onPress={() => router.push('/(app)/voice')}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble" size={14} color="#1a1400" />
              <Text style={s.emptyCtaText}>Talk to Dilly</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Stats Footer ───────────────────────────────────────────── */}
        {totalFacts > 0 && (
          <Text style={s.statsFooter}>
            {totalFacts} fact{totalFacts !== 1 ? 's' : ''} learned
            {sessionCount > 0 ? ` from ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}` : ''}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, color: colors.t3 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  backBtn: { width: 36 },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.t1,
  },

  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // ── Narrative ─────────────────────────────────────────────────────────────
  narrativeCard: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    padding: 16,
    marginBottom: 20,
  },
  narrativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  narrativeTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: colors.gold,
    flex: 1,
  },
  narrativeAge: {
    fontSize: 10,
    color: colors.t3,
  },
  narrativeText: {
    fontSize: 14,
    color: colors.t1,
    lineHeight: 22,
  },
  narrativeEmpty: {
    paddingVertical: 8,
  },
  narrativeEmptyText: {
    fontSize: 13,
    color: colors.t2,
    lineHeight: 20,
  },

  // ── Section eyebrow ───────────────────────────────────────────────────────
  sectionEyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.t3,
    marginBottom: 12,
  },

  // ── Category Cards ────────────────────────────────────────────────────────
  categoryCard: {
    backgroundColor: colors.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  categoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t1,
    flex: 1,
  },
  categoryCount: {
    backgroundColor: colors.b2,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  categoryCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.t2,
  },

  // ── Facts ─────────────────────────────────────────────────────────────────
  factsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  factRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  factRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  factContent: {
    flex: 1,
    marginRight: 10,
  },
  factLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t1,
    marginBottom: 2,
  },
  factValue: {
    fontSize: 12,
    color: colors.t2,
    lineHeight: 18,
    marginBottom: 4,
  },
  factMeta: {
    fontSize: 9,
    color: colors.t3,
  },
  factDelete: {
    paddingTop: 2,
  },
  addFactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addFactText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Empty State ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 16,
    color: colors.t1,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyCtaText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    color: '#1a1400',
  },

  // ── Stats Footer ──────────────────────────────────────────────────────────
  statsFooter: {
    fontSize: 11,
    color: colors.t3,
    textAlign: 'center',
    marginTop: 20,
  },
});
