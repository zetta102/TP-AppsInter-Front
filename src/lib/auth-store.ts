import { navigate } from 'astro:transitions/client';
import { ApiError } from './problem.ts';
import { apiFetch, registerAuthHooks, requestJson } from './http.ts';
import type { AuthTokens, LoginRequest, RegisterRequest, User } from './types.ts';
import { Role } from './enums.ts';

/**
 * El único propietario de ambos tokens, el mutex de refresh y el perfil de
 * `/api/users/me` (backend-status-for-frontend.md §7.1).
 *
 * Los tokens viven en memoria con un espejo en `localStorage` para sobrevivir a una recarga.
 * No existe flujo de cookies ni de CSRF.
 *
 * La invariante crítica: **el refresh se serializa detrás de una única promesa en vuelo**.
 * La rotación revoca el refresh token consumido, así que dos refreshes en paralelo cierran
 * la sesión del usuario. Es un comportamiento verificado del backend, no una carrera que
 * podamos ignorar.
 */

const STORAGE_KEY = 'cine.auth.tokens';

export interface AuthState {
  readonly tokens: AuthTokens | null;
  readonly user: User | null;
  /** Permanece en false hasta que el store lea `localStorage` y resuelva el perfil. */
  readonly ready: boolean;
}

type Listener = (state: AuthState) => void;

const isBrowser = typeof window !== 'undefined';

let state: AuthState = { tokens: null, user: null, ready: !isBrowser };
const listeners = new Set<Listener>();

function setState(next: Partial<AuthState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

function isTokens(value: unknown): value is AuthTokens {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AuthTokens>;
  return typeof candidate.token === 'string' && typeof candidate.refreshToken === 'string';
}

function readStoredTokens(): AuthTokens | null {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isTokens(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredTokens(tokens: AuthTokens | null): void {
  if (!isBrowser) return;
  try {
    if (tokens) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Los fallos de cuota en navegación privada no deben romper el inicio de sesión;
    // la copia en memoria sigue funcionando para esta pestaña.
  }
}

/** Copia solo los campos conocidos: lo que se persiste en `localStorage` no depende de extras del servidor. */
function pickTokens(response: AuthTokens): AuthTokens {
  return {
    token: response.token,
    tokenType: response.tokenType,
    expiresAt: response.expiresAt,
    refreshToken: response.refreshToken,
    refreshExpiresAt: response.refreshExpiresAt,
  };
}

function applyTokens(tokens: AuthTokens | null): void {
  writeStoredTokens(tokens);
  setState({ tokens });
}

// ---------------------------------------------------------------------------
// Mutex de refresh
// ---------------------------------------------------------------------------

let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Refresca el par de tokens como máximo una vez por vez. Cada llamada concurrente
 * espera la misma promesa, así que el backend solo ve una rotación.
 */
export function refreshTokens(): Promise<boolean> {
  if (inFlightRefresh) return inFlightRefresh;

  const { promise, resolve } = Promise.withResolvers<boolean>();
  inFlightRefresh = promise;

  void (async () => {
    try {
      const current = state.tokens ?? readStoredTokens();
      if (!current?.refreshToken) {
        resolve(false);
        return;
      }

      const next = await requestJson<AuthTokens>('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: current.refreshToken },
      });
      // Reemplaza *ambos* tokens: el refresh token consumido ya quedó revocado.
      applyTokens(pickTokens(next));
      resolve(true);
    } catch {
      resolve(false);
    } finally {
      // Siempre debe limpiarse; si no, el mutex queda trabado y cada 401 posterior
      // cierra la sesión sin volver a llamar a /api/auth/refresh.
      inFlightRefresh = null;
    }
  })();

  return promise;
}

// ---------------------------------------------------------------------------
// Ciclo de vida de la sesión
// ---------------------------------------------------------------------------

/** Adónde enviar al usuario después de un cierre de sesión forzado. */
function redirectToLogin(): void {
  if (!isBrowser) return;
  const { pathname, search } = window.location;
  if (pathname === '/login' || pathname === '/register') return;
  const next = encodeURIComponent(`${pathname}${search}`);
  void navigate(`/login?next=${next}`);
}

/** Limpia todo rastro de la sesión sin llamar a la API. */
export function clearSession(): void {
  applyTokens(null);
  setState({ user: null });
}

/** Aplica un perfil recién actualizado sin hacer un viaje de ida y vuelta por `fetchProfile`. */
export function setUser(user: User): void {
  setState({ user });
}

export async function fetchProfile(): Promise<User | null> {
  try {
    const user = await requestJson<User>('/api/users/me', { auth: true });
    setState({ user });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearSession();
    return null;
  }
}

export async function login(credentials: LoginRequest): Promise<User> {
  const response = await requestJson<AuthTokens>('/api/auth/login', {
    method: 'POST',
    body: credentials,
  });
  applyTokens(pickTokens(response));

  const user = await fetchProfile();
  if (!user) {
    clearSession();
    throw new ApiError(401, {
      title: 'No autorizado',
      status: 401,
      detail: 'No se pudo cargar el perfil tras iniciar sesión.',
      code: 'INVALID_CREDENTIALS',
    });
  }
  return user;
}

/** El registro siempre crea un `CUSTOMER`; no existe alta de admin de autoservicio. */
export async function register(payload: RegisterRequest): Promise<void> {
  await apiFetch('/api/auth/register', { method: 'POST', body: payload });
}

/** Revocar un token desconocido o ya revocado es un no-op silencioso del lado del servidor. */
export async function logout(): Promise<void> {
  const refreshToken = state.tokens?.refreshToken;
  try {
    if (refreshToken) {
      await apiFetch('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    }
  } catch {
    // Un revoke fallido nunca debe dejar al usuario atrapado en una interfaz con sesión iniciada.
  } finally {
    clearSession();
  }
}

/**
 * Restaura una sesión desde `localStorage` en la primera carga y resuelve el
 * perfil. Es seguro llamarla varias veces; solo la primera hace trabajo real.
 */
let initialization: Promise<AuthState> | null = null;

export function initAuth(): Promise<AuthState> {
  if (!isBrowser) return Promise.resolve(state);
  if (initialization) return initialization;

  initialization = (async () => {
    const stored = readStoredTokens();
    if (!stored) {
      setState({ ready: true });
      return state;
    }

    setState({ tokens: stored });
    await fetchProfile();
    setState({ ready: true });
    return state;
  })();

  return initialization;
}

// ---------------------------------------------------------------------------
// Helpers derivados
// ---------------------------------------------------------------------------

export function isAuthenticated(): boolean {
  return state.tokens !== null;
}

export function isAdmin(): boolean {
  // Las decisiones de autorización vienen de `/api/users/me`, nunca de decodificar el JWT.
  return state.user?.role === Role.ADMIN;
}

// Conecta el store con la capa HTTP. Registrarlo en el scope del módulo garantiza que
// cualquier módulo que llegue a la red ya tenga instalados los hooks.
registerAuthHooks({
  getAccessToken: () => state.tokens?.token ?? null,
  refresh: refreshTokens,
  onAuthFailure: () => {
    clearSession();
    redirectToLogin();
  },
});

// Mantiene sincronizadas las pestañas: un cierre de sesión o refresh en una pestaña se aplica a todas.
if (isBrowser) {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const stored = readStoredTokens();
    setState({ tokens: stored });
    if (!stored) setState({ user: null });
    else void fetchProfile();
  });
}
