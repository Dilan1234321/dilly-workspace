import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';

interface FactItem {
  id: string;
  category: string;
  label: string;
  value: string;
  confidence: string;
  created_at: string;
  source: string;
}

function relativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 60) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export default function CategoryFactsScreen() {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { category, label, color } = useLocalSearchParams<{
    category: string;
    label: string;
    color?: string;
  }>();

  const dotColor = color || theme.accent;

  const [facts, setFacts] = useState<FactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await dilly.fetch('/memory').catch(() => null);
      if (res?.ok) {
        const json = await res.json();
        const items: FactItem[] = Array.isArray(json?.items) ? json.items : [];
        const filtered = items
          .filter(f => f.category === category)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setFacts(filtered);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  return (
    <View style={[s.root, { backgroundColor: theme.surface.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: theme.surface.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t1} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.surface.t1 }]} numberOfLines={1}>
            {label || category}
          </Text>
          {!loading && (
            <Text style={[s.subtitle, { color: theme.surface.t3 }]}>
              {facts.length} {facts.length === 1 ? 'fact' : 'facts'} · newest first
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[s.emptyText, { color: theme.surface.t3 }]}>Loading…</Text>
        ) : facts.length === 0 ? (
          <Text style={[s.emptyText, { color: theme.surface.t3 }]}>
            Nothing here yet. Talk to Dilly to add facts.
          </Text>
        ) : (
          facts.map((fact, i) => (
            <View
              key={fact.id || i}
              style={[
                s.row,
                { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                i === 0 && s.rowFirst,
              ]}
            >
              <View style={[s.dot, { backgroundColor: dotColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.factLabel, { color: theme.surface.t1 }]}>{fact.label}</Text>
                {fact.value ? (
                  <Text style={[s.factValue, { color: theme.surface.t2 }]}>{fact.value}</Text>
                ) : null}
              </View>
              <Text style={[s.date, { color: theme.surface.t3 }]}>{relativeDate(fact.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingRight: 4 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowFirst: {},
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  factLabel: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  factValue: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  date: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  emptyText: {
    fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 40,
  },
});
