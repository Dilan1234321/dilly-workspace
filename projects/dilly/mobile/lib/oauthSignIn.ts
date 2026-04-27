/**
 * oauthSignIn.ts — Sign in with Apple + Sign in with Google.
 *
 * Both flows POST to backend endpoints that resolve the OAuth identity
 * to a Dilly user account (existing or freshly created with
 * account_type='general'). Returns the same {token, user} shape as the
 * email-code path so callers can route identically.
 *
 * Restricted to non-student situations by design — see
 * api/routers/auth.py for the rationale (SIWA can't satisfy .edu;
 * Google restricted for cleaner mental model).
 */

import { Platform } from 'react-native';
import { API_BASE } from './tokens';

export interface OAuthResult {
  token: string;
  user: {
    email?: string;
    account_type?: string;
    subscribed?: boolean;
  };
}

// ─── Sign in with Apple ──────────────────────────────────────────────

export async function signInWithApple(): Promise<OAuthResult> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is iOS only.');
  }
  const AppleAuth = await import('expo-apple-authentication');

  // Apple's full_name + email arrive ONLY on the very first sign-in
  // for a given (app, account) pair — subsequent sign-ins return only
  // the stable user sub. The backend caches them on first hit so we
  // never depend on getting them again.
  const credential = await AppleAuth.signInAsync({
    requestedScopes: [
      AppleAuth.AppleAuthenticationScope.FULL_NAME,
      AppleAuth.AppleAuthenticationScope.EMAIL,
    ],
  });

  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const res = await fetch(`${API_BASE}/auth/sign-in-with-apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity_token: credential.identityToken,
      user: credential.user,
      email: credential.email || undefined,
      full_name: fullName || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Apple sign-in failed.');
  }
  return data as OAuthResult;
}

// ─── Sign in with Google ─────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '';

export async function signInWithGoogle(): Promise<OAuthResult> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured. Use email or Apple instead.');
  }

  const AuthSession = await import('expo-auth-session');
  const Crypto = await import('expo-crypto');

  const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

  const codeVerifier = await _genCodeVerifier(Crypto);
  const codeChallenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  ).then(b64ToB64Url);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'dilly', path: 'oauth/google' });

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    codeChallenge,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    extraParams: { access_type: 'offline' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(result.type === 'cancel' ? 'Google sign-in cancelled.' : 'Google sign-in failed.');
  }

  const tokenResp = await AuthSession.exchangeCodeAsync(
    {
      clientId: GOOGLE_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: codeVerifier },
    },
    discovery,
  );

  const idToken = (tokenResp as any).idToken;
  if (!idToken) {
    throw new Error('Google did not return an ID token.');
  }

  const claims = _decodeIdToken(idToken);
  const email = (claims.email || '').toString().trim().toLowerCase();
  const fullName = (claims.name || '').toString().trim();

  const res = await fetch(`${API_BASE}/auth/sign-in-with-google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_token: idToken,
      email,
      full_name: fullName || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Google sign-in failed.');
  }
  return data as OAuthResult;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function _genCodeVerifier(Crypto: any): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return b64ToB64Url(bytesToB64(bytes));
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
}

function b64ToB64Url(b64: string): string {
  return b64.replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function _decodeIdToken(jwt: string): Record<string, unknown> {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    // eslint-disable-next-line no-undef
    const decoded = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}
