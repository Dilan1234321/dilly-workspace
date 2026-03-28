import { useState, useEffect, useCallback } from 'react';

// ── Student context passed when opening the overlay ───────────────────────────

export interface StudentContext {
  name?: string;
  cohort?: string;
  score?: number;
  smart?: number;
  grit?: number;
  build?: number;
  gap?: number;
  cohortBar?: number;
  referenceCompany?: string;
  applicationTarget?: string;
  isPaid?: boolean;
  initialMessage?: string;
}

// ── Module-level pub/sub — no React context needed ────────────────────────────

type Listener = (open: boolean, ctx?: StudentContext) => void;

const _listeners = new Set<Listener>();
let _lastCtx: StudentContext | undefined;

/** Open the Dilly overlay from anywhere. Optionally pass student context + initialMessage. */
export function openDillyOverlay(ctx?: StudentContext) {
  if (ctx) _lastCtx = ctx;
  // Force close then reopen so useEffect always fires
  _listeners.forEach(l => l(false));
  setTimeout(() => {
    _listeners.forEach(l => l(true, _lastCtx));
  }, 150);
}

/** Close the Dilly overlay from anywhere. */
export function closeDillyOverlay() {
  _listeners.forEach(l => l(false));
}

// ── useDillyOverlayState — used internally by DillyOverlay ───────────────────

export function useDillyOverlayState() {
  const [visible, setVisible]             = useState(false);
  const [studentContext, setStudentContext] = useState<StudentContext | undefined>();

  useEffect(() => {
    const listener: Listener = (open, ctx) => {
      setVisible(open);
      if (ctx) setStudentContext(ctx);
    };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const close = useCallback(() => {
    _listeners.forEach(l => l(false));
  }, []);

  return { visible, studentContext, close };
}

// ── Default export — used by screens to trigger the overlay ──────────────────

export default function useDillyOverlay() {
  return { open: openDillyOverlay, close: closeDillyOverlay };
}