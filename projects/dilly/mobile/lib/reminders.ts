/**
 * iOS Reminders integration via expo-calendar.
 *
 * When "Sync to Reminders" is enabled in Settings, Dilly creates a
 * matching native iOS Reminder for every deadline added via
 * openAddToCalendar(). The reminder lives in the user's default
 * reminders list (or a Dilly-specific list if they choose one).
 *
 * Deduplication: a stable external-id stored in AsyncStorage maps
 * event title+date → reminder ID so we never create duplicates.
 * If the user later taps "remove" in Dilly we delete the reminder.
 *
 * Permission model: we never auto-prompt. The first prompt happens
 * contextually when the user enables the "Sync to Reminders" toggle
 * in Settings. After that, we check before each write and silently
 * skip if permission was revoked.
 *
 * Android placeholder: the public interface is identical; the
 * implementation returns early on Android. When an Android equivalent
 * (Google Tasks or local notifications) is added, swap the body here.
 *
 * expo-calendar is lazy-loaded (dynamic import) to prevent a native
 * crash on app startup. A top-level static import of expo-calendar
 * caused startup crashes in builds ~86 and was hotfixed in ccdff51.
 * Never revert to a static import here.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREF_KEY = 'dilly_sync_reminders_v1';
const ID_MAP_KEY = 'dilly_reminder_id_map_v1';

// ── Lazy-load expo-calendar ──────────────────────────────────────────
// Static import at module level caused native crash on startup (see
// commit ccdff51). Dynamic import defers native module access until
// the function is first called - after the bridge is fully initialized.

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

// ── Preference ──────────────────────────────────────────────────────

export async function isRemindersSyncEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREF_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setRemindersSyncEnabled(val: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_KEY, val ? '1' : '0');
  } catch {}
}

// ── Permission ──────────────────────────────────────────────────────

/** Request reminders permission. Returns true if granted. */
export async function requestRemindersPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const C = await Cal();
    if (!C) return false;
    const { status } = await C.requestRemindersPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function getRemindersPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const C = await Cal();
    if (!C) return false;
    const { status } = await C.getRemindersPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ── ID map helpers ──────────────────────────────────────────────────

async function loadIdMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveIdMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(ID_MAP_KEY, JSON.stringify(map));
  } catch {}
}

function reminderKey(title: string, date: string): string {
  return `${title}::${date}`;
}

// ── Core ────────────────────────────────────────────────────────────

/**
 * Create (or deduplicate) a Reminders entry for a Dilly deadline.
 * Returns the reminder ID or null if creation failed / not applicable.
 */
export async function syncReminderForEvent(
  title: string,
  date: string, // YYYY-MM-DD
): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  if (!(await isRemindersSyncEnabled())) return null;
  if (!(await getRemindersPermission())) return null;

  const key = reminderKey(title, date);
  const map = await loadIdMap();

  // Already created - skip.
  if (map[key]) return map[key];

  try {
    const C = await Cal();
    if (!C) return null;

    // Parse the date. Default reminder time: 9 AM on the deadline day.
    const [y, m, d] = date.split('-').map(Number);
    const dueDate = new Date(y, m - 1, d, 9, 0, 0);

    const listId = await getOrCreateDillyReminderList();
    const id = await C.createReminderAsync(listId, {
      title: `Dilly: ${title}`,
      dueDate,
      alarms: [{ relativeOffset: -60 * 24 }], // 24 h before
    });

    map[key] = id;
    await saveIdMap(map);
    return id;
  } catch {
    return null;
  }
}

/** Stable AsyncStorage key for the dedicated "Dilly" iOS Reminders
 *  calendar id. We create one once via expo-calendar and reuse the
 *  same id for every subsequent createReminderAsync so all career
 *  reminders cluster under one heading in the Reminders app instead
 *  of bleeding into the user's default list. */
const DILLY_REMINDER_LIST_KEY = 'dilly_reminder_list_id_v1';

/** Find an existing "Dilly" reminders list, or create one. Returns the
 *  list id, or null if permission is missing / native module is not
 *  available. The caller passes this id to createReminderAsync as the
 *  first argument so the reminder lands in the Dilly list. */
export async function getOrCreateDillyReminderList(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const cached = await AsyncStorage.getItem(DILLY_REMINDER_LIST_KEY);
    if (cached) {
      // Verify the cached id still exists - the user may have deleted
      // the list manually. If gone, fall through and recreate.
      const C = await Cal();
      if (C) {
        try {
          const cals: any[] = await C.getCalendarsAsync(C.EntityTypes?.REMINDER || 'reminder');
          if ((cals || []).some(c => c?.id === cached)) return cached;
        } catch {}
      }
    }
    const C = await Cal();
    if (!C) return null;
    const perm = await C.getRemindersPermissionsAsync();
    if (perm?.status !== 'granted') return null;

    // First, see if a Dilly list already exists by title (e.g. user
    // reinstalled and we lost the AsyncStorage key but the list is
    // still on the device).
    const existing: any[] = await C.getCalendarsAsync(C.EntityTypes?.REMINDER || 'reminder');
    const found = (existing || []).find(c => String(c?.title || '').toLowerCase() === 'dilly');
    if (found?.id) {
      await AsyncStorage.setItem(DILLY_REMINDER_LIST_KEY, found.id);
      return found.id;
    }

    // Create a fresh Dilly list. Source must be writable - on iOS the
    // default writable source is "Local". Pass null to let the system
    // pick the default if available.
    const sources: any[] = (await C.getSourcesAsync?.()) || [];
    const localSource = sources.find(s => String(s?.type || '').toLowerCase() === 'local')
      || sources.find(s => /icloud/i.test(String(s?.name || '')))
      || sources[0];
    const id = await C.createCalendarAsync({
      title: 'Dilly',
      color: '#3B82F6',
      entityType: C.EntityTypes?.REMINDER || 'reminder',
      sourceId: localSource?.id,
      source: localSource ? undefined : { isLocalAccount: true, name: 'Dilly', type: 'LOCAL' },
      name: 'Dilly',
      ownerAccount: 'Dilly',
      accessLevel: C.CalendarAccessLevel?.OWNER || 'owner',
    });
    if (id) await AsyncStorage.setItem(DILLY_REMINDER_LIST_KEY, id);
    return id || null;
  } catch {
    return null;
  }
}

/** AsyncStorage cooldown so the silent auto-extractor only adds one
 *  reminder every COOLDOWN_MS, even if the user fires off a chat
 *  storm. Founder direction: "wow this is good" not "why so many?". */
const SILENT_LAST_KEY = 'dilly_silent_reminder_last_at_v1';
const SILENT_COOLDOWN_MS = 1000 * 60 * 60 * 3; // 3 hours

/** Words that mean "this came from a Chapter/session" - we never put
 *  Chapter content into Reminders. Reasoning per founder: chapters are
 *  the in-app ritual; bleeding them out to system Reminders erodes the
 *  feeling that opening Dilly is its own moment. */
const CHAPTER_BLOCK_PATTERNS = [
  /\bchapter\b/i,
  /\bweekly session\b/i,
  /\brecap\b/i,
  /\bsit down with dilly\b/i,
];

/** Phrases that suggest an actionable career task with a near-term
 *  trigger. The presence of one of these (plus a verb-led action
 *  clause) is what turns assistant text into a reminder candidate. */
const ACTION_PATTERNS = [
  /\b(apply|submit|send|email|reach out to|message|follow up with|follow up on|prepare for|practice|finish|complete|review|update|polish|refresh)\b/i,
];

const TIME_HINT_PATTERNS = [
  /\b(today|tomorrow|tonight|this week|next week|by (mon|tue|wed|thu|fri|sat|sun)\w*|by friday|by monday|in \d+ days?)\b/i,
];

/**
 * Pull at most one short, action-oriented reminder candidate from a
 * line of assistant text. Returns null when nothing reads as a
 * concrete career to-do, when the line is chapter-flavored, or when
 * the candidate is too vague / too long.
 *
 * This intentionally errs toward returning null. The product brief is
 * "add stuff here and there, enough for the user to say wow" - not
 * "harvest every action verb". Quiet beats loud.
 */
export function extractReminderFromAssistantText(text: string): string | null {
  if (!text || text.length < 20) return null;
  if (CHAPTER_BLOCK_PATTERNS.some(rx => rx.test(text))) return null;

  // Split into sentences and look for the first one that has both an
  // action verb and a time hint. This filters out general advice
  // like "you should think about your strengths" and only catches
  // things the user is supposed to actually do soon.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 12 && s.length <= 140);

  for (const s of sentences) {
    if (CHAPTER_BLOCK_PATTERNS.some(rx => rx.test(s))) continue;
    if (!ACTION_PATTERNS.some(rx => rx.test(s))) continue;
    if (!TIME_HINT_PATTERNS.some(rx => rx.test(s))) continue;
    // Strip a leading "you should/can/might want to" so the reminder
    // reads as an instruction to self, not advice from someone else.
    let title = s.replace(/^(you should|you could|you might (?:want to|consider)|i'?d|i would|maybe)\s+/i, '');
    title = title.replace(/[.!?]+$/, '').trim();
    if (title.length < 8 || title.length > 110) continue;
    // Capitalize first letter so it reads cleanly in Reminders.
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return title;
  }
  return null;
}

/**
 * Silently add a career-related reminder pulled from the AI chat. No
 * permission prompt, no toast, no UI feedback - the user discovers it
 * later in their iOS Reminders app and feels Dilly reaching beyond the
 * sandbox in a useful way.
 *
 * Strict rate-limit (one per 3 hours per device) so the user never
 * feels assigned homework. If anything fails - permission missing,
 * cooldown active, native error - we no-op without raising.
 */
export async function maybeSilentlyAddCareerReminder(
  text: string,
  hoursOut: number = 24,
): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    // Cooldown gate first - cheaper than a native bridge call.
    const lastRaw = await AsyncStorage.getItem(SILENT_LAST_KEY);
    const last = lastRaw ? Number(lastRaw) : 0;
    if (Date.now() - last < SILENT_COOLDOWN_MS) return null;

    const title = extractReminderFromAssistantText(text);
    if (!title) return null;

    // We only add silently if Reminders permission is already granted.
    // Never prompt from a chat turn - the prompt would itself be the
    // thing that makes the user feel "assigned homework".
    const C = await Cal();
    if (!C) return null;
    const perm = await C.getRemindersPermissionsAsync();
    if (perm?.status !== 'granted') return null;

    const due = new Date(Date.now() + hoursOut * 60 * 60 * 1000);
    const listId = await getOrCreateDillyReminderList();
    const id = await C.createReminderAsync(listId, {
      title,
      dueDate: due,
      notes: 'Added by Dilly from your conversation.',
    });
    await AsyncStorage.setItem(SILENT_LAST_KEY, String(Date.now()));
    return id || null;
  } catch {
    return null;
  }
}

/** Weekly recurring "Check your Dilly brief" reminder. Fires every
 *  Monday at 9am in the user's local time so they read their brief
 *  with their morning coffee. Uses recurrence rules so we set it once;
 *  iOS handles the weekly repeat. */
export async function ensureWeeklyBriefReminder(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const C = await Cal();
    if (!C) return null;
    const perm = await C.getRemindersPermissionsAsync();
    if (perm?.status !== 'granted') return null;
    const existingId = await AsyncStorage.getItem('dilly_weekly_brief_reminder_id_v1');
    if (existingId) return existingId;
    const listId = await getOrCreateDillyReminderList();
    // Compute next Monday at 9am local.
    const now = new Date();
    const target = new Date(now);
    target.setHours(9, 0, 0, 0);
    let diff = (1 - now.getDay() + 7) % 7;
    if (diff === 0 && target.getTime() <= now.getTime()) diff = 7;
    target.setDate(target.getDate() + diff);
    const id = await C.createReminderAsync(listId, {
      title: 'Check your Dilly brief',
      dueDate: target,
      recurrenceRule: { frequency: C.Frequency?.WEEKLY || 'weekly', interval: 1 },
      notes: 'Three new things this week, every Monday morning.',
    });
    if (id) await AsyncStorage.setItem('dilly_weekly_brief_reminder_id_v1', id);
    return id || null;
  } catch {
    return null;
  }
}

/** Two-week silent application follow-up reminder. Called from the
 *  internship tracker when a user logs an application. The reminder
 *  fires 14 days later asking them to nudge the recruiter. */
export async function scheduleApplicationFollowupReminder(args: {
  applicationKey: string;
  company: string;
  role?: string;
  appliedAt?: Date;
}): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const C = await Cal();
    if (!C) return null;
    const perm = await C.getRemindersPermissionsAsync();
    if (perm?.status !== 'granted') return null;
    const listId = await getOrCreateDillyReminderList();
    const base = args.appliedAt || new Date();
    const dueDate = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
    dueDate.setHours(10, 0, 0, 0);
    const where = args.role ? `${args.role} at ${args.company}` : args.company;
    const id = await C.createReminderAsync(listId, {
      title: `Follow up: ${args.company}`,
      dueDate,
      notes: `It's been 2 weeks since you applied to ${where}. A short follow-up email keeps you visible.`,
    });
    if (id) {
      const map = await loadIdMap();
      map[`appfollow::${args.applicationKey}`] = id;
      await saveIdMap(map);
    }
    return id || null;
  } catch {
    return null;
  }
}

/** Interview prep reminder fires 3 days before an interview so the
 *  user has runway to actually prepare instead of cramming. */
export async function scheduleInterviewPrepReminder(args: {
  interviewKey: string;
  interviewAt: Date;
  company: string;
  role?: string;
}): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const C = await Cal();
    if (!C) return null;
    const perm = await C.getRemindersPermissionsAsync();
    if (perm?.status !== 'granted') return null;
    const listId = await getOrCreateDillyReminderList();
    const dueDate = new Date(args.interviewAt.getTime() - 3 * 24 * 60 * 60 * 1000);
    dueDate.setHours(19, 0, 0, 0); // 7pm three days before
    const where = args.role ? `${args.role} at ${args.company}` : args.company;
    const id = await C.createReminderAsync(listId, {
      title: `Interview in 3 days: ${args.company}`,
      dueDate,
      notes: `${where}. Open Dilly for prep - she has your gap areas mapped to predicted questions.`,
    });
    if (id) {
      const map = await loadIdMap();
      map[`intprep::${args.interviewKey}`] = id;
      await saveIdMap(map);
    }
    return id || null;
  } catch {
    return null;
  }
}

/**
 * Delete the reminder previously created for this title+date pair.
 * No-ops silently if it doesn't exist or permission is gone.
 */
export async function deleteReminderForEvent(
  title: string,
  date: string,
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const key = reminderKey(title, date);
  const map = await loadIdMap();
  const id = map[key];
  if (!id) return;
  try {
    const C = await Cal();
    if (!C) return;
    await C.deleteReminderAsync(id);
    delete map[key];
    await saveIdMap(map);
  } catch {}
}
