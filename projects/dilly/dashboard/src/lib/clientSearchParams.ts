"use client";

import { useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function emit() {
  queueMicrotask(() => listeners.forEach((l) => l()));
}

let historyPatched = false;

function ensureHistoryPatched() {
  if (typeof window === "undefined" || historyPatched) return;
  historyPatched = true;
  window.addEventListener("popstate", emit);
  const { pushState, replaceState } = history;
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    pushState.apply(history, args);
    emit();
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    replaceState.apply(history, args);
    emit();
  };
}

function subscribeSearch(onStoreChange: () => void) {
  ensureHistoryPatched();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSearchSnapshot() {
  return typeof window !== "undefined" ? window.location.search : "";
}

/**
 * URL query as `URLSearchParams` without `useSearchParams()`, which suspends on
 * client navigations and forces the nearest `<Suspense>` fallback (full-screen
 * loaders when leaving e.g. `/leaderboard` for `/`).
 */
export function useClientSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribeSearch, getSearchSnapshot, () => "");
  return useMemo(() => {
    const q = search.startsWith("?") ? search.slice(1) : search;
    return new URLSearchParams(q);
  }, [search]);
}
