/**
 * appIntents.ts — bridge dilly-intents pending payloads → expo-router.
 *
 * Native side (DillyIntentsModule) writes a pending payload to App
 * Group UserDefaults whenever the user fires "Hey Siri, log a Dilly
 * win" / a Shortcuts run / the Action Button. This module:
 *
 *   1. consumeAndRoute() — pops the pending intent and routes
 *   2. installAppStateConsumer() — wires it to AppState 'active'
 *
 * Also covers the symmetric quick-actions case via expo-quick-actions.
 *
 * Keeps the routing table in one place so adding a new intent only
 * touches the route map.
 */
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';

let _installed = false;

const ROUTE_BY_INTENT: Record<string, string> = {
  'log-win': '/(app)?openLogWin=1',
  'open-today': '/(app)',
  'new-chapter': '/(app)/chapter/prep',
  'open-voice': '/(app)/voice',
  'mark-habit-done': '/(app)',
};

/** Route a single intent payload. Idempotent. */
function route(intentName: string, payload?: Record<string, unknown>): void {
  const dest = ROUTE_BY_INTENT[intentName];
  if (!dest) return;
  try {
    let path = dest;
    // For log-win, allow Siri to pre-fill the win text.
    if (intentName === 'log-win' && payload?.text) {
      const sep = path.includes('?') ? '&' : '?';
      path += `${sep}prefill=${encodeURIComponent(String(payload.text))}`;
    }
    router.push(path as any);
  } catch {}
}

/** Pop the pending intent (if any) and route. Safe to call any time. */
export async function consumeAndRoute(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const Intents: any = await import('dilly-intents').catch(() => null);
    const pending = await Intents?.consumePendingIntent?.();
    if (!pending?.name) return;
    route(pending.name, pending.payload as Record<string, unknown>);
  } catch {}
}

/** Donate App Intents to the system (one-time, on cold start). */
export async function donateAppIntents(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const Intents: any = await import('dilly-intents').catch(() => null);
    await Intents?.donateIntents?.();
    await Intents?.refreshAppShortcuts?.();
  } catch {}
}

/** Install AppState listener so any time the app becomes active we
 *  check for a pending intent (Siri / Shortcuts may have just fired). */
export function installAppStateConsumer(): () => void {
  if (_installed) return () => {};
  _installed = true;
  // Check on install (covers cold start where the intent fired before
  // RN was ready).
  consumeAndRoute().catch(() => {});
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') consumeAndRoute().catch(() => {});
  });
  return () => {
    try { sub.remove(); } catch {}
    _installed = false;
  };
}

// ─── Quick Actions (long-press on app icon) ──────────────────────────

const QA_ROUTE_BY_TYPE: Record<string, string> = {
  'com.dilly.app.shortcut.today': '/(app)',
  'com.dilly.app.shortcut.log-win': '/(app)?openLogWin=1',
  'com.dilly.app.shortcut.new-chapter': '/(app)/chapter/prep',
  'com.dilly.app.shortcut.voice': '/(app)/voice',
};

let _qaInstalled = false;

/** Wire expo-quick-actions: navigate when the user picks a long-press
 *  shortcut. Also called once on cold start in case the app was
 *  launched directly via a shortcut. */
export async function installQuickActionsHandler(): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {};
  if (_qaInstalled) return () => {};
  _qaInstalled = true;
  try {
    const QA: any = await import('expo-quick-actions').catch(() => null);
    if (!QA) return () => {};

    // Route the action that launched the app, if any.
    try {
      const initial = QA.QuickActions?.initial ?? QA.initial;
      if (initial?.id) {
        const dest = QA_ROUTE_BY_TYPE[String(initial.id)];
        if (dest) router.push(dest as any);
      }
    } catch {}

    // Subscribe to in-session taps.
    let sub: any = null;
    if (QA.useQuickActionRouting) {
      // Newer API: hook-based routing not available here — fall back.
    }
    if (QA.QuickActions?.addListener) {
      sub = QA.QuickActions.addListener((action: any) => {
        const dest = QA_ROUTE_BY_TYPE[String(action?.id || '')];
        if (dest) router.push(dest as any);
      });
    } else if (QA.addListener) {
      sub = QA.addListener((action: any) => {
        const dest = QA_ROUTE_BY_TYPE[String(action?.id || '')];
        if (dest) router.push(dest as any);
      });
    }

    return () => {
      try { sub?.remove?.(); } catch {}
      _qaInstalled = false;
    };
  } catch {
    return () => {};
  }
}
