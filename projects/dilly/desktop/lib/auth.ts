import { apiFetch } from './api';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dilly_token');
}

export function setToken(token: string) {
  localStorage.setItem('dilly_token', token);
}

export function clearToken() {
  localStorage.removeItem('dilly_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export async function fetchProfile() {
  return apiFetch('/profile');
}
