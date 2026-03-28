import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../lib/auth';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const GOLD  = '#C9A84C';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE  = '#0A84FF';
const INDIGO = '#5E5CE6';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD
  type: 'deadline' | 'interview' | 'career_fair' | 'custom';
  notes?: string;
  completedAt?: string | null;
}

type EventType = CalendarEvent['type'];

const EVENT_CONFIG: Record<EventType, { color: string; icon: string; label: string }> = {
  deadline:    { color: GOLD,   icon: 'flag-outline',          label: 'Deadline' },
  interview:   { color: CORAL,  icon: 'people-outline',        label: 'Interview' },
  career_fair: { color: BLUE,   icon: 'business-outline',      label: 'Career Fair' },
  custom:      { color: INDIGO, icon: 'calendar-outline',      label: 'Event' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2, 10); }

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(dateStr: string): number {
  const d = parseDate(dateStr);
  if (!d) return 999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateShort(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

function formatDateFull(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDay = first.getDay();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= lastDay; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

// ── This Week Summary ─────────────────────────────────────────────────────────

function ThisWeekCard({ events }: { events: CalendarEvent[] }) {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

  const thisWeek = events.filter(e => {
    const d = parseDate(e.date);
    if (!d) return false;
    return d >= now && d <= endOfWeek && !e.completedAt;
  });

  const deadlines = thisWeek.filter(e => e.type === 'deadline').length;
  const interviews = thisWeek.filter(e => e.type === 'interview').length;
  const other = thisWeek.length - deadlines - interviews;

  if (thisWeek.length === 0) {
    return (
      <View style={cs.weekCard}>
        <View style={cs.weekHeader}>
          <Ionicons name="calendar" size={14} color={GREEN} />
          <Text style={cs.weekTitle}>THIS WEEK</Text>
        </View>
        <Text style={cs.weekEmpty}>Nothing scheduled. Add deadlines to stay on track.</Text>
      </View>
    );
  }

  return (
    <View style={cs.weekCard}>
      <View style={cs.weekHeader}>
        <Ionicons name="calendar" size={14} color={GOLD} />
        <Text style={cs.weekTitle}>THIS WEEK</Text>
        <View style={cs.weekBadge}>
          <Text style={cs.weekBadgeText}>{thisWeek.length}</Text>
        </View>
      </View>
      <View style={cs.weekStats}>
        {deadlines > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: GOLD }]} />
            <Text style={cs.weekStatText}>{deadlines} deadline{deadlines > 1 ? 's' : ''}</Text>
          </View>
        )}
        {interviews > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: CORAL }]} />
            <Text style={cs.weekStatText}>{interviews} interview{interviews > 1 ? 's' : ''}</Text>
          </View>
        )}
        {other > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: BLUE }]} />
            <Text style={cs.weekStatText}>{other} event{other > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
      {/* Next up */}
      {thisWeek.length > 0 && (() => {
        const next = thisWeek.sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
        const days = daysUntil(next.date);
        const cfg = EVENT_CONFIG[next.type];
        return (
          <View style={cs.weekNext}>
            <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
            <Text style={cs.weekNextText} numberOfLines={1}>
              <Text style={{ color: cfg.color, fontWeight: '700' }}>
                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
              </Text>
              {' — '}{next.title}
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

// ── Month Grid ────────────────────────────────────────────────────────────────

function MonthGrid({ year, month, events, selectedDay, onSelectDay }: {
  year: number; month: number; events: CalendarEvent[];
  selectedDay: string | null; onSelectDay: (key: string | null) => void;
}) {
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);
  const today = toDateKey(new Date());

  // Build event map for this month
  const eventMap = useMemo(() => {
    const map: Record<string, EventType[]> = {};
    for (const e of events) {
      const d = parseDate(e.date);
      if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = toDateKey(d);
      if (!map[key]) map[key] = [];
      if (!map[key].includes(e.type)) map[key].push(e.type);
    }
    return map;
  }, [events, year, month]);

  return (
    <View style={cs.gridWrap}>
      {/* Day headers */}
      <View style={cs.gridRow}>
        {DAYS.map((d, i) => (
          <View key={i} style={cs.gridCell}>
            <Text style={cs.gridDayHeader}>{d}</Text>
          </View>
        ))}
      </View>
      {/* Weeks */}
      {weeks.map((week, wi) => (
        <View key={wi} style={cs.gridRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={cs.gridCell} />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = key === today;
            const isSelected = key === selectedDay;
            const dayEvents = eventMap[key] || [];

            return (
              <AnimatedPressable
                key={di}
                style={[
                  cs.gridCell,
                  isToday && cs.gridCellToday,
                  isSelected && cs.gridCellSelected,
                ]}
                onPress={() => onSelectDay(isSelected ? null : key)}
                scaleDown={0.9}
              >
                <Text style={[
                  cs.gridDayNum,
                  isToday && cs.gridDayNumToday,
                  isSelected && cs.gridDayNumSelected,
                ]}>
                  {day}
                </Text>
                {dayEvents.length > 0 && (
                  <View style={cs.dotRow}>
                    {dayEvents.slice(0, 3).map((type, ti) => (
                      <View key={ti} style={[cs.eventDot, { backgroundColor: EVENT_CONFIG[type].color }]} />
                    ))}
                  </View>
                )}
              </AnimatedPressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event, onComplete, onDelete }: {
  event: CalendarEvent; onComplete: () => void; onDelete: () => void;
}) {
  const cfg = EVENT_CONFIG[event.type];
  const days = daysUntil(event.date);
  const isUrgent = days <= 2 && days >= 0;
  const isPast = days < 0;

  return (
    <View style={[cs.eventCard, isUrgent && { borderColor: cfg.color + '40' }]}>
      <View style={[cs.eventIcon, { backgroundColor: cfg.color + '15' }]}>
        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={cs.eventTitleRow}>
          <Text style={[cs.eventTitle, event.completedAt && cs.eventTitleDone]} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={[cs.eventType, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={cs.eventMeta}>
          <Text style={cs.eventDate}>{formatDateShort(event.date)}</Text>
          {!isPast && !event.completedAt && (
            <Text style={[cs.eventCountdown, { color: isUrgent ? CORAL : colors.t3 }]}>
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
            </Text>
          )}
          {isPast && !event.completedAt && (
            <Text style={[cs.eventCountdown, { color: CORAL }]}>Overdue</Text>
          )}
        </View>
        {event.notes ? <Text style={cs.eventNotes} numberOfLines={2}>{event.notes}</Text> : null}
      </View>
      <View style={cs.eventActions}>
        {!event.completedAt && (
          <AnimatedPressable onPress={onComplete} scaleDown={0.85} hitSlop={8}>
            <Ionicons name="checkmark-circle-outline" size={20} color={GREEN} />
          </AnimatedPressable>
        )}
        <AnimatedPressable onPress={onDelete} scaleDown={0.85} hitSlop={8}>
          <Ionicons name="trash-outline" size={14} color={colors.t3 + '60'} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

function AddEventModal({ visible, onClose, onAdd }: {
  visible: boolean; onClose: () => void; onAdd: (event: CalendarEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<EventType>('deadline');

  function handleAdd() {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    if (!dateStr.trim()) { Alert.alert('Date required', 'Enter a date like 2026-04-15'); return; }
    // Validate date
    const parsed = parseDate(dateStr);
    if (!parsed) { Alert.alert('Invalid date', 'Use format YYYY-MM-DD'); return; }

    onAdd({
      id: uid(),
      title: title.trim(),
      date: toDateKey(parsed),
      type,
      notes: notes.trim() || undefined,
    });
    setTitle(''); setDateStr(''); setNotes(''); setType('deadline');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={cs.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={cs.modalKav}>
          <View style={[cs.modalCard, { paddingBottom: insets.bottom + 20 }]}>

            <View style={cs.modalHeader}>
              <Text style={cs.modalTitle}>New Event</Text>
              <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12}>
                <Ionicons name="close" size={20} color={colors.t2} />
              </AnimatedPressable>
            </View>

            {/* Type selector */}
            <View style={cs.typeRow}>
              {(Object.entries(EVENT_CONFIG) as [EventType, typeof EVENT_CONFIG[EventType]][]).map(([key, cfg]) => (
                <AnimatedPressable
                  key={key}
                  style={[cs.typeChip, type === key && { backgroundColor: cfg.color + '20', borderColor: cfg.color + '40' }]}
                  onPress={() => setType(key)}
                  scaleDown={0.95}
                >
                  <Ionicons name={cfg.icon as any} size={12} color={type === key ? cfg.color : colors.t3} />
                  <Text style={[cs.typeChipText, type === key && { color: cfg.color }]}>{cfg.label}</Text>
                </AnimatedPressable>
              ))}
            </View>

            <TextInput
              style={cs.modalInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={colors.t3}
              autoFocus
            />

            <TextInput
              style={cs.modalInput}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={colors.t3}
              keyboardType="numbers-and-punctuation"
            />

            <TextInput
              style={[cs.modalInput, { minHeight: 60 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.t3}
              multiline
            />

            <AnimatedPressable style={cs.modalBtn} onPress={handleAdd} scaleDown={0.97}>
              <Ionicons name="add-circle" size={16} color="#1a1400" />
              <Text style={cs.modalBtnText}>Add Event</Text>
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();

  const [events, setEvents]         = useState<CalendarEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdd, setShowAdd]       = useState(false);

  // Current month view
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Load deadlines from profile
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/profile');
        const data = await res.json();
        const deadlines = data?.deadlines || [];
        const mapped: CalendarEvent[] = deadlines
          .filter((d: any) => d && d.date)
          .map((d: any) => ({
            id: d.id || uid(),
            title: d.label || d.title || 'Untitled',
            date: d.date.slice(0, 10),
            type: (d.type as EventType) || 'deadline',
            notes: d.notes || d.prep || undefined,
            completedAt: d.completedAt || null,
          }));
        setEvents(mapped);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  // Save events back to profile as deadlines
  async function saveEvents(updated: CalendarEvent[]) {
    setEvents(updated);
    try {
      const deadlines = updated.map(e => ({
        id: e.id,
        label: e.title,
        date: e.date,
        type: e.type,
        notes: e.notes || '',
        completedAt: e.completedAt || null,
      }));
      await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ deadlines }),
      });
    } catch {}
  }

  function handleAddEvent(event: CalendarEvent) {
    saveEvents([...events, event]);
  }

  function handleComplete(id: string) {
    saveEvents(events.map(e => e.id === id ? { ...e, completedAt: new Date().toISOString() } : e));
  }

  function handleDelete(id: string) {
    Alert.alert('Delete event?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => saveEvents(events.filter(e => e.id !== id)) },
    ]);
  }

  // Navigate months
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  }

  // Filter events for selected day or upcoming
  const displayEvents = useMemo(() => {
    if (selectedDay) {
      return events.filter(e => e.date === selectedDay).sort((a, b) => a.title.localeCompare(b.title));
    }
    // Upcoming 14 days
    return events
      .filter(e => {
        const days = daysUntil(e.date);
        return days >= -1 && days <= 14 && !e.completedAt;
      })
      .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  }, [events, selectedDay]);

  if (loading) {
    return (
      <View style={[cs.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.t3, fontSize: 12 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[cs.container, { paddingTop: insets.top }]}>

      {/* Nav bar */}
      <FadeInView delay={0}>
        <View style={cs.navBar}>
          <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.t1} />
          </AnimatedPressable>
          <Text style={cs.navTitle}>Calendar</Text>
          <AnimatedPressable onPress={() => setShowAdd(true)} scaleDown={0.9} hitSlop={12}>
            <View style={cs.addBtn}>
              <Ionicons name="add" size={18} color={GOLD} />
            </View>
          </AnimatedPressable>
        </View>
      </FadeInView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 40 }]}>

        {/* This week */}
        <FadeInView delay={60}>
          <ThisWeekCard events={events} />
        </FadeInView>

        {/* Month navigation */}
        <FadeInView delay={120}>
          <View style={cs.monthNav}>
            <AnimatedPressable onPress={prevMonth} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="chevron-back" size={18} color={colors.t2} />
            </AnimatedPressable>
            <Text style={cs.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <AnimatedPressable onPress={nextMonth} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="chevron-forward" size={18} color={colors.t2} />
            </AnimatedPressable>
          </View>

          {/* Month grid */}
          <MonthGrid
            year={viewYear}
            month={viewMonth}
            events={events}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </FadeInView>

        {/* Event list */}
        <FadeInView delay={200}>
          <View style={cs.listHeader}>
            <Text style={cs.listLabel}>
              {selectedDay ? formatDateFull(selectedDay) : 'UPCOMING'}
            </Text>
            {selectedDay && (
              <AnimatedPressable onPress={() => setSelectedDay(null)} scaleDown={0.9}>
                <Text style={cs.listClear}>Show all</Text>
              </AnimatedPressable>
            )}
          </View>

          {displayEvents.length === 0 ? (
            <View style={cs.emptyWrap}>
              <Ionicons name="calendar-outline" size={32} color={colors.t3 + '40'} />
              <Text style={cs.emptyText}>
                {selectedDay ? 'Nothing on this day' : 'No upcoming events'}
              </Text>
              <AnimatedPressable style={cs.emptyBtn} onPress={() => setShowAdd(true)} scaleDown={0.97}>
                <Ionicons name="add" size={14} color={GOLD} />
                <Text style={cs.emptyBtnText}>Add an event</Text>
              </AnimatedPressable>
            </View>
          ) : (
            displayEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onComplete={() => handleComplete(event.id)}
                onDelete={() => handleDelete(event.id)}
              />
            ))
          )}
        </FadeInView>

      </ScrollView>

      {/* FAB */}
      <AnimatedPressable
        style={[cs.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowAdd(true)}
        scaleDown={0.92}
      >
        <Ionicons name="add" size={24} color="#1a1400" />
      </AnimatedPressable>

      {/* Add modal */}
      <AddEventModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAddEvent} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // This week card
  weekCard: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 16,
  },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  weekTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.5, color: GOLD, flex: 1 },
  weekBadge: {
    backgroundColor: GOLD + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  weekBadgeText: { fontFamily: 'Cinzel_700Bold', fontSize: 11, color: GOLD },
  weekStats: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  weekStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weekStatDot: { width: 6, height: 6, borderRadius: 3 },
  weekStatText: { fontSize: 12, color: colors.t2 },
  weekNext: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.s3, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  weekNextText: { fontSize: 12, color: colors.t2, flex: 1 },
  weekEmpty: { fontSize: 12, color: colors.t3, lineHeight: 18 },

  // Month nav
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },

  // Grid
  gridWrap: { marginBottom: 20 },
  gridRow: { flexDirection: 'row' },
  gridCell: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, minHeight: 44,
  },
  gridCellToday: {
    backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 10,
  },
  gridCellSelected: {
    backgroundColor: GOLD + '20', borderRadius: 10, borderWidth: 1, borderColor: GOLD + '40',
  },
  gridDayHeader: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1, color: colors.t3 },
  gridDayNum: { fontSize: 14, color: colors.t2, fontWeight: '500' },
  gridDayNumToday: { color: GOLD, fontWeight: '700' },
  gridDayNumSelected: { color: GOLD, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },

  // List
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  listLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.5, color: colors.t3 },
  listClear: { fontSize: 11, color: BLUE, fontWeight: '600' },

  // Event card
  eventCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 8,
  },
  eventIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: colors.t1, flex: 1 },
  eventTitleDone: { textDecorationLine: 'line-through', color: colors.t3 },
  eventType: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  eventMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  eventDate: { fontSize: 11, color: colors.t3 },
  eventCountdown: { fontSize: 11, fontWeight: '600' },
  eventNotes: { fontSize: 11, color: colors.t3, lineHeight: 16, marginTop: 4 },
  eventActions: { gap: 8, alignItems: 'center' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13, color: colors.t3 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: GOLD + '30', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
  },
  emptyBtnText: { fontSize: 12, color: GOLD, fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute', right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalKav: { justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.s1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.s3, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  typeChipText: { fontSize: 11, color: colors.t3, fontWeight: '600' },
  modalInput: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.t1,
    marginBottom: 10,
  },
  modalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, marginTop: 6,
  },
  modalBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#1a1400' },
});