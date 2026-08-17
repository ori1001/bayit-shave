import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Last-known data for each screen, kept for the life of the process.
 *
 * Navigating to a screen mounts it from scratch, so without this every tab tap
 * started from nothing: skeleton, two or three round trips, then content. The
 * app holds a few dozen rows in total, so there is no reason for a screen you
 * have already seen to show a loading state ever again -- it paints its last
 * data on the same frame as the tap and reconciles in the background.
 */
const cache = new Map<string, unknown>();

/** Dropped on sign-out, so the next account never sees the previous one's data. */
export function clearScreenData(): void {
  cache.clear();
}

/** Fills a key before anything asks for it. Used by the tab prefetch. */
export function primeScreenData<T>(key: string, value: T): void {
  cache.set(key, value);
}

/** Reads a key without subscribing. Exists so tests can prove a key was warmed. */
export function peekScreenData<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export interface ScreenData<T> {
  /** Undefined only before this key has ever loaded. */
  data: T | undefined;
  /**
   * True when this screen opened straight from cache.
   *
   * Screens use it to skip their entrance animation: content the user has
   * already seen should simply be there when they come back, not re-assemble
   * itself row by row on top of the screen transition.
   */
  fromCache: boolean;
  /** True only on the very first load of a key -- never on a revisit or a refetch. */
  loading: boolean;
  error: string | null;
  /** Refetch in the background, leaving the current data on screen. */
  refresh: () => Promise<void>;
  /** Apply a local change immediately; the cache is updated with it. */
  update: (change: (current: T) => T) => void;
}

/**
 * Read-through cache for a screen's whole payload.
 *
 * `key` identifies the data, not the screen: the calendar keys by month, so
 * paging back to a month you have already opened is instant too.
 */
export function useScreenData<T>(key: string, fetcher: () => Promise<T>): ScreenData<T> {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined);
  const [error, setError] = useState<string | null>(null);
  // Captured once, from the very first render: whether this mount had an answer
  // before it asked. A later refetch must not flip it back on and re-trigger
  // every row's entrance animation under the user.
  const [fromCache] = useState(() => cache.get(key) !== undefined);

  // Held in a ref so a new closure on every render does not re-trigger the
  // fetch; only the key decides when to go back to the network.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // A manual refresh can outlive the screen -- tap an action, navigate away
  // before the request lands -- and would otherwise set state on an unmounted
  // component. Written only in effects, read only in callbacks.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (cacheKey: string, isCurrent: () => boolean) => {
    try {
      const value = await fetcherRef.current();
      if (!isCurrent()) {
        return;
      }
      cache.set(cacheKey, value);
      setData(value);
      setError(null);
    } catch (e) {
      if (isCurrent()) {
        setError(e instanceof Error ? e.message : 'unknown_error');
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Seeding from the cache here rather than in the body keeps this effect
    // free of a synchronous setState, and a key change swaps the data on the
    // same tick as the fetch starts.
    const seed = cache.get(key) as T | undefined;
    if (seed !== undefined) {
      setData(seed);
    }
    setError(null);
    load(key, () => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [key, load]);

  const refresh = useCallback(async () => {
    await load(key, () => mounted.current);
  }, [key, load]);

  const update = useCallback(
    (change: (current: T) => T) => {
      setData((current) => {
        if (current === undefined) {
          return current;
        }
        const next = change(current);
        cache.set(key, next);
        return next;
      });
    },
    [key]
  );

  return { data, fromCache, loading: data === undefined && error === null, error, refresh, update };
}
