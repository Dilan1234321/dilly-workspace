// Score history — snapshots stored in localStorage.
// Each time the profile loads, we save a snapshot. The chart reads these back.

const STORAGE_KEY = 'dilly_score_history';
const MAX_SNAPSHOTS = 60; // ~2 months of daily use

export interface ScoreSnapshot {
  ts: number;        // unix ms
  smart: number;
  grit: number;
  build: number;
  dilly: number;
}

export function saveSnapshot(smart: number, grit: number, build: number, dilly: number) {
  if (typeof window === 'undefined') return;
  if (!smart && !grit && !build && !dilly) return;

  const history = loadHistory();

  // Don't save if same day and scores haven't changed
  const last = history[history.length - 1];
  if (last) {
    const sameDay = new Date(last.ts).toDateString() === new Date().toDateString();
    const unchanged = last.smart === Math.round(smart) && last.grit === Math.round(grit) &&
      last.build === Math.round(build) && last.dilly === Math.round(dilly);
    if (sameDay && unchanged) return;
  }

  history.push({ ts: Date.now(), smart: Math.round(smart), grit: Math.round(grit), build: Math.round(build), dilly: Math.round(dilly) });

  // Keep only most recent MAX_SNAPSHOTS
  const trimmed = history.slice(-MAX_SNAPSHOTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function loadHistory(): ScoreSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(s => s && typeof s.ts === 'number' && typeof s.dilly === 'number');
  } catch {
    return [];
  }
}

// Return history deduplicated to one entry per day (latest of each day)
export function getDailyHistory(): ScoreSnapshot[] {
  const all = loadHistory();
  const byDay = new Map<string, ScoreSnapshot>();
  for (const s of all) {
    const day = new Date(s.ts).toDateString();
    byDay.set(day, s); // last write wins
  }
  return Array.from(byDay.values()).sort((a, b) => a.ts - b.ts);
}

export function getMilestone(prev: number, curr: number): string | null {
  const thresholds = [60, 70, 75, 80, 85, 90];
  for (const t of thresholds) {
    if (prev < t && curr >= t) return `Crossed ${t}`;
  }
  return null;
}
