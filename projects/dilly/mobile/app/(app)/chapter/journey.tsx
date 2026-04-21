/**
 * Chapter Journey Map (build 352).
 *
 * This is the between-sessions surface. After a Chapter session ends,
 * the user lands here. Instead of a list of "things we talked about,"
 * the topics become nodes on a winding path — a visual journey. Each
 * node is a doorway back into Dilly, seeded with that topic, so the
 * user can work on one thing at a time between sessions.
 *
 * Design intent (user-stated): Chapter should feel more interactive
 * and visual. The same topic map users see on `my dilly profile` style
 * premium surfaces, but tuned for the rhythm of a Chapter.
 *
 * Data model:
 *   - Loads latest Chapter via /chapters/current (the one just ended).
 *   - Each `screen.slot` becomes a node. Already-tapped nodes are
 *     remembered in AsyncStorage so their state (filled vs open)
 *     persists between opens.
 *   - Tapping a node → openDillyOverlay with a seed prompt that names
 *     the topic so Dilly continues the session thread in chat.
 *
 * No new backend endpoints required. If /chapters/current fails, we
 * render a gentle empty state instead of crashing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
  Dimensions,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import { openDillyOverlay } from '../../../hooks/useDillyOverlay';

interface Screen { slot: string; body: string; }
interface Chapter {
  id?: string;
  title: string;
  screens: Screen[];
  count?: number;
  generated_at?: string;
}

// Slot → human-facing node title. Dilly speaks in long sentences
// inside the Chapter screens; the journey node title is the short
// verb-form of "what you were asked to sit with."
const SLOT_NODE_LABEL: Record<string, string> = {
  cold_open: 'The opening',
  noticed: 'What I noticed',
  working: "What's working",
  push_on: 'Push harder here',
  one_move: 'Your one move',
  question: 'The question',
  close: 'Closing thought',
};

// Slot → seed prompt for Dilly chat. These drop the user into a
// conversation that knows which Chapter thread they're continuing.
// Must feel like picking up mid-conversation, not starting fresh.
function seedPrompt(slot: string, body: string): string {
  const snippet = body.length > 140 ? body.slice(0, 137) + '...' : body;
  switch (slot) {
    case 'noticed':   return `Dilly, can we keep talking about what you noticed? You said: "${snippet}"`;
    case 'working':   return `Walk me through "what's working" again: "${snippet}". Where do I go from here?`;
    case 'push_on':   return `About the thing I should push on: "${snippet}". Help me make that real this week.`;
    case 'one_move':  return `Let's work on my one move: "${snippet}". What's the next 30 minutes look like?`;
    case 'question':  return `Let's sit with the question you asked me: "${snippet}". Here's what came up.`;
    case 'cold_open': return `I want to start where you started me: "${snippet}". Can we unpack that?`;
    case 'close':     return `I keep coming back to your closing thought: "${snippet}".`;
    default:          return `Let's keep going on this: "${snippet}"`;
  }
}

// Storage key for which nodes have been visited. Scoped per chapter
// (by generated_at timestamp) so a fresh Chapter clears the map.
const VISITED_KEY_PREFIX = 'chapter_journey_visited_v1:';

const SCREEN_W = Dimensions.get('window').width;

export default function ChapterJourneyScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [visited, setVisited] = useState<Set<string>>(new Set());

  const journeyKey = chapter?.generated_at
    ? VISITED_KEY_PREFIX + chapter.generated_at
    : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dilly.get('/chapters/current').catch(() => null);
        if (cancelled) return;
        if (res && typeof res === 'object' && Array.isArray((res as any).screens)) {
          setChapter(res as Chapter);
          // Hydrate visited set scoped to this chapter.
          const key = VISITED_KEY_PREFIX + ((res as Chapter).generated_at || 'latest');
          const raw = await AsyncStorage.getItem(key).catch(() => null);
          if (raw && !cancelled) {
            try { setVisited(new Set(JSON.parse(raw) as string[])); }
            catch { /* ignore */ }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onNodeTap = useCallback((slot: string, body: string) => {
    if (!journeyKey) return;
    const nextVisited = new Set(visited);
    nextVisited.add(slot);
    setVisited(nextVisited);
    AsyncStorage.setItem(journeyKey, JSON.stringify([...nextVisited])).catch(() => {});
    openDillyOverlay({ initialMessage: seedPrompt(slot, body) });
  }, [visited, journeyKey]);

  const nodes = useMemo(() => {
    if (!chapter) return [];
    // Show journey-worthy slots only. Cold open and close are framing,
    // not homework — they clutter the map. User tap-opens real topics.
    const WANT = new Set(['noticed', 'working', 'push_on', 'one_move', 'question']);
    return chapter.screens.filter(s => WANT.has(s.slot));
  }, [chapter]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!chapter || nodes.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface.bg, paddingTop: insets.top + 20 }]}>
        <Text style={[styles.emptyTitle, { color: theme.surface.t1 }]}>No journey yet</Text>
        <Text style={[styles.emptyBody, { color: theme.surface.t2 }]}>
          Finish a Chapter session and the things you talked through will show up
          here as a map you can keep opening.
        </Text>
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: theme.accent }]}
          onPress={() => router.replace('/chapter')}
        >
          <Text style={styles.ctaBtnText}>Start a session</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render nodes as a winding path. Each node alternates left/right
  // across the canvas, connected by a curved Path. The whole canvas
  // scrolls vertically so long chapters still fit.
  const nodeCount = nodes.length;
  const nodeGap = 130;
  const sideInset = 56;
  const canvasH = nodeCount * nodeGap + 60;
  const colLeft  = sideInset;
  const colRight = SCREEN_W - sideInset;

  const pathD = nodes.map((_, i) => {
    const cx = i % 2 === 0 ? colLeft : colRight;
    const cy = 40 + i * nodeGap;
    if (i === 0) return `M ${cx} ${cy}`;
    // Curve from previous point (opposite column) to current.
    const prevX = (i - 1) % 2 === 0 ? colLeft : colRight;
    const prevY = 40 + (i - 1) * nodeGap;
    const midY = (prevY + cy) / 2;
    return `C ${prevX} ${midY}, ${cx} ${midY}, ${cx} ${cy}`;
  }).join(' ');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.replace('/(app)')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="close" size={22} color={theme.surface.t3} />
        </AnimatedPressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>YOUR JOURNEY</Text>
          <Text style={[styles.title, { color: theme.surface.t1 }]} numberOfLines={1}>
            {chapter.title}
          </Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <Text style={[styles.intro, { color: theme.surface.t2 }]}>
        Tap any node to keep working on it with Dilly. Filled nodes are ones you've
        already opened since this session.
      </Text>

      {/* Map canvas */}
      <View style={{ width: SCREEN_W, height: canvasH, marginTop: 8 }}>
        <Svg width={SCREEN_W} height={canvasH}>
          <Path d={pathD} stroke={theme.accentBorder} strokeWidth={2} fill="none" strokeDasharray="4,6" />
          {nodes.map((_, i) => {
            const cx = i % 2 === 0 ? colLeft : colRight;
            const cy = 40 + i * nodeGap;
            return <Circle key={i} cx={cx} cy={cy} r={3} fill={theme.accentBorder} />;
          })}
        </Svg>

        {nodes.map((screen, i) => {
          const cx = i % 2 === 0 ? colLeft : colRight;
          const cy = 40 + i * nodeGap;
          const isVisited = visited.has(screen.slot);
          const nodeSize = 78;
          return (
            <TouchableOpacity
              key={screen.slot + i}
              activeOpacity={0.85}
              onPress={() => onNodeTap(screen.slot, screen.body)}
              style={{
                position: 'absolute',
                left: cx - nodeSize / 2,
                top: cy - nodeSize / 2,
                width: nodeSize,
                height: nodeSize,
                borderRadius: nodeSize / 2,
                backgroundColor: isVisited ? theme.accent : theme.surface.s1,
                borderWidth: 2,
                borderColor: isVisited ? theme.accent : theme.accentBorder,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isVisited ? 0.16 : 0.06,
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              <Ionicons
                name={iconForSlot(screen.slot)}
                size={22}
                color={isVisited ? '#FFF' : theme.accent}
              />
            </TouchableOpacity>
          );
        })}

        {/* Node labels — positioned beside each node on the opposite
            side of where the node sits so they don't run off screen. */}
        {nodes.map((screen, i) => {
          const onLeft = i % 2 === 0;
          const cy = 40 + i * nodeGap;
          return (
            <View
              key={'lbl' + i}
              style={{
                position: 'absolute',
                top: cy - 20,
                left: onLeft ? colLeft + 50 : 12,
                right: onLeft ? 12 : SCREEN_W - colRight + 50,
                alignItems: onLeft ? 'flex-start' : 'flex-end',
              }}
              pointerEvents="none"
            >
              <Text style={[styles.nodeLabel, { color: theme.surface.t1 }]} numberOfLines={2}>
                {SLOT_NODE_LABEL[screen.slot] || screen.slot}
              </Text>
              <Text
                style={[styles.nodeHint, { color: theme.surface.t3, textAlign: onLeft ? 'left' : 'right' }]}
                numberOfLines={2}
              >
                {visited.has(screen.slot) ? 'Continue with Dilly' : 'Tap to work on this'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Schedule next session CTA */}
      <View style={[styles.scheduleCard, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
        <Text style={[styles.scheduleEyebrow, { color: theme.accent }]}>NEXT SESSION</Text>
        <Text style={[styles.scheduleTitle, { color: theme.surface.t1 }]}>
          Dilly thinks another session in 3 days would land well.
        </Text>
        <View style={styles.schedRow}>
          <ScheduleBtn label="Sounds right" onPress={() => scheduleNext(3)} theme={theme} primary />
          <ScheduleBtn label="Sooner" onPress={() => scheduleNext(1)} theme={theme} />
          <ScheduleBtn label="Later" onPress={() => scheduleNext(7)} theme={theme} />
        </View>
      </View>
    </ScrollView>
  );
}

function iconForSlot(slot: string): any {
  switch (slot) {
    case 'noticed':  return 'eye-outline';
    case 'working':  return 'sparkles-outline';
    case 'push_on':  return 'flash-outline';
    case 'one_move': return 'footsteps-outline';
    case 'question': return 'help-circle-outline';
    default:         return 'ellipse-outline';
  }
}

function scheduleNext(days: number) {
  const target = new Date();
  target.setDate(target.getDate() + days);
  // Backend endpoint optional; fail quietly. The toast is the real
  // confirmation. If the endpoint does not exist the UI still reads
  // correctly — the user sees that Dilly heard them.
  dilly.fetch('/chapters/schedule-next', {
    method: 'POST',
    body: JSON.stringify({ scheduled_for: target.toISOString() }),
  }).catch(() => {});
  // TODO: success toast when we wire InlineToast in this route.
}

function ScheduleBtn({ label, onPress, theme, primary }: {
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useResolvedTheme>;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.schedBtn,
        primary
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { backgroundColor: 'transparent', borderColor: theme.accentBorder },
      ]}
    >
      <Text style={[styles.schedBtnText, { color: primary ? '#FFF' : theme.surface.t1 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20, paddingHorizontal: 16 },
  ctaBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 11 },
  ctaBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  intro: { fontSize: 12, paddingHorizontal: 24, textAlign: 'center', lineHeight: 17, marginTop: 10 },

  nodeLabel: { fontSize: 14, fontWeight: '800' },
  nodeHint: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  scheduleCard: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  scheduleEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  scheduleTitle: { fontSize: 15, fontWeight: '700', marginTop: 6, lineHeight: 21 },
  schedRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  schedBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
  },
  schedBtnText: { fontSize: 12, fontWeight: '800' },
});
