/**
 * Chapter schedule - feels like booking a real advisory meeting.
 *
 * Old version was a settings grid (day chips + hour chips + Save).
 * Functional, but didn't read as "this is a session you're carving
 * out time for". Founder direction: make it look like a thing people
 * would pay for despite being once a week.
 *
 * New layout:
 *   - Hero card: "Your weekly Chapter" with the Dilly mark + a
 *     four-line pitch on what the session actually does
 *   - "What you get every week" - three short value lines so the user
 *     understands this isn't just a reminder
 *   - Day picker as full-name pills (more breathing room than 3-letter
 *     abbreviations)
 *   - Hour picker as scrollable time row (wider tap targets)
 *   - Live preview card showing the next concrete date in plain English
 *   - Confirm button copy goes from "Save" to "Confirm my Chapter time"
 *
 * Day-of-week is 0=Mon..6=Sun (backend convention). Hours 6-21 cover
 * the realistic "sit down with Dilly" window.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import { scheduleChapterNotifications } from '../../../hooks/useChapterNotifications';
import { showToast } from '../../../lib/globalToast';
import { safeBack } from '../../../lib/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAYS = [
  { idx: 0, short: 'Mon', long: 'Monday' },
  { idx: 1, short: 'Tue', long: 'Tuesday' },
  { idx: 2, short: 'Wed', long: 'Wednesday' },
  { idx: 3, short: 'Thu', long: 'Thursday' },
  { idx: 4, short: 'Fri', long: 'Friday' },
  { idx: 5, short: 'Sat', long: 'Saturday' },
  { idx: 6, short: 'Sun', long: 'Sunday' },
];

const HOURS = [6, 9, 12, 15, 18, 19, 20, 21];

// Backend day idx -> JS day idx for next-instance math.
const BACKEND_TO_JS: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };

const VALUE_LINES = [
  { icon: 'eye-outline', title: 'Dilly notices what you missed', body: 'A weekly read on what your story is doing - good and bad - that you can\'t see from the inside.' },
  { icon: 'compass-outline', title: 'One real next move', body: 'Not a pep talk. A specific play for the week, picked for where your career actually is right now.' },
  { icon: 'archive-outline', title: 'Memory that compounds', body: 'Every Chapter remembers what you talked about last time. The advice gets sharper as Dilly knows you.' },
];

function labelForHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return 'noon';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function nextInstanceLabel(day: number, hour: number): string {
  const jsTarget = BACKEND_TO_JS[day] ?? 0;
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  let diff = (jsTarget - now.getDay() + 7) % 7;
  if (diff === 0 && target.getTime() <= now.getTime()) diff = 7;
  target.setDate(target.getDate() + diff);
  const dayLong = DAYS[day]?.long ?? 'Sunday';
  const monthShort = target.toLocaleString('default', { month: 'short' });
  const dayNum = target.getDate();
  if (diff === 0) return `${dayLong} - in a few hours`;
  if (diff === 1) return `Tomorrow - ${dayLong}, ${monthShort} ${dayNum}`;
  return `${dayLong}, ${monthShort} ${dayNum} - in ${diff} days`;
}

const SCHED_LATER_KEY = 'dilly_chapter_schedule_later_v1';

export default function ChapterScheduleScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [day, setDay] = useState<number>(6);
  const [hour, setHour] = useState<number>(19);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCurrent = useCallback(async () => {
    try {
      const res: { day_of_week?: number; hour?: number } = await dilly.get('/chapters/schedule');
      if (res) {
        if (typeof res.day_of_week === 'number') setDay(res.day_of_week);
        if (typeof res.hour === 'number') setHour(res.hour);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCurrent(); }, [fetchCurrent]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await dilly.fetch('/chapters/schedule', {
        method: 'POST',
        body: JSON.stringify({ day_of_week: day, hour }),
      });
      if (res.ok) {
        // Clear the "I'll schedule later" flag so the home tile drops
        // its deferred-state copy on the next focus.
        AsyncStorage.removeItem(SCHED_LATER_KEY).catch(() => {});
        scheduleChapterNotifications({ day_of_week: day, hour, next_override_at: null }).catch(() => {});
        router.replace('/(app)/chapter/prep' as any);
      } else {
        showToast({ message: 'Could not save your schedule right now.', type: 'error' });
      }
    } catch {
      showToast({ message: 'Could not reach Dilly right now.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const nextLabel = useMemo(() => nextInstanceLabel(day, hour), [day, hour]);

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => safeBack('/(app)')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t1} />
        </AnimatedPressable>
        <Text style={[s.title, { color: theme.surface.t1 }]}>Schedule your Chapter</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero - sets tone. Reads like a calendar invite for your
            most considered weekly meeting. */}
        <View style={[s.hero, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <View style={[s.heroBadge, { backgroundColor: theme.accent }]}>
            <Ionicons name="bookmark" size={14} color="#FFF" />
            <Text style={s.heroBadgeText}>WEEKLY · 1:1</Text>
          </View>
          <Text style={[s.heroBig, {
            color: theme.surface.t1,
            fontFamily: theme.type.display,
            fontWeight: theme.type.heroWeight,
            letterSpacing: theme.type.heroTracking,
          }]}>
            Your standing meeting with Dilly.
          </Text>
          <Text style={[s.heroBody, { color: theme.surface.t2 }]}>
            One sit-down, every week, written specifically for where your career is right now. Pick the day and the time that fit your life.
          </Text>
        </View>

        {/* Value lines */}
        <View style={s.valueWrap}>
          {VALUE_LINES.map((v) => (
            <View key={v.title} style={[s.valueRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <View style={[s.valueIconWrap, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name={v.icon as any} size={16} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.valueTitle, { color: theme.surface.t1 }]}>{v.title}</Text>
                <Text style={[s.valueBody, { color: theme.surface.t3 }]}>{v.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pick a day */}
        <Text style={[s.sectionLabel, { color: theme.surface.t3 }]}>YOUR DAY</Text>
        <View style={s.dayCol}>
          {DAYS.map(d => {
            const active = d.idx === day;
            return (
              <AnimatedPressable
                key={d.idx}
                style={[
                  s.dayPill,
                  { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                  active && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => setDay(d.idx)}
                scaleDown={0.97}
              >
                <Ionicons
                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={active ? '#FFF' : theme.surface.t3}
                />
                <Text style={[s.dayPillText, { color: active ? '#FFF' : theme.surface.t1 }]}>{d.long}</Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* Pick a time */}
        <Text style={[s.sectionLabel, { color: theme.surface.t3, marginTop: 24 }]}>YOUR TIME</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
        >
          {HOURS.map(h => {
            const active = h === hour;
            return (
              <AnimatedPressable
                key={h}
                style={[
                  s.hourPill,
                  { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                  active && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => setHour(h)}
                scaleDown={0.95}
              >
                <Text style={[s.hourPillText, { color: active ? '#FFF' : theme.surface.t1 }]}>{labelForHour(h)}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {/* Live preview - reads like a calendar invite confirming
            the very next instance. */}
        <View style={[s.preview, { backgroundColor: theme.surface.s1, borderColor: theme.accent }]}>
          <View style={s.previewHeader}>
            <Ionicons name="calendar" size={15} color={theme.accent} />
            <Text style={[s.previewLabel, { color: theme.accent }]}>YOUR FIRST SESSION</Text>
          </View>
          <Text style={[s.previewBig, { color: theme.surface.t1 }]}>
            {nextLabel}
          </Text>
          <Text style={[s.previewSub, { color: theme.surface.t3 }]}>
            at {labelForHour(hour)} - then every {DAYS[day]?.long || 'Sunday'} after that
          </Text>
        </View>
      </ScrollView>

      {/* Pinned confirm bar */}
      <View style={[s.saveBar, { backgroundColor: theme.surface.bg, borderTopColor: theme.surface.border, paddingBottom: Math.max(12, insets.bottom) }]}>
        <AnimatedPressable
          style={[s.saveBtn, { backgroundColor: theme.accent }, (loading || saving) && { opacity: 0.5 }]}
          onPress={save}
          disabled={loading || saving}
          scaleDown={0.97}
        >
          <Ionicons name="checkmark-circle" size={17} color="#FFF" />
          <Text style={s.saveBtnText}>{saving ? 'Saving...' : 'Confirm my Chapter time'}</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

  hero: {
    marginHorizontal: 18,
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 4,
  },
  heroBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroBig: { fontSize: 24, lineHeight: 30 },
  heroBody: { fontSize: 13, lineHeight: 19 },

  valueWrap: {
    paddingHorizontal: 18,
    marginTop: 18,
    gap: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  valueIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  valueTitle: { fontSize: 13, fontWeight: '800', letterSpacing: -0.1, marginBottom: 3 },
  valueBody: { fontSize: 12, lineHeight: 17 },

  sectionLabel: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6,
    paddingHorizontal: 18, marginTop: 24, marginBottom: 10,
  },

  dayCol: { paddingHorizontal: 18, gap: 7 },
  dayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1,
  },
  dayPillText: { fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },

  hourPill: {
    paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 12, borderWidth: 1,
    minWidth: 60, alignItems: 'center',
  },
  hourPillText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },

  preview: {
    marginHorizontal: 18,
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  previewLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  previewBig: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  previewSub: { fontSize: 12, marginTop: 2 },

  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 14,
  },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },
});
