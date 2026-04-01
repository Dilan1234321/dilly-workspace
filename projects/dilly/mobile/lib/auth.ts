import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './tokens';
import {
  AUTH_TOKEN_KEY as TOKEN_KEY,
  AUTH_USER_KEY as USER_KEY,
  AUDIT_RESULT_KEY,
  ONBOARDING_NAME_KEY,
  ONBOARDING_COHORT_KEY,
  ONBOARDING_TRACK_KEY,
  ONBOARDING_MAJORS_KEY,
  ONBOARDING_PRE_PROF_KEY,
  ONBOARDING_TARGET_KEY,
  ONBOARDING_INDUSTRY_TARGET_KEY,
  PENDING_UPLOAD_KEY,
} from '@dilly/api';

// Write to both SecureStore (production) and AsyncStorage (dev fallback)
export async function setToken(token: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => null),
    AsyncStorage.setItem(TOKEN_KEY, token),
  ]);
}

// Read from SecureStore first, fall back to AsyncStorage
export async function getToken(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secure) return secure;
  } catch { /* fall through */ }
  return AsyncStorage.getItem(TOKEN_KEY);
}

// Clears auth tokens and session data. Preserves HAS_ONBOARDED_KEY so returning
// users go to verify screen instead of full onboarding.
export async function clearAuth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => null),
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
    AsyncStorage.removeItem(AUDIT_RESULT_KEY),
    AsyncStorage.removeItem(ONBOARDING_NAME_KEY),
    AsyncStorage.removeItem(ONBOARDING_COHORT_KEY),
    AsyncStorage.removeItem(ONBOARDING_TRACK_KEY),
    AsyncStorage.removeItem(ONBOARDING_MAJORS_KEY),
    AsyncStorage.removeItem(ONBOARDING_PRE_PROF_KEY),
    AsyncStorage.removeItem(ONBOARDING_TARGET_KEY),
    AsyncStorage.removeItem(ONBOARDING_INDUSTRY_TARGET_KEY),
    AsyncStorage.removeItem(PENDING_UPLOAD_KEY),
    // NOTE: HAS_ONBOARDED_KEY ("dilly_has_onboarded") is intentionally NOT cleared
  ]);
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  return response;
}
