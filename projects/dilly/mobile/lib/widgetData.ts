/**
 * widgetData.ts - bridge between the React Native app and the iOS
 * home-screen widget bundle.
 *
 * The widget reads from App Group UserDefaults (`group.com.dilly.app`)
 * under the key `dilly_widget_data`. This module is the single
 * write-side: every time the app computes fresh content for the
 * widgets (after Chapter, score update, daily refresh), it calls
 * writeWidgetData() with the latest values.
 *
 * Six widgets currently consume this data:
 *   1. Today's Question (todaysQuestion)
 *   2. Your One Move (oneMoveTitle / oneMoveBody / oneMoveDeepLink)
 *   3. Tonight's 15 Minutes (tonightTitle / tonightDeepLink)
 *   4. Dilly Profile (profileFactCount / profileCategoryCount /
 *      profileRecentFacts / profileLatestFactDate / profileLatestFactCategory)
 *      [REPLACED Honest Mirror — "living, breathing profile" feel:
 *       the widget rotates through the user's actual recent facts so
 *       every refresh shows a different "Dilly remembers..." line.]
 *   5. Moment of Truth (truthQuestion / truthAnswered / truthStreakDays)
 *   6. Dilly Today summary (large) — uses Question + One Move + Tonight
 *
 * The widget renders empty hints when fields are missing, so partial
 * payloads are safe.
 *
 * Lazy-loaded native module: react-native-shared-group-preferences
 * isn't available on simulator/Expo Go. All public functions silently
 * no-op in that case.
 */

import { Platform } from 'react-native';

const APP_GROUP = 'group.com.dilly.app';
const DATA_KEY = 'dilly_widget_data';
const TRUTH_QUEUE_KEY = 'dilly_widget_truth_queue';

let _SGP: any = null;
async function loadSGP(): Promise<any> {
  if (_SGP) return _SGP;
  try {
    const mod = await import('react-native-shared-group-preferences');
    _SGP = (mod as any).default || mod;
    return _SGP;
  } catch {
    return null;
  }
}

export interface WidgetData {
  todaysQuestion?: string;

  oneMoveTitle?: string;
  oneMoveBody?: string;
  oneMoveDeepLink?: string;

  tonightTitle?: string;
  tonightDeepLink?: string;

  // Dilly Profile widget (replaces Honest Mirror).
  // The widget rotates through profileRecentFacts on each timeline
  // refresh so the user sees a different "Dilly remembers: ..." line
  // every time iOS reloads — gives the profile a living/breathing feel.
  profileFactCount?: number;
  profileCategoryCount?: number;
  profileRecentFacts?: string[];      // 3-6 most recent facts as quoted lines
  profileLatestFactDate?: string;     // short string like "Tue" or "Mar 12"
  profileLatestFactCategory?: string; // e.g. "achievement", "skill"

  // Honest Mirror retired — kept here as deprecated for backward-compat
  // with old App Group data the widget bundle still understands.
  /** @deprecated Removed in build 441; widget no longer renders this. */
  mirrorSentence?: string;

  truthQuestion?: string;
  truthAnswered?: boolean;
  truthStreakDays?: number;

  // ORGANISM #4 — what's coming up. Surfaced on the lock-screen
  // accessoryRectangular and Home Screen widgets so the user sees
  // "Citadel interview Wed" without unlocking the app. Sourced from
  // the merged calendar feed (profile.deadlines + tracker apps +
  // /calendar/profile-suggestions). 1 line max — must fit a tiny
  // rectangular complication.
  nextEventTitle?: string;       // e.g. "Citadel interview"
  nextEventCountdown?: string;   // e.g. "Wed" / "tomorrow" / "in 3d"
  nextEventCompany?: string;     // e.g. "Citadel" — used for icon hint
  nextEventType?: string;        // e.g. "interview" | "deadline" | "prep"

  lastUpdatedAt?: number;
}

/** Read whatever is currently in App Group UserDefaults. Returns
 *  undefined when the group/native module isn't available; callers
 *  should fall through to defaults. */
export async function readWidgetData(): Promise<WidgetData | undefined> {
  if (Platform.OS !== 'ios') return undefined;
  const SGP = await loadSGP();
  if (!SGP) return undefined;
  try {
    const raw = await SGP.getItem(DATA_KEY, APP_GROUP);
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return undefined; }
    }
    return raw || undefined;
  } catch {
    return undefined;
  }
}

/** Merge new fields into the existing widget payload + persist back.
 *  Partial-update semantics so a caller can update only the One Move
 *  without clobbering the Today's Question. */
export async function writeWidgetData(patch: WidgetData): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const SGP = await loadSGP();
  if (!SGP) return;
  try {
    const existing = (await readWidgetData()) || {};
    const merged: WidgetData = {
      ...existing,
      ...patch,
      lastUpdatedAt: Date.now() / 1000,
    };
    // The widget's Codable expects a JSON string under DATA_KEY (the
    // Swift side does JSONDecoder().decode(...) on the value). We
    // store as a string here for that contract.
    await SGP.setItem(DATA_KEY, JSON.stringify(merged), APP_GROUP);
  } catch {
    // Best-effort; widget data is non-critical and stale is fine.
  }
}

/** Drain the queue of Moment-of-Truth answers the user logged from
 *  the home-screen widget (interactive button writes them via App
 *  Intent). Called by the main app on foreground so the answers can
 *  be POSTed to the backend and merged into the user's profile. */
export async function drainTruthAnswerQueue(): Promise<Array<{
  answer: string;
  question: string;
  answeredAt: number;
}>> {
  if (Platform.OS !== 'ios') return [];
  const SGP = await loadSGP();
  if (!SGP) return [];
  try {
    const raw = await SGP.getItem(TRUTH_QUEUE_KEY, APP_GROUP);
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { parsed = []; }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    // Clear the queue immediately so subsequent renders don't re-sync.
    await SGP.setItem(TRUTH_QUEUE_KEY, JSON.stringify([]), APP_GROUP).catch(() => {});
    return parsed.map((row: any) => ({
      answer: String(row?.answer || ''),
      question: String(row?.question || ''),
      answeredAt: Number(row?.answeredAt || 0),
    }));
  } catch {
    return [];
  }
}
