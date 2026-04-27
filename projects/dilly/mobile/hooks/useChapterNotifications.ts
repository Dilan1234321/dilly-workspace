/**
 * useChapterNotifications - local scheduled notifications for Chapters.
 *
 * Uses device-local notifications (not server push) because the
 * schedule is fully known on the client: the user's day-of-week +
 * hour. No server dispatcher needed. Each time the user's schedule
 * changes (or we fetch /chapters/current and learn a new next-at),
 * we cancel any prior Chapter notifications and schedule fresh ones.
 *
 * Notifications fired:
 *   T-1h  "Your Chapter opens in an hour. Got anything to add?"
 *   T     "Your Chapter is ready. Tap to begin."
 *   T+24h "Your Chapter is still waiting for you."  (only if unopened)
 *
 * The T+24h reminder is scheduled at the same time as the others,
 * and we let the user naturally dismiss it by opening the Chapter
 * before that point (ios won't fire a silent-cancelled notification
 * but we can cancel it from the card's focus effect once the user
 * has opened the session).
 *
 * All notifications are tagged with a "chapter-" identifier prefix
 * so cancelScheduledForChapter only touches our own and never steps
 * on other notifications the app might schedule.
 */

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable (Expo Go / Simulator may not have it
  // fully wired; the hook becomes a no-op in those environments).
}

const CHAPTER_NOTIF_ID_PREFIX = 'chapter-';

export interface ChapterScheduleInput {
  day_of_week: number;       // 0=Mon...6=Sun (server convention)
  hour: number;              // 0-23 local time
  next_override_at: string | null;
}

/**
 * Compute the next session datetime from the weekly cadence plus any
 * one-time override. Mirrors the logic in ChapterCard.tsx. Kept here
 * so the notification layer is self-contained.
 */
export function nextChapterAt(schedule: ChapterScheduleInput): Date {
  if (schedule.next_override_at) {
    const o = new Date(schedule.next_override_at);
    if (!isNaN(o.getTime())) return o;
  }
  const day = schedule.day_of_week ?? 6;
  const hour = schedule.hour ?? 19;
  const now = new Date();
  // JS Date.getDay: 0=Sun..6=Sat. Server: 0=Mon..6=Sun. Convert.
  const jsDay = (day + 1) % 7;
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  const diff = (jsDay - now.getDay() + 7) % 7;
  if (diff === 0 && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  } else {
    target.setDate(target.getDate() + diff);
  }
  return target;
}

/**
 * Cancel any Chapter notifications we previously scheduled. Safe to
 * call even if none exist.
 */
export async function cancelChapterNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      (all || [])
        .filter((n: any) => typeof n?.identifier === 'string' && n.identifier.startsWith(CHAPTER_NOTIF_ID_PREFIX))
        .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // Silent. Scheduling below will still work.
  }
}

/**
 * Cancel prior Chapter notifications and schedule fresh ones around
 * the next session. If the session is already in the past, does nothing.
 *
 * Returns true if any notifications were scheduled.
 */
export async function scheduleChapterNotifications(schedule: ChapterScheduleInput): Promise<boolean> {
  if (!Notifications) return false;
  try {
    await cancelChapterNotifications();

    const at = nextChapterAt(schedule);
    const now = Date.now();
    if (at.getTime() <= now) return false;

    const hourBefore = new Date(at.getTime() - 60 * 60 * 1000);
    const dayAfter = new Date(at.getTime() + 24 * 60 * 60 * 1000);

    const scheduleOne = async (id: string, fireAt: Date, title: string, body: string) => {
      if (fireAt.getTime() <= Date.now()) return; // In the past, skip.
      await Notifications.scheduleNotificationAsync({
        identifier: CHAPTER_NOTIF_ID_PREFIX + id,
        content: {
          title,
          body,
          data: { route: '/(app)/chapter' },
          sound: 'default',
        },
        trigger: { type: 'date', date: fireAt },
      });
    };

    await scheduleOne(
      'pre',
      hourBefore,
      'Your Chapter opens in an hour',
      'Got anything to add before Dilly sits down to write it?',
    );
    await scheduleOne(
      'ready',
      at,
      'Your Chapter is ready',
      'Dilly wrote it for you. Tap to begin.',
    );
    await scheduleOne(
      'miss',
      dayAfter,
      'Your Chapter is still waiting',
      'Take a few minutes when you can. Dilly will be here.',
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel only the "miss" reminder. Called after the user opens the
 * session so we don't nag them a day later about a Chapter they
 * already read.
 */
export async function cancelMissReminder(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(CHAPTER_NOTIF_ID_PREFIX + 'miss');
  } catch {
    // Not scheduled. Fine.
  }
}
