/**
 * MY DILLY — Your Career DNA.
 *
 * Not a settings page. Not a list of facts. A living, breathing
 * representation of who you are professionally — everything Dilly
 * knows, visualized beautifully.
 *
 * Sections:
 * 1. Identity Card (premium gradient hero)
 * 2. Talk to Dilly (rotating conversation starter)
 * 3. Strengths Map (visual grid of career strengths)
 * 4. Skills Cloud (tag cloud with confidence sizing)
 * 5. Experiences (timeline with extracted details)
 * 6. Generated Resumes Gallery
 * 7. What Dilly Still Needs (missing profile areas)
 * 8. Profile Activity
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  LayoutAnimation, RefreshControl, Animated, Easing,
  Dimensions, Image, TextInput, Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { mediumHaptic } from '../../lib/haptics';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import DillyFooter from '../../components/DillyFooter';
import DillyCardEditor, { type CardData } from '../../components/DillyCard';
import InlinePopup, { type PopupAction } from '../../components/InlinePopup';
import InlineToastView, { useInlineToast } from '../../components/InlineToast';

const W = Dimensions.get('window').width;
const GOLD = '#2B3A8E';
const COBALT = '#1652F0';
const CYAN = '#58A6FF';

// ── Types ────────────────────────────────────────────────────────────────────

interface FactItem {
  id: string; category: string; label: string; value: string;
  confidence: string; created_at: string; source: string;
}

interface MemorySurface {
  items: FactItem[];
  grouped: Record<string, FactItem[]>;
}

// ── Category config ──────────────────────────────────────────────────────────

const STRENGTH_CATEGORIES: Record<string, { icon: string; label: string; color: string }> = {
  achievement:          { icon: 'trophy',        label: 'Achievements',   color: '#FFD700' },
  goal:                 { icon: 'flag',          label: 'Goals',          color: colors.green },
  target_company:       { icon: 'business',      label: 'Target Cos',    color: COBALT },
  skill_unlisted:       { icon: 'code-slash',    label: 'Hidden Skills',  color: CYAN },
  project_detail:       { icon: 'construct',     label: 'Projects',       color: colors.green },
  motivation:           { icon: 'heart',         label: 'Motivations',    color: '#FF6B8A' },
  personality:          { icon: 'person',        label: 'Personality',    color: '#AF52DE' },
  soft_skill:           { icon: 'people',        label: 'Soft Skills',    color: '#AF52DE' },
  hobby:                { icon: 'football',      label: 'Interests',      color: '#FF9F0A' },
  strength:             { icon: 'trending-up',   label: 'Strengths',      color: colors.green },
  weakness:             { icon: 'alert-circle',  label: 'Weaknesses',     color: colors.coral },
  challenge:            { icon: 'fitness',       label: 'Challenges',     color: colors.amber },
  area_for_improvement: { icon: 'arrow-up',      label: 'To Improve',     color: colors.amber },
  fear:                 { icon: 'thunderstorm',  label: 'Concerns',       color: '#8E8E93' },
  company_culture_pref: { icon: 'storefront',    label: 'Culture Fit',    color: '#FFD700' },
  life_context:         { icon: 'home',          label: 'Background',     color: '#FF9F0A' },
};

const CORE_CATEGORIES = [
  { key: 'goal', nudge: 'your career goals' },
  { key: 'target_company', nudge: 'your dream companies' },
  { key: 'skill_unlisted', nudge: 'skills not in your profile yet' },
  { key: 'project_detail', nudge: 'a project you worked on' },
  { key: 'motivation', nudge: 'what drives you' },
  { key: 'personality', nudge: 'your work style' },
  { key: 'strength', nudge: 'what you are good at' },
  { key: 'hobby', nudge: 'your hobbies' },
  { key: 'company_culture_pref', nudge: 'your ideal workplace' },
  { key: 'achievement', nudge: 'something you are proud of' },
];

// Rotating conversation starters
const CONVERSATION_STARTERS = [
  { prompt: 'Tell me about a project you are proud of', icon: 'construct' },
  { prompt: 'What kind of company culture do you thrive in?', icon: 'storefront' },
  { prompt: 'What is a skill you have that Dilly does not know about yet?', icon: 'code-slash' },
  { prompt: 'What are you most passionate about in your career?', icon: 'heart' },
  { prompt: 'Describe your biggest professional achievement', icon: 'trophy' },
  { prompt: 'What does your ideal first job look like?', icon: 'business' },
];

// ── Strength Ring ────────────────────────────────────────────────────────────

function StrengthRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const sw = 4;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct / 100);
  const color = pct >= 70 ? colors.green : pct >= 40 ? '#FF9F0A' : '#FF453A';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={sw} fill="transparent" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={sw} fill="transparent"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 14, fontWeight: '800', color: '#fff' }}>{pct}%</Text>
    </View>
  );
}

// ── Fact Row (measures own position for inline popup) ────────────────────────

function FactRow({ fact, color, onPress }: { fact: FactItem; color: string; onPress: (anchor: { x: number; y: number }) => void }) {
  const rowRef = useRef<View>(null);
  return (
    <AnimatedPressable
      style={d.factRow}
      onPress={() => {
        rowRef.current?.measureInWindow((x, y, w, h) => {
          onPress({ x: x + w - 30, y: y + h / 2 });
        });
      }}
      scaleDown={0.98}
    >
      <View ref={rowRef} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
        <View style={[d.factDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={d.factLabel}>{fact.label}</Text>
          <Text style={d.factValue}>{fact.value}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={14} color={colors.t3} />
      </View>
    </AnimatedPressable>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function MyDillyProfileScreen() {
  const insets = useSafeAreaInsets();
  const toast = useInlineToast();
  const [data, setData] = useState<MemorySurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [starterIdx, setStarterIdx] = useState(0);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [popup, setPopup] = useState<{ visible: boolean; anchor?: { x: number; y: number }; fact?: FactItem }>({ visible: false });
  const [editingFact, setEditingFact] = useState<{ fact: FactItem; label: string; value: string } | null>(null);
  const [resumes, setResumes] = useState<{ id: string; job_title: string; company: string; created_at: string }[]>([]);
  const starterOpacity = useRef(new Animated.Value(1)).current;

  const fetchData = useCallback(async () => {
    try {
      const [memRes, profileRes, resumesRes] = await Promise.all([
        dilly.fetch('/memory'),
        dilly.get('/profile').catch(() => null),
        dilly.get('/generated-resumes').catch(() => null),
      ]);
      if (memRes.ok) {
        const json = await memRes.json();
        setData(json);
      }
      if (profileRes) setProfile(profileRes || {});
      if (resumesRes?.resumes) setResumes(resumesRes.resumes);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  // Rotate conversation starters
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(starterOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setStarterIdx(i => (i + 1) % CONVERSATION_STARTERS.length);
        Animated.timing(starterOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(async () => {
    mediumHaptic();
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Derived
  const p = profile as any;
  const firstName = (p.name || '').trim().split(/\s+/)[0] || 'You';
  const fullName = (p.name || '').trim() || 'Your Name';
  const cohort = p.cohort || p.track || '';
  const school = p.school_id === 'utampa' ? 'University of Tampa' : (p.school_name || '');
  const totalFacts = data?.items?.length ?? 0;
  const filledCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) > 0);
  const missingCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) === 0);
  const completeness = CORE_CATEGORIES.length > 0 ? Math.round((filledCore.length / CORE_CATEGORIES.length) * 100) : 0;
  const starter = CONVERSATION_STARTERS[starterIdx];

  // Skills from skill_unlisted + soft_skill categories
  const allSkills = [
    ...(data?.grouped?.skill_unlisted || []),
    ...(data?.grouped?.soft_skill || []),
  ];

  // Strength categories that have facts
  const strengthCats = Object.keys(STRENGTH_CATEGORIES).filter(k => (data?.grouped?.[k]?.length ?? 0) > 0);

  // Share a resume card
  const handleShareResume = (resume: { id: string; job_title: string; company: string }) => {
    router.push({ pathname: '/(app)/resume-generate', params: { viewId: resume.id } });
  };

  if (loading) {
    return (
      <View style={[d.container, { paddingTop: insets.top }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="person-circle" size={60} color={colors.t3} />
          <Text style={{ color: colors.t3, marginTop: 12, fontSize: 13 }}>Loading your Dilly profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={d.container}>
      {/* Toast overlay — absolute, top-most z-index */}
      <InlineToastView
        {...toast.props}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999 }}
      />

      {/* Header */}
      <View style={[d.header, { paddingTop: insets.top + 8 }]}>
        <View style={{ width: 28 }} />
        <Text style={d.headerTitle}>My Dilly</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/settings')} hitSlop={12}>
          <Ionicons name="settings-outline" size={20} color={colors.t3} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[d.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={GOLD} />}
      >

        {/* ── 1. Dilly Card ──────────────────────────────────── */}
        <FadeInView delay={0}>
          <DillyCardEditor
            initialData={{
              name: fullName,
              school: p.user_type === 'professional' ? '' : school,
              major: p.user_type === 'professional' ? (p.career_fields?.[0] || '') : (p.majors?.[0] || p.major || ''),
              classYear: p.user_type === 'professional' ? '' : (p.graduation_year ? String(p.graduation_year) : ''),
              tagline: p.profile_tagline || p.custom_tagline || '',
              email: p.email || '',
              phones: p.phones || [{ label: 'Cell', number: '' }],
              username: p.profile_slug || '',
              photoUri: p.profile_slug ? `https://api.trydilly.com/profile/public/${p.profile_slug}/photo` : null,
            }}
            onSave={() => {}}
            userType={p.user_type}
          />
        </FadeInView>

        {/* ── 2. Talk to Dilly (rotating prompt) ───────────────── */}
        <FadeInView delay={80}>
          <AnimatedPressable
            style={d.talkCard}
            onPress={() => openDillyOverlay({
              isPaid: true,
              initialMessage: `I want to tell you more about myself. ${starter.prompt}`,
            })}
            scaleDown={0.98}
          >
            <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: starterOpacity }}>
              <View style={d.talkIcon}>
                <Ionicons name={starter.icon as any} size={18} color={COBALT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={d.talkPrompt}>{starter.prompt}</Text>
                <Text style={d.talkHint}>Tap to tell Dilly</Text>
              </View>
              <Ionicons name="chatbubble-ellipses" size={20} color={COBALT} />
            </Animated.View>
          </AnimatedPressable>
        </FadeInView>

        {/* ── 3. Strengths Map ─────────────────────────────────── */}
        {strengthCats.length > 0 && (
          <FadeInView delay={200}>
            <Text style={d.sectionLabel}>WHAT WE KNOW ABOUT YOU</Text>
            <View style={d.strengthGrid}>
              {Object.entries(STRENGTH_CATEGORIES).map(([key, cfg]) => {
                const facts = data?.grouped?.[key] || [];
                const filled = facts.length > 0;
                return (
                  <AnimatedPressable
                    key={key}
                    style={[d.strengthCard, filled && { borderColor: cfg.color + '40', backgroundColor: cfg.color + '08' }]}
                    onPress={() => {
                      if (filled) {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setExpandedCat(expandedCat === key ? null : key);
                      } else {
                        openDillyOverlay({
                          isPaid: true,
                          initialMessage: `I want to tell you about ${cfg.label.toLowerCase()}. Ask me a specific question to get started.`,
                        });
                      }
                    }}
                    scaleDown={0.96}
                  >
                    <View style={[d.strengthIcon, { backgroundColor: filled ? cfg.color + '20' : colors.s3 }]}>
                      <Ionicons name={cfg.icon as any} size={16} color={filled ? cfg.color : colors.t3} />
                    </View>
                    <Text style={[d.strengthName, filled && { color: colors.t1 }]} numberOfLines={1}>{cfg.label}</Text>
                    {filled ? (
                      <View style={[d.strengthBadge, { backgroundColor: cfg.color + '20' }]}>
                        <Text style={[d.strengthBadgeText, { color: cfg.color }]}>{facts.length}</Text>
                      </View>
                    ) : (
                      <Ionicons name="add-circle-outline" size={14} color={colors.t3} />
                    )}
                  </AnimatedPressable>
                );
              })}
            </View>

            {/* Expanded category details */}
            {expandedCat && data?.grouped?.[expandedCat] && (
              <View style={d.expandedFacts}>
                {data.grouped[expandedCat].slice(0, 8).map((fact, i) => (
                  <FactRow
                    key={fact.id || i}
                    fact={fact}
                    color={STRENGTH_CATEGORIES[expandedCat]?.color || colors.t3}
                    onPress={(anchor) => setPopup({ visible: true, anchor, fact })}
                  />
                ))}
                {/* Add new fact */}
                <AnimatedPressable
                  style={[d.factRow, { borderTopWidth: 1, borderTopColor: colors.b1, paddingTop: 10 }]}
                  onPress={() => openDillyOverlay({
                    isPaid: true,
                    initialMessage: `I want to add something new to my ${STRENGTH_CATEGORIES[expandedCat]?.label || expandedCat} profile. Ask me what I want to add.`,
                  })}
                  scaleDown={0.97}
                >
                  <Ionicons name="add-circle" size={16} color={colors.gold} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gold }}>Add to {STRENGTH_CATEGORIES[expandedCat]?.label || expandedCat}</Text>
                </AnimatedPressable>
              </View>
            )}
          </FadeInView>
        )}

        {/* ── 4. Skills Cloud ──────────────────────────────────── */}
        {allSkills.length > 0 && (
          <FadeInView delay={260}>
            <Text style={d.sectionLabel}>SKILLS DILLY KNOWS</Text>
            <View style={d.skillCloud}>
              {allSkills.slice(0, 20).map((skill, i) => {
                const conf = skill.confidence === 'high' ? 1 : skill.confidence === 'medium' ? 0.7 : 0.4;
                return (
                  <View key={skill.id || i} style={[d.skillTag, { opacity: 0.5 + conf * 0.5 }]}>
                    <Text style={[d.skillTagText, { fontSize: 11 + conf * 3 }]}>{skill.label || skill.value}</Text>
                  </View>
                );
              })}
            </View>
          </FadeInView>
        )}

        {/* ── 5. Help Dilly Help You (always visible) ─────────── */}
        <FadeInView delay={320}>
          <Text style={d.sectionLabel}>HELP DILLY HELP YOU</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[
              { icon: 'people', text: 'Tell Dilly about a leadership role you held', color: colors.indigo },
              { icon: 'rocket', text: 'Share a project you are proud of', color: colors.green },
              { icon: 'briefcase', text: 'Tell Dilly about an internship experience', color: colors.amber },
              { icon: 'compass', text: 'Share your career goals', color: COBALT },
              { icon: 'build', text: 'Tell Dilly about a skill you are developing', color: colors.coral },
              { icon: 'heart', text: 'Share a challenge you overcame', color: '#E040FB' },
              { icon: 'hand-left', text: 'Tell Dilly about volunteer work', color: colors.green },
              { icon: 'school', text: 'Share your GPA or academic honors', color: colors.indigo },
              { icon: 'flag', text: 'Tell Dilly about a club or organization', color: colors.amber },
              { icon: 'globe', text: 'Share what industries interest you', color: COBALT },
              { icon: 'star', text: 'Tell Dilly about your dream companies', color: GOLD },
              { icon: 'chatbubbles', text: 'Describe a time you worked on a team', color: colors.coral },
            ].slice((totalFacts % 8), (totalFacts % 8) + 4).concat(
              [{ icon: 'people', text: 'Tell Dilly about a leadership role', color: colors.indigo },
               { icon: 'rocket', text: 'Share a project you are proud of', color: colors.green },
               { icon: 'briefcase', text: 'Tell Dilly about an internship', color: colors.amber },
               { icon: 'compass', text: 'Share your career goals', color: COBALT }]
            ).slice(0, 4).map((item, i) => (
              <AnimatedPressable
                key={i}
                style={d.nudgeCard}
                onPress={() => openDillyOverlay({
                  isPaid: true,
                  initialMessage: `${item.text}. Ask me a specific question to get started.`,
                })}
                scaleDown={0.97}
              >
                <View style={[d.nudgeIcon, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={16} color={item.color} />
                </View>
                <Text style={d.nudgeText}>{item.text}</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.t3} />
              </AnimatedPressable>
            ))}
          </ScrollView>
        </FadeInView>

        {/* ── 5b. Milestones ──────────────────────────────────── */}
        <FadeInView delay={350}>
          <Text style={d.sectionLabel}>YOUR MILESTONES</Text>
          <View style={{ gap: 6 }}>
            {totalFacts > 0 && (
              <View style={d.milestoneRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={d.milestoneText}>{totalFacts} fact{totalFacts !== 1 ? 's' : ''} in your Dilly Profile</Text>
              </View>
            )}
            {resumes.length > 0 && (
              <View style={d.milestoneRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={d.milestoneText}>{resumes.length} tailored resume{resumes.length !== 1 ? 's' : ''} generated</Text>
              </View>
            )}
            {totalFacts === 0 && resumes.length === 0 && (
              <View style={d.milestoneRow}>
                <Ionicons name="ellipse-outline" size={16} color={colors.t3} />
                <Text style={d.milestoneText}>Start telling Dilly about yourself to unlock milestones</Text>
              </View>
            )}
          </View>
        </FadeInView>
        {/* ── 7. My Resumes ──────────────────────────────────── */}
        {resumes.length > 0 && (
          <FadeInView delay={400}>
            <Text style={d.sectionLabel}>MY RESUMES</Text>
            {resumes.slice(0, 5).map((r) => {
              const date = new Date(r.created_at);
              const dateStr = `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
              return (
                <AnimatedPressable
                  key={r.id}
                  style={d.resumeCard}
                  onPress={() => router.push({ pathname: '/(app)/resume-generate', params: { viewId: r.id } })}
                  scaleDown={0.98}
                >
                  <Ionicons name="document-text-outline" size={18} color={COBALT} />
                  <View style={{ flex: 1 }}>
                    <Text style={d.resumeTitle}>{r.job_title}</Text>
                    <Text style={d.resumeSub}>{r.company} · {dateStr}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={10}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleShareResume(r);
                    }}
                    style={d.resumeShareBtn}
                  >
                    <Ionicons name="share-outline" size={16} color={COBALT} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={14} color={colors.t3} />
                </AnimatedPressable>
              );
            })}
          </FadeInView>
        )}

        <DillyFooter />
      </ScrollView>

      {/* Inline popup for fact editing */}
      <InlinePopup
        visible={popup.visible}
        anchor={popup.anchor}
        title={popup.fact?.label}
        message={popup.fact?.value}
        actions={[
          {
            label: 'Edit',
            onPress: () => {
              if (!popup.fact) return;
              setEditingFact({ fact: popup.fact, label: popup.fact.label, value: popup.fact.value });
            },
          },
          {
            label: 'Delete',
            destructive: true,
            onPress: async () => {
              if (!popup.fact) return;
              const factId = popup.fact.id;
              try {
                await dilly.fetch(`/memory/items/${factId}`, { method: 'DELETE' });
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setData(prev => {
                  if (!prev) return prev;
                  const items = prev.items.filter(it => it.id !== factId);
                  const grouped: Record<string, any[]> = {};
                  for (const item of items) {
                    if (!grouped[item.category]) grouped[item.category] = [];
                    grouped[item.category].push(item);
                  }
                  return { ...prev, items, grouped };
                });
              } catch {}
            },
          },
        ]}
        onClose={() => setPopup({ visible: false })}
      />

      {/* Inline fact editor */}
      {editingFact && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.15)' }]}
            activeOpacity={1}
            onPress={() => { Keyboard.dismiss(); setEditingFact(null); }}
          />
          <View style={d.inlineEditor}>
            <Text style={d.inlineEditorFieldLabel}>Title</Text>
            <TextInput
              style={d.inlineEditorLabelInput}
              value={editingFact.label}
              onChangeText={(v) => setEditingFact(prev => prev ? { ...prev, label: v } : prev)}
              autoFocus
              returnKeyType="next"
            />
            <Text style={[d.inlineEditorFieldLabel, { marginTop: 12 }]}>Value</Text>
            <TextInput
              style={d.inlineEditorInput}
              value={editingFact.value}
              onChangeText={(v) => setEditingFact(prev => prev ? { ...prev, value: v } : prev)}
              multiline
              returnKeyType="done"
              blurOnSubmit
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={d.inlineEditorCancel}
                onPress={() => setEditingFact(null)}
              >
                <Text style={{ fontSize: 13, color: colors.t2 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={d.inlineEditorSave}
                onPress={async () => {
                  if (!editingFact) return;
                  const { fact, label, value } = editingFact;
                  if (label.trim() === fact.label && value.trim() === fact.value) { setEditingFact(null); return; }
                  try {
                    await dilly.fetch(`/memory/items/${fact.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ label: label.trim(), value: value.trim() }),
                    });
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setData(prev => {
                      if (!prev) return prev;
                      const items = prev.items.map(it => it.id === fact.id ? { ...it, label: label.trim(), value: value.trim() } : it);
                      const grouped: Record<string, any[]> = {};
                      for (const item of items) {
                        if (!grouped[item.category]) grouped[item.category] = [];
                        grouped[item.category].push(item);
                      }
                      return { ...prev, items, grouped };
                    });
                  } catch {}
                  setEditingFact(null);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.t1 },
  scroll: { paddingHorizontal: spacing.lg, gap: 16 },

  // Identity Card
  idCard: { borderRadius: 18, overflow: 'hidden' },
  idCardGradient: {
    backgroundColor: '#0D1117', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: '#21262D',
  },
  idCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  idCardBrand: { fontSize: 10, fontWeight: '800', letterSpacing: 3, color: CYAN, marginBottom: 6 },
  idCardName: { fontSize: 22, fontWeight: '800', color: '#F0F6FC', lineHeight: 26 },
  idCardCohort: { fontSize: 13, color: '#8B949E', marginTop: 4 },
  idCardSchool: { fontSize: 11, color: '#484F58', marginTop: 2 },
  idCardBottom: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
    marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#21262D',
  },
  idCardStat: { alignItems: 'center' },
  idCardStatNum: { fontSize: 18, fontWeight: '800', color: '#F0F6FC' },
  idCardStatLabel: { fontSize: 9, color: '#484F58', marginTop: 2, fontWeight: '600', letterSpacing: 0.5 },
  shareBtn: { marginLeft: 'auto', padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },

  // Talk to Dilly
  talkCard: {
    backgroundColor: COBALT + '08', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: COBALT + '25',
  },
  talkIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COBALT + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  talkPrompt: { fontSize: 14, fontWeight: '600', color: colors.t1, lineHeight: 19 },
  talkHint: { fontSize: 11, color: COBALT, marginTop: 2, fontWeight: '500' },

  // Section label
  sectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: colors.t3, marginBottom: 4 },

  // Strengths Map
  strengthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  strengthCard: {
    width: (W - spacing.lg * 2 - 8) / 2, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.b1,
  },
  strengthIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  strengthName: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.t3 },
  strengthBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  strengthBadgeText: { fontSize: 10, fontWeight: '700' },

  // Expanded facts
  expandedFacts: {
    backgroundColor: colors.s1, borderRadius: 10, padding: 12, gap: 8,
    borderWidth: 1, borderColor: colors.b1,
  },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  factLabel: { fontSize: 12, fontWeight: '600', color: colors.t1 },
  factValue: { fontSize: 11, color: colors.t2, lineHeight: 16, marginTop: 1 },

  // Skills Cloud
  skillCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillTag: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COBALT + '10', borderWidth: 1, borderColor: COBALT + '20',
  },
  skillTagText: { fontWeight: '600', color: COBALT },

  // Nudge cards (horizontal scroll)
  nudgeCard: {
    width: 160, backgroundColor: colors.s1, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.b1, gap: 8,
  },
  nudgeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nudgeText: { fontSize: 12, fontWeight: '500', color: colors.t1, lineHeight: 17 },

  // Activity
  activityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s1, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.b1,
  },
  activityText: { fontSize: 12, color: colors.t2, fontWeight: '500' },

  // Milestones
  milestoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.s1, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.b1,
  },
  milestoneText: { fontSize: 12, color: colors.t2, fontWeight: '500' },

  // My Resumes
  resumeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.b1, marginBottom: 8,
  },
  resumeTitle: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  resumeSub: { fontSize: 11, color: colors.t3, marginTop: 2 },
  resumeShareBtn: {
    padding: 6, borderRadius: 8, backgroundColor: COBALT + '10',
  },

  // Inline fact editor
  inlineEditor: {
    position: 'absolute',
    top: '30%',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.b1,
  },
  inlineEditorLabel: { fontSize: 12, fontWeight: '700', color: colors.t2, marginBottom: 8 },
  inlineEditorFieldLabel: { fontSize: 11, fontWeight: '600', color: colors.t3, marginBottom: 4, letterSpacing: 0.5 },
  inlineEditorLabelInput: {
    fontSize: 15, fontWeight: '600', color: colors.t1,
    borderWidth: 1, borderColor: colors.b1, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  inlineEditorInput: {
    fontSize: 15, color: colors.t1, lineHeight: 21,
    borderWidth: 1, borderColor: colors.b1, borderRadius: 10,
    padding: 12, minHeight: 60, textAlignVertical: 'top',
  },
  inlineEditorCancel: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, backgroundColor: colors.s2,
  },
  inlineEditorSave: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, backgroundColor: GOLD,
  },
});
