import { safeBack } from '../../../lib/navigation';
/**
 * Chapter schedule - pick which day and hour your weekly Chapter lands.
 *
 * Defaults to Sunday 7pm. Users change this once and almost never
 * again; the UI reflects that by keeping it a single, calm screen
 * with generous spacing. Not a settings grid.
 *
 * Day-of-week is 0=Mon through 6=Sun to match the backend convention
 * (Python datetime.weekday). We render it in "Monday/Tuesday/..." the
 * user expects.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../../lib/dilly';
import { useResolvedTheme } from '../../../hooks/useTheme';
import AnimatedPressable from '../../../components/AnimatedPressable';
import { scheduleChapterNotifications } from '../../../hooks/useChapterNotifications';
import { showToast } from '../../../lib/globalToast';

const DAYS = [
  { idx: 0, label: 'Mon' },
  { idx: 1, label: 'Tue' },
  { idx: 2, label: 'Wed' },
  { idx: 3, label: 'Thu' },
  { idx: 4, label: 'Fri' },
  { idx: 5, label: 'Sat' },
  { idx: 6, label: 'Sun' },
];

// Offer 6am, 9am, noon, 3pm, 6pm, 7pm, 8pm, 9pm. Covers most realistic
// "sit down with Dilly" times without a wheel picker.
const HOURS = [6, 9, 12, 15, 18, 19, 20, 21];

function labelForHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return 'noon';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

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
        scheduleChapterNotifications({ day_of_week: day, hour, next_override_at: null }).catch(() => {});
        // Always land on the prep screen after scheduling so the user
        // immediately sees their countdown and can write notes.
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

  const dayLabel = DAYS[day]?.label || 'Sunday';
  const hourLabel = labelForHour(hour);

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => safeBack('/(app)')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={26} color={theme.surface.t1} />
        </AnimatedPressable>
        <Text style={[s.title, { color: theme.surface.t1 }]}>Your Chapter time</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <Text style={[s.intro, { color: theme.surface.t2 }]}>
          Every week, one Chapter. Pick the day and hour that feel right for yours.
        </Text>

        {/* Live preview of the choice. Calm, almost ceremonial. */}
        <View style={[s.preview, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Text style={[s.previewEyebrow, { color: theme.accent }]}>YOUR CHAPTER LANDS</Text>
          <Text style={[s.previewBig, {
            color: theme.surface.t1,
            fontFamily: theme.type.display,
            fontWeight: theme.type.heroWeight,
            letterSpacing: theme.type.heroTracking,
          }]}>
            Every {DAYS[day]?.label === 'Sun' ? 'Sunday' : DAYS[day]?.label === 'Sat' ? 'Saturday' : DAYS[day]?.label === 'Fri' ? 'Friday' : DAYS[day]?.label === 'Thu' ? 'Thursday' : DAYS[day]?.label === 'Wed' ? 'Wednesday' : DAYS[day]?.label === 'Tue' ? 'Tuesday' : 'Monday'} at {hourLabel}
          </Text>
        </View>

        {/* Day row */}
        <Text style={[s.sectionLabel, { color: theme.surface.t3 }]}>DAY</Text>
        <View style={s.dayRow}>
          {DAYS.map(d => {
            const active = d.idx === day;
            return (
              <AnimatedPressable
                key={d.idx}
                style={[
                  s.dayBtn,
                  { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                  active && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => setDay(d.idx)}
                scaleDown={0.94}
              >
                <Text style={[s.dayBtnText, { color: active ? '#fff' : theme.surface.t1 }]}>{d.label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* Hour row */}
        <Text style={[s.sectionLabel, { color: theme.surface.t3, marginTop: 26 }]}>HOUR</Text>
        <View style={s.hourRow}>
          {HOURS.map(h => {
            const active = h === hour;
            return (
              <AnimatedPressable
                key={h}
                style={[
                  s.hourBtn,
                  { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                  active && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => setHour(h)}
                scaleDown={0.94}
              >
                <Text style={[s.hourBtnText, { color: active ? '#fff' : theme.surface.t1 }]}>{labelForHour(h)}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Pinned save bar */}
      <View style={[s.saveBar, { backgroundColor: theme.surface.bg, borderTopColor: theme.surface.border, paddingBottom: Math.max(12, insets.bottom) }]}>
        <AnimatedPressable
          style={[s.saveBtn, { backgroundColor: theme.accent }, (loading || saving) && { opacity: 0.5 }]}
          onPress={save}
          disabled={loading || saving}
          scaleDown={0.97}
        >
          <Text style={s.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
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
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },

  preview: {
    borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 24, gap: 6,
  },
  previewEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  previewBig: { fontSize: 22, lineHeight: 28 },

  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  dayRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayBtn: {
    flex: 1, minWidth: 40, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  dayBtnText: { fontSize: 12, fontWeight: '700' },

  hourRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  hourBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  hourBtnText: { fontSize: 13, fontWeight: '700' },

  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },
  saveBtn: {
    paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: -0.1 },
});
