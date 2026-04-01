import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import useCelebration from '../../hooks/useCelebration';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  initials: string;
  name: string;
  major: string;
  score: number;
  isYou?: boolean;
  delta?: number; // pts from rank above
}

interface RankData {
  track: string;
  your_rank: number;
  rank_change: number; // positive = moved up
  entries: LeaderboardEntry[];
  weakest_dim: string;
  pts_to_next: number;
  activity: { color: string; text: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rankColor(rank: number): string {
  if (rank === 1) return colors.gold;
  if (rank === 2) return 'rgba(192,192,192,0.9)';
  if (rank === 3) return 'rgba(205,127,50,0.9)';
  return colors.t3;
}

function movementText(change: number): { label: string; color: string } {
  if (change > 0) return { label: `↑ Up ${change} from last week`, color: colors.green };
  if (change < 0) return { label: `↓ Down ${Math.abs(change)} from last week`, color: colors.coral };
  return { label: '→ Holding steady', color: colors.t3 };
}

// ── Fallback data (shown when no real leaderboard yet) ────────────────────────

function buildFallback(profile: any, audit: any): RankData {
  const track = profile?.track || 'General';
  const yourScore = audit?.final_score ?? 72;
  const yourRank = 8;

  const names = [
    { i: 'AK', n: 'Arjun K.', m: 'Computer Science' },
    { i: 'SP', n: 'Sofia P.', m: 'Data Science' },
    { i: 'ML', n: 'Marcus L.', m: 'CS + Finance' },
    { i: 'ZW', n: 'Zoe W.', m: 'Computer Science' },
    { i: 'RJ', n: 'Rohan J.', m: 'Software Eng.' },
    { i: 'EV', n: 'Elena V.', m: 'Data Science' },
    { i: 'TN', n: 'Tyler N.', m: 'Cybersecurity' },
  ];

  const topScores = [94, 91, 88, 85, 83, 81, 79];
  const entries: LeaderboardEntry[] = names.map((n, i) => ({
    rank: i + 1,
    initials: n.i,
    name: n.n,
    major: n.m,
    score: topScores[i],
    isYou: false,
  }));

  const youAbove = entries[yourRank - 2];
  entries.push({
    rank: yourRank,
    initials: 'DK',
    name: 'You',
    major: profile?.track || 'Tech',
    score: yourScore,
    isYou: true,
    delta: youAbove ? youAbove.score - yourScore : 0,
  });

  const scores: Record<string, number> = audit?.scores || { smart: 68, grit: 100, build: 72 };
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] || 'smart';

  return {
    track,
    your_rank: yourRank,
    rank_change: 2,
    entries,
    weakest_dim: weakest,
    pts_to_next: (youAbove?.score || 0) - yourScore,
    activity: [
      { color: colors.green, text: 'D.K. moved into Top 10% this week' },
      { color: colors.blue, text: '3 new students joined the Tech cohort' },
      { color: colors.gold, text: 'M.T. improved their Grit score by 8 pts' },
      { color: colors.coral, text: 'Goldman Sachs deadline in 12 days' },
    ],
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RankScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<RankData | null>(null);
  const { CelebrationPortal } = useCelebration();

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, auditRes] = await Promise.all([
          dilly.get('/profile'),
          dilly.get('/audit/latest'),
        ]);
        const audit = auditRes?.audit ?? auditRes;
        const rankData = buildFallback(profileRes, audit);
        setData(rankData);
      } catch {
        setData({
          track: '',
          your_rank: 0,
          rank_change: 0,
          entries: [],
          weakest_dim: '',
          pts_to_next: 0,
          activity: [],
        });
      }
    })();
  }, []);

  if (!data) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.t3, fontSize: 12 }}>Loading…</Text>
      </View>
    );
  }

  if (data.entries.length === 0) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <Ionicons name="podium-outline" size={48} color={colors.t3} style={{ marginBottom: 16 }} />
        <Text style={{ fontFamily: 'Cinzel_700Bold', fontSize: 16, color: colors.t1, marginBottom: 8 }}>No leaderboard data</Text>
        <Text style={{ fontSize: 14, color: colors.t2, textAlign: 'center', lineHeight: 20 }}>Leaderboard data unavailable. Pull down to refresh.</Text>
        <CelebrationPortal />
      </View>
    );
  }

  const move = movementText(data.rank_change);
  const topThree = data.entries.filter(e => e.rank <= 3);
  const listEntries = data.entries.slice(0, data.your_rank + 2);
  const youEntry = data.entries.find(e => e.isYou);

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <Text style={s.eyebrow}>RANK</Text>
        <Text style={s.subEyebrow}>{data.track} cohort</Text>

        {/* Your rank */}
        <View style={s.rankHero}>
          <Text style={s.rankYoure}>You're</Text>
          <Text style={[s.rankNumber, { color: data.your_rank <= 10 ? colors.green : colors.amber }]}>
            #{data.your_rank}
          </Text>
          <Text style={s.rankThisWeek}>this week</Text>
        </View>
        <Text style={[s.movement, { color: move.color }]}>{move.label}</Text>

        {/* ── Top 3 Podium ─────────────────────────────────────────────── */}
        <View style={s.podium}>
          {[topThree[1], topThree[0], topThree[2]].map((entry, i) => {
            if (!entry) return null;
            const isCenter = i === 1;
            return (
              <View key={entry.rank} style={[s.podiumTile, isCenter && s.podiumCenter]}>
                <Text style={[s.podiumRank, { color: rankColor(entry.rank) }]}>#{entry.rank}</Text>
                <View style={[s.podiumAvatar, isCenter && s.podiumAvatarCenter]}>
                  <Text style={s.podiumInitials}>{entry.initials}</Text>
                </View>
                <Text style={s.podiumScore}>{Math.round(entry.score)}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Rankings List ─────────────────────────────────────────────── */}
        <View style={s.listContainer}>
          {listEntries.map((entry) => (
            <View
              key={entry.rank}
              style={[
                s.row,
                entry.isYou && s.rowYou,
                !entry.isYou && entry.rank > (data.your_rank) && s.rowDimmed,
              ]}
            >
              <Text style={[s.rowRank, entry.isYou && { color: colors.amber }]}>
                #{entry.rank}
              </Text>
              <View style={[s.rowAvatar, entry.isYou && s.rowAvatarYou]}>
                <Text style={[s.rowInitials, entry.isYou && { color: '#1a0a00' }]}>
                  {entry.initials}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowName, entry.isYou && { color: colors.amber }]}>
                  {entry.name}
                </Text>
                <Text style={[s.rowMajor, entry.isYou && entry.delta! > 0 && { color: colors.amber }]}>
                  {entry.isYou && entry.delta! > 0
                    ? `${entry.delta} pts from #${entry.rank - 1}`
                    : entry.major}
                </Text>
              </View>
              <Text style={[s.rowScore, entry.isYou && { color: colors.amber }]}>
                {Math.round(entry.score)}
              </Text>
            </View>
          ))}

          {/* Lock row */}
          <View style={s.lockRow}>
            <Ionicons name="lock-closed" size={13} color={colors.indigo} />
            <Text style={s.lockText}>See the full leaderboard</Text>
            <TouchableOpacity
              style={s.lockBtn}
              onPress={() => Alert.alert('Coming Soon', 'Payments are in development.')}
              activeOpacity={0.8}
            >
              <Text style={s.lockBtnText}>Unlock Dilly →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Move Up card ─────────────────────────────────────────────── */}
        <View style={s.moveCard}>
          <Text style={s.moveLabel}>HOW TO MOVE UP</Text>
          <Text style={s.moveText}>
            {data.pts_to_next} {data.pts_to_next === 1 ? 'point' : 'points'} separates you from #{data.your_rank - 1}.{' '}
            Your {data.weakest_dim.charAt(0).toUpperCase() + data.weakest_dim.slice(1)} is the gap — work on quantified
            impact and project outcomes to close it fast.
          </Text>
          <TouchableOpacity
            style={s.moveBtn}
            onPress={() => router.push('/(app)/voice')}
            activeOpacity={0.85}
          >
            <Text style={s.moveBtnText}>Fix this with Dilly →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Weekly Activity ───────────────────────────────────────────── */}
        <View style={s.activityCard}>
          <Text style={s.activityLabel}>THIS WEEK</Text>
          {data.activity.map((item, i) => (
            <View key={i} style={s.activityRow}>
              <View style={[s.activityDot, { backgroundColor: item.color }]} />
              <Text style={s.activityText}>{item.text}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <CelebrationPortal />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl },

  eyebrow: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.t3,
    marginBottom: 2,
  },
  subEyebrow: { fontSize: 11, color: colors.t3, marginBottom: 20 },

  rankHero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  rankYoure:    { fontSize: 14, color: colors.t2, paddingBottom: 10 },
  rankNumber:   { fontFamily: 'Cinzel_900Black', fontSize: 52, lineHeight: 58 },
  rankThisWeek: { fontSize: 14, color: colors.t2, paddingBottom: 10 },
  movement:     { fontSize: 11, textAlign: 'center', marginBottom: 20 },

  // Podium
  podium: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  podiumTile: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.b1,
  },
  podiumCenter: {
    paddingVertical: 16,
    borderColor: colors.goldbdr,
    backgroundColor: colors.golddim,
  },
  podiumRank:       { fontFamily: 'Cinzel_900Black', fontSize: 18, marginBottom: 6 },
  podiumAvatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  podiumAvatarCenter: { backgroundColor: colors.gold },
  podiumInitials:   { fontSize: 11, fontWeight: '700', color: colors.t1 },
  podiumScore:      { fontSize: 10, color: colors.t3 },

  // List
  listContainer: { marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.s2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowYou: {
    backgroundColor: colors.adim,
    borderColor: colors.abdr,
  },
  rowDimmed: { opacity: 0.4 },
  rowRank:     { fontFamily: 'Cinzel_700Bold', fontSize: 13, color: colors.t3, width: 28 },
  rowAvatar:   { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' },
  rowAvatarYou:{ backgroundColor: colors.amber },
  rowInitials: { fontSize: 13, fontWeight: '700', color: colors.t1 },
  rowName:     { fontSize: 12, fontWeight: '600', color: colors.t1 },
  rowMajor:    { fontSize: 10, color: colors.t3, marginTop: 1 },
  rowScore:    { fontSize: 13, fontWeight: '300', color: colors.t2 },

  // Lock row
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.idim,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.ibdr,
    marginBottom: 6,
  },
  lockText: { flex: 1, fontSize: 11, color: colors.indigo },
  lockBtn:  { backgroundColor: colors.indigo, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  lockBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Move Up card
  moveCard: {
    backgroundColor: colors.s2,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  moveLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.t3,
    marginBottom: 8,
  },
  moveText: { fontSize: 12, color: colors.t1, lineHeight: 19 },
  moveBtn: {
    backgroundColor: colors.gold,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  moveBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, color: '#FFFFFF' },

  // Activity
  activityCard: {
    backgroundColor: colors.s2,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  activityLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.t3,
    marginBottom: 8,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityText: { fontSize: 10, color: colors.t2, lineHeight: 16, flex: 1 },
});
