const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
const TEST_TOKEN = process.env.NEXT_PUBLIC_TEST_TOKEN || '';

function getToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('dilly_token') || TEST_TOKEN;
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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) return null;
  return res.blob();
}
