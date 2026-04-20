/**
 * useOutcomePushes — local scheduled notifications for user-logged
 * outcomes (interviews, offers, deadlines, homework).
 *
 * Same pattern as useChapterNotifications but for events the user
 * owns: an interview date they typed in, a deadline they added, a
 * Chapter one_move they put on the calendar. Every scheduled push
 * has an 'outcome-' identifier prefix so the batch can be managed
 * without touching Chapter or other app notifications.
 *
 * Runtime strategy:
 *  - T-18h: "<title> is tomorrow. Here's how Dilly can help you prep."
 *    Opens the AI chat overlay seeded with the event title so the
 *    user lands in a prep conversation on tap.
 *  - T:     "Good luck — <title> is now." Opens to Home.
 *
 * Zero LLM cost. Pure client-side timers. No server dispatch.
 *
 * Falls back gracefully when expo-notifications is unavailable
 * (Expo Go without the module, simulator without permissions).
 */

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable — hook becomes a no-op silently.
}

const OUTCOME_NOTIF_ID_PREFIX = 'outcome-';

export interface OutcomeEvent {
  /** Stable id so we can cancel + reschedule without sprays. */
  id: string;
  /** User-facing event title. Short. */
  title: string;
  /** When the event happens. ISO string or Date. */
  at: string | Date;
  /** Optional prep-chat seed. When provided, tapping the T-18h push
   *  opens the AI overlay with this as the initial message. */
  prepPrompt?: string;
}

function resolveAt(at: string | Date): Date | null {
  if (at instanceof Date) return isNaN(at.getTime()) ? null : at;
  if (typeof at !== 'string' || !at) return null;
  const d = new Date(at);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Schedule the two-tier push (T-18h + T) for a single outcome event.
 * Cancels any existing pushes for the same id first so re-scheduling
 * the same event idempotently just updates the timings. Returns true
 * when at least one push was scheduled.
 */
export async function scheduleOutcomePushes(event: OutcomeEvent): Promise<boolean> {
  if (!Notifications || !event?.id) return false;
  try {
    await cancelOutcomePushes(event.id);

    const at = resolveAt(event.at);
    if (!at) return false;

    const now = Date.now();
    if (at.getTime() <= now) return false;

    const pre = new Date(at.getTime() - 18 * 60 * 60 * 1000);
    let scheduled = false;

    // T-18h prep nudge. If this is already in the past (user logged a
    // same-day event), skip the pre push but still fire the day-of one.
    if (pre.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: OUTCOME_NOTIF_ID_PREFIX + event.id + '-pre',
        content: {
          title: `${event.title} is tomorrow`,
          body: "Open Dilly tonight — she'll help you prep.",
          data: {
            route: '/(app)',
            overlaySeed: event.prepPrompt || `I have ${event.title} tomorrow. Help me prep.`,
          },
          sound: 'default',
        },
        trigger: { type: 'date', date: pre },
      });
      scheduled = true;
    }

    // T-0 day-of notification.
    await Notifications.scheduleNotificationAsync({
      identifier: OUTCOME_NOTIF_ID_PREFIX + event.id + '-at',
      content: {
        title: `${event.title} — good luck`,
        body: "You've got this. Dilly will be here after.",
        data: { route: '/(app)' },
        sound: 'default',
      },
      trigger: { type: 'date', date: at },
    });
    return true || scheduled;
  } catch {
    return false;
  }
}

/**
 * Cancel any pre-scheduled pushes for the given event id. Called
 * when the user removes or completes the event, or reschedules.
 */
export async function cancelOutcomePushes(id: string): Promise<void> {
  if (!Notifications || !id) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = OUTCOME_NOTIF_ID_PREFIX + id;
    await Promise.all(
      (all || [])
        .filter((n: any) => typeof n?.identifier === 'string' && n.identifier.startsWith(prefix))
        .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // Swallow — cancellation failures are acceptable (worst case: a
    // stale notification fires; the user dismisses it).
  }
}
