import { API_BASE as DIRECT_API_BASE } from './tokens';
import { DESKTOP_AUTH_TOKEN_KEY } from '@dilly/api';

const TEST_TOKEN = process.env.NEXT_PUBLIC_TEST_TOKEN || '';

/** In the browser, route through Next.js rewrite proxy to avoid cross-origin issues (Safari). */
function getApiBase(): string {
  if (typeof window !== 'undefined') return '/api/proxy';
  return DIRECT_API_BASE;
}

function getToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(DESKTOP_AUTH_TOKEN_KEY) || TEST_TOKEN;
  }
  return TEST_TOKEN;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export async function apiFetchBlob(path: string): Promise<Blob | null> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { headers });
  if (!res.ok) return null;
  return res.blob();
}
