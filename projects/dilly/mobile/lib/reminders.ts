/**
 * Dilly Reminders — native iOS Reminders integration via expo-calendar.
 *
 * Creates a dedicated "dilly" reminder list (cobalt blue) and provides
 * helpers to create, check, and manage reminders for deadlines,
 * interviews, follow-ups, and nudges.
 *
 * Permission is requested lazily on first use — no upfront prompt.
 * expo-calendar is lazy-loaded to prevent crash if native module isn't ready.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DILLY_LIST_KEY = 'dilly_reminders_list_id';
const DILLY_LIST_NAME = 'dilly';
const DILLY_COBALT = '#1652F0';

// Lazy-load expo-calendar to prevent crash on app startup
let _Cal: any = null;
async function Cal(): Promise<any> {
  if (_Cal) return _Cal;
  try {
    _Cal = await import('expo-calendar');
    return _Cal;
  } catch {
    return null;
  }
}

// ── Permission ────────────────────────────────────────────────────────────

let _permissionGranted: boolean | null = null;

export async function hasReminderPermission(): Promise<boolean> {
  if (_permissionGranted === true) return true;
  if (Platform.OS !== 'ios') return false;
  try {
    const C = await Cal();
    if (!C) return false;
    const { status } = await C.getRemindersPermissionsAsync();
    _permissionGranted = status === 'granted';
    return _permissionGranted;
  } catch {
    return false;
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const C = await Cal();
    if (!C) return false;
    const { status } = await C.requestRemindersPermissionsAsync();
    _permissionGranted = status === 'granted';
    return _permissionGranted;
  } catch {
    return false;
  }
}

// ── Dilly Reminder List ───────────────────────────────────────────────────

async function ensureDillyList(): Promise<string | null> {
  const C = await Cal();
  if (!C) return null;

  const cached = await AsyncStorage.getItem(DILLY_LIST_KEY).catch(() => null);
  if (cached) {
    try {
      const calendars = await C.getCalendarsAsync(C.EntityTypes.REMINDER);
      if (calendars.some((c: any) => c.id === cached)) return cached;
    } catch {}
  }

  try {
    const calendars = await C.getCalendarsAsync(C.EntityTypes.REMINDER);
    const existing = calendars.find(
      (c: any) => c.title?.toLowerCase() === DILLY_LIST_NAME && c.allowsModifications
    );
    if (existing) {
      await AsyncStorage.setItem(DILLY_LIST_KEY, existing.id);
      return existing.id;
    }

    const defaultSource = calendars.find((c: any) => c.source?.type === 'local' && c.allowsModifications)?.source
      ?? calendars.find((c: any) => c.allowsModifications)?.source
      ?? calendars[0]?.source;

    if (!defaultSource) return null;

    const newId = await C.createCalendarAsync({
      title: DILLY_LIST_NAME,
      color: DILLY_COBALT,
      entityType: C.EntityTypes.REMINDER,
      source: {
        name: defaultSource.name,
        type: defaultSource.type,
        isLocalAccount: defaultSource.isLocalAccount,
      },
      name: DILLY_LIST_NAME,
      accessLevel: C.CalendarAccessLevel.OWNER,
    });

    await AsyncStorage.setItem(DILLY_LIST_KEY, newId);
    return newId;
  } catch (e) {
    console.warn('[dilly-reminders] failed to create list:', e);
    return null;
  }
}

// ── Create Reminder ───────────────────────────────────────────────────────

export interface DillyReminder {
  title: string;
  notes?: string;
  dueDate: string;
  alertMinutesBefore?: number;
}

export async function createReminder(reminder: DillyReminder): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;

  const C = await Cal();
  if (!C) return null;

  const granted = await hasReminderPermission() || await requestReminderPermission();
  if (!granted) return null;

  const listId = await ensureDillyList();
  if (!listId) return null;

  try {
    const due = new Date(reminder.dueDate);
    const alertOffset = reminder.alertMinutesBefore ?? 0;

    const id = await C.createReminderAsync(listId, {
      title: reminder.title,
      notes: reminder.notes || undefined,
      startDate: due,
      dueDate: due,
      alarms: [{ relativeOffset: -alertOffset }],
    });

    return id;
  } catch (e) {
    console.warn('[dilly-reminders] failed to create reminder:', e);
    return null;
  }
}

// ── Convenience creators ──────────────────────────────────────────────────

export async function remindDeadline(
  company: string, role: string, deadlineDate: string,
): Promise<string | null> {
  const due = new Date(deadlineDate);
  const reminderDate = new Date(due);
  reminderDate.setDate(reminderDate.getDate() - 2);
  reminderDate.setHours(9, 0, 0, 0);

  if (reminderDate.getTime() < Date.now()) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    if (tomorrow.getTime() < due.getTime()) {
      reminderDate.setTime(tomorrow.getTime());
    } else {
      return null;
    }
  }

  return createReminder({
    title: `${company} ${role} deadline in 2 days`,
    notes: `Application deadline: ${due.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. Open Dilly to finalize.`,
    dueDate: reminderDate.toISOString(),
  });
}

export async function remindInterview(
  company: string, role: string, interviewDate: string,
): Promise<{ dayBefore: string | null; hoursBefore: string | null }> {
  const interview = new Date(interviewDate);

  const dayBefore = new Date(interview);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(9, 0, 0, 0);

  const hoursBefore = new Date(interview);
  hoursBefore.setHours(hoursBefore.getHours() - 2);

  const dayId = dayBefore.getTime() > Date.now()
    ? await createReminder({
        title: `Interview with ${company} tomorrow`,
        notes: `${role} interview. Open Dilly to drill your STAR stories and review the prep deck.`,
        dueDate: dayBefore.toISOString(),
      })
    : null;

  const hourId = hoursBefore.getTime() > Date.now()
    ? await createReminder({
        title: `${company} interview in 2 hours`,
        notes: `Last chance to review your prep deck for the ${role} interview.`,
        dueDate: hoursBefore.toISOString(),
      })
    : null;

  return { dayBefore: dayId, hoursBefore: hourId };
}

export async function remindFollowUp(
  company: string, role: string, appliedDate: string,
): Promise<string | null> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return createReminder({
    title: `Follow up with ${company}`,
    notes: `You applied for ${role} on ${new Date(appliedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. A short follow-up email doubles your response rate.`,
    dueDate: tomorrow.toISOString(),
  });
}

export async function remindMeLater(
  title: string, notes?: string, hoursFromNow: number = 3,
): Promise<string | null> {
  const due = new Date();
  due.setHours(due.getHours() + hoursFromNow);

  return createReminder({ title, notes, dueDate: due.toISOString() });
}

export async function remindReaudit(): Promise<string | null> {
  const due = new Date();
  due.setDate(due.getDate() + 5);
  due.setHours(9, 0, 0, 0);

  return createReminder({
    title: 'Re-audit your resume on Dilly',
    notes: "It's been a few days since your last audit. Open Dilly and see how much you've improved.",
    dueDate: due.toISOString(),
  });
}
