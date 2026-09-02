import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

/**
 * A small async-resource hook for the read side of the app.
 *
 * It exists because every list and detail view needs the same three things: an
 * `AbortSignal` tied to the component's lifetime, a refetch handle (the spec
 * demands "refetch and let the user retry" on every `409`), and a state machine
 * that never lands in a stale-success state after an error.
 */

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

export interface Resource<T> {
  readonly data: T | null;
  readonly error: unknown;
  readonly status: ResourceStatus;
  readonly isLoading: boolean;
  /** True while a refetch runs over data that is already on screen. */
  readonly isRefreshing: boolean;
  /** Re-runs the fetcher. Safe to call from event handlers. */
  readonly refetch: () => void;
  /** Replaces the cached value without a round-trip (optimistic updates). */
  readonly setData: (updater: T | ((current: T | null) => T | null)) => void;
}

export type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * @param fetcher stable-by-convention loader; re-runs whenever `deps` change
 * @param deps    values that identify the request (ids, filters, page)
 * @param options `enabled: false` defers the fetch (e.g. until auth is ready)
 */
export function useResource<T>(
  fetcher: Fetcher<T>,
  deps: readonly unknown[],
  options: { readonly enabled?: boolean } = {},
): Resource<T> {
  const { enabled = true } = options;

  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<ResourceStatus>(enabled ? 'loading' : 'idle');
  const [nonce, setNonce] = useState(0);
  const [isRefreshing, startRefresh] = useTransition();

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const hasData = data !== null;

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    if (!hasData) setStatus('loading');

    void (async () => {
      try {
        const result = await fetcherRef.current(controller.signal);
        if (cancelled) return;
        setDataState(result);
        setError(null);
        setStatus('success');
      } catch (caught) {
        if (cancelled || isAbort(caught)) return;
        setError(caught);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const refetch = useCallback(() => {
    startRefresh(() => {
      setNonce((value) => value + 1);
    });
  }, []);

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setDataState((current) =>
      typeof updater === 'function' ? (updater as (c: T | null) => T | null)(current) : updater,
    );
  }, []);

  return {
    data,
    error,
    status,
    isLoading: status === 'loading',
    isRefreshing,
    refetch,
    setData,
  };
}
