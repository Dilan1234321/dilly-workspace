// Thin server-side client for the Dilly FastAPI backend.
// All Skill Lab data reads go through this so we have one source of truth.

import { cookies } from "next/headers";
import type { SavedVideo, SessionUser, Video } from "./types";

const API_URL = process.env.DILLY_API_URL ?? "http://localhost:8000";
const SESSION_COOKIE = "dilly_session";

async function api<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T | null> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (init?.auth) {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    headers["authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    // Server component caching is governed by Cache Components — no default revalidation here.
    cache: init?.cache ?? "no-store",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 404) return null;
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── Videos ─────────────────────────────────────────────────────────────────────

export async function listVideosByCohort(
  cohortSlug: string,
  opts: {
    limit?: number;
    sort?: "best" | "newest";
    maxDurationMin?: number;
    lang?: string;
  } = {},
): Promise<Video[]> {
  const params = new URLSearchParams({ cohort: cohortSlug });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.maxDurationMin) params.set("max_duration_min", String(opts.maxDurationMin));
  if (opts.lang) params.set("lang", opts.lang);
  const data = await api<{ videos: Video[] }>(`/skill-lab/videos?${params.toString()}`);
  return data?.videos ?? [];
}

export async function getVideo(id: string): Promise<Video | null> {
  const data = await api<{ video: Video }>(`/skill-lab/videos/${id}`);
  return data?.video ?? null;
}

export async function listTrending(limit = 12, lang?: string): Promise<Video[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (lang) params.set("lang", lang);
  const data = await api<{ videos: Video[] }>(`/skill-lab/trending?${params.toString()}`);
  return data?.videos ?? [];
}

// ── Saved library (auth required) ─────────────────────────────────────────────

export async function listSavedVideos(): Promise<SavedVideo[]> {
  const data = await api<{ videos: SavedVideo[] }>(`/skill-lab/library`, { auth: true });
  return data?.videos ?? [];
}

export async function saveVideo(videoId: string): Promise<boolean> {
  const data = await api<{ ok: boolean }>(`/skill-lab/save`, {
    method: "POST",
    body: JSON.stringify({ video_id: videoId }),
    auth: true,
  });
  return Boolean(data?.ok);
}

export async function unsaveVideo(videoId: string): Promise<boolean> {
  const data = await api<{ ok: boolean }>(`/skill-lab/save/${videoId}`, {
    method: "DELETE",
    auth: true,
  });
  return Boolean(data?.ok);
}

// ── Session ───────────────────────────────────────────────────────────────────
// Dilly uses email + 6-digit verification code auth. There's no password and
// no separate sign-up endpoint — /auth/verify-code creates the profile on
// first verification and just issues a session on subsequent ones.

export async function getSession(): Promise<SessionUser | null> {
  return api<SessionUser>(`/auth/me`, { auth: true });
}

export async function sendVerificationCode(
  email: string,
  userType: "student" | "general" = "general",
): Promise<{ ok: boolean; devCode?: string }> {
  const data = await api<{ ok: boolean; dev_code?: string }>(`/auth/send-verification-code`, {
    method: "POST",
    body: JSON.stringify({ email, user_type: userType }),
  });
  return { ok: Boolean(data?.ok), devCode: data?.dev_code };
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const data = await api<{ token: string }>(`/auth/verify-code`, {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  return data?.token ?? null;
}

export async function serverSignOut(): Promise<void> {
  await api(`/auth/logout`, { method: "POST", auth: true });
}

/**
 * Patches the Dilly profile with what Skill Lab collected during sign-up.
 * Uses the same PATCH /profile endpoint the mobile app uses, so the created
 * profile is a real first-class Dilly profile.
 */
export async function patchProfile(payload: Record<string, unknown>): Promise<boolean> {
  const data = await api<{ ok: boolean }>(`/profile`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    auth: true,
  });
  return Boolean(data?.ok ?? data);
}

export { SESSION_COOKIE };
