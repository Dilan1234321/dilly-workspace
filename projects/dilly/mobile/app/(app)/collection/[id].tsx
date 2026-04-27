import { safeBack } from '../../../lib/navigation';
/**
 * Collection detail - shows the saved jobs inside a single collection.
 *
 * Reached via `router.push('/(app)/collection/' + collectionId)` from the
 * My Collections sheet on the Jobs page. Renders the collection name big
 * at the top, a back button, and the saved jobs as cards.
 *
 * Collections only store a slim snapshot per job (id, title, company, url)
 * so the cards here are intentionally lightweight - not the full fit
 * narrative flow. Tapping a card opens the job URL in Safari; there's a
 * remove action on each card so users can curate the collection.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Linking, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../../../lib/dilly';
import { showConfirm } from '../../../lib/globalConfirm';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import FadeInView from '../../../components/FadeInView';

interface CollectionJob {
  job_id: string;
  title: string;
  company: string;
  url?: string;
  added_at?: string;
}

interface Collection {
  id: string;
  name: string;
  jobs: CollectionJob[];
  created_at?: string;
  updated_at?: string;
}

export default function CollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCollection = useCallback(async () => {
    try {
      // The list endpoint gives us every collection in one round-trip,
      // so we filter client-side instead of adding a per-id endpoint.
      const data = await dilly.get('/collections');
      const list: Collection[] = Array.isArray(data) ? data : (data?.collections || []);
      const found = list.find(c => c.id === id) || null;
      setCollection(found);
    } catch {
      setCollection(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCollection(); }, [fetchCollection]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchCollection();
    setRefreshing(false);
  }

  async function removeJob(jobId: string) {
    if (!collection) return;
    const ok = await showConfirm({
      title: 'Remove from collection?',
      message: 'The job stays in Dilly - this just takes it out of this collection.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setCollection({ ...collection, jobs: collection.jobs.filter(j => j.job_id !== jobId) });
    try {
      await dilly.fetch(`/collections/${collection.id}/jobs/${jobId}`, { method: 'DELETE' });
    } catch {
      fetchCollection();
    }
  }

  async function renameCollection() {
    if (!collection) return;
    Alert.prompt(
      'Rename collection',
      'Give this collection a clearer name.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save', onPress: async (name?: string) => {
            const trimmed = (name || '').trim();
            if (!trimmed || trimmed === collection.name) return;
            const prev = collection.name;
            setCollection({ ...collection, name: trimmed });
            try {
              await dilly.fetch(`/collections/${collection.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: trimmed }),
              });
            } catch {
              setCollection({ ...collection, name: prev });
            }
          },
        },
      ],
      'plain-text',
      collection.name,
    );
  }

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
      {/* Top bar with back + rename. Intentionally spare so the
          collection name can carry the visual weight below. */}
      <View style={[s.topBar, { borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => safeBack('/(app)/jobs')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t1} />
        </AnimatedPressable>
        <AnimatedPressable onPress={renameCollection} hitSlop={12} scaleDown={0.9} disabled={!collection}>
          <Ionicons name="create-outline" size={20} color={collection ? theme.surface.t2 : theme.surface.t3} />
        </AnimatedPressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
      >
        {/* Big title. Lives inside the scroll so it fades away as the
            user scrolls through a long collection. */}
        <FadeInView delay={0}>
          <Text style={[s.name, {
            color: theme.surface.t1,
            fontFamily: theme.type.display,
            fontWeight: theme.type.heroWeight,
            letterSpacing: theme.type.heroTracking,
          }]}>
            {collection?.name || (loading ? '' : 'Collection')}
          </Text>
          <Text style={[s.sub, { color: theme.surface.t3 }]}>
            {collection
              ? `${collection.jobs.length} job${collection.jobs.length === 1 ? '' : 's'}`
              : loading ? 'Loading…' : 'Not found'}
          </Text>
        </FadeInView>

        {/* Job cards. Slim because that's all the collection stores;
            if the user wants the full fit narrative they can open the
            job URL. */}
        {collection && collection.jobs.length > 0 && (
          <View style={{ gap: 10, marginTop: 18 }}>
            {collection.jobs.map((j, i) => (
              <FadeInView key={j.job_id} delay={40 + i * 30}>
                <AnimatedPressable
                  style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
                  onPress={() => { if (j.url) Linking.openURL(j.url); }}
                  scaleDown={0.98}
                >
                  <View style={[s.logo, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                    <Ionicons name="briefcase" size={16} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.title, { color: theme.surface.t1 }]} numberOfLines={2}>{j.title}</Text>
                    <Text style={[s.company, { color: theme.surface.t2 }]} numberOfLines={1}>{j.company}</Text>
                    {j.added_at ? (
                      <Text style={[s.added, { color: theme.surface.t3 }]}>Saved {formatRelative(j.added_at)}</Text>
                    ) : null}
                  </View>
                  <AnimatedPressable
                    onPress={(e: any) => { e?.stopPropagation?.(); removeJob(j.job_id); }}
                    scaleDown={0.85}
                    hitSlop={10}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close-circle" size={18} color={theme.surface.t3} />
                  </AnimatedPressable>
                </AnimatedPressable>
              </FadeInView>
            ))}
          </View>
        )}

        {/* Empty state. Reads like the rest of the app (quiet,
            informative) rather than a sad-face illustration. */}
        {collection && collection.jobs.length === 0 && !loading && (
          <View style={[s.empty, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            <Ionicons name="bookmark-outline" size={28} color={theme.surface.t3} />
            <Text style={[s.emptyTitle, { color: theme.surface.t1 }]}>No saved jobs yet.</Text>
            <Text style={[s.emptySub, { color: theme.surface.t3 }]}>
              Tap the bookmark on any job and pick this collection.
            </Text>
            <AnimatedPressable
              style={[s.emptyBtn, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/(app)/jobs')}
              scaleDown={0.97}
            >
              <Ionicons name="search" size={14} color="#fff" />
              <Text style={s.emptyBtnText}>Browse jobs</Text>
            </AnimatedPressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const s = Math.max(0, (now - then) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  scroll: { padding: 20 },
  name: {
    fontSize: 34,
    lineHeight: 38,
    marginTop: 6,
  },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2, lineHeight: 18 },
  company: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  added: { fontSize: 10, fontWeight: '500', marginTop: 4, letterSpacing: 0.2 },
  empty: {
    alignItems: 'center',
    gap: 10,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 24,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 17, paddingHorizontal: 10 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
