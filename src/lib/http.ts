import { PUBLIC_API_BASE_URL, PUBLIC_API_TIMEOUT_MS } from 'astro:env/client';
import { ApiError, parseProblem } from './problem.ts';
import { buildQuery, type QueryParams } from './query.ts';

/**
 * El único punto de salida de `fetch` de toda la app.
 *
 * Responsabilidades:
 *  - resolver URLs contra la base validada por `astro:env`;
 *  - adjuntar `Authorization: Bearer …` cuando la llamada lo requiere;
 *  - acotar cada solicitud con `AbortSignal.timeout()`, combinada con la señal
 *    del llamador mediante `AbortSignal.any()`;
 *  - traducir respuestas no-2xx a `ApiError` a partir del body problem+json;
 *  - ante un `401 TOKEN_EXPIRED`, ejecutar el hook de refresh **una vez** y repetir
 *    la solicitud (backend-status-for-frontend.md §7.1).
 *
 * Los hooks de auth los inyecta `auth-store.ts`, para que este módulo no tenga una
 * dependencia circular con el store.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * - `true`: ruta protegida. Envía el token y habilita el flujo de refrescar y reintentar.
 * - `'optional'`: ruta pública que se personaliza con sesión (p. ej. disponibilidad de
 *   asientos, que no descuenta las retenciones propias). Envía el token si existe; un
 *   token vencido se ignora del lado del servidor, así que nunca refresca ni redirige.
 * - `false` / omitido: nunca envía el token.
 */
export type AuthMode = boolean | 'optional';

export interface AuthHooks {
  /** Token de acceso actual, o `null` cuando no hay sesión. */
  readonly getAccessToken: () => string | null;
  /**
   * Realiza un único refresh de token serializado. Resuelve `true` cuando hay un
   * access token nuevo disponible. Debe ser idempotente ante concurrencia: los
   * refreshes paralelos se revocan entre sí del lado del servidor.
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
  readonly auth?: AuthMode;
  /** Cancelación del llamador (desmontaje del componente, búsqueda reemplazada, …). */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Agrupa un `AbortSignal` por intento con limpieza determinista.
 * `Symbol.dispose` permite acotarlo con `using`.
 *
 * El controller solo se dispara si el scope termina **antes** de que el intento
 * se resuelva. `fetch` resuelve apenas llegan los headers, así que abortar después
 * de una respuesta exitosa cortaría el stream del body que el llamador todavía no
 * leyó; la señal de timeout sigue combinada y acota igualmente la lectura del body.
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
 * Ejecuta una solicitud y, en rutas protegidas, refresca y repite **una sola vez**
 * ante un `401 TOKEN_EXPIRED`. Cualquier otro `401` (token inválido o revocado) cierra
 * la sesión sin reintentar. Siempre devuelve una respuesta 2xx; cualquier otra cosa
 * lanza `ApiError`.
 */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const url = resolveUrl(path, options.query);

  let response = await attempt(url, options);

  if (response.status === 401 && options.auth === true) {
    const problem = await parseProblem(response);

    // Un backend anterior podía omitir `code`; en ese caso se intenta el refresh igual.
    const expired = problem?.code === undefined || problem.code === 'TOKEN_EXPIRED';
    const refreshed = expired && ((await authHooks?.refresh()) ?? false);
    if (!refreshed) {
      authHooks?.onAuthFailure();
      throw new ApiError(401, problem);
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

/**
 * Abre un stream `text/event-stream` (backend-status-for-frontend.md §7.6). Envía el token si
 * hay sesión (`auth: 'optional'`): `EventSource` no puede mandar `Authorization`, por eso se usa
 * `fetch`. El timeout cubre solo la conexión (hasta los headers); el body vive hasta que el
 * servidor lo cierre o se aborte `signal`. Lanza `ApiError` ante un estado no 2xx.
 */
export async function openStream(
  path: string,
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<Response> {
  const headers = new Headers({ Accept: 'text/event-stream' });
  const token = authHooks?.getAccessToken() ?? null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const connect = new AbortController();
  const timer = setTimeout(
    () => connect.abort(new DOMException('Timeout', 'TimeoutError')),
    options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS,
  );
  const signals = options.signal ? [connect.signal, options.signal] : [connect.signal];

  let response: Response;
  try {
    response = await fetch(resolveUrl(path, undefined), {
      headers,
      signal: AbortSignal.any(signals),
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
    });
  } catch (cause) {
    throw ApiError.network(cause);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok || !response.body) {
    throw new ApiError(response.status, await parseProblem(response));
  }
  return response;
}

export { PUBLIC_API_BASE_URL as apiBaseUrl };
