/**
 * Memory tab — visualizes the Dilly Profile as a knowledge graph.
 *
 * The Profile is Dilly's biggest moat (career second-brain that
 * compounds with every interaction). But until now it lived inside
 * My Dilly Profile as a flat list of facts, which doesn't *feel*
 * like a moat to the user. This screen crystallizes it:
 *
 *   - A counter at the top: "Dilly knows X things about you"
 *   - Growth: "12 things 30 days ago → 187 now"
 *   - Category clusters (skills, companies, people, projects, etc.)
 *   - Cross-category connections Dilly noticed ("Sarah → Goldman")
 *   - A narrative summary Dilly wrote about the user
 *
 * The strategic point: when a user opens this screen and sees the
 * web of stuff Dilly remembers about them, they understand why
 * Dilly is different from ChatGPT. That's the moment of "oh."
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import { DillyFace } from '../../components/DillyFace';
import FadeInView from '../../components/FadeInView';

/** Tiny growth sparkline — shows the user the moat compounding.
 *  Three real data points (30 days ago, 7 days ago, now) with line +
 *  end-dot, scaled to a fixed pixel area. Not pretending to be a
 *  full chart — just enough motion to make Profile growth feel real. */
function GrowthSparkline({ d30, d7, now, color, w = 100, h = 36 }: {
  d30: number; d7: number; now: number; color: string; w?: number; h?: number;
}) {
  const max = Math.max(now, 1);
  const min = Math.min(d30, d7, now, 0);
  const span = Math.max(1, max - min);
  const pts = [d30, d7, now];
  const xs = [0, w * 0.5, w];
  const ys = pts.map(v => h - ((v - min) / span) * (h - 4) - 2);
  const polyPoints = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <Svg width={w} height={h}>
      <Polyline
        points={polyPoints}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={xs[2]} cy={ys[2]} r={3.5} fill={color} />
    </Svg>
  );
}

type GraphItem = { id?: string; category?: string; label?: string; value?: string };
interface GraphData {
  total: number;
  categories: { category: string; count: number }[];
  clusters: Record<string, GraphItem[]>;
  connections: Array<{
    from: { id?: string; category: string; label: string };
    to: { id?: string; category: string; label: string };
    evidence: string;
  }>;
  growth: { now: number; d7: number; d30: number; added_last_7d: number; added_last_30d: number };
  narrative?: string | null;
}

const CATEGORY_ICONS: Record<string, { icon: string; label: string }> = {
  skill: { icon: 'construct', label: 'Skills' },
  skill_unlisted: { icon: 'construct-outline', label: 'Skills (off resume)' },
  technical_skill: { icon: 'code-slash', label: 'Technical Skills' },
  experience: { icon: 'briefcase', label: 'Experiences' },
  project: { icon: 'rocket', label: 'Projects' },
  project_detail: { icon: 'rocket-outline', label: 'Project Details' },
  person: { icon: 'person', label: 'People' },
  person_to_follow_up: { icon: 'person-circle', label: 'Follow Ups' },
  recruiter: { icon: 'person-circle', label: 'Recruiters' },
  company: { icon: 'business', label: 'Companies' },
  target_company: { icon: 'flag', label: 'Target Companies' },
  achievement: { icon: 'trophy', label: 'Achievements' },
  goal: { icon: 'flag-outline', label: 'Goals' },
  motivation: { icon: 'flame', label: 'Motivations' },
  interest: { icon: 'star', label: 'Interests' },
  hobby: { icon: 'happy', label: 'Hobbies' },
  personality: { icon: 'sparkles', label: 'Personality' },
  soft_skill: { icon: 'people', label: 'Soft Skills' },
  strength: { icon: 'flash', label: 'Strengths' },
  preference: { icon: 'options', label: 'Preferences' },
  deadline: { icon: 'calendar', label: 'Deadlines' },
  interview: { icon: 'mic', label: 'Interviews' },
  rejection: { icon: 'close-circle', label: 'Rejections' },
  career_interest: { icon: 'compass', label: 'Career Interests' },
  company_culture_pref: { icon: 'leaf', label: 'Culture Prefs' },
  availability: { icon: 'time', label: 'Availability' },
};

function categoryMeta(cat: string) {
  return CATEGORY_ICONS[cat] || { icon: 'ellipsis-horizontal', label: cat.replace(/_/g, ' ') };
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // ORGANISM: pull next 2 calendar events so the Memory tab can
  // call out facts that are "active this week" — e.g., a person/
  // company fact lights up when there's a scheduled event involving
  // it. Reads the same merged feed everything else uses.
  const [activeThisWeek, setActiveThisWeek] = useState<Array<{
    title: string; date: string; daysOut: number; company: string;
  }>>([]);

  const load = useCallback(async () => {
    try {
      const res = await dilly.get('/memory/graph');
      if (res) setData(res as GraphData);
      // Calendar suggestions for active-this-week halo
      try {
        const sug: any = await dilly.get('/calendar/profile-suggestions').catch(() => null);
        const items = (sug?.suggestions || []) as any[];
        const today = new Date();
        const todayKey = today.toISOString().slice(0, 10);
        const week = items
          .filter(s => s?.date && String(s.date) >= todayKey)
          .map(s => {
            const ms = new Date(String(s.date).slice(0, 10)).getTime() - new Date(todayKey).getTime();
            return {
              title: String(s.title || 'Event'),
              date: String(s.date).slice(0, 10),
              daysOut: Math.max(0, Math.round(ms / 86400000)),
              company: String(s.company || ''),
            };
          })
          .filter(e => e.daysOut <= 14)
          .sort((a, b) => a.daysOut - b.daysOut)
          .slice(0, 3);
        setActiveThisWeek(week);
      } catch {}
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface.bg, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <DillyFace size={88} mood="thoughtful" accessory="glasses" />
        <Text style={{ marginTop: 16, fontSize: 13, fontWeight: '600', color: theme.surface.t2, letterSpacing: 0.3 }}>
          Loading what Dilly remembers about you…
        </Text>
      </View>
    );
  }

  const total = data?.total || 0;
  const growth7 = data?.growth?.added_last_7d || 0;
  const growth30 = data?.growth?.added_last_30d || 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 80, paddingHorizontal: 18 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />
        }
      >
        {/* Header */}
        <FadeInView delay={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={theme.surface.t1} />
            </TouchableOpacity>
            <DillyFace size={36} mood="warm" />
            <Text style={{ fontFamily: theme.type.display, fontSize: 24, fontWeight: '800', color: theme.surface.t1, letterSpacing: 0.4 }}>
              Memory
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: theme.surface.t2, fontFamily: theme.type.body, lineHeight: 18, marginBottom: 22 }}>
            Everything Dilly's learned about you across every conversation. Tap a cluster to see the facts.
          </Text>
        </FadeInView>

        {/* Hero counter */}
        <FadeInView delay={80}>
          <View style={{
            backgroundColor: theme.surface.s1,
            borderColor: theme.surface.border,
            borderWidth: 1,
            borderRadius: 18,
            padding: 22,
            alignItems: 'center',
            marginBottom: 18,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2, marginBottom: 6 }}>
              DILLY REMEMBERS
            </Text>
            <Text style={{ fontSize: 56, fontWeight: '900', color: theme.accent, fontFamily: theme.type.display, letterSpacing: -1, lineHeight: 64 }}>
              {total}
            </Text>
            <Text style={{ fontSize: 13, color: theme.surface.t2, fontFamily: theme.type.body, marginTop: -2 }}>
              {total === 1 ? 'thing about you' : 'things about you'}
            </Text>
            {(growth7 > 0 || growth30 > 0) && (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.surface.border, width: '100%', justifyContent: 'center' }}>
                {growth7 > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.surface.t1 }}>+{growth7}</Text>
                    <Text style={{ fontSize: 10, color: theme.surface.t3, letterSpacing: 0.3 }}>this week</Text>
                  </View>
                )}
                {growth30 > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.surface.t1 }}>+{growth30}</Text>
                    <Text style={{ fontSize: 10, color: theme.surface.t3, letterSpacing: 0.3 }}>this month</Text>
                  </View>
                )}
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.surface.t1 }}>{data?.categories?.length || 0}</Text>
                  <Text style={{ fontSize: 10, color: theme.surface.t3, letterSpacing: 0.3 }}>categories</Text>
                </View>
              </View>
            )}
            {/* Growth sparkline — three points (30d ago / 7d ago / now)
                with a connecting line. Crystallizes the moat: every
                conversation makes Dilly know more, and the line goes
                up. Shown only when there's actual movement to chart. */}
            {data?.growth && data.growth.now > 0 && (data.growth.added_last_30d > 0 || data.growth.added_last_7d > 0) && (
              <View style={{ width: '100%', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.surface.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.surface.t3, letterSpacing: 0.8 }}>
                      30 DAYS AGO
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.surface.t2, marginTop: 2 }}>
                      {data.growth.d30}
                    </Text>
                  </View>
                  <GrowthSparkline
                    d30={data.growth.d30}
                    d7={data.growth.d7}
                    now={data.growth.now}
                    color={theme.accent}
                    w={120}
                    h={36}
                  />
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.accent, letterSpacing: 0.8 }}>
                      NOW
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.accent, marginTop: 2 }}>
                      {data.growth.now}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </FadeInView>

        {/* Empty state */}
        {total === 0 && (
          <FadeInView delay={120}>
            <View style={{ backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderWidth: 1, borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="chatbubbles-outline" size={28} color={theme.surface.t3} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1, marginTop: 8 }}>
                Nothing here yet.
              </Text>
              <Text style={{ fontSize: 12, color: theme.surface.t2, textAlign: 'center', marginTop: 4, lineHeight: 17 }}>
                Talk to Dilly. Every conversation builds your career second-brain.
                The more she knows, the better every other tool gets.
              </Text>
            </View>
          </FadeInView>
        )}

        {/* ── ORGANISM: ACTIVE THIS WEEK ──────────────────────
            Surfaces facts that connect to upcoming calendar events.
            "Memory tab" stops feeling like a static archive and
            starts feeling like a live thing — facts light up when
            they're relevant to what's coming up. Tap → /calendar. */}
        {activeThisWeek.length > 0 && (
          <FadeInView delay={130}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="pulse" size={11} color={theme.accent} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.accent, letterSpacing: 1.2 }}>
                ACTIVE THIS WEEK
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(app)/calendar' as any)}
              activeOpacity={0.92}
              style={{
                marginBottom: 22,
                padding: 14,
                borderRadius: 14,
                backgroundColor: theme.accentSoft,
                borderWidth: 1, borderColor: theme.accent + '40',
                gap: 8,
              }}
            >
              {activeThisWeek.map((e, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    paddingHorizontal: 7, paddingVertical: 2,
                    borderRadius: 8,
                    backgroundColor: theme.accent,
                  }}>
                    <Text style={{
                      fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.3,
                    }}>
                      {e.daysOut === 0 ? 'TODAY' : e.daysOut === 1 ? 'TOMORROW' : `IN ${e.daysOut}D`}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '700', color: theme.surface.t1 }}>
                    {e.title}
                  </Text>
                </View>
              ))}
              <Text style={{ fontSize: 11, color: theme.surface.t2, marginTop: 2, fontStyle: 'italic' }}>
                Tap to see your full calendar.
              </Text>
            </TouchableOpacity>
          </FadeInView>
        )}

        {/* Connections — "Dilly noticed" */}
        {data?.connections && data.connections.length > 0 && (
          <FadeInView delay={140}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2, marginBottom: 8 }}>
              DILLY NOTICED
            </Text>
            <View style={{ marginBottom: 22, gap: 8 }}>
              {data.connections.slice(0, 6).map((c, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.accentBorder,
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={categoryMeta(c.from.category).icon as any} size={12} color={theme.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.surface.t1 }}>
                      {c.from.label}
                    </Text>
                    <Ionicons name="arrow-forward" size={11} color={theme.surface.t3} />
                    <Ionicons name={categoryMeta(c.to.category).icon as any} size={12} color={theme.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.surface.t1 }}>
                      {c.to.label}
                    </Text>
                  </View>
                  {!!c.evidence && (
                    <Text style={{ fontSize: 11, color: theme.surface.t2, marginTop: 4, fontStyle: 'italic', lineHeight: 15 }}>
                      "{c.evidence}"
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        {/* Category clusters */}
        {(data?.categories || []).length > 0 && (
          <FadeInView delay={180}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2, marginBottom: 8 }}>
              WHAT DILLY KNOWS
            </Text>
            <View style={{ gap: 10, marginBottom: 22 }}>
              {(data?.categories || []).map((c) => {
                const meta = categoryMeta(c.category);
                return (
                  <TouchableOpacity
                    key={c.category}
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: theme.surface.s1,
                      borderColor: theme.surface.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                    }}
                    onPress={() => router.push({ pathname: '/(app)/my-dilly-category', params: { cat: c.category } } as any)}
                  >
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accentBorder,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name={meta.icon as any} size={15} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1 }}>
                        {meta.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.surface.t3 }}>
                        {c.count} {c.count === 1 ? 'fact' : 'facts'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </FadeInView>
        )}

        {/* Narrative */}
        {data?.narrative && (
          <FadeInView delay={220}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2, marginBottom: 8 }}>
              DILLY'S READ ON YOU
            </Text>
            <View style={{ backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 22 }}>
              <Text style={{ fontSize: 13, color: theme.surface.t1, lineHeight: 19, fontStyle: 'italic', fontFamily: theme.type.body }}>
                {data.narrative}
              </Text>
            </View>
          </FadeInView>
        )}

        {/* Footer CTA */}
        <FadeInView delay={260}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <Text style={{ fontSize: 11, color: theme.surface.t3, textAlign: 'center', maxWidth: 280, lineHeight: 16 }}>
              Every conversation with Dilly grows this. Talk to her, and your resume,
              your tracker, and your interview prep all get sharper.
            </Text>
          </View>
        </FadeInView>
      </ScrollView>
    </View>
  );
}
