import { useCallback, useEffect, useEffectEvent, useState, useTransition } from 'react';

/**
 * Un hook chico de recursos asíncronos para el lado de lectura de la app.
 *
 * Existe porque cada vista de lista y de detalle necesita las mismas tres cosas: un
 * `AbortSignal` atado a la vida del componente, un handle de refetch (ante un `409`
 * siempre hay que "recargar y dejar reintentar"), y una máquina de estados que nunca
 * queda en un éxito desactualizado después de un error.
 */

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

export interface Resource<T> {
  readonly data: T | null;
  readonly error: unknown;
  readonly status: ResourceStatus;
  readonly isLoading: boolean;
  /** `true` mientras corre un refetch sobre datos que ya están en pantalla. */
  readonly isRefreshing: boolean;
  /** Vuelve a ejecutar el fetcher. Es seguro llamarlo desde event handlers. */
  readonly refetch: () => void;
  /** Reemplaza el valor cacheado sin ir al servidor (actualizaciones optimistas). */
  readonly setData: (updater: T | ((current: T | null) => T | null)) => void;
}

export type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * @param fetcher loader; siempre se usa su versión más reciente, sin re-disparar el efecto
 * @param deps    valores que identifican la solicitud (ids, filtros, página)
 * @param options `enabled: false` difiere la carga (p. ej. hasta que la sesión esté lista)
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

  // Effect Events (React 19.2+): leen el fetcher y los datos más recientes sin ser
  // dependencias del efecto, en lugar de escribir una ref durante el render.
  const runFetcher = useEffectEvent((signal: AbortSignal) => fetcher(signal));
  const markLoading = useEffectEvent(() => {
    // Un refetch sobre datos visibles no vuelve a mostrar el spinner de carga completa.
    if (data === null) setStatus('loading');
  });

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    markLoading();

    void (async () => {
      try {
        const result = await runFetcher(controller.signal);
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
    // `deps` es la API del hook: el llamador declara qué identifica a la solicitud.
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
