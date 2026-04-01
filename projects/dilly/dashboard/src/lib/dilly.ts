/**
 * Dashboard Dilly client — configured with localStorage tokens.
 *
 * Import this everywhere instead of dillyUtils + raw fetch:
 *   import { dilly } from '@/lib/dilly';
 *   const profile = await dilly.getProfile();
 */

import {
  createDillyClient,
  localStorageTokenProvider,
} from "@dilly/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const dilly = createDillyClient({
  baseUrl: API_BASE,
  tokenProvider: localStorageTokenProvider("dilly_auth_token"),
  onUnauthorized() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("dilly_auth_token");
      window.location.href = "/login";
    }
  },
});

// Re-export everything from @dilly/api for convenient single-import
export * from "@dilly/api";
