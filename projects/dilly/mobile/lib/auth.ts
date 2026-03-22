import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './tokens';

const TOKEN_KEY = 'dilly_auth_token';
const USER_KEY  = 'dilly_user';

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

export async function clearAuth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => null),
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
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
