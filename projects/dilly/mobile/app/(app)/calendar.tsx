import { safeBack } from '../../lib/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
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
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import { useResolvedTheme } from '../../hooks/useTheme';
import { openAddToCalendar, openSubscribeToDillyCalendar, isCalendarSubscribed } from '../../lib/calendar';
import { syncReminderForEvent, deleteReminderForEvent } from '../../lib/reminders';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { DillyFace } from '../../components/DillyFace';
import { TouchableOpacity } from 'react-native';
import { showToast } from '../../lib/globalToast';
import { showConfirm } from '../../lib/globalConfirm';

const GOLD  = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE  = '#0A84FF';
const INDIGO = '#5E5CE6';
const PURPLE = '#AF52DE';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD
  type: 'deadline' | 'interview' | 'career_fair' | 'custom' | 'application' | 'prep';
  notes?: string;
  completedAt?: string | null;
  reminder_days?: number[];
  prep_type?: string;
  createdBy?: string;
  company?: string;
  role?: string;
}

type EventType = CalendarEvent['type'];

const EVENT_CONFIG: Record<EventType, { color: string; icon: string; label: string }> = {
  deadline:    { color: GOLD,   icon: 'flag-outline',          label: 'Deadline' },
  interview:   { color: CORAL,  icon: 'people-outline',        label: 'Interview' },
  career_fair: { color: BLUE,   icon: 'business-outline',      label: 'Career Fair' },
  custom:      { color: INDIGO, icon: 'calendar-outline',      label: 'Event' },
  application: { color: GREEN,  icon: 'briefcase-outline',     label: 'Application' },
  prep:        { color: PURPLE, icon: 'book-outline',          label: 'Prep' },
};

// ── Prep Deck types ──

interface PrepQuestion {
  question: string;
  category: string;
  probability: string;
  why_flagged: string;
  prep_tip: string;
}

interface DimensionGap {
  dimension: string;
  gap: number;
  focus: string;
}

interface PrepDeck {
  company: string;
  role: string;
  track_label: string;
  questions: PrepQuestion[];
  dimension_gaps: DimensionGap[];
  company_insights: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2, 10); }

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(iso: string): Date | null {
  if (!iso) return null;
  // CRITICAL: Do NOT use new Date(iso) for date-only strings like "2026-04-09".
  // JS interprets that as UTC midnight, which shifts to the previous day in
  // negative-offset timezones (EDT, CST, PST). Split and construct locally.
  const parts = iso.trim().slice(0, 10).split('-');
  if (parts.length >= 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(day)) {
      const d = new Date(y, m, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  // Fallback for full ISO timestamps (has T)
  if (iso.includes('T')) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
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

const REMINDER_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
];

// ── Build-78: Interview Countdown Hero ────────────────────────────────────────
// When the nearest interview is ≤7 days away, this replaces the generic
// ThisWeekCard with a focused countdown: big days-remaining number, company +
// role, prep progress, and a one-tap "Drill questions" button. This is what
// makes the calendar feel like a career advisor, not a grid.

function InterviewCountdownHero({
  interview, events, onViewPrepDeck, loadingPrepDeck,
}: {
  interview: CalendarEvent;
  events: CalendarEvent[];
  onViewPrepDeck: () => void;
  loadingPrepDeck: boolean;
}) {
  const theme = useResolvedTheme();
  const days = daysUntil(interview.date);
  const prepBlocks = events.filter(
    e => e.type === 'prep' && e.company === interview.company && !e.completedAt
  );
  const prepDone = events.filter(
    e => e.type === 'prep' && e.company === interview.company && !!e.completedAt
  ).length;
  const prepTotal = prepBlocks.length + prepDone;
  const prepPct = prepTotal > 0 ? Math.round((prepDone / prepTotal) * 100) : 0;

  return (
    <View style={[cs.countdownCard, { backgroundColor: theme.surface.s1, borderColor: CORAL + '40' }]}>
      <View style={cs.countdownHeader}>
        <Ionicons name="people" size={14} color={CORAL} />
        <Text style={cs.countdownLabel}>INTERVIEW COUNTDOWN</Text>
      </View>
      <View style={cs.countdownBody}>
        <View style={cs.countdownLeft}>
          <Text style={cs.countdownDays}>
            {days === 0 ? 'TODAY' : days === 1 ? '1' : String(days)}
          </Text>
          {days > 0 && <Text style={[cs.countdownDaysLabel, { color: theme.surface.t3 }]}>day{days !== 1 ? 's' : ''}</Text>}
        </View>
        <View style={cs.countdownRight}>
          <Text style={[cs.countdownCompany, { color: theme.surface.t1 }]} numberOfLines={1}>
            {interview.company || interview.title}
          </Text>
          {interview.role ? (
            <Text style={[cs.countdownRole, { color: theme.surface.t2 }]} numberOfLines={1}>{interview.role}</Text>
          ) : null}
          <Text style={[cs.countdownDate, { color: theme.surface.t3 }]}>{formatDateFull(interview.date)}</Text>
        </View>
      </View>
      {/* Prep progress */}
      {prepTotal > 0 && (
        <View style={cs.countdownPrepRow}>
          <View style={[cs.countdownPrepTrack, { backgroundColor: theme.surface.s2 }]}>
            <View style={[cs.countdownPrepFill, { width: `${prepPct}%` }]} />
          </View>
          <Text style={[cs.countdownPrepText, { color: theme.surface.t3 }]}>
            {prepDone}/{prepTotal} prep blocks done
          </Text>
        </View>
      )}
      {/* Actions */}
      <View style={cs.countdownActions}>
        <AnimatedPressable
          style={cs.countdownBtn}
          onPress={onViewPrepDeck}
          scaleDown={0.97}
        >
          <Ionicons name="reader-outline" size={13} color="#FFFFFF" />
          <Text style={cs.countdownBtnText}>
            {loadingPrepDeck ? 'Loading...' : 'Drill questions'}
          </Text>
        </AnimatedPressable>
        <TouchableOpacity
          style={[cs.countdownCalBtn, { borderColor: CORAL + '40' }]}
          onPress={() => {
            router.push({
              pathname: '/(app)/resume-generate',
              params: { focusDimension: 'tailor' },
            });
          }}
          hitSlop={8}
        >
          <Ionicons name="document-text-outline" size={13} color={CORAL} />
          <Text style={cs.countdownCalBtnText}>Tailor resume</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


// ── This Week Summary ─────────────────────────────────────────────────────────

function ThisWeekCard({ events }: { events: CalendarEvent[] }) {
  const theme = useResolvedTheme();
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

  const thisWeek = events.filter(e => {
    const d = parseDate(e.date);
    if (!d) return false;
    return d >= now && d <= endOfWeek && !e.completedAt;
  });

  const deadlines = thisWeek.filter(e => e.type === 'deadline' || e.type === 'application').length;
  const interviews = thisWeek.filter(e => e.type === 'interview').length;
  const prepBlocks = thisWeek.filter(e => e.type === 'prep').length;
  const other = thisWeek.length - deadlines - interviews - prepBlocks;

  if (thisWeek.length === 0) {
    return (
      <View style={[cs.weekCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <View style={cs.weekHeader}>
          <Ionicons name="calendar" size={14} color={GREEN} />
          <Text style={[cs.weekTitle, { color: theme.surface.t2 }]}>THIS WEEK</Text>
        </View>
        <Text style={[cs.weekEmpty, { color: theme.surface.t3 }]}>Nothing scheduled. Add deadlines to stay on track.</Text>
      </View>
    );
  }

  return (
    <View style={[cs.weekCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      <View style={cs.weekHeader}>
        <Ionicons name="calendar" size={14} color={theme.accent} />
        <Text style={[cs.weekTitle, { color: theme.surface.t2 }]}>THIS WEEK</Text>
        <View style={[cs.weekBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Text style={[cs.weekBadgeText, { color: theme.accent }]}>{thisWeek.length}</Text>
        </View>
      </View>
      <View style={cs.weekStats}>
        {deadlines > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: theme.accent }]} />
            <Text style={[cs.weekStatText, { color: theme.surface.t2 }]}>{deadlines} deadline{deadlines > 1 ? 's' : ''}</Text>
          </View>
        )}
        {interviews > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: CORAL }]} />
            <Text style={[cs.weekStatText, { color: theme.surface.t2 }]}>{interviews} interview{interviews > 1 ? 's' : ''}</Text>
          </View>
        )}
        {prepBlocks > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: PURPLE }]} />
            <Text style={[cs.weekStatText, { color: theme.surface.t2 }]}>{prepBlocks} prep block{prepBlocks > 1 ? 's' : ''}</Text>
          </View>
        )}
        {other > 0 && (
          <View style={cs.weekStat}>
            <View style={[cs.weekStatDot, { backgroundColor: BLUE }]} />
            <Text style={[cs.weekStatText, { color: theme.surface.t2 }]}>{other} event{other > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
      {/* Next up */}
      {thisWeek.length > 0 && (() => {
        const next = thisWeek.sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
        const days = daysUntil(next.date);
        const cfg = EVENT_CONFIG[next.type] || EVENT_CONFIG.custom;
        return (
          <View style={[cs.weekNext, { borderTopColor: theme.surface.border }]}>
            <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
            <Text style={[cs.weekNextText, { color: theme.surface.t1 }]} numberOfLines={1}>
              <Text style={{ color: cfg.color, fontWeight: '700' }}>
                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
              </Text>
              {' \u2014 '}{next.title}
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
  const theme = useResolvedTheme();
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
    <View style={[cs.gridWrap, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      {/* Day headers */}
      <View style={cs.gridRow}>
        {DAYS.map((d, i) => (
          <View key={i} style={cs.gridCell}>
            <Text style={[cs.gridDayHeader, { color: theme.surface.t3 }]}>{d}</Text>
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
                  isToday && [cs.gridCellToday, { backgroundColor: theme.accentSoft }],
                  isSelected && [cs.gridCellSelected, { backgroundColor: theme.accent, borderColor: theme.accent }],
                ]}
                onPress={() => onSelectDay(isSelected ? null : key)}
                scaleDown={0.9}
              >
                <Text style={[
                  cs.gridDayNum,
                  { color: theme.surface.t1 },
                  isToday && [cs.gridDayNumToday, { color: theme.accent }],
                  isSelected && [cs.gridDayNumSelected, { color: '#FFFFFF' }],
                ]}>
                  {day}
                </Text>
                {dayEvents.length > 0 && (
                  <View style={cs.dotRow}>
                    {dayEvents.slice(0, 3).map((type, ti) => (
                      <View key={ti} style={[cs.eventDot, { backgroundColor: (EVENT_CONFIG[type] || EVENT_CONFIG.custom).color }]} />
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

// ── Reminder Toggles ──────────────────────────────────────────────────────────

function ReminderToggles({ event, onUpdate }: { event: CalendarEvent; onUpdate: (days: number[]) => void }) {
  const current = event.reminder_days || [];
  return (
    <View style={cs.reminderRow}>
      <Text style={cs.reminderLabel}>REMINDERS</Text>
      <View style={cs.reminderChips}>
        {REMINDER_OPTIONS.map(opt => {
          const active = current.includes(opt.days);
          return (
            <AnimatedPressable
              key={opt.days}
              style={[cs.reminderChip, active && cs.reminderChipActive]}
              onPress={() => {
                const next = active ? current.filter(d => d !== opt.days) : [...current, opt.days];
                onUpdate(next);
              }}
              scaleDown={0.95}
            >
              {active && <Ionicons name="checkmark" size={10} color={BLUE} style={{ marginRight: 3 }} />}
              <Text style={[cs.reminderChipText, active && { color: BLUE }]}>{opt.label}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Prep Deck Modal ───────────────────────────────────────────────────────────

function PrepDeckModalMobile({ deck, onClose }: { deck: PrepDeck; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const probColor: Record<string, string> = { high: CORAL, medium: AMBER, low: GREEN };

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={cs.modalOverlay}>
        <View style={[cs.prepDeckSheet, { backgroundColor: theme.surface.s1, paddingBottom: insets.bottom + 20 }]}>
          <View style={cs.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[cs.modalTitle, { color: theme.surface.t1 }]}>Interview Prep Deck</Text>
              <Text style={[cs.prepDeckSub, { color: theme.surface.t3 }]}>{deck.company} - {deck.role} ({deck.track_label})</Text>
            </View>
            <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="close" size={20} color={theme.surface.t2} />
            </AnimatedPressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Dimension gaps */}
            {(deck.dimension_gaps?.length ?? 0) > 0 && (
              <View style={cs.prepSection}>
                <Text style={cs.prepSectionLabel}>YOUR GAP AREAS</Text>
                {(deck.dimension_gaps || []).map(g => (
                  <View key={g.dimension} style={cs.gapCard}>
                    <Text style={cs.gapDim}>{g.dimension}</Text>
                    <Text style={cs.gapPts}>{g.gap} pts gap</Text>
                    <Text style={cs.gapFocus}>{g.focus}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Company insights */}
            <View style={cs.insightCard}>
              <Text style={cs.insightLabel}>COMPANY INSIGHT</Text>
              <Text style={cs.insightText}>{deck.company_insights}</Text>
            </View>

            {/* Questions */}
            <View style={cs.prepSection}>
              <Text style={cs.prepSectionLabel}>PREDICTED QUESTIONS ({deck.questions.length})</Text>
              {deck.questions.map((q, i) => (
                <View key={i} style={cs.questionCard}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                    <View style={[cs.probBadge, { backgroundColor: (probColor[q.probability] || '#999') + '20' }]}>
                      <Text style={[cs.probBadgeText, { color: probColor[q.probability] || '#999' }]}>{q.probability}</Text>
                    </View>
                    <View style={cs.catBadge}>
                      <Text style={cs.catBadgeText}>{q.category}</Text>
                    </View>
                  </View>
                  <Text style={cs.questionText}>{q.question}</Text>
                  {q.why_flagged ? <Text style={cs.whyFlagged}>{q.why_flagged}</Text> : null}
                  {q.prep_tip ? <Text style={cs.prepTip}>Tip: {q.prep_tip}</Text> : null}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event, onComplete, onDelete, onUpdateReminders, onGeneratePrepSchedule, onViewPrepDeck, loadingPrepSchedule, loadingPrepDeck }: {
  event: CalendarEvent;
  onComplete: () => void;
  onDelete: () => void;
  onUpdateReminders: (days: number[]) => void;
  onGeneratePrepSchedule: () => void;
  onViewPrepDeck: () => void;
  loadingPrepSchedule: boolean;
  loadingPrepDeck: boolean;
}) {
  const theme = useResolvedTheme();
  const cfg = EVENT_CONFIG[event.type] || EVENT_CONFIG.custom;
  const days = daysUntil(event.date);
  const isUrgent = days <= 2 && days >= 0;
  const isPast = days < 0;

  return (
    <View style={[cs.eventCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }, isUrgent && { borderColor: cfg.color + '40' }]}>
      <View style={[cs.eventIcon, { backgroundColor: cfg.color + '15' }]}>
        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={cs.eventTitleRow}>
          <Text style={[cs.eventTitle, { color: theme.surface.t1 }, event.completedAt && [cs.eventTitleDone, { color: theme.surface.t3 }]]} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={[cs.eventType, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={cs.eventMeta}>
          <Text style={[cs.eventDate, { color: theme.surface.t2 }]}>{formatDateShort(event.date)}</Text>
          {!isPast && !event.completedAt && (
            <Text style={[cs.eventCountdown, { color: isUrgent ? CORAL : theme.surface.t3 }]}>
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
            </Text>
          )}
          {isPast && !event.completedAt && (
            <Text style={[cs.eventCountdown, { color: CORAL }]}>Overdue</Text>
          )}
        </View>
        {event.notes ? <Text style={[cs.eventNotes, { color: theme.surface.t2 }]} numberOfLines={2}>{event.notes}</Text> : null}

        {/* Reminder toggles for deadlines/interviews/applications */}
        {(event.type === 'deadline' || event.type === 'interview' || event.type === 'application') && (
          <ReminderToggles event={event} onUpdate={onUpdateReminders} />
        )}

        {/* Prep schedule button for interviews */}
        {event.type === 'interview' && event.company && (
          <AnimatedPressable
            style={[cs.actionBtn, { backgroundColor: PURPLE + '15', borderColor: PURPLE + '30' }]}
            onPress={onGeneratePrepSchedule}
            scaleDown={0.97}
          >
            <Ionicons name="book-outline" size={12} color={PURPLE} />
            <Text style={[cs.actionBtnText, { color: PURPLE }]}>
              {loadingPrepSchedule ? 'Generating...' : 'Generate Prep Schedule'}
            </Text>
          </AnimatedPressable>
        )}

        {/* Prep deck button for interviews */}
        {event.type === 'interview' && event.company && (
          <AnimatedPressable
            style={[cs.actionBtn, { backgroundColor: AMBER + '15', borderColor: AMBER + '30' }]}
            onPress={onViewPrepDeck}
            scaleDown={0.97}
          >
            <Ionicons name="reader-outline" size={12} color={AMBER} />
            <Text style={[cs.actionBtnText, { color: AMBER }]}>
              {loadingPrepDeck ? 'Loading...' : 'View Prep Deck'}
            </Text>
          </AnimatedPressable>
        )}
      </View>
      <View style={cs.eventActions}>
        {!event.completedAt && !isPast && (
          <AnimatedPressable
            onPress={async () => {
              const company = event.company || event.title;
              const role = event.role || '';
              let created = false;
              if (event.type === 'interview') {
                const r = await remindInterview(company, role, event.date);
                created = !!(r.dayBefore || r.hoursBefore);
              } else {
                const r = await remindDeadline(company, role, event.date);
                created = !!r;
              }
              if (created) showToast({ message: `Added to your Reminders app.`, type: 'success' });
              else showToast({ message: 'Check Reminders permissions in Settings.', type: 'error' });
            }}
            scaleDown={0.85}
            hitSlop={8}
          >
            <Ionicons name="notifications-outline" size={16} color={GOLD} />
          </AnimatedPressable>
        )}
        {!event.completedAt && (
          <AnimatedPressable onPress={onComplete} scaleDown={0.85} hitSlop={8}>
            <Ionicons name="checkmark-circle-outline" size={20} color={GREEN} />
          </AnimatedPressable>
        )}
        <AnimatedPressable onPress={onDelete} scaleDown={0.85} hitSlop={8}>
          <Ionicons name="trash-outline" size={14} color={theme.surface.t3 + '60'} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

function AddEventModal({ visible, onClose, onAdd, initialDate }: {
  visible: boolean; onClose: () => void; onAdd: (event: CalendarEvent) => void;
  initialDate?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<EventType>('deadline');

  // Pre-fill date from the selected day when modal opens
  useEffect(() => {
    if (visible && initialDate) {
      setDateStr(initialDate);
    }
  }, [visible, initialDate]);

  function handleAdd() {
    if (!title.trim()) { showToast({ message: 'Title required', type: 'error' }); return; }
    if (!dateStr.trim()) { showToast({ message: 'Enter a date like 2026-04-15', type: 'info' }); return; }
    // Validate date
    const parsed = parseDate(dateStr);
    if (!parsed) { showToast({ message: 'Use format YYYY-MM-DD', type: 'error' }); return; }

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
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={cs.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={cs.modalKav}>
          {/* Cap the card height so it never fills the full screen
              (which pushed the X button up under the status bar with
              the keyboard open). maxHeight: 82% leaves room for the
              top notch area. */}
          <View style={[cs.modalCard, { backgroundColor: theme.surface.s1, paddingBottom: insets.bottom + 20, maxHeight: '82%' }]}>

            {/* Close button bumped bigger and wrapped in a padded
                press target so it's always reachable, even at the
                top of a tall modal. */}
            <View style={cs.modalHeader}>
              <Text style={[cs.modalTitle, { color: theme.surface.t1 }]}>New Event</Text>
              <AnimatedPressable
                onPress={onClose}
                scaleDown={0.9}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={24} color={theme.surface.t1} />
              </AnimatedPressable>
            </View>

            {/* Scrollable body - the keyboard used to cover the date
                picker + notes + Add button because the modal card was
                fixed. Wrapping everything below the header in a
                ScrollView lets the user scroll past the keyboard to
                hit "Add Event". keyboardShouldPersistTaps='handled' so
                date picker chips still register taps while the input
                has focus. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
            >

            {/* Type selector */}
            <View style={cs.typeRow}>
              {(Object.entries(EVENT_CONFIG) as [EventType, typeof EVENT_CONFIG[EventType]][]).map(([key, cfg]) => (
                <AnimatedPressable
                  key={key}
                  style={[cs.typeChip, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }, type === key && { backgroundColor: cfg.color + '20', borderColor: cfg.color + '40' }]}
                  onPress={() => setType(key)}
                  scaleDown={0.95}
                >
                  <Ionicons name={cfg.icon as any} size={12} color={type === key ? cfg.color : theme.surface.t3} />
                  <Text style={[cs.typeChipText, { color: theme.surface.t3 }, type === key && { color: cfg.color }]}>{cfg.label}</Text>
                </AnimatedPressable>
              ))}
            </View>

            <TextInput
              style={[cs.modalInput, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border, color: theme.surface.t1 }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={theme.surface.t3}
              autoFocus
            />

            {/* Date picker - mini calendar */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.surface.t2 }}>Date</Text>
              {(() => {
                const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const selected = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
                const [pickerMonth, setPickerMonth] = useState(selected.getMonth());
                const [pickerYear, setPickerYear] = useState(selected.getFullYear());

                const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
                const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
                const monthName = new Date(pickerYear, pickerMonth).toLocaleString('default', { month: 'long' });

                return (
                  <View style={{ backgroundColor: theme.surface.s1, borderRadius: 10, borderWidth: 1, borderColor: theme.surface.border, padding: 10 }}>
                    {/* Month/Year nav */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <AnimatedPressable onPress={() => { if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(pickerYear - 1); } else setPickerMonth(pickerMonth - 1); }} scaleDown={0.9} hitSlop={8}>
                        <Ionicons name="chevron-back" size={18} color={theme.surface.t2} />
                      </AnimatedPressable>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.surface.t1 }}>{monthName} {pickerYear}</Text>
                      <AnimatedPressable onPress={() => { if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(pickerYear + 1); } else setPickerMonth(pickerMonth + 1); }} scaleDown={0.9} hitSlop={8}>
                        <Ionicons name="chevron-forward" size={18} color={theme.surface.t2} />
                      </AnimatedPressable>
                    </View>
                    {/* Day headers */}
                    <View style={{ flexDirection: 'row' }}>
                      {['S','M','T','W','T','F','S'].map((d, i) => (
                        <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', color: theme.surface.t3 }}>{d}</Text>
                      ))}
                    </View>
                    {/* Day grid */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {Array.from({ length: firstDay }).map((_, i) => <View key={`e-${i}`} style={{ width: '14.28%', height: 32 }} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const key = fmt(new Date(pickerYear, pickerMonth, day));
                        const isSelected = dateStr === key;
                        return (
                          <AnimatedPressable
                            key={day}
                            style={{ width: '14.28%', height: 32, alignItems: 'center', justifyContent: 'center' }}
                            onPress={() => setDateStr(key)}
                            scaleDown={0.9}
                          >
                            <View style={isSelected ? { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' } : undefined}>
                              <Text style={{ fontSize: 12, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#fff' : theme.surface.t1 }}>{day}</Text>
                            </View>
                          </AnimatedPressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
              {dateStr ? <Text style={{ fontSize: 11, color: theme.accent, fontWeight: '600', marginTop: 4 }}>{dateStr}</Text> : null}
            </View>

            <TextInput
              style={[cs.modalInput, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border, color: theme.surface.t1, minHeight: 60 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              placeholderTextColor={theme.surface.t3}
              multiline
            />

            <AnimatedPressable style={[cs.modalBtn, { backgroundColor: theme.accent }]} onPress={handleAdd} scaleDown={0.97}>
              <Ionicons name="add-circle" size={16} color="#FFFFFF" />
              <Text style={cs.modalBtnText}>Add Event</Text>
            </AnimatedPressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  // Calendar had no theme integration - all 63 frozen colors refs
  // meant Midnight / Cream / Blush users saw a permanently light
  // surface. Pulling resolved theme here and threading it through
  // the main screen's key surfaces (container bg, navbar, month
  // label, loading text). Full StyleSheet overhaul is bigger than
  // this session allows; this covers the shell every user sees.
  const theme = useResolvedTheme();

  const [events, setEvents]         = useState<CalendarEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [prepDeck, setPrepDeck]     = useState<PrepDeck | null>(null);
  const [loadingPrepScheduleId, setLoadingPrepScheduleId] = useState<string | null>(null);
  const [loadingPrepDeckId, setLoadingPrepDeckId] = useState<string | null>(null);
  // Whether the user has already subscribed to the Dilly Calendar feed
  // in iOS. When true, we hide the Subscribe button in the top bar to
  // avoid a redundant CTA - the user can always unsubscribe via
  // Settings → Calendar → Account, which is where iOS owns the state.
  const [calSubscribed, setCalSubscribed] = useState(false);
  useFocusEffect(useCallback(() => {
    isCalendarSubscribed().then(setCalSubscribed);
  }, []));

  // Current month view
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Build-78: load from profile.deadlines + auto-import from tracker applications.
  // Also auto-generate "follow up" ghost events for silent applications.
  const fetchCalendarData = useCallback(async () => {
    try {
      const [profileRes, appsRes] = await Promise.all([
        dilly.fetch('/profile').then(r => r.json()).catch(() => ({})),
        dilly.get('/applications').then(r => {
          if (Array.isArray(r)) return { applications: r };
          return r || { applications: [] };
        }).catch(() => ({ applications: [] })),
      ]);

      // 1. Map profile deadlines (existing behavior)
      const deadlines = profileRes?.deadlines || [];
      const mapped: CalendarEvent[] = deadlines
        .filter((d: any) => d && d.date)
        .map((d: any) => ({
          id: d.id || uid(),
          title: d.label || d.title || 'Untitled',
          date: (d.date || '').slice(0, 10),
          type: (d.type as EventType) || 'deadline',
          notes: d.notes || d.prep || undefined,
          completedAt: d.completedAt || null,
          reminder_days: Array.isArray(d.reminder_days) ? d.reminder_days : undefined,
          prep_type: d.prep_type || undefined,
          createdBy: d.createdBy || undefined,
          company: d.company || undefined,
          role: d.role || undefined,
        }));

      // 2. Auto-import application deadlines from the tracker that
      //    don't already exist in profile.deadlines. Dedupes by
      //    company+role+date to prevent double-entry.
      const existingKeys = new Set(
        mapped.map(e => `${(e.company||'').toLowerCase()}|${(e.role||'').toLowerCase()}|${e.date}`)
      );
      const apps = (appsRes as any)?.applications || [];
      let imported = 0;
      for (const a of apps) {
        if (!a || typeof a !== 'object') continue;
        const deadline = (a.deadline || '').slice(0, 10);
        if (!deadline) continue;
        const company = (a.company || '').trim();
        const role = (a.role || '').trim();
        const key = `${company.toLowerCase()}|${role.toLowerCase()}|${deadline}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        mapped.push({
          id: a.id || uid(),
          title: company ? `${company}  -  ${role || 'Application'}` : (role || 'Application deadline'),
          date: deadline,
          type: 'application',
          notes: a.notes || undefined,
          completedAt: null,
          company: company || undefined,
          role: role || undefined,
          createdBy: 'tracker',
        });
        imported++;
      }

      // 3. Auto-suggest follow-up ghost events for applied apps
      //    that haven't had activity in 14+ days.
      const now = Date.now();
      const FOLLOW_UP_DAYS = 14;
      for (const a of apps) {
        if (!a || typeof a !== 'object') continue;
        if ((a.status || '').toLowerCase() !== 'applied') continue;
        const appliedAt = a.applied_at ? new Date(a.applied_at).getTime() : 0;
        if (!appliedAt || isNaN(appliedAt)) continue;
        const daysSince = Math.round((now - appliedAt) / 86400000);
        if (daysSince < 7) continue; // too early
        const followUpDate = new Date(appliedAt + FOLLOW_UP_DAYS * 86400000);
        const followUpKey = followUpDate.toISOString().slice(0, 10);
        const company = (a.company || '').trim();
        const role = (a.role || '').trim();
        const dedupKey = `followup|${company.toLowerCase()}|${role.toLowerCase()}|${followUpKey}`;
        if (existingKeys.has(dedupKey)) continue;
        existingKeys.add(dedupKey);
        mapped.push({
          id: `followup-${a.id || uid()}`,
          title: `Follow up  -  ${company || role || 'application'}`,
          date: followUpKey,
          type: 'custom',
          notes: daysSince >= FOLLOW_UP_DAYS
            ? `${daysSince} days since you applied. A short follow-up doubles response rate.`
            : `Suggested follow-up date. Applied ${daysSince} days ago.`,
          completedAt: null,
          company: company || undefined,
          role: role || undefined,
          createdBy: 'dilly-auto',
        });
      }

      setEvents(mapped);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await fetchCalendarData();
      setLoading(false);
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCalendarData();
    setRefreshing(false);
  }, [fetchCalendarData]);

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
        reminder_days: e.reminder_days || [],
        prep_type: e.prep_type || undefined,
        createdBy: e.createdBy || undefined,
        company: e.company || undefined,
        role: e.role || undefined,
      }));
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ deadlines }),
      });
    } catch {}
  }

  function handleAddEvent(event: CalendarEvent) {
    saveEvents([...events, event]);
    // Fire-and-forget: also create a native iOS Reminder if the user
    // turned on Sync to Reminders in Settings. Silently no-ops when
    // the toggle is off or permission was revoked.
    syncReminderForEvent(event.title, event.date).catch(() => {});
  }

  function handleComplete(id: string) {
    const target = events.find(e => e.id === id);
    saveEvents(events.map(e => e.id === id ? { ...e, completedAt: new Date().toISOString() } : e));
    if (target) deleteReminderForEvent(target.title, target.date).catch(() => {});
  }

  async function handleDelete(id: string) {
    const ok = await showConfirm({
      title: 'Delete event?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const target = events.find(e => e.id === id);
    saveEvents(events.filter(e => e.id !== id));
    if (target) deleteReminderForEvent(target.title, target.date).catch(() => {});
  }

  // Update reminders
  const handleUpdateReminders = useCallback(async (eventId: string, reminderDays: number[]) => {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, reminder_days: reminderDays } : e));
    try {
      const res = await dilly.fetch('/profile');
      const data = await res.json();
      const deadlines: any[] = data?.deadlines || [];
      const dl = deadlines.find((d: any) => d.id === eventId);
      if (dl) {
        dl.reminder_days = reminderDays;
        await dilly.fetch('/profile', {
          method: 'PATCH',
          body: JSON.stringify({ deadlines }),
        });
      }
    } catch {}
  }, []);

  // Generate prep schedule
  const handleGeneratePrepSchedule = useCallback(async (event: CalendarEvent) => {
    if (!event.company || !event.date) return;
    setLoadingPrepScheduleId(event.id);
    try {
      const res = await dilly.fetch('/calendar/generate-prep-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_date: event.date,
          company: event.company,
          role: event.role || event.title,
        }),
      });
      const data = await res.json();
      if (data.blocks && data.blocks.length > 0) {
        const newPrepEvents: CalendarEvent[] = data.blocks.map((b: any) => ({
          id: b.id,
          title: b.label,
          date: b.date.slice(0, 10),
          type: 'prep' as const,
          prep_type: b.prep_type,
          createdBy: 'dilly',
          company: event.company,
        }));
        setEvents(prev => {
          const ids = new Set(newPrepEvents.map(e => e.id));
          const kept = prev.filter(e => !ids.has(e.id));
          return [...kept, ...newPrepEvents];
        });
        showToast({ message: `${data.blocks.length} prep blocks added for ${event.company}`, type: 'success' });
      }
    } catch {
      showToast({ message: 'Could not generate prep schedule', type: 'error' });
    } finally {
      setLoadingPrepScheduleId(null);
    }
  }, []);

  // Generate prep deck
  const handleViewPrepDeck = useCallback(async (event: CalendarEvent) => {
    if (!event.company) {
      // No company info. just navigate to interview practice
      router.push('/(app)/interview-practice');
      return;
    }
    // Navigate to interview practice with the company + role pre-filled
    router.push({
      pathname: '/(app)/interview-practice',
      params: {
        company: event.company,
        role: event.role || event.title || '',
      },
    });
  }, []);

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
      <View style={[cs.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }]}>
        <DillyFace size={100} />
        <Text style={{ color: theme.surface.t2, fontSize: 15, fontWeight: '600', marginTop: 20 }}>Loading your calendar...</Text>
      </View>
    );
  }

  return (
    <View style={[cs.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>

      {/* Prep Deck Modal */}
      {prepDeck && <PrepDeckModalMobile deck={prepDeck} onClose={() => setPrepDeck(null)} />}

      {/* Nav bar */}
      <FadeInView delay={0}>
        <View style={cs.navBar}>
          <AnimatedPressable onPress={() => safeBack('/(app)')} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={theme.surface.t1} />
          </AnimatedPressable>
          <Text style={[cs.navTitle, { color: theme.surface.t1 }]}>Calendar</Text>
          <View />
        </View>
      </FadeInView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>

        {/* Dilly Calendar sync card */}
        {!calSubscribed ? (
          <AnimatedPressable
            style={[cs.calSyncCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
            onPress={async () => {
              await openSubscribeToDillyCalendar();
              setCalSubscribed(await isCalendarSubscribed());
            }}
            scaleDown={0.97}
          >
            <View style={[cs.calSyncIconWrap, { backgroundColor: theme.accent }]}>
              <Ionicons name="calendar-outline" size={18} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cs.calSyncTitle, { color: theme.surface.t1 }]}>Add to your calendar app</Text>
              <Text style={[cs.calSyncSub, { color: theme.surface.t2 }]}>
                Every Dilly deadline auto-syncs. Tap once, stays forever.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={theme.accent} />
          </AnimatedPressable>
        ) : (
          <View style={[cs.calSyncCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <View style={[cs.calSyncIconWrap, { backgroundColor: theme.accent }]}>
              <Ionicons name="checkmark" size={18} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cs.calSyncTitle, { color: theme.surface.t1 }]}>Built in to your phone</Text>
              <Text style={[cs.calSyncSub, { color: theme.surface.t2 }]}>
                Dilly deadlines sync automatically. Remove in Settings.
              </Text>
            </View>
          </View>
        )}

        {/* Build-78: Interview Countdown Hero (≤7 days to interview)
            replaces the generic ThisWeekCard when an interview is imminent */}
        {(() => {
          const nextInterview = events
            .filter(e => e.type === 'interview' && !e.completedAt)
            .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
            .find(e => daysUntil(e.date) >= 0 && daysUntil(e.date) <= 7);
          if (nextInterview) {
            return (
              <FadeInView delay={60}>
                <InterviewCountdownHero
                  interview={nextInterview}
                  events={events}
                  onViewPrepDeck={() => handleViewPrepDeck(nextInterview)}
                  loadingPrepDeck={loadingPrepDeckId === nextInterview.id}
                />
              </FadeInView>
            );
          }
          return (
            <FadeInView delay={60}>
              <ThisWeekCard events={events} />
            </FadeInView>
          );
        })()}

        {/* Month navigation + Today pill */}
        <FadeInView delay={120}>
          <View style={cs.monthNav}>
            <AnimatedPressable onPress={prevMonth} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="chevron-back" size={18} color={theme.surface.t2} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => {
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
                setSelectedDay(toDateKey(now));
              }}
              scaleDown={0.95}
            >
              <Text style={[cs.monthLabel, { color: theme.surface.t1 }]}>{MONTHS[viewMonth]} {viewYear}</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={nextMonth} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="chevron-forward" size={18} color={theme.surface.t2} />
            </AnimatedPressable>
            {/* Build-78: Today pill  -  one tap jumps back to current month */}
            {(viewMonth !== now.getMonth() || viewYear !== now.getFullYear()) && (
              <TouchableOpacity
                style={cs.todayPill}
                onPress={() => {
                  setViewYear(now.getFullYear());
                  setViewMonth(now.getMonth());
                  setSelectedDay(toDateKey(now));
                }}
                hitSlop={6}
              >
                <Text style={cs.todayPillText}>Today</Text>
              </TouchableOpacity>
            )}
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

        {/* Build-78: Agenda view  -  the event list is now the primary view.
            Shows events for the selected day, or the next 14 days of
            upcoming events grouped by day if no day is selected. */}
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

          {/* Build-78: smart empty state */}
          {displayEvents.length === 0 ? (
            <View style={cs.emptyWrap}>
              <Ionicons name="calendar-outline" size={32} color={theme.surface.t3 + '40'} />
              <Text style={[cs.emptyText, { color: theme.surface.t3 }]}>
                {selectedDay ? 'Nothing on this day' : 'No upcoming events'}
              </Text>
              {!selectedDay && events.length === 0 && (
                <Text style={[cs.emptyHint, { color: theme.surface.t3 }]}>
                  Track an application with a deadline, or add an interview date  -  Dilly will build your prep plan automatically.
                </Text>
              )}
              <AnimatedPressable style={cs.emptyBtn} onPress={() => setShowAdd(true)} scaleDown={0.97}>
                <Ionicons name="add" size={14} color={GOLD} />
                <Text style={cs.emptyBtnText}>Add an event</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <>
              {/* Group events by day for agenda-style rendering when no
                  specific day is selected */}
              {!selectedDay ? (
                (() => {
                  const grouped: Record<string, CalendarEvent[]> = {};
                  for (const e of displayEvents) {
                    const key = e.date;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(e);
                  }
                  return Object.entries(grouped).map(([dateKey, dayEvents]) => (
                    <View key={dateKey} style={cs.agendaDayGroup}>
                      <View style={cs.agendaDayHeader}>
                        <Text style={cs.agendaDayLabel}>{formatDateShort(dateKey)}</Text>
                        <Text style={cs.agendaDaysUntil}>
                          {daysUntil(dateKey) === 0 ? 'Today' : daysUntil(dateKey) === 1 ? 'Tomorrow' : `${daysUntil(dateKey)}d`}
                        </Text>
                      </View>
                      {dayEvents.map(event => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onComplete={() => handleComplete(event.id)}
                          onDelete={() => handleDelete(event.id)}
                          onUpdateReminders={(d) => handleUpdateReminders(event.id, d)}
                          onGeneratePrepSchedule={() => handleGeneratePrepSchedule(event)}
                          onViewPrepDeck={() => handleViewPrepDeck(event)}
                          loadingPrepSchedule={loadingPrepScheduleId === event.id}
                          loadingPrepDeck={loadingPrepDeckId === event.id}
                        />
                      ))}
                    </View>
                  ));
                })()
              ) : (
                displayEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onComplete={() => handleComplete(event.id)}
                    onDelete={() => handleDelete(event.id)}
                    onUpdateReminders={(d) => handleUpdateReminders(event.id, d)}
                    onGeneratePrepSchedule={() => handleGeneratePrepSchedule(event)}
                    onViewPrepDeck={() => handleViewPrepDeck(event)}
                    loadingPrepSchedule={loadingPrepScheduleId === event.id}
                    loadingPrepDeck={loadingPrepDeckId === event.id}
                  />
                ))
              )}
            </>
          )}
        </FadeInView>

      </ScrollView>

      {/* FAB */}
      <AnimatedPressable
        style={[cs.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowAdd(true)}
        scaleDown={0.92}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
      </AnimatedPressable>

      {/* Add modal */}
      <AddEventModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAddEvent} initialDate={selectedDay} />
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
  weekStats: { flexDirection: 'row', gap: 16, marginBottom: 10, flexWrap: 'wrap' },
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

  // Reminders
  reminderRow: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.b1 },
  reminderLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1, color: colors.t3, marginBottom: 6 },
  reminderChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  reminderChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.s3, borderRadius: 8, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  reminderChipActive: { backgroundColor: BLUE + '15', borderColor: BLUE + '30' },
  reminderChipText: { fontSize: 10, color: colors.t3, fontWeight: '600' },

  // Action buttons
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1,
    paddingVertical: 8, marginTop: 6,
  },
  actionBtnText: { fontSize: 11, fontWeight: '600' },

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
  modalBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#FFFFFF' },

  // Prep Deck Modal
  prepDeckSheet: {
    backgroundColor: colors.s1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 16, maxHeight: '90%', flex: 1,
  },
  prepDeckSub: { fontSize: 11, color: colors.t3, marginTop: 2 },
  prepSection: { marginBottom: 16 },
  prepSectionLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: colors.t3, marginBottom: 8 },
  gapCard: {
    backgroundColor: CORAL + '10', borderRadius: 12, borderWidth: 1, borderColor: CORAL + '25',
    padding: 12, marginBottom: 6,
  },
  gapDim: { fontSize: 13, fontWeight: '700', color: CORAL },
  gapPts: { fontSize: 11, color: colors.t2, marginTop: 2 },
  gapFocus: { fontSize: 11, color: colors.t3, marginTop: 4, lineHeight: 16 },
  insightCard: {
    backgroundColor: BLUE + '10', borderRadius: 12, borderWidth: 1, borderColor: BLUE + '25',
    padding: 12, marginBottom: 16,
  },
  insightLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: BLUE, marginBottom: 6 },
  insightText: { fontSize: 12, color: colors.t2, lineHeight: 18 },
  questionCard: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    padding: 12, marginBottom: 6,
  },
  probBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  probBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  catBadge: { backgroundColor: colors.s3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText: { fontSize: 9, fontWeight: '600', color: colors.t3 },
  questionText: { fontSize: 14, fontWeight: '600', color: colors.t1, lineHeight: 20 },
  whyFlagged: { fontSize: 11, color: AMBER, marginTop: 6 },
  prepTip: { fontSize: 11, color: colors.t3, marginTop: 4, lineHeight: 16 },

  // ── Build 78 styles ─────────────────────────────────────────────────────

  // Interview Countdown Hero
  countdownCard: {
    backgroundColor: '#1C1C2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  countdownHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  countdownLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.6)',
  },
  countdownBody: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12,
  },
  countdownLeft: { alignItems: 'center', minWidth: 70 },
  countdownDays: {
    fontSize: 42, fontWeight: '900', color: CORAL, lineHeight: 46,
  },
  countdownDaysLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: -2 },
  countdownRight: { flex: 1 },
  countdownCompany: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  countdownRole: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  countdownDate: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  countdownPrepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  countdownPrepTrack: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  countdownPrepFill: {
    height: '100%', borderRadius: 2, backgroundColor: GREEN,
  },
  countdownPrepText: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  countdownActions: {
    flexDirection: 'row', gap: 8,
  },
  countdownBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: CORAL, borderRadius: 10, paddingVertical: 11,
  },
  countdownBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  countdownCalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14,
  },
  countdownCalBtnText: { fontSize: 11, fontWeight: '700', color: CORAL },

  // Today pill
  todayPill: {
    backgroundColor: GOLD + '15', borderRadius: 6, borderWidth: 1, borderColor: GOLD + '35',
    paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8,
  },
  todayPillText: { fontSize: 10, fontWeight: '700', color: GOLD },

  // Agenda day grouping
  agendaDayGroup: { marginBottom: 12 },
  agendaDayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6, paddingHorizontal: 2,
  },
  agendaDayLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 10, letterSpacing: 1,
    color: colors.t2,
  },
  agendaDaysUntil: { fontSize: 10, color: colors.t3, fontWeight: '600' },

  // Smart empty state hint
  emptyHint: {
    fontSize: 11, color: colors.t3, textAlign: 'center',
    lineHeight: 16, marginTop: 6, paddingHorizontal: 20,
  },

  // Calendar sync card
  calSyncCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14,
  },
  calSyncIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  calSyncTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  calSyncSub: { fontSize: 12, lineHeight: 16 },
});
