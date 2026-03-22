"use client";

import * as React from "react";

/** Visual families we dedupe per viewport (same kind hidden if an older instance is still on-screen). */
export type VoiceDedupKind =
  | "scores"
  | "agenda"
  | "deadline"
  | "top_recs"
  | "calendar_saved"
  | "application"
  | "next_moves"
  | "story_timeline"
  | "peer_context";

type Ctx = {
  setScrollRoot: (el: HTMLElement | null) => void;
  register: (messageIndex: number, kind: VoiceDedupKind, el: Element | null) => void;
  shouldShow: (messageIndex: number, kind: VoiceDedupKind) => boolean;
};

const VoiceVisualDedupContext = React.createContext<Ctx | null>(null);

function rectsIntersect(el: Element, root: HTMLElement): boolean {
  const er = el.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  if (er.height < 2 && er.width < 2) return false;
  return er.bottom > rr.top + 0.5 && er.top < rr.bottom - 0.5 && er.right > rr.left + 0.5 && er.left < rr.right - 0.5;
}

export function VoiceVisualDedupProvider({ children }: { children: React.ReactNode }) {
  const scrollRootRef = React.useRef<HTMLElement | null>(null);
  const observersRef = React.useRef<Map<string, IntersectionObserver>>(new Map());
  const intersectingRef = React.useRef<Map<string, boolean>>(new Map());
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  const setScrollRoot = React.useCallback((el: HTMLElement | null) => {
    if (scrollRootRef.current === el) return;
    scrollRootRef.current = el;
    observersRef.current.forEach((o) => o.disconnect());
    observersRef.current.clear();
    intersectingRef.current.clear();
    force();
  }, []);

  const register = React.useCallback((messageIndex: number, kind: VoiceDedupKind, el: Element | null) => {
    const key = `${kind}:${messageIndex}`;
    const root = scrollRootRef.current;
    const existing = observersRef.current.get(key);
    if (existing) {
      existing.disconnect();
      observersRef.current.delete(key);
    }
    if (!el || !root) {
      intersectingRef.current.delete(key);
      force();
      return;
    }
    const setVis = (v: boolean) => {
      const prev = intersectingRef.current.get(key);
      if (prev === v) return;
      intersectingRef.current.set(key, v);
      force();
    };
    setVis(rectsIntersect(el, root));
    const io = new IntersectionObserver(
      (entries) => {
        setVis(entries.some((e) => e.isIntersecting));
      },
      { root, rootMargin: "0px", threshold: [0, 0.05, 0.1] }
    );
    io.observe(el);
    observersRef.current.set(key, io);
  }, []);

  const shouldShow = React.useCallback((messageIndex: number, kind: VoiceDedupKind) => {
    for (const [key, vis] of intersectingRef.current.entries()) {
      if (!vis) continue;
      const colon = key.lastIndexOf(":");
      const k = key.slice(0, colon);
      const idx = parseInt(key.slice(colon + 1), 10);
      if (k !== kind || Number.isNaN(idx)) continue;
      if (idx < messageIndex) return false;
    }
    return true;
  }, []);

  const value = React.useMemo(() => ({ setScrollRoot, register, shouldShow }), [setScrollRoot, register, shouldShow]);

  return <VoiceVisualDedupContext.Provider value={value}>{children}</VoiceVisualDedupContext.Provider>;
}

export function useVoiceVisualDedup() {
  return React.useContext(VoiceVisualDedupContext);
}

/** Call inside Provider; binds the chat scroll root used by IntersectionObserver. */
export function VoiceChatDedupScrollBinder({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const ctx = useVoiceVisualDedup();
  React.useLayoutEffect(() => {
    if (!ctx) return;
    ctx.setScrollRoot(scrollRef.current);
    return () => ctx.setScrollRoot(null);
  }, [ctx, scrollRef]);
  return null;
}

type DivProps = React.ComponentPropsWithoutRef<"div">;

/** Scroll container that registers itself as the dedup viewport (ref fires when the node mounts). */
export function VoiceDedupScrollRoot({
  scrollRef,
  children,
  ...rest
}: DivProps & { scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const dedup = useVoiceVisualDedup();
  return (
    <div
      {...rest}
      ref={(el) => {
        if (scrollRef) scrollRef.current = el;
        dedup?.setScrollRoot(el);
      }}
    >
      {children}
    </div>
  );
}

/** Mounts a wrapper that registers visibility for dedup; unmount when show is false. */
export function VoiceDedupVisualHost({
  kind,
  messageIndex,
  show,
  children,
}: {
  kind: VoiceDedupKind;
  messageIndex: number;
  show: boolean;
  children: React.ReactNode;
}) {
  const dedup = useVoiceVisualDedup();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!dedup || messageIndex < 0) return;
    if (!show) {
      dedup.register(messageIndex, kind, null);
      return;
    }
    dedup.register(messageIndex, kind, wrapRef.current);
    return () => dedup.register(messageIndex, kind, null);
  }, [dedup, messageIndex, kind, show]);
  if (!show) return null;
  return (
    <div ref={wrapRef} className="w-full min-w-0">
      {children}
    </div>
  );
}
