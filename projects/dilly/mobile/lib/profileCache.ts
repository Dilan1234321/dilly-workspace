/**
 * Slim profile cache - stores a few high-signal fields from the full
 * /profile response so SplashScreen can generate personalized greeting
 * variants without a network call on cold open.
 *
 * Written whenever the theme hook fetches /profile. Expires after 24h
 * so stale signals don't persist across sessions where the user has
 * logged out or cleared data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY  = 'dilly_profile_slim_v1';
const HISTORY_KEY = 'dilly_splash_history_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_SIZE = 5;

export interface ProfileSlim {
  name?: string;
  school?: string;
  major?: string;
  gpa?: number;
  graduation_year?: number;
  experience_count: number;
  skills_count: number;
  courses_count: number;
  activities_count: number;
  cached_at: number;
}

export async function cacheProfileSlim(profile: any): Promise<void> {
  if (!profile || typeof profile !== 'object') return;
  try {
    const slim: ProfileSlim = {
      name: profile.name || profile.first_name || undefined,
      school: profile.school || profile.institution || undefined,
      major: Array.isArray(profile.majors)
        ? profile.majors[0]
        : profile.major || undefined,
      gpa: typeof profile.gpa === 'number' ? profile.gpa : undefined,
      graduation_year: profile.graduation_year || profile.grad_year || undefined,
      experience_count: countList(profile.experience ?? profile.internships ?? profile.work_experience),
      skills_count: countList(profile.skills),
      courses_count: countList(profile.courses ?? profile.coursework),
      activities_count: countList(profile.activities ?? profile.clubs),
      cached_at: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(slim));
  } catch {}
}

export async function readProfileSlim(): Promise<ProfileSlim | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p: ProfileSlim = JSON.parse(raw);
    if (Date.now() - (p.cached_at || 0) > CACHE_TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}

/** Returns the last N shown variant IDs. */
export async function readSplashHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Appends a variant ID to the history, keeping at most HISTORY_SIZE entries. */
export async function recordSplashShown(variantId: string): Promise<void> {
  try {
    const hist = await readSplashHistory();
    const next = [...hist.filter(id => id !== variantId), variantId].slice(-HISTORY_SIZE);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

function countList(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return 0;
}
