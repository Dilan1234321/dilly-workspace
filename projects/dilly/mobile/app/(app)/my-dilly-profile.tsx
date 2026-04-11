import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  LayoutAnimation, UIManager, Platform, Alert, Modal,
  TextInput, KeyboardAvoidingView, RefreshControl, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import FadeInView from '../../components/FadeInView';
import AnimatedPressable from '../../components/AnimatedPressable';
import Svg, { Circle } from 'react-native-svg';

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

function Skeleton({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[{ width: width as any, height, borderRadius: 6, backgroundColor: '#E4E6F0', opacity }, style]} />;
}

export default function MyDillyProfileScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MemorySurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, any>>({});

  const fetchData = useCallback(async () => {
    try {
      const [memRes, profileRes] = await Promise.all([
        dilly.fetch('/memory'),
        dilly.get('/profile').catch(() => null),
      ]);
      if (memRes.ok) {
        const json = await memRes.json();
        setData(json);
      }
      if (profileRes) setProfile(profileRes || {});
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  // Opens the Dilly AI overlay pre-prompted to collect information about a
  // specific profile gap (e.g. "Tell Dilly about your career goals"). The
  // overlay prompts the user for the info directly so they can answer in
  // chat instead of navigating to the voice screen and starting cold.
  function startTellDillyFlow(nudge: string, categoryKey: string) {
    const p = profile as any;
    const firstName = p.name?.trim().split(/\s+/)[0] || 'there';
    const cohort = p.track || p.cohort || 'General';
    // Turn the nudge label into a clean opening question Dilly will ask.
    // "Tell Dilly about your career goals" -> Dilly asks about career goals.
    const topic = nudge
      .replace(/^Tell Dilly (?:more )?about\s*/i, '')
      .replace(/^Share\s*/i, '')
      .replace(/^Mention\s*/i, '')
      .replace(/^Describe\s*/i, '')
      .replace(/^Talk about\s*/i, '')
      .trim() || nudge;
    openDillyOverlay({
      name: firstName,
      cohort,
      score: 0, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
      isPaid: true,
      initialMessage:
        `${firstName} wants to tell you about ${topic}. ` +
        `Ask them one friendly, specific question to get started  -  the kind of question that makes it easy to share. ` +
        `After they answer, ask one gentle follow-up so you capture enough detail to remember it well. ` +
        `Then save what you learn to their profile under the '${categoryKey}' category.`,
    });
  }

  useEffect(() => { fetchData(); }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  function toggleCategory(cat: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => prev === cat ? null : cat);
  }

  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [editingFact, setEditingFact] = useState<FactItem | null>(null);

  function openAddModal(category: string) {
    setAddCategory(category);
  }

  function openEditModal(fact: FactItem) {
    setEditingFact(fact);
  }

  async function saveEdit(label: string, value: string) {
    if (!editingFact) return;
    try {
      const res = await dilly.fetch(`/memory/items/${editingFact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: label.slice(0, 80), value }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        const newRow = updated?.item;
        // Optimistic local update so the new version shows up immediately
        // without waiting for a refetch.
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setData(prev => {
          if (!prev) return prev;
          const items = prev.items.map(it =>
            it.id === editingFact.id
              ? { ...it, label: label.slice(0, 80), value, ...(newRow || {}) }
              : it
          );
          const grouped: Record<string, FactItem[]> = {};
          for (const item of items) {
            if (!grouped[item.category]) grouped[item.category] = [];
            grouped[item.category].push(item);
          }
          return { ...prev, items, grouped };
        });
      } else {
        Alert.alert('Save failed', 'Could not update this entry.');
      }
    } catch {
      Alert.alert('Save failed', 'Could not update this entry.');
    }
    setEditingFact(null);
  }

  async function deleteFact(id: string) {
    Alert.alert('Remove fact', 'Dilly will forget this. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await dilly.delete(`/memory/items/${id}`);
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

  // Completeness: core categories every student should have
  const CORE_CATEGORIES = [
    { key: 'goal', nudge: 'Tell Dilly about your career goals' },
    { key: 'target_company', nudge: 'Share your dream companies' },
    { key: 'skill_unlisted', nudge: 'Mention skills not on your resume' },
    { key: 'project_detail', nudge: 'Describe projects you have worked on' },
    { key: 'motivation', nudge: 'Tell Dilly what drives you' },
    { key: 'hobby', nudge: 'Share your hobbies and interests' },
    { key: 'personality', nudge: 'Tell Dilly about your work style' },
    { key: 'strength', nudge: 'Talk about what you are good at' },
    { key: 'company_culture_pref', nudge: 'Describe your ideal workplace' },
    { key: 'availability', nudge: 'Share when you can start working' },
  ];
  const filledCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) > 0);
  const missingCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) === 0);
  const completeness = CORE_CATEGORIES.length > 0 ? Math.round((filledCore.length / CORE_CATEGORIES.length) * 100) : 0;

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <View style={{ width: 36 }} />
          <Skeleton width={130} height={11} />
          <View style={{ width: 36 }} />
        </View>
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: 16 }}>
          {/* Narrative card skeleton */}
          <View style={{ backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.goldbdr, padding: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Skeleton width={14} height={14} style={{ borderRadius: 7 }} />
              <Skeleton width={120} height={10} />
            </View>
            <Skeleton width="100%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="90%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="70%" height={14} />
          </View>
          {/* Category list skeleton */}
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Skeleton width={28} height={28} style={{ borderRadius: 8 }} />
              <Skeleton width={120} height={13} style={{ flex: 1 }} />
              <Skeleton width={20} height={20} style={{ borderRadius: 10 }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Profile strength ring helper
  const strengthColor = completeness >= 70 ? colors.green : completeness >= 40 ? colors.amber : colors.coral;
  const ringSize = 72;
  const ringStroke = 5;
  const ringR = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringR;
  const ringDash = ringCirc * (1 - completeness / 100);

  const p = profile as any;
  const firstName = (p.name || '').trim().split(/\s+/)[0] || 'You';
  const cohort = p.cohort || p.track || '';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.push('/(app)/profile')} hitSlop={12}>
          <Ionicons name="person-circle-outline" size={22} color={colors.t2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Dilly</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/settings')} hitSlop={12}>
          <Ionicons name="settings-outline" size={20} color={colors.t3} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2B3A8E" />}
      >
        {/* ── Hero: Profile Strength + Identity ──────────────────────── */}
        <FadeInView delay={0}>
          <View style={s.heroCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              {/* Strength Ring */}
              <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={ringSize} height={ringSize}>
                  <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} stroke={colors.b2} strokeWidth={ringStroke} fill="transparent" />
                  <Circle
                    cx={ringSize / 2} cy={ringSize / 2} r={ringR}
                    stroke={strengthColor} strokeWidth={ringStroke} fill="transparent"
                    strokeDasharray={`${ringCirc} ${ringCirc}`}
                    strokeDashoffset={ringDash} strokeLinecap="round"
                    transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                  />
                </Svg>
                <Text style={{ position: 'absolute', fontSize: 20, fontWeight: '800', color: strengthColor }}>{completeness}%</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.t1 }}>
                  {firstName}'s Dilly
                </Text>
                {cohort ? <Text style={{ fontSize: 12, color: colors.t2, marginTop: 2 }}>{cohort}</Text> : null}
                <Text style={{ fontSize: 11, color: colors.t3, marginTop: 4 }}>
                  {totalFacts} facts learned{sessionCount > 0 ? ` from ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            </View>

            {/* Strength bar */}
            <View style={{ height: 4, backgroundColor: colors.s3, borderRadius: 2, marginTop: 14, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${completeness}%`, backgroundColor: strengthColor, borderRadius: 2 }} />
            </View>

            {/* Tell Dilly More CTA */}
            <AnimatedPressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, backgroundColor: colors.gold, paddingVertical: 12, borderRadius: 10 }}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `I want to tell you more about myself so you can build better resumes for me. Ask me about something you don't know yet.`,
              })}
              scaleDown={0.97}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Tell Dilly More</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>

        {/* ── Your Story (narrative) ─────────────────────────────────── */}
        <FadeInView delay={80}>
          <View style={s.narrativeCard}>
            <View style={s.narrativeHeader}>
              <Ionicons name="book-outline" size={14} color={colors.gold} />
              <Text style={s.narrativeTitle}>Your Story</Text>
              {data?.narrative_updated_relative && (
                <Text style={s.narrativeAge}>{data.narrative_updated_relative}</Text>
              )}
            </View>
            {data?.narrative ? (
              <Text style={s.narrativeText}>{data.narrative}</Text>
            ) : (
              <View style={s.narrativeEmpty}>
                <Text style={s.narrativeEmptyText}>
                  Chat with Dilly to start building your story. The more you share, the better your generated resumes will be.
                </Text>
              </View>
            )}
          </View>
        </FadeInView>

        {/* ── Missing nudges (what Dilly doesn't know yet) ───────────── */}
        {missingCore.length > 0 && (
          <FadeInView delay={140}>
            <View style={{ gap: 6, marginBottom: 8 }}>
              <Text style={s.sectionEyebrow}>WHAT DILLY STILL NEEDS</Text>
              {missingCore.slice(0, 4).map(m => {
                const cfg = CATEGORY_CONFIG[m.key];
                return (
                  <AnimatedPressable
                    key={m.key}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1 }}
                    onPress={() => startTellDillyFlow(m.nudge, m.key)}
                    scaleDown={0.98}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: (cfg?.color || colors.t3) + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={cfg?.icon as any || 'ellipse'} size={13} color={cfg?.color || colors.t3} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.t1 }}>{m.nudge}</Text>
                    <Ionicons name="chatbubble-outline" size={14} color={colors.gold} />
                  </AnimatedPressable>
                );
              })}
            </View>
          </FadeInView>
        )}

        {/* ── What Dilly Knows ───────────────────────────────────────── */}
        {orderedCategories.length > 0 ? (
          <FadeInView delay={200}>
            <Text style={s.sectionEyebrow}>WHAT DILLY KNOWS</Text>

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
                        <TouchableOpacity
                          key={fact.id}
                          style={[s.factRow, s.factRowBorder]}
                          onPress={() => openEditModal(fact)}
                          activeOpacity={0.7}
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
                            onPress={(e) => { e.stopPropagation(); deleteFact(fact.id); }}
                            hitSlop={12}
                            style={s.factDelete}
                          >
                            <Ionicons name="close" size={14} color={colors.t3} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                      {/* Add fact button */}
                      <TouchableOpacity
                        style={s.addFactRow}
                        onPress={() => openAddModal(cat)}
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
          </FadeInView>
        ) : (
          <View style={s.emptyState}>
            <Ionicons name="sparkles" size={44} color={colors.gold} style={{ marginBottom: 14 }} />
            <Text style={s.emptyTitle}>Your Dilly Profile is empty</Text>
            <Text style={s.emptyText}>
              Tell Dilly about yourself — your goals, projects, skills, what you're good at. The more Dilly knows, the better your custom resumes will be.
            </Text>
            <AnimatedPressable
              style={s.emptyCta}
              onPress={() => openDillyOverlay({
                isPaid: true,
                initialMessage: `I want to build my Dilly Profile. Ask me about my experiences, projects, skills, and career goals so you can generate better resumes for me.`,
              })}
              scaleDown={0.97}
            >
              <Ionicons name="chatbubble-ellipses" size={14} color="#FFFFFF" />
              <Text style={s.emptyCtaText}>Start building your profile</Text>
            </AnimatedPressable>
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

      {/* ── Edit Fact Modal ─────────────────────────────────────────── */}
      <AddFactModal
        visible={!!editingFact}
        category={editingFact?.category || ''}
        mode="edit"
        initialLabel={editingFact?.label}
        initialValue={editingFact?.value}
        onClose={() => setEditingFact(null)}
        onAdd={(label, value) => saveEdit(label, value)}
      />

      {/* ── Add Fact Modal ──────────────────────────────────────────── */}
      <AddFactModal
        visible={!!addCategory}
        category={addCategory || ''}
        onClose={() => setAddCategory(null)}
        onAdd={async (label, value) => {
          if (!addCategory) return;
          try {
            const res = await dilly.fetch('/memory/items', {
              method: 'POST',
              body: JSON.stringify({
                category: addCategory,
                label: label.slice(0, 80),
                value: value,
                source: 'profile',
                confidence: 'high',
              }),
            });
            if (res.ok) fetchData();
          } catch {}
          setAddCategory(null);
        }}
      />
    </View>
  );
}

// ── Add Fact Modal ──────────────────────────────────────────────────────────

function AddFactModal({ visible, category, onClose, onAdd, initialLabel, initialValue, mode }: {
  visible: boolean;
  category: string;
  onClose: () => void;
  onAdd: (label: string, value: string) => void;
  initialLabel?: string;
  initialValue?: string;
  mode?: 'add' | 'edit';
}) {
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState(initialLabel || '');
  const [value, setValue] = useState(initialValue || '');

  // Re-sync when the modal opens with new initial values (edit different fact)
  useEffect(() => {
    if (visible) {
      setLabel(initialLabel || '');
      setValue(initialValue || '');
    }
  }, [visible, initialLabel, initialValue]);

  const cfg = CATEGORY_CONFIG[category] || { icon: 'ellipse', label: category, color: colors.t2 };
  const isEdit = mode === 'edit';

  function handleAdd() {
    if (!label.trim()) { Alert.alert('Title required'); return; }
    onAdd(label.trim(), value.trim() || label.trim());
    setLabel('');
    setValue('');
  }

  function handleClose() {
    setLabel('');
    setValue('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={handleClose}>
      <View style={s.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
          <View style={[s.modalCard, { paddingBottom: insets.bottom + 20 }]}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.categoryIcon, { backgroundColor: cfg.color + '18' }]}>
                  <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                </View>
                <Text style={s.modalTitle}>{isEdit ? `Edit ${cfg.label}` : `Add to ${cfg.label}`}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={20} color={colors.t2} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.modalInput}
              value={label}
              onChangeText={setLabel}
              placeholder="Title (e.g. Rock climbing)"
              placeholderTextColor={colors.t3}
              autoFocus
            />
            <TextInput
              style={[s.modalInput, { minHeight: 72 }]}
              value={value}
              onChangeText={setValue}
              placeholder="Details (e.g. Play club soccer at UTampa, midfielder, 3x/week)"
              placeholderTextColor={colors.t3}
              multiline
            />

            <TouchableOpacity
              style={[s.modalBtn, { backgroundColor: cfg.color }]}
              onPress={handleAdd}
              activeOpacity={0.85}
            >
              <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={16} color="#FFFFFF" />
              <Text style={s.modalBtnText}>{isEdit ? 'Save changes' : 'Add to Profile'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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

  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16, gap: 16 },

  // ── Hero
  heroCard: {
    backgroundColor: colors.s1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    padding: 18,
  },

  // ── Narrative ─────────────────────────────────────────────────────────────
  narrativeCard: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    padding: 16,
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

  // ── Completeness Card ──────────────────────────────────────────────────────
  completenessCard: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 16,
    marginBottom: 20,
  },
  completenessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  completenessTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: colors.t3,
    marginBottom: 4,
  },
  completenessPercent: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  ringWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBg: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.b2,
  },
  ringFill: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
  },
  ringText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.t2,
  },
  completenessBar: {
    height: 6,
    backgroundColor: colors.b2,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: 12,
  },
  completenessFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  nudgeList: {
    gap: 6,
  },
  nudgeLabel: {
    fontSize: 10,
    color: colors.t3,
    marginBottom: 2,
  },
  nudgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.s3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  nudgeText: {
    fontSize: 11,
    color: colors.t2,
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
    color: '#FFFFFF',
  },

  // ── Stats Footer ──────────────────────────────────────────────────────────
  statsFooter: {
    fontSize: 11,
    color: colors.t3,
    textAlign: 'center',
    marginTop: 20,
  },

  // ── Add Fact Modal ────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.s1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
    letterSpacing: 1,
    color: colors.t1,
  },
  modalInput: {
    backgroundColor: colors.s2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
    fontSize: 14,
    color: colors.t1,
    marginBottom: 10,
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 6,
  },
  modalBtnText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
});
