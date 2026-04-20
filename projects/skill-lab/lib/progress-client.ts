// Client-side progress store backed by localStorage. Handles the richer state
// that would blow up a cookie (watched video ids, seconds invested today).
// Everything here is optional enhancement — the server still works without it.

"use client";

const KEY_WATCHED = "skilllab.watched.v1";        // Record<videoId, { at: iso, sec: number }>
const KEY_TIME_TODAY = "skilllab.time_today.v1";  // { date: "YYYY-MM-DD", sec: number }
const KEY_RESUME = "skilllab.resume.v1";          // Record<videoId, { at: iso, sec: number }>

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

// ── Resume-from-position ───────────────────────────────────────────────────

type ResumeMap = Record<string, { at: string; sec: number }>;

function loadResumeMap(): ResumeMap {
  if (typeof window === "undefined") return {};
  return safeParse<ResumeMap>(localStorage.getItem(KEY_RESUME), {});
}

export function getResumePosition(videoId: string): number {
  if (typeof window === "undefined") return 0;
  const entry = loadResumeMap()[videoId];
  return entry?.sec ?? 0;
}

export function setResumePosition(videoId: string, seconds: number): void {
  if (typeof window === "undefined") return;
  const map = loadResumeMap();
  map[videoId] = { at: new Date().toISOString(), sec: Math.max(0, Math.round(seconds)) };
  localStorage.setItem(KEY_RESUME, JSON.stringify(map));
}

export function clearResumePosition(videoId: string): void {
  if (typeof window === "undefined") return;
  const map = loadResumeMap();
  delete map[videoId];
  localStorage.setItem(KEY_RESUME, JSON.stringify(map));
}

export function formatMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
