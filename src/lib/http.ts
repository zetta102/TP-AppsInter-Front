import { PUBLIC_API_BASE_URL, PUBLIC_API_TIMEOUT_MS } from 'astro:env/client';
import { ApiError, parseProblem } from './problem.ts';
import { buildQuery, type QueryParams } from './query.ts';

/**
 * The single fetch chokepoint for the whole app.
 *
 * Responsibilities:
 *  - resolve URLs against the validated `astro:env` base URL;
 *  - attach `Authorization: Bearer â€¦` when the call is authenticated;
 *  - bound every request with `AbortSignal.timeout()`, composed with any
 *    caller-supplied signal via `AbortSignal.any()`;
 *  - translate non-2xx responses into `ApiError` from the problem+json body;
 *  - on a 401, run the registered refresh hook **once** and replay the request.
 *
 * The auth hooks are injected by `auth-store.ts` so that this module stays free
 * of a circular dependency on the store.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AuthHooks {
  /** Token de acceso actual, o `null` cuando no hay sesión. */
  readonly getAccessToken: () => string | null;
  /**
   * Realiza un único refresh de token serializado. Resuelve `true` cuando hay
   * access token is available. Must be idempotent under concurrency â€” parallel
   * los refreshes paralelos se revocan entre sí del lado del servidor.
   */
  readonly refresh: () => Promise<boolean>;
  /** Se llama cuando una solicitud autenticada queda rechazada de forma definitiva. */
  readonly onAuthFailure: () => void;
}

let authHooks: AuthHooks | null = null;

export function registerAuthHooks(hooks: AuthHooks): void {
  authHooks = hooks;
}

export interface RequestOptions {
  readonly method?: HttpMethod;
  readonly query?: QueryParams;
  readonly body?: unknown;
  /** Envía el bearer token y habilita el flujo de refrescar y reintentar. */
  readonly auth?: boolean;
  /** Caller cancellation (component unmount, superseded search, â€¦). */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Bundles a per-attempt `AbortSignal` with deterministic cleanup.
 * `Symbol.dispose` lets callers scope it with `using`.
 *
 * The controller is only fired if the scope exits **before** the attempt
 * settles. `fetch` resolves as soon as the headers arrive, so aborting after a
 * successful response would tear down the body stream the caller has not read
 * yet â€” the timeout signal remains composed in and still bounds the body read.
 */
function requestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { readonly signal: AbortSignal; settle(): void; [Symbol.dispose](): void } {
  const controller = new AbortController();
  const signals: AbortSignal[] = [controller.signal, AbortSignal.timeout(timeoutMs)];
  if (callerSignal) signals.push(callerSignal);

  let settled = false;

  return {
    signal: AbortSignal.any(signals),
    settle() {
      settled = true;
    },
    [Symbol.dispose]() {
      // Se abandonó antes de que llegara la respuesta: cancela la solicitud en vuelo.
      if (!settled && !controller.signal.aborted) controller.abort();
    },
  };
}

function resolveUrl(path: string, query: QueryParams | undefined): string {
  const base = PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}${buildQuery(query)}`;
}

async function attempt(url: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, auth = false, signal, timeoutMs, headers } = options;

  const requestHeaders = new Headers({ Accept: 'application/json', ...headers });
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');

  if (auth) {
    const token = authHooks?.getAccessToken() ?? null;
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  using scope = requestSignal(signal, timeoutMs ?? PUBLIC_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: scope.signal,
      // La API se basa en tokens; las cookies nunca forman parte del flujo.
      credentials: 'omit',
      mode: 'cors',
    });
    // El body todavía debe leerse después de que esta función retorne.
    scope.settle();
    return response;
  } catch (cause) {
    throw ApiError.network(cause);
  }
}

/**
 * Ejecuta una solicitud, refrescando y repitiendo **una sola vez** ante un 401.
 * Siempre devuelve una respuesta con estado 2xx; cualquier otra cosa lanza `ApiError`.
 */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const url = resolveUrl(path, options.query);

  let response = await attempt(url, options);

  if (response.status === 401 && options.auth) {
    // Descarta el body para que la conexión pueda reutilizarse antes de reintentar.
    await response.body?.cancel().catch(() => undefined);

    const refreshed = (await authHooks?.refresh()) ?? false;
    if (!refreshed) {
      authHooks?.onAuthFailure();
      throw new ApiError(401, {
        title: 'No autorizado',
        status: 401,
        detail: 'Tu sesión expiró. Inicia sesión nuevamente.',
      });
    }

    response = await attempt(url, options);

    if (response.status === 401) {
      authHooks?.onAuthFailure();
      throw new ApiError(401, await parseProblem(response));
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseProblem(response));
  }

  return response;
}

/** Una solicitud cuyo body 2xx es JSON. */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  return (await response.json()) as T;
}

/** Una solicitud `204 No Content`. Cualquier body se descarta. */
export async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await apiFetch(path, options);
  await response.body?.cancel().catch(() => undefined);
}

export interface CreatedResource<T> {
  readonly data: T;
  /**
   * El header `Location`. Es legible entre orígenes porque el backend lo incluye
   * en `exposedHeaders`.
   */
  readonly location: string | null;
}

/** Una solicitud `201 Created` que expone el header `Location` junto al body. */
export async function requestCreated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<CreatedResource<T>> {
  const response = await apiFetch(path, { method: 'POST', ...options });
  return {
    data: (await response.json()) as T,
    location: response.headers.get('Location'),
  };
}

export { PUBLIC_API_BASE_URL as apiBaseUrl };

