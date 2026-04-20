// Client-side progress store backed by localStorage. Handles the richer state
// that would blow up a cookie (watched video ids, seconds invested today).
// Everything here is optional enhancement — the server still works without it.

"use client";

const KEY_WATCHED = "skilllab.watched.v1";        // Record<videoId, { at: iso, sec: number }>
const KEY_TIME_TODAY = "skilllab.time_today.v1";  // { date: "YYYY-MM-DD", sec: number }

type WatchedMap = Record<string, { at: string; sec: number }>;
type TimeToday = { date: string; sec: number };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadWatched(): WatchedMap {
  if (typeof window === "undefined") return {};
  return safeParse<WatchedMap>(localStorage.getItem(KEY_WATCHED), {});
}

export function markWatched(videoId: string, estimatedSeconds = 0): void {
  if (typeof window === "undefined") return;
  const map = loadWatched();
  map[videoId] = { at: new Date().toISOString(), sec: estimatedSeconds };
  localStorage.setItem(KEY_WATCHED, JSON.stringify(map));
}

export function isWatched(videoId: string): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(loadWatched()[videoId]);
}

export function watchedCount(): number {
  return Object.keys(loadWatched()).length;
}

export function loadTimeToday(): TimeToday {
  if (typeof window === "undefined") return { date: todayIso(), sec: 0 };
  const raw = safeParse<TimeToday>(localStorage.getItem(KEY_TIME_TODAY), {
    date: todayIso(),
    sec: 0,
  });
  if (raw.date !== todayIso()) return { date: todayIso(), sec: 0 };
  return raw;
}

export function addTimeToday(seconds: number): TimeToday {
  if (typeof window === "undefined") return { date: todayIso(), sec: 0 };
  const current = loadTimeToday();
  const next: TimeToday = {
    date: todayIso(),
    sec: Math.max(0, current.sec + Math.round(seconds)),
  };
  localStorage.setItem(KEY_TIME_TODAY, JSON.stringify(next));
  return next;
}

export function formatMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
