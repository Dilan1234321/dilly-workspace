/**
 * Cross-screen signal for the "Dilly is writing this down" moment.
 *
 * When the chat overlay closes, it calls /ai/chat/flush to extract
 * new facts from the session. That call returns `{added: [...]}` -
 * the newly captured fact objects. My Dilly watches this signal: if
 * it's mounted when extraction is in-flight OR when `added` lands, it
 * shows a transparent overlay with DillyFace writing, then fades out
 * and reveals the new facts one at a time on a 300ms stagger.
 *
 * Module-level pub/sub - same pattern as useDillyOverlay and
 * usePaywall so the overlay can poke profile screens from outside
 * React. Plays nice with Expo Router remounts.
 */

import { useState, useEffect, useCallback } from 'react';

export interface ExtractionAddedFact {
  id: string;
  category: string;
  label: string;
  value: string;
}

export interface ExtractionState {
  /** True between overlay-close and the flush response landing. */
  pending: boolean;
  /** Most recent batch of newly-captured fact objects. Cleared after
   *  My Dilly consumes them (via consumeAdded). */
  added: ExtractionAddedFact[];
  /** Monotonic counter so listeners can detect "new batch arrived"
   *  even if `added` happens to equal the previous value. */
  seq: number;
}

const INITIAL: ExtractionState = { pending: false, added: [], seq: 0 };

type Listener = (s: ExtractionState) => void;
const _listeners = new Set<Listener>();
let _state: ExtractionState = { ...INITIAL };

function _broadcast() {
  _listeners.forEach(l => l(_state));
}

/** Chat overlay calls this when it dispatches the /flush request. */
export function markExtractionPending() {
  _state = { ..._state, pending: true };
  _broadcast();
}

/** Called with the `added` array from /flush when it resolves. */
export function resolveExtraction(added: ExtractionAddedFact[]) {
  _state = {
    pending: false,
    added: added || [],
    seq: _state.seq + 1,
  };
  _broadcast();
}

/** Called if the flush request fails - just clear pending, no adds. */
export function abortExtraction() {
  _state = { ..._state, pending: false };
  _broadcast();
}

/** My Dilly calls this after consuming the added list so subsequent
 *  mounts don't replay the overlay. */
export function consumeAdded() {
  if (_state.added.length === 0) return;
  _state = { ..._state, added: [] };
  _broadcast();
}

export function useExtractionState(): ExtractionState {
  const [s, setS] = useState<ExtractionState>(_state);
  useEffect(() => {
    const l: Listener = (next) => setS(next);
    _listeners.add(l);
    setS(_state);
    return () => { _listeners.delete(l); };
  }, []);
  return s;
}
