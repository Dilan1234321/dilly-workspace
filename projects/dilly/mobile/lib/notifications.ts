/**
 * notifications.ts - centralized notifications layer for Dilly.
 *
 * Goal: every notification feels like a system notification - quiet,
 * useful, with native-style action buttons - not marketing spam.
 *
 * Three things happen here:
 *   1. Define notification CATEGORIES with iOS action buttons. Each
 *      category maps to a kind of message (job match, interview, deadline,
 *      weekly brief). Categories let iOS render "Long press to see View /
 *      Save / Dismiss" without us doing anything custom on receipt.
 *   2. Provide tone-correct schedulers for the four recurring kinds
 *      (weekly brief, deadline T-7/T-3/T-1, interview T-24h/T-3h/T-1h,
 *      Friday recap). Each one writes with the right category id so
 *      the action buttons just work.
 *   3. Single registerNotificationCategories() to call once at app
 *      startup. Idempotent - safe to call on every cold start.
 *
 * Tone rules (from spec):
 *   - Lead with the data ("3 new roles match", "+4 readiness points")
 *     not a CTA ("Open Dilly!")
 *   - Past-tense / present-tense, not imperative
 *   - Specific over generic
 *
 * Lazy-loaded native module: expo-notifications native bridge is not
 * available in Expo Go / simulator on first cold-start, so we wrap in
 * a try/catch and treat the missing module as a no-op.
 */

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable. Functions below silently no-op.
}

// ── Category IDs - referenced by scheduleNotificationAsync({ ..., categoryIdentifier }) ──
export const CAT_JOB_MATCH        = 'dilly_job_match';
export const CAT_INTERVIEW        = 'dilly_interview_reminder';
export const CAT_DEADLINE         = 'dilly_deadline_warning';
export const CAT_WEEKLY_BRIEF     = 'dilly_weekly_brief';
export const CAT_WEEKLY_RECAP     = 'dilly_weekly_recap';
export const CAT_SCORE_UPDATE     = 'dilly_score_update';

// ── Action IDs - what gets fired back to addNotificationResponseReceivedListener ──
export const ACT_VIEW_JOB         = 'dilly_view_job';
export const ACT_SAVE_FOR_LATER   = 'dilly_save_for_later';
export const ACT_PREP_NOW         = 'dilly_prep_now';
export const ACT_SNOOZE           = 'dilly_snooze';
export const ACT_VIEW             = 'dilly_view';
export const ACT_READ_BRIEF       = 'dilly_read_brief';

let _registered = false;

/** One-shot category registration. Call from app shell on cold start.
 *  iOS persists categories until the next install, but we re-register
 *  so changes to action labels ship without users having to reinstall.
 *  Idempotent within a process - the _registered flag prevents duplicate
 *  work after the first call. */
export async function registerNotificationCategories(): Promise<void> {
  if (!Notifications || _registered) return;
  try {
    await Notifications.setNotificationCategoryAsync(CAT_JOB_MATCH, [
      { identifier: ACT_VIEW_JOB,       buttonTitle: 'View job',       options: { opensAppToForeground: true } },
      { identifier: ACT_SAVE_FOR_LATER, buttonTitle: 'Save for later', options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(CAT_INTERVIEW, [
      { identifier: ACT_PREP_NOW, buttonTitle: 'Prep now', options: { opensAppToForeground: true } },
      { identifier: ACT_SNOOZE,   buttonTitle: '1 hour',   options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(CAT_DEADLINE, [
      { identifier: ACT_VIEW,   buttonTitle: 'View',    options: { opensAppToForeground: true } },
      { identifier: ACT_SNOOZE, buttonTitle: 'Tomorrow', options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(CAT_WEEKLY_BRIEF, [
      { identifier: ACT_READ_BRIEF, buttonTitle: 'Read brief', options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(CAT_WEEKLY_RECAP, [
      { identifier: ACT_READ_BRIEF, buttonTitle: 'Read recap', options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(CAT_SCORE_UPDATE, [
      { identifier: ACT_VIEW, buttonTitle: 'See what changed', options: { opensAppToForeground: true } },
    ]);
    _registered = true;
  } catch {
    // Silent. Categories are best-effort; absence falls back to plain
    // notifications without action buttons.
  }
}

// ── Schedulers ──────────────────────────────────────────────────────

const NOTIF_PREFIX = 'dilly-';

/** Cancel any previously-scheduled notification with the given id. Safe
 *  to call when nothing is scheduled. */
async function cancelById(id: string): Promise<void> {
  if (!Notifications) return;
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_PREFIX + id); } catch {}
}

/** Cancel every dilly-prefixed scheduled notification. Useful on logout
 *  or when the user toggles a sweeping preference off. */
export async function cancelAllDillyNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      (all || [])
        .filter((n: any) => typeof n?.identifier === 'string' && n.identifier.startsWith(NOTIF_PREFIX))
        .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {}
}

interface ScheduleOptions {
  id: string;             // logical id, gets NOTIF_PREFIX added
  title: string;
  body: string;
  fireAt: Date;
  category?: string;      // categoryIdentifier - links to action buttons
  route?: string;         // deep link target on tap
  data?: Record<string, any>;
}

async function scheduleOne(opts: ScheduleOptions): Promise<void> {
  if (!Notifications) return;
  if (opts.fireAt.getTime() <= Date.now()) return;
  try {
    await cancelById(opts.id);
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_PREFIX + opts.id,
      content: {
        title: opts.title,
        body: opts.body,
        sound: 'default',
        categoryIdentifier: opts.category,
        data: { ...(opts.data || {}), ...(opts.route ? { route: opts.route } : {}) },
      },
      trigger: { type: 'date', date: opts.fireAt },
    });
  } catch {}
}

// ── Domain-specific helpers ─────────────────────────────────────────

/** Weekly brief drop: Monday at 8am. Specific count + top match in the
 *  body, never "Open Dilly!". Caller passes the prefetched values so
 *  we don't fire an LLM call from a notification scheduler.
 *
 *  Schedules the next Monday-at-8am occurrence relative to now. The
 *  weekly recurrence is handled by re-scheduling on cold start - the
 *  app shell calls this whenever a new brief is generated and stored. */
export async function scheduleWeeklyBriefArrival(args: {
  newMatchesCount: number;
  topMatchTitle?: string;
  topMatchCompany?: string;
}): Promise<void> {
  const fireAt = nextWeekdayAtHour(1 /* Monday */, 8);
  const top = args.topMatchTitle && args.topMatchCompany
    ? ` Top match: ${args.topMatchTitle} at ${args.topMatchCompany}.`
    : '';
  await scheduleOne({
    id: 'weekly_brief',
    title: 'Your Dilly brief is ready',
    body: `${args.newMatchesCount} new ${args.newMatchesCount === 1 ? 'role matches' : 'roles match'} your profile this week.${top}`,
    fireAt,
    category: CAT_WEEKLY_BRIEF,
    route: '/(app)',
  });
}

/** Friday afternoon recap. Reflective, past-tense - "here's what you
 *  accomplished" not "you should have done more". */
export async function scheduleWeeklyRecapArrival(args: {
  winsThisWeek: number;
  applicationsThisWeek: number;
}): Promise<void> {
  const fireAt = nextWeekdayAtHour(5 /* Friday */, 16);
  const wins = args.winsThisWeek > 0 ? `${args.winsThisWeek} ${args.winsThisWeek === 1 ? 'win' : 'wins'}` : 'no wins logged';
  const apps = args.applicationsThisWeek > 0 ? `${args.applicationsThisWeek} ${args.applicationsThisWeek === 1 ? 'application' : 'applications'} sent` : '';
  const body = apps ? `${wins} and ${apps}. Worth a beat to look back.` : `${wins} this week. Worth a beat to look back.`;
  await scheduleOne({
    id: 'weekly_recap',
    title: "Here's what you did this week",
    body,
    fireAt,
    category: CAT_WEEKLY_RECAP,
    route: '/(app)/my-dilly-profile',
  });
}

/** Deadline warnings at T-7, T-3, T-1 days before a deadline. Caller
 *  passes the deadline date and a user-readable label - we compute the
 *  three fire times. Past T-1 is silently skipped. */
export async function scheduleDeadlineWarnings(args: {
  deadlineKey: string;     // unique key (e.g. application id)
  deadlineAt: Date;
  label: string;           // "Stripe internship deadline"
}): Promise<void> {
  const offsets = [
    { days: 7, id: '7d' },
    { days: 3, id: '3d' },
    { days: 1, id: '1d' },
  ];
  for (const o of offsets) {
    const fireAt = new Date(args.deadlineAt.getTime() - o.days * 24 * 60 * 60 * 1000);
    await scheduleOne({
      id: `deadline_${args.deadlineKey}_${o.id}`,
      title: `${o.days} ${o.days === 1 ? 'day' : 'days'} until ${args.label}`,
      body: o.days === 1
        ? `Last day. Take 20 minutes tonight to wrap it up.`
        : `Worth a check now - the closer to the deadline, the noisier the inbox.`,
      fireAt,
      category: CAT_DEADLINE,
      route: '/(app)/calendar',
      data: { deadlineKey: args.deadlineKey },
    });
  }
}

/** Interview reminders at T-24h, T-3h, T-1h. The T-3h one carries the
 *  Prep now action; the T-1h one is the do-not-snooze nudge. */
export async function scheduleInterviewReminders(args: {
  interviewKey: string;
  interviewAt: Date;
  company: string;
  role?: string;
}): Promise<void> {
  const where = args.role ? `${args.role} at ${args.company}` : args.company;
  await scheduleOne({
    id: `interview_${args.interviewKey}_24h`,
    title: `Interview tomorrow: ${args.company}`,
    body: `${where}. Open prep when you have 15 minutes - Dilly knows where you've been weak.`,
    fireAt: new Date(args.interviewAt.getTime() - 24 * 60 * 60 * 1000),
    category: CAT_INTERVIEW,
    route: '/(app)/interview-practice',
    data: { interviewKey: args.interviewKey },
  });
  await scheduleOne({
    id: `interview_${args.interviewKey}_3h`,
    title: `Interview in 3 hours: ${args.company}`,
    body: `One last loop through your top stories - Dilly has them queued.`,
    fireAt: new Date(args.interviewAt.getTime() - 3 * 60 * 60 * 1000),
    category: CAT_INTERVIEW,
    route: '/(app)/interview-practice',
    data: { interviewKey: args.interviewKey },
  });
  await scheduleOne({
    id: `interview_${args.interviewKey}_1h`,
    title: `Interview in 1 hour`,
    body: `${where}. Breathe. You prepared. Go land it.`,
    fireAt: new Date(args.interviewAt.getTime() - 60 * 60 * 1000),
    category: CAT_INTERVIEW,
    data: { interviewKey: args.interviewKey },
  });
}

/** Score-update notification - fired when readiness score changes. We
 *  always lead with the delta so the body reads as data, not promo. */
export async function scheduleScoreUpdate(args: { delta: number; newScore: number; whenAt?: Date }): Promise<void> {
  if (Math.abs(args.delta) < 1) return;
  const dir = args.delta > 0 ? 'up' : 'down';
  const fireAt = args.whenAt ?? new Date(Date.now() + 60 * 1000);
  await scheduleOne({
    id: `score_${Date.now()}`,
    title: `Your readiness score is ${dir} ${Math.abs(Math.round(args.delta))} points`,
    body: `Now at ${Math.round(args.newScore)}. Open to see what moved.`,
    fireAt,
    category: CAT_SCORE_UPDATE,
    route: '/(app)/score-detail',
  });
}

// ── Helpers ────────────────────────────────────────────────────────

/** Returns the next Date for the given weekday (0=Sun..6=Sat) at the
 *  given hour. If today is the target weekday and the hour has already
 *  passed, returns the next week's instance. */
function nextWeekdayAtHour(targetWeekday: number, hour: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  let diff = (targetWeekday - now.getDay() + 7) % 7;
  if (diff === 0 && target.getTime() <= now.getTime()) diff = 7;
  target.setDate(target.getDate() + diff);
  return target;
}
