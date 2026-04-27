/**
 * backgroundRefresh.ts - keeps Dilly's data warm so opening the app
 * never shows a loading spinner.
 *
 * Uses expo-background-fetch + expo-task-manager to register a single
 * "dilly-warm-cache" task that iOS schedules opportunistically (the
 * exact cadence is up to the OS, but typically every ~4-6 hours when
 * the device is plugged in or recently used).
 *
 * What the task does:
 *   1. Refreshes the cached profile slim
 *   2. Fetches the next batch of jobs into the disk cache
 *   3. Refreshes the chapter state
 *   4. Refreshes the readiness score
 *
 * Each step is independent and silently no-ops on auth failure - the
 * cache stays stale rather than corrupting itself with empty state.
 *
 * Lazy-loaded: native modules are imported inside register() so the
 * module is safe to import on Expo Go / simulator (will simply no-op).
 */

const TASK_NAME = 'dilly-warm-cache';

let _registered = false;

export async function registerBackgroundRefresh(): Promise<void> {
  if (_registered) return;
  let TaskManager: any = null;
  let BackgroundFetch: any = null;
  try {
    TaskManager = require('expo-task-manager');
    BackgroundFetch = require('expo-background-fetch');
  } catch {
    return;
  }

  try {
    // Define the task - safe to call even after a previous define on
    // this process; the task manager dedupes by name.
    if (!TaskManager.isTaskDefined?.(TASK_NAME)) {
      TaskManager.defineTask(TASK_NAME, async () => {
        try {
          await Promise.allSettled([
            warmProfile(),
            warmJobs(),
            warmChapter(),
            warmScore(),
          ]);
          return BackgroundFetch.BackgroundFetchResult?.NewData ?? 1;
        } catch {
          return BackgroundFetch.BackgroundFetchResult?.Failed ?? 2;
        }
      });
    }

    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      // Minimum interval iOS will respect (not a guarantee). 4 hours
      // is a sweet spot - frequent enough for the user to wake up to
      // fresh data, infrequent enough to not drain battery.
      minimumInterval: 60 * 60 * 4,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    _registered = true;
  } catch {
    // Permission missing / native module variant - silently skip.
  }
}

/** Manually unregister the task. Used during sign-out. */
export async function unregisterBackgroundRefresh(): Promise<void> {
  let BackgroundFetch: any = null;
  try {
    BackgroundFetch = require('expo-background-fetch');
    await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
  } catch {}
  _registered = false;
}

// ── Warm tasks ──────────────────────────────────────────────────────
// Each step is best-effort. Network errors, auth errors, schema drift
// - all silently swallowed. The point is to fill the cache when the
// stars align, not to alert the user about background failures.

async function warmProfile(): Promise<void> {
  try {
    const { dilly } = require('./dilly');
    const { setCached } = require('./profileCache');
    const profile = await dilly.fetch('/profile').then((r: any) => r.json()).catch(() => null);
    if (profile) {
      try { setCached?.('profile:full', profile); } catch {}
    }
  } catch {}
}

async function warmJobs(): Promise<void> {
  try {
    const { dilly } = require('./dilly');
    const { setCached } = require('./profileCache');
    const jobs = await dilly.get('/internships/v2?limit=24').catch(() => null);
    if (jobs) {
      try { setCached?.('jobs:hot', jobs); } catch {}
    }
  } catch {}
}

async function warmChapter(): Promise<void> {
  try {
    const { dilly } = require('./dilly');
    const { setCached } = require('./profileCache');
    const cur = await dilly.get('/chapters/current').catch(() => null);
    if (cur) {
      try { setCached?.('chapter:current', cur); } catch {}
    }
  } catch {}
}

async function warmScore(): Promise<void> {
  try {
    const { dilly } = require('./dilly');
    const { setCached } = require('./profileCache');
    const score = await dilly.get('/score').catch(() => null);
    if (score) {
      try { setCached?.('score:current', score); } catch {}
    }
  } catch {}
}
