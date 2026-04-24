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
// the function is first called — after the bridge is fully initialized.

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

  // Already created — skip.
  if (map[key]) return map[key];

  try {
    const C = await Cal();
    if (!C) return null;

    // Parse the date. Default reminder time: 9 AM on the deadline day.
    const [y, m, d] = date.split('-').map(Number);
    const dueDate = new Date(y, m - 1, d, 9, 0, 0);

    const id = await C.createReminderAsync(null, {
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
