/**
 * Global paywall singleton. Same module-level pub/sub pattern as
 * useDillyOverlay — so `lib/dilly.ts` can trigger the paywall from
 * outside React (on a 402 response) without needing context.
 *
 * Any paid feature that returns 402 flows through here. The response
 * body's `feature` and `message` fields (if present) become the
 * paywall's surface label and promise line.
 */

import { useState, useEffect, useCallback } from 'react';
import type { DillyPaywallContext } from '../components/DillyPaywallFullScreen';

type Listener = (open: boolean, ctx?: DillyPaywallContext) => void;

const _listeners = new Set<Listener>();
let _lastCtx: DillyPaywallContext | undefined;
let _lastFireAt = 0;

/**
 * Open the paywall. De-duped within 800ms so rapid parallel 402s
 * (e.g. two fetches firing at once) don't stutter the modal.
 */
export function openPaywall(ctx?: DillyPaywallContext) {
  const now = Date.now();
  if (now - _lastFireAt < 800) return;
  _lastFireAt = now;
  if (ctx) _lastCtx = ctx;
  _listeners.forEach(l => l(true, _lastCtx));
}

export function closePaywall() {
  _listeners.forEach(l => l(false));
}

export function usePaywallState() {
  const [visible, setVisible] = useState(false);
  const [context, setContext] = useState<DillyPaywallContext | undefined>();

  useEffect(() => {
    const listener: Listener = (open, ctx) => {
      setVisible(open);
      if (ctx) setContext(ctx);
    };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const close = useCallback(() => {
    _listeners.forEach(l => l(false));
  }, []);

  return { visible, context, close };
}
