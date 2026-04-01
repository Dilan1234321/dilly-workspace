/**
 * Mobile Dilly client — configured with SecureStore tokens.
 *
 * Import this everywhere instead of using raw fetch:
 *   import { dilly } from '@/lib/dilly';
 *   const profile = await dilly.getProfile();
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDillyClient, type TokenProvider, AUTH_TOKEN_KEY as TOKEN_KEY } from "@dilly/api";
import { API_BASE } from "./tokens";

/**
 * SecureStore-backed token provider with AsyncStorage fallback.
 * SecureStore uses the device keychain (encrypted), but may be unavailable
 * on some simulators — AsyncStorage is the fallback.
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

export const dilly = createDillyClient({
  baseUrl: API_BASE,
  tokenProvider: secureStoreTokenProvider(),
  onUnauthorized() {
    // The mobile app handles this via the auth context / navigation
    // which listens for 401s and redirects to the login screen.
  },
});

// Re-export everything from @dilly/api for convenient single-import
export * from "@dilly/api";
