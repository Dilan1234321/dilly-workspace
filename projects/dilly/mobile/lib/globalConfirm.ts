/**
 * Global in-app confirm modal singleton. Mirrors lib/globalToast for
 * any case that needs Yes/No (or arbitrary button) input - destructive
 * deletes, sign-out, "discard your edits", etc. All of those used to
 * call Alert.alert which pops the OS-native modal that feels foreign
 * on a designed surface.
 *
 * Usage:
 *   const ok = await showConfirm({
 *     title: 'Dilly will forget this',
 *     message: 'Permanently remove this fact from your profile?',
 *     confirmLabel: 'Delete',
 *     destructive: true,
 *   })
 *   if (ok) { ... }
 */

import { useEffect, useState } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface ConfirmState extends ConfirmOptions {
  visible: boolean;
  id: number;
}

const _initial: ConfirmState = {
  visible: false,
  message: '',
  id: 0,
};

let _state: ConfirmState = _initial;
let _resolver: ((v: boolean) => void) | null = null;
const _listeners = new Set<(s: ConfirmState) => void>();
let _idCounter = 0;

function _set(next: ConfirmState) {
  _state = next;
  _listeners.forEach(l => l(_state));
}

/** Show an in-app confirmation modal. Returns a Promise that resolves
 *  with true if the user tapped the confirm button, false otherwise. */
export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  // If a previous confirm is still open, resolve it as cancelled so
  // we never leave a dangling promise.
  if (_resolver) {
    _resolver(false);
    _resolver = null;
  }
  _idCounter += 1;
  return new Promise<boolean>(resolve => {
    _resolver = resolve;
    _set({
      ...opts,
      visible: true,
      id: _idCounter,
    });
  });
}

export function _resolveConfirm(answer: boolean) {
  if (_resolver) {
    _resolver(answer);
    _resolver = null;
  }
  _set({ ..._state, visible: false });
}

export function useGlobalConfirmState(): ConfirmState {
  const [s, setS] = useState<ConfirmState>(_state);
  useEffect(() => {
    _listeners.add(setS);
    return () => { _listeners.delete(setS); };
  }, []);
  return s;
}
