// Cookie-backed session state for anonymous visitors. This is what makes Skill
// Lab feel like a place where you're actually doing something, not a brochure.
//
// Two cookies:
//   - `skilllab_streak_v1`    JSON: { streak, last } — days-in-a-row + last ISO date
//   - `skilllab_last_watched_v1`  JSON: { id, cohort, at } — most recent video
//
// Keep both small — cookies are sent on every request. Heavier state
// (watched_video_ids, time_invested_today) lives in localStorage.

import { cookies } from "next/headers";

export const STREAK_COOKIE = "skilllab_streak_v1";
export const LAST_WATCHED_COOKIE = "skilllab_last_watched_v1";

export type StreakState = {
  streak: number;    // consecutive days
  last: string;      // ISO date, e.g. "2026-04-20"
};

export type LastWatched = {
  id: string;
  cohort: string;
  at: string;        // ISO timestamp
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z").getTime();
  const b = new Date(bIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/** Read the current streak without mutating. */
export async function getStreak(): Promise<StreakState> {
  const store = await cookies();
  const raw = store.get(STREAK_COOKIE)?.value;
  if (!raw) return { streak: 0, last: "" };
  try {
    const parsed = JSON.parse(raw) as StreakState;
    if (typeof parsed?.streak !== "number" || typeof parsed?.last !== "string") {
      return { streak: 0, last: "" };
    }
    const gap = daysBetween(parsed.last, todayIso());
    // If > 1 day has passed, the streak is visibly broken for display.
    if (gap > 1) return { streak: 0, last: parsed.last };
    return parsed;
  } catch {
    return { streak: 0, last: "" };
  }
}

export async function getLastWatched(): Promise<LastWatched | null> {
  const store = await cookies();
  const raw = store.get(LAST_WATCHED_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastWatched;
    if (!parsed?.id || !parsed?.cohort) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Whether this is a brand-new visitor (no streak cookie at all). */
export async function isFirstVisit(): Promise<boolean> {
  const store = await cookies();
  return !store.get(STREAK_COOKIE);
}

/**
 * Call from a route handler / server action when the user interacts. Increments
 * the streak if this is a new day, holds it if same day, resets to 1 if the
 * previous day was skipped.
 */
export async function bumpStreak(): Promise<StreakState> {
  const store = await cookies();
  const raw = store.get(STREAK_COOKIE)?.value;
  const today = todayIso();
  let next: StreakState;
  if (!raw) {
    next = { streak: 1, last: today };
  } else {
    try {
      const prev = JSON.parse(raw) as StreakState;
      if (prev.last === today) {
        next = prev;
      } else if (daysBetween(prev.last, today) === 1) {
        next = { streak: prev.streak + 1, last: today };
      } else {
        next = { streak: 1, last: today };
      }
    } catch {
      next = { streak: 1, last: today };
    }
  }
  store.set(STREAK_COOKIE, JSON.stringify(next), {
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
  });
  return next;
}

export async function setLastWatched(payload: LastWatched): Promise<void> {
  const store = await cookies();
  store.set(LAST_WATCHED_COOKIE, JSON.stringify(payload), {
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
    sameSite: "lax",
  });
}
