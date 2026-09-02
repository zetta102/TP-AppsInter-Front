import { ApiError } from './problem.ts';
import { apiFetch, registerAuthHooks, requestJson } from './http.ts';
import type { AuthResponse, LoginRequest, RegisterRequest, UserResponse } from './types.ts';
import { Role } from './enums.ts';

/**
 * The single owner of both tokens, the refresh mutex and the `/api/users/me`
 * profile (frontend-spec.md §3).
 *
 * Tokens live in memory with a `localStorage` mirror so a reload survives.
 * There is no cookie or CSRF flow.
 *
 * The critical invariant: **refresh is serialized behind one in-flight
 * promise**. Rotation revokes the consumed refresh token, so two parallel
 * refreshes log the user out. This is verified backend behaviour, not a race we
 * may ignore.
 */

const STORAGE_KEY = 'cine.auth.tokens';

export interface AuthTokens {
  readonly token: string;
  readonly tokenType: string;
  readonly expiresAt: string;
  readonly refreshToken: string;
  readonly refreshExpiresAt: string;
}

export interface AuthState {
  readonly tokens: AuthTokens | null;
  readonly user: UserResponse | null;
  /** False until the store has read `localStorage` and resolved the profile. */
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
// Persistence
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
    // Private-browsing quota failures must not break sign-in; the in-memory
    // copy still works for this tab.
  }
}

function fromAuthResponse(response: AuthResponse): AuthTokens {
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
// Refresh mutex
// ---------------------------------------------------------------------------

let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Refreshes the token pair at most once at a time. Every concurrent caller
 * awaits the same promise, so the backend only ever sees one rotation.
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

      const next = await requestJson<AuthResponse>('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: current.refreshToken },
      });
      // Replace *both* tokens: the consumed refresh token is already revoked.
      applyTokens(fromAuthResponse(next));
      resolve(true);
    } catch {
      resolve(false);
    } finally {
      // Must always clear, or the mutex latches and every later 401 signs the
      // user out without ever calling /api/auth/refresh.
      inFlightRefresh = null;
    }
  })();

  return promise;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Where to send the user after a forced sign-out. */
function redirectToLogin(): void {
  if (!isBrowser) return;
  const { pathname, search } = window.location;
  if (pathname === '/login' || pathname === '/register') return;
  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`/login?next=${next}`);
}

/** Clears every trace of the session without calling the API. */
export function clearSession(): void {
  applyTokens(null);
  setState({ user: null });
}

export async function fetchProfile(): Promise<UserResponse | null> {
  try {
    const user = await requestJson<UserResponse>('/api/users/me', { auth: true });
    setState({ user });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearSession();
    return null;
  }
}

export async function login(credentials: LoginRequest): Promise<UserResponse> {
  const response = await requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: credentials,
  });
  applyTokens(fromAuthResponse(response));

  const user = await fetchProfile();
  if (!user) {
    clearSession();
    throw new ApiError(401, { title: 'Unauthorized', status: 401, detail: 'Invalid credentials' });
  }
  return user;
}

/** Registration always creates a `CUSTOMER`; there is no self-service admin signup. */
export async function register(payload: RegisterRequest): Promise<void> {
  await apiFetch('/api/auth/register', { method: 'POST', body: payload });
}

/** Revoking an unknown or already-revoked token is a silent no-op server-side. */
export async function logout(): Promise<void> {
  const refreshToken = state.tokens?.refreshToken;
  try {
    if (refreshToken) {
      await apiFetch('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    }
  } catch {
    // A failed revoke must never trap the user in a signed-in shell.
  } finally {
    clearSession();
  }
}

/**
 * Restores a session from `localStorage` on first load and resolves the
 * profile. Safe to call repeatedly; only the first call does work.
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
// Derived helpers
// ---------------------------------------------------------------------------

export function isAuthenticated(): boolean {
  return state.tokens !== null;
}

export function isAdmin(): boolean {
  // Authorization decisions come from `/api/users/me`, never from decoding the JWT.
  return state.user?.role === Role.ADMIN;
}

// Wire the store into the HTTP layer. Registering at module scope means any
// module that reaches the network has already installed the hooks.
registerAuthHooks({
  getAccessToken: () => state.tokens?.token ?? null,
  refresh: refreshTokens,
  onAuthFailure: () => {
    clearSession();
    redirectToLogin();
  },
});

// Keep tabs in sync: a sign-out or refresh in one tab applies to all of them.
if (isBrowser) {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const stored = readStoredTokens();
    setState({ tokens: stored });
    if (!stored) setState({ user: null });
    else void fetchProfile();
  });
}
