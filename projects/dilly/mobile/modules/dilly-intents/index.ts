/**
 * dilly-intents — App Intents bridge.
 *
 * The Swift side defines the intents (LogWinIntent, OpenTodayIntent,
 * StartChapterIntent, OpenVoiceIntent, MarkHabitDoneIntent) so they
 * appear in Siri, Shortcuts, Spotlight, and the Action Button.
 *
 * Each intent writes a payload to the App Group UserDefaults under the
 * key 'dilly:pending_intent'. The JS side polls this on resume + on
 * cold start and routes accordingly.
 *
 * Why poll instead of push? App Intents can fire when the app is not
 * running — Siri/Shortcuts may launch the app fresh. The simplest
 * cross-state path is: intent writes a pending action → JS reads it on
 * any focus event → clears it after handling.
 */
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

let _native: any = null;
function _mod(): any {
  if (Platform.OS !== 'ios') return null;
  if (_native) return _native;
  try {
    _native = requireNativeModule('DillyIntents');
    return _native;
  } catch {
    return null;
  }
}

export type PendingIntentName =
  | 'log-win'
  | 'open-today'
  | 'new-chapter'
  | 'open-voice'
  | 'mark-habit-done';

export interface PendingIntent {
  name: PendingIntentName;
  payload?: Record<string, unknown>;
  firedAt: number;
}

/** Read the pending intent (if any) and atomically clear it. */
export async function consumePendingIntent(): Promise<PendingIntent | null> {
  const m = _mod();
  if (!m?.consumePendingIntent) return null;
  try {
    const r = await m.consumePendingIntent();
    if (!r || !r.name) return null;
    return r as PendingIntent;
  } catch {
    return null;
  }
}

/** Donate intents to the system so they appear as Siri Suggestions. */
export async function donateIntents(): Promise<void> {
  const m = _mod();
  if (!m?.donateIntents) return;
  try {
    await m.donateIntents();
  } catch {
    /* non-fatal */
  }
}

/** Update the App Shortcut phrases (called once on app launch). */
export async function refreshAppShortcuts(): Promise<void> {
  const m = _mod();
  if (!m?.refreshAppShortcuts) return;
  try {
    await m.refreshAppShortcuts();
  } catch {
    /* non-fatal */
  }
}

export default { consumePendingIntent, donateIntents, refreshAppShortcuts };
