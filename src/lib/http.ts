import { PUBLIC_API_BASE_URL, PUBLIC_API_TIMEOUT_MS } from 'astro:env/client';
import { ApiError, parseProblem } from './problem.ts';
import { buildQuery, type QueryParams } from './query.ts';

/**
 * The single fetch chokepoint for the whole app.
 *
 * Responsibilities:
 *  - resolve URLs against the validated `astro:env` base URL;
 *  - attach `Authorization: Bearer …` when the call is authenticated;
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
  /** Current access token, or `null` when signed out. */
  readonly getAccessToken: () => string | null;
  /**
   * Performs a single, serialized token refresh. Resolves `true` when a new
   * access token is available. Must be idempotent under concurrency — parallel
   * refreshes revoke each other server-side.
   */
  readonly refresh: () => Promise<boolean>;
  /** Called when an authenticated request is definitively rejected. */
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
  /** Send the bearer token and enable the refresh-and-replay dance. */
  readonly auth?: boolean;
  /** Caller cancellation (component unmount, superseded search, …). */
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
 * yet — the timeout signal remains composed in and still bounds the body read.
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
      // Abandoned before the response arrived: cancel the in-flight request.
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
      // The API is token-based; cookies are never part of the flow.
      credentials: 'omit',
      mode: 'cors',
    });
    // The body still has to be read after this function returns.
    scope.settle();
    return response;
  } catch (cause) {
    throw ApiError.network(cause);
  }
}

/**
 * Executes a request, refreshing and replaying **once** on a 401.
 * Always returns a response with a 2xx status; anything else throws `ApiError`.
 */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const url = resolveUrl(path, options.query);

  let response = await attempt(url, options);

  if (response.status === 401 && options.auth) {
    // Drain the body so the connection can be reused before we retry.
    await response.body?.cancel().catch(() => undefined);

    const refreshed = (await authHooks?.refresh()) ?? false;
    if (!refreshed) {
      authHooks?.onAuthFailure();
      throw new ApiError(401, {
        title: 'Unauthorized',
        status: 401,
        detail: 'Your session has expired. Please sign in again.',
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

/** A request whose 2xx body is JSON. */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  return (await response.json()) as T;
}

/** A `204 No Content` request. Any body is discarded. */
export async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await apiFetch(path, options);
  await response.body?.cancel().catch(() => undefined);
}

export interface CreatedResource<T> {
  readonly data: T;
  /**
   * The `Location` header. Readable cross-origin because the backend lists it
   * in `exposedHeaders`.
   */
  readonly location: string | null;
}

/** A `201 Created` request, exposing the `Location` header alongside the body. */
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
