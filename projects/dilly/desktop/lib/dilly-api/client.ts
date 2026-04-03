/**
 * @dilly/api — Shared API client
 *
 * Works on web (Next.js) and React Native (Expo) with identical behavior.
 * Each platform plugs in its own TokenProvider for storage.
 *
 * Usage:
 *   // Desktop / Dashboard (web)
 *   const api = createDillyClient({
 *     baseUrl: process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000',
 *     tokenProvider: localStorageTokenProvider('dilly_token'),
 *   });
 *
 *   // Mobile (React Native)
 *   const api = createDillyClient({
 *     baseUrl: API_BASE,
 *     tokenProvider: secureStoreTokenProvider(),
 *   });
 */

import type {
  ApiError,
  AppProfile,
  Application,
  AuditV2,
  AuthSendCodeResponse,
  AuthUser,
  AuthVerifyCodeResponse,
  RichContext,
  VoiceConversation,
} from "./types";

// ─── Token Provider Interface ───────────────────────────────────────────────

/**
 * Abstraction over token storage. Each platform provides its own implementation.
 * All methods can be async to support SecureStore, IndexedDB, etc.
 */
export interface TokenProvider {
  getToken(): string | null | Promise<string | null>;
  setToken(token: string): void | Promise<void>;
  clearToken(): void | Promise<void>;
}

// ─── Built-in Token Providers ───────────────────────────────────────────────

/** localStorage-based token provider for web apps. */
export function localStorageTokenProvider(key: string): TokenProvider {
  return {
    getToken() {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(key);
    },
    setToken(token: string) {
      localStorage.setItem(key, token);
    },
    clearToken() {
      localStorage.removeItem(key);
    },
  };
}

// ─── Client Options ─────────────────────────────────────────────────────────

export interface DillyClientOptions {
  /** API base URL, no trailing slash. */
  baseUrl: string;
  /** How to read/write the auth token. */
  tokenProvider: TokenProvider;
  /**
   * Optional URL rewriter for requests. Desktop uses this to route through
   * a Next.js proxy to avoid CORS issues in Safari.
   * If provided, overrides baseUrl for actual fetch calls.
   */
  urlRewriter?: (path: string) => string;
  /** Default timeout in ms (defaults to 22000). */
  timeoutMs?: number;
  /** Called when a request returns 401. Use this to redirect to login. */
  onUnauthorized?: () => void;
}

// ─── Error Class ────────────────────────────────────────────────────────────

export class DillyApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, body: ApiError) {
    super(body.detail || body.error || `API error ${status}`);
    this.name = "DillyApiError";
    this.status = status;
    this.code = body.code || "UNKNOWN";
    this.requestId = body.request_id;
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

export interface DillyClient {
  /** Raw fetch with auth headers, timeout, and error handling. */
  fetch(path: string, options?: RequestInit): Promise<Response>;

  /** JSON GET shorthand. Default returns `any` for easy migration; add generics to tighten. */
  get<T = any>(path: string): Promise<T>;

  /** JSON POST shorthand. */
  post<T = any>(path: string, body?: unknown): Promise<T>;

  /** JSON PATCH shorthand. */
  patch<T = any>(path: string, body?: unknown): Promise<T>;

  /** JSON PUT shorthand. */
  put<T = any>(path: string, body?: unknown): Promise<T>;

  /** JSON DELETE shorthand. */
  delete<T = any>(path: string): Promise<T>;

  /** Fetch as Blob (for PDFs, images). Returns null on error. */
  blob(path: string): Promise<Blob | null>;

  // ── Typed endpoint helpers ──────────────────────────────────────────────

  /** Auth: send verification code to email. */
  sendCode(email: string): Promise<AuthSendCodeResponse>;

  /** Auth: verify code and get token. Automatically stores the token. */
  verifyCode(email: string, code: string): Promise<AuthVerifyCodeResponse>;

  /** Auth: get current user from stored token. */
  me(): Promise<AuthUser>;

  /** Auth: invalidate session and clear stored token. */
  logout(): Promise<void>;

  /** Profile: get current user's full profile. */
  getProfile(): Promise<AppProfile>;

  /** Profile: update profile fields. */
  updateProfile(fields: Partial<AppProfile>): Promise<AppProfile>;

  /** Audit: get full audit by ID. */
  getAudit(auditId: string): Promise<AuditV2>;

  /** AI: get rich context for the AI coach. */
  getAIContext(): Promise<RichContext | null>;

  /** Voice: list conversation history. */
  getVoiceHistory(limit?: number): Promise<VoiceConversation[]>;

  /** Applications: list all applications. */
  getApplications(): Promise<Application[]>;

  /** Check if the user is authenticated (has a stored token). */
  isAuthenticated(): Promise<boolean>;

  /** Access the token provider directly for advanced use cases. */
  tokenProvider: TokenProvider;
}

export function createDillyClient(options: DillyClientOptions): DillyClient {
  const {
    baseUrl,
    tokenProvider,
    urlRewriter,
    timeoutMs = 22_000,
    onUnauthorized,
  } = options;

  function buildUrl(path: string): string {
    if (urlRewriter) return urlRewriter(path);
    return `${baseUrl}${path}`;
  }

  async function authFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await tokenProvider.getToken();
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Don't set Content-Type for FormData (browser sets boundary automatically)
    if (!(init.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(buildUrl(path), {
        ...init,
        headers,
        signal: init.signal || controller.signal,
      });

      if (res.status === 401) {
        onUnauthorized?.();
      }

      return res;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function jsonFetch<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await authFetch(path, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({
        error: res.statusText,
        code: "UNKNOWN",
      }));
      throw new DillyApiError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  const client: DillyClient = {
    tokenProvider,

    fetch: authFetch,

    get<T>(path: string) {
      return jsonFetch<T>(path);
    },

    post<T>(path: string, body?: unknown) {
      return jsonFetch<T>(path, {
        method: "POST",
        body: body != null ? JSON.stringify(body) : undefined,
      });
    },

    patch<T>(path: string, body?: unknown) {
      return jsonFetch<T>(path, {
        method: "PATCH",
        body: body != null ? JSON.stringify(body) : undefined,
      });
    },

    put<T>(path: string, body?: unknown) {
      return jsonFetch<T>(path, {
        method: "PUT",
        body: body != null ? JSON.stringify(body) : undefined,
      });
    },

    delete<T>(path: string) {
      return jsonFetch<T>(path, { method: "DELETE" });
    },

    async blob(path: string) {
      try {
        const res = await authFetch(path);
        if (!res.ok) return null;
        return res.blob();
      } catch {
        return null;
      }
    },

    // ── Typed endpoints ─────────────────────────────────────────────────

    sendCode(email: string) {
      return client.post<AuthSendCodeResponse>("/auth/send-verification-code", {
        email,
      });
    },

    async verifyCode(email: string, code: string) {
      const result = await client.post<AuthVerifyCodeResponse>(
        "/auth/verify-code",
        { email, code },
      );
      await tokenProvider.setToken(result.token);
      return result;
    },

    me() {
      return client.get<AuthUser>("/auth/me");
    },

    async logout() {
      try {
        await client.post("/auth/logout");
      } finally {
        await tokenProvider.clearToken();
      }
    },

    getProfile() {
      return client.get<AppProfile>("/profile");
    },

    updateProfile(fields: Partial<AppProfile>) {
      return client.patch<AppProfile>("/profile", fields);
    },

    getAudit(auditId: string) {
      return client.get<AuditV2>(`/audit/${encodeURIComponent(auditId)}`);
    },

    async getAIContext() {
      try {
        return await client.get<RichContext>("/ai/context");
      } catch {
        return null;
      }
    },

    getVoiceHistory(limit = 20) {
      return client.get<VoiceConversation[]>(`/voice/history?limit=${limit}`);
    },

    getApplications() {
      return client.get<Application[]>("/applications");
    },

    async isAuthenticated() {
      const token = await tokenProvider.getToken();
      return !!token;
    },
  };

  return client;
}
