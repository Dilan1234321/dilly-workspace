const API_BASE = 'http://10.106.52.22:8000';
const TEST_TOKEN = 'CDGRr6KLXjUEO7n6SUAmNolOsSl1ur1zWsXGleL5QHE';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('dilly_token') || TEST_TOKEN)
    : TEST_TOKEN;

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
