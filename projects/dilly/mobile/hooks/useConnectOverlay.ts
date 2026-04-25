import { useState, useEffect, useCallback } from 'react';

// ── Pub/sub — mirrors useDillyOverlay pattern exactly ─────────────────────────

type ConnectSection = 'home' | 'companies' | 'requests' | 'conversations' | 'pipeline' | 'settings';

interface ConnectOverlayOptions {
  /** Which sub-section to open to. Defaults to 'home'. */
  section?: ConnectSection;
}

type Listener = (open: boolean, opts?: ConnectOverlayOptions) => void;

const _listeners = new Set<Listener>();
let _lastOpts: ConnectOverlayOptions | undefined;

export function openConnectOverlay(opts?: ConnectOverlayOptions) {
  if (opts) _lastOpts = opts;
  _listeners.forEach(l => l(false));
  setTimeout(() => {
    _listeners.forEach(l => l(true, _lastOpts));
  }, 150);
}

export function closeConnectOverlay() {
  _listeners.forEach(l => l(false));
}

export function useConnectOverlayState() {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ConnectOverlayOptions | undefined>();

  useEffect(() => {
    const listener: Listener = (open, opts) => {
      setVisible(open);
      if (opts) setOptions(opts);
    };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const close = useCallback(() => {
    _listeners.forEach(l => l(false));
  }, []);

  return { visible, options, close };
}

export default function useConnectOverlay() {
  return { open: openConnectOverlay, close: closeConnectOverlay };
}
