const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "dilly_auth_token"; // Must match dashboard's AUTH_TOKEN_KEY
const USER_KEY = "dilly_user";

export interface DillyUser {
  email: string;
  subscribed: boolean;
}

// ── Token storage ──────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Fetch helper ───────────────────────────────────────────────────────────────

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
}

// ── Auth flows ─────────────────────────────────────────────────────────────────

/** Returns dev_code when the API is in dev mode (DILLY_DEV=1 on the server). */
export async function sendVerificationCode(
  email: string
): Promise<{ devCode?: string }> {
  const res = await apiFetch("/auth/send-verification-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to send code.");
  return { devCode: data.dev_code ?? undefined };
}

export async function verifyCode(
  email: string,
  code: string
): Promise<DillyUser> {
  const res = await apiFetch("/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Invalid code.");
  setToken(data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user as DillyUser;
}

export async function getMe(): Promise<DillyUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await apiFetch("/auth/me");
    if (!res.ok) {
      clearAuth();
      return null;
    }
    return (await res.json()) as DillyUser;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearAuth();
  }
}

// ── Profile ────────────────────────────────────────────────────────────────────

export async function patchProfile(fields: Record<string, unknown>): Promise<void> {
  const res = await apiFetch("/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to update profile.");
  }
}

export async function getProfile(): Promise<Record<string, unknown> | null> {
  const res = await apiFetch("/profile");
  if (!res.ok) return null;
  return res.json();
}
