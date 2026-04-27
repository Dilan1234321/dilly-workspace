/**
 * sessionCache - module-level in-memory cache + a hook that wraps the
 * mount+focus fetch pattern used across the app.
 *
 * Context: every tab in this app does some variation of
 *
 *   useEffect(() => { fetch(); }, []);
 *   useFocusEffect(useCallback(() => { fetch(); }, [fetch]));
 *
 * Which means a user tapping from the Career Center into Calendar and
 * back triggers a fresh network round-trip every time. That's fine
 * most of the time but during screen-share / screen-recording the
 * frame budget is tight and extra main-thread work from repeated
 * fetches makes the whole app feel sluggish. It also means switching
 * app modes (Holder ↔ Seeker from Settings) feels empty for ~500ms
 * because both variants start from nothing.
 *
 * This module gives each consumer:
 *   - a synchronous value if we've got a cached result (so mode flips
 *     and tab remounts feel instant)
 *   - a background revalidation if the cache is older than the TTL
 *   - a manual refresh() for pull-to-refresh that bypasses the cache
 *
 * The cache lives on the JS module so it survives component unmounts
 * but dies at app-process exit, which matches what we want - no stale
 * data across app launches.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

type Entry<T> = { value: T; ts: number };
const _cache: Map<string, Entry<unknown>> = new Map();

export function getCached<T = unknown>(key: string): T | undefined {
  return _cache.get(key)?.value as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  _cache.set(key, { value, ts: Date.now() });
}

export function invalidate(key: string): void {
  _cache.delete(key);
}

export function invalidatePrefix(prefix: string): void {
  for (const k of Array.from(_cache.keys())) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

export function clearAll(): void {
  _cache.clear();
}

export function isStale(key: string, ttlMs: number): boolean {
  const e = _cache.get(key);
  if (!e) return true;
  return Date.now() - e.ts > ttlMs;
}

type UseCachedFetchOpts<T> = {
  /** How long a cached value is considered fresh. Stale values are
   *  still returned instantly; a background revalidation runs. */
  ttlMs?: number;
  /** When true, treat cache absence (no entry at all) as "wait for
   *  the first fetch" - the returned `data` stays undefined until
   *  the fetch resolves. Defaults to true. */
  waitForFirstFetch?: boolean;
  /** Parse a raw fetch result into the cached shape. Runs BEFORE the
   *  value is stored, so the cache holds parsed data. */
  parse?: (raw: any) => T | null;
};

export type UseCachedFetchResult<T> = {
  data: T | undefined;
  loading: boolean;          // true while the first fetch for this mount is in-flight
  refreshing: boolean;       // true while a manual refresh() is in-flight
  refresh: () => Promise<void>;
};

/**
 * Wraps a fetcher with module-level caching. Pattern:
 *
 *   const { data, loading, refreshing, refresh } = useCachedFetch(
 *     'holder:career-dashboard',
 *     () => dilly.fetch('/holder/career-dashboard').then(r => r.ok ? r.json() : null),
 *     { ttlMs: 60_000 }
 *   );
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T | null | undefined>,
  opts: UseCachedFetchOpts<T> = {},
): UseCachedFetchResult<T> {
  const { ttlMs = 60_000, waitForFirstFetch = true, parse } = opts;

  const [, forceRender] = useState(0);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const refreshingRef = useRef(false);
  const firstFetchDoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = useCallback(async (manual: boolean) => {
    if (inFlightRef.current && !manual) return;
    inFlightRef.current = true;
    if (manual) refreshingRef.current = true;
    try {
      const raw = await fetcher();
      const parsed = parse ? parse(raw) : (raw as T | null | undefined);
      if (parsed !== null && parsed !== undefined) {
        setCached<T>(key, parsed);
      }
    } catch {
      // Keep any previously-cached value; don't blow away on transient failures.
    } finally {
      inFlightRef.current = false;
      firstFetchDoneRef.current = true;
      if (manual) refreshingRef.current = false;
      if (mountedRef.current) forceRender(n => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // On mount: if we have a cached value, show it. If it's stale (or
  // missing), kick off a background fetch.
  useEffect(() => {
    const hasCached = _cache.has(key);
    if (!hasCached || isStale(key, ttlMs)) {
      run(false);
    } else {
      firstFetchDoneRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = useCallback(async () => { await run(true); }, [run]);

  const cached = getCached<T>(key);
  const hasCached = cached !== undefined;

  return {
    data: cached,
    loading: waitForFirstFetch
      ? (!hasCached && !firstFetchDoneRef.current)
      : (!hasCached && inFlightRef.current),
    refreshing: refreshingRef.current,
    refresh,
  };
}
