/**
 * Desktop Dilly client — configured with localStorage tokens and proxy routing.
 *
 * Import this everywhere instead of using raw fetch:
 *   import { dilly } from '@/lib/dilly';
 *   const profile = await dilly.getProfile();
 */

import {
  createDillyClient,
  localStorageTokenProvider,
  DESKTOP_AUTH_TOKEN_KEY,
} from "@dilly/api";
import { API_BASE } from "./tokens";

export const dilly = createDillyClient({
  baseUrl: API_BASE,
  tokenProvider: localStorageTokenProvider(DESKTOP_AUTH_TOKEN_KEY),
  // Route through Next.js proxy in browser to avoid Safari CORS issues
  urlRewriter:
    typeof window !== "undefined"
      ? (path) => `/api/proxy${path}`
      : undefined,
  onUnauthorized() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(DESKTOP_AUTH_TOKEN_KEY);
      window.location.href = "/onboarding";
    }
  },
});

// Re-export everything from @dilly/api for convenient single-import
export * from "@dilly/api";
