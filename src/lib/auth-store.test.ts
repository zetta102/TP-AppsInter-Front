import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './http.ts';
import { clearSession, getAuthState, login, refreshTokens } from './auth-store.ts';
import { ApiError } from './problem.ts';

/**
 * Cubre las invariantes de sesión de backend-status-for-frontend.md §7.1:
 * un solo refresh en vuelo, refresh solo ante `TOKEN_EXPIRED` y lecturas públicas que
 * envían el token sin refrescar nunca.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const authResponse = (n: number) => ({
  token: `access-${n}`,
  tokenType: 'Bearer',
  expiresAt: '2099-01-01T00:00:00Z',
  refreshToken: `refresh-${n}`,
  refreshExpiresAt: '2099-01-01T00:00:00Z',
});

const user = { uuid: 'u1', firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com', role: 'CUSTOMER' };

type Route = (request: Request) => Response | Promise<Response>;

function installFetch(routes: Record<string, Route>) {
  const calls: Request[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    const route = routes[`${request.method} ${new URL(request.url).pathname}`];
    if (!route) throw new Error(`Ruta no esperada: ${request.method} ${request.url}`);
    return route(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

async function signIn() {
  installFetch({
    'POST /api/auth/login': () => json(200, authResponse(1)),
    'GET /api/users/me': () => json(200, user),
  });
  await login({ email: 'ana@x.com', password: 'secret123' });
}

beforeEach(async () => {
  await signIn();
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('refreshTokens', () => {
  it('serializa refreshes concurrentes en una sola rotación', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const calls = installFetch({
      'POST /api/auth/refresh': async () => {
        await gate;
        return json(200, authResponse(2));
      },
    });

    const results = Promise.all([refreshTokens(), refreshTokens(), refreshTokens()]);
    release();

    expect(await results).toEqual([true, true, true]);
    expect(calls.filter((c) => c.url.endsWith('/api/auth/refresh'))).toHaveLength(1);
    expect(getAuthState().tokens?.token).toBe('access-2');
    expect(getAuthState().tokens?.refreshToken).toBe('refresh-2');
  });

  it('libera el mutex tras un fallo, para que el próximo 401 vuelva a intentar', async () => {
    const calls = installFetch({
      'POST /api/auth/refresh': () => json(401, { status: 401, code: 'TOKEN_REVOKED' }),
    });
    expect(await refreshTokens()).toBe(false);
    expect(await refreshTokens()).toBe(false);
    expect(calls).toHaveLength(2);
  });
});

describe('apiFetch con auth: true', () => {
  it('ante 401 TOKEN_EXPIRED refresca una vez y repite con el token nuevo', async () => {
    let attempts = 0;
    const calls = installFetch({
      'GET /api/reservations': (request) => {
        attempts++;
        return request.headers.get('Authorization') === 'Bearer access-2'
          ? json(200, { ok: true })
          : json(401, { status: 401, code: 'TOKEN_EXPIRED' });
      },
      'POST /api/auth/refresh': () => json(200, authResponse(2)),
    });

    const response = await apiFetch('/api/reservations', { auth: true });
    expect(await response.json()).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/reservations',
      '/api/auth/refresh',
      '/api/reservations',
    ]);
  });

  it('ante otro 401 no refresca y cierra la sesión', async () => {
    const calls = installFetch({
      'GET /api/reservations': () => json(401, { status: 401, code: 'INVALID_CREDENTIALS' }),
    });

    const failure = apiFetch('/api/reservations', { auth: true });
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await failure.catch((error: ApiError) => expect(error.code).toBe('INVALID_CREDENTIALS'));
    expect(calls).toHaveLength(1);
    expect(getAuthState().tokens).toBeNull();
  });
});

describe("apiFetch con auth: 'optional'", () => {
  it('envía el token si hay sesión, sin refrescar ni cerrar sesión ante un 401', async () => {
    const calls = installFetch({
      'GET /api/screenings/s1/seats': () => json(401, { status: 401, code: 'TOKEN_EXPIRED' }),
    });

    await expect(apiFetch('/api/screenings/s1/seats', { auth: 'optional' })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer access-1');
    expect(getAuthState().tokens?.token).toBe('access-1');
  });
});
