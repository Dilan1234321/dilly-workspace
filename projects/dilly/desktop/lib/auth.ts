import { dilly } from './dilly';

export function getToken(): string | null {
  return dilly.tokenProvider.getToken() as string | null;
}

export function setToken(token: string) {
  dilly.tokenProvider.setToken(token);
}

export function clearToken() {
  dilly.tokenProvider.clearToken();
}

export async function isAuthenticated(): Promise<boolean> {
  return dilly.isAuthenticated();
}

export async function fetchProfile() {
  return dilly.getProfile();
}
