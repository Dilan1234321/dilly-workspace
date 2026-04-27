/**
 * Global toast singleton. Any screen can call `showToast(...)` to fire
 * an in-app toast that renders over the entire app from a single mount
 * point in (app)/_layout. Replaces Alert.alert for non-blocking
 * feedback (success, info, error) so the app stops popping the OS-
 * native modal which feels foreign on a designed surface.
 *
 * Pattern matches the existing Dilly overlay / paywall / gate stores -
 * a module-level state + listener set, with a tiny hook for components
 * to subscribe.
 */

import { useEffect, useState } from 'react';

export type ToastType = 'error' | 'info' | 'success';

export interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  id: number;
}

const _initial: ToastState = { visible: false, message: '', type: 'info', id: 0 };

let _state: ToastState = _initial;
const _listeners = new Set<(s: ToastState) => void>();
let _hideTimer: ReturnType<typeof setTimeout> | null = null;
let _idCounter = 0;

function _set(next: ToastState) {
  _state = next;
  _listeners.forEach(l => l(_state));
}

/**
 * Show an in-app toast. Auto-dismisses after `durationMs` (default 3s).
 * Replaces Alert.alert for confirmations and errors that don't need
 * user acknowledgement.
 */
export function showToast(opts: {
  message: string;
  type?: ToastType;
  durationMs?: number;
}): void {
  if (_hideTimer) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
  _idCounter += 1;
  _set({
    visible: true,
    message: opts.message,
    type: opts.type ?? 'info',
    id: _idCounter,
  });
  const ms = Math.max(1000, opts.durationMs ?? 3200);
  _hideTimer = setTimeout(() => {
    _set({ ..._state, visible: false });
    _hideTimer = null;
  }, ms);
}

export function hideToast(): void {
  if (_hideTimer) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
  _set({ ..._state, visible: false });
}

/** Hook for the single global mount point. Internal - external screens
 *  should call `showToast()` directly, not subscribe. */
export function useGlobalToastState(): ToastState {
  const [s, setS] = useState<ToastState>(_state);
  useEffect(() => {
    _listeners.add(setS);
    return () => { _listeners.delete(setS); };
  }, []);
  return s;
}
