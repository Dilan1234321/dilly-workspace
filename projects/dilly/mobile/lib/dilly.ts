/**
 * Mobile Dilly client  -  configured with SecureStore tokens.
 *
 * Import this everywhere instead of using raw fetch:
 *   import { dilly } from '@/lib/dilly';
 *   const profile = await dilly.getProfile();
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDillyClient, type TokenProvider, AUTH_TOKEN_KEY as TOKEN_KEY } from "@dilly/api";
import { API_BASE } from "./tokens";
import { openPaywall } from "../hooks/usePaywall";

/**
 * SecureStore-backed token provider with AsyncStorage fallback.
 * SecureStore uses the device keychain (encrypted), but may be unavailable
 * on some simulators  -  AsyncStorage is the fallback.
 */
function secureStoreTokenProvider(): TokenProvider {
  return {
    async getToken() {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) return token;
      } catch {
        // SecureStore unavailable (simulator, etc.)
      }
      try {
        return await AsyncStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    },

    async setToken(token: string) {
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      } catch {
        // fallback
      }
      try {
        await AsyncStorage.setItem(TOKEN_KEY, token);
      } catch {
        // ignore
      }
    },

    async clearToken() {
      try {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } catch {
        // ignore
      }
      try {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } catch {
        // ignore
      }
    },
  };
}

const _baseClient = createDillyClient({
  baseUrl: API_BASE,
  tokenProvider: secureStoreTokenProvider(),
  onUnauthorized() {
    // The mobile app handles this via the auth context / navigation
    // which listens for 401s and redirects to the login screen.
  },
});

/**
 * Intercept every 402 Payment Required response and surface the
 * DillyPaywallFullScreen globally. Backend paid routes return 402
 * with a JSON body like `{ feature, message }` which we pass through
 * as the paywall's surface + promise.
 *
 * We clone the response so consumers downstream can still read the
 * body themselves (some screens need the error detail for toasts).
 */
const _origFetch = _baseClient.fetch.bind(_baseClient);

// Paths that should NEVER auto-fire the global paywall on 402.
// These are background/polling endpoints that run without the user
// asking. If the user just downgraded or cancelled, these return 402
// and would open the paywall at random moments — which testers saw
// as "the paywall appears when not prompted randomly, at random times"
// after cancelling. The screens that own these endpoints handle the
// 402 locally (usually by rendering an inline upgrade teaser instead
// of the global modal).
const _PAYWALL_SILENT_PATHS = [
  '/jobs/fit-narrative/usage',       // polled on Jobs tab mount
  '/jobs/fit-narrative',             // warm-on-expand; screen renders teaser
  '/holder/market-radar',            // holder home background fetch
  '/ai/context',                     // AI overlay open
  '/ai/chat-history',                // history panel fetch
];

// Debounce the global paywall so bursts of 402s only trigger one
// modal open. 5s is long enough to absorb a page's worth of parallel
// GETs but short enough that a real second paywall trigger (e.g.
// tap a paid button, close, tap another) still feels responsive.
let _lastPaywallAt = 0;
const _PAYWALL_COOLDOWN_MS = 5000;

async function fetchWithPaywall(path: string, init?: RequestInit): Promise<Response> {
  const res = await _origFetch(path, init);
  if (res.status === 402) {
    // Silent-path guard: let the caller handle the 402 inline.
    const isSilentPath = _PAYWALL_SILENT_PATHS.some(p => path.startsWith(p));
    // Cooldown guard: don't re-open within the window.
    const now = Date.now();
    const inCooldown = now - _lastPaywallAt < _PAYWALL_COOLDOWN_MS;
    if (!isSilentPath && !inCooldown) {
      _lastPaywallAt = now;
      let ctx: { surface?: string; promise?: string } | undefined;
      try {
        const body = await res.clone().json();
        ctx = {
          surface: body?.feature || body?.detail?.feature,
          promise: body?.message || body?.detail?.message || body?.error,
        };
      } catch {
        // body wasn't JSON — show the default paywall copy
      }
      openPaywall(ctx);
    }
  }
  return res;
}

export const dilly = {
  ..._baseClient,
  fetch: fetchWithPaywall,
};

// Re-export everything from @dilly/api for convenient single-import
export * from "@dilly/api";
