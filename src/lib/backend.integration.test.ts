import { afterAll, describe, expect, it } from 'vitest';
import { getMetadataConfig, getMetadataEnums } from './api/metadata.ts';
import { listMovies, listNowShowing, movieSortFields, nowShowingSortFields } from './api/movies.ts';
import { productSortFields } from './api/products.ts';
import { listRooms, roomSortFields } from './api/rooms.ts';
import {
  getScreening,
  getScreeningSeatMap,
  getScreeningWithSeatMap,
  listScreenings,
  screeningSortFields,
} from './api/screenings.ts';
import { createHold } from './api/holds.ts';
import {
  listAllReservations,
  listMyReservations,
  quoteReservation,
  reservationSortFields,
} from './api/reservations.ts';
import {
  changeMyPassword,
  getCurrentUser,
  listUsers,
  updateMyProfile,
  userSortFields,
} from './api/users.ts';
import { adjustmentSortFields, inventorySortFields, listInventory } from './api/inventory.ts';
import { collectAllPages } from './api/shared.ts';
import { getAuthState, login, logout, refreshTokens, register } from './auth-store.ts';
import { ApiError, apiErrorCodes } from './problem.ts';
import { apiBaseUrl, requestJson } from './http.ts';
import { movieGenreValues } from './enums.ts';

/**
 * Pruebas de integración contra el backend real (`PUBLIC_API_BASE_URL`, por defecto
 * http://localhost:8080). Ejercitan la misma capa cliente que usa la UI.
 *
 * Efecto secundario: registran un cliente nuevo y desechable en la base del backend.
 * Ejecutar con `npm run test:integration` con el backend levantado.
 */

const NIL = '00000000-0000-0000-0000-000000000000';
const stamp = Date.now();
const email = `qa.front+${stamp}@example.com`;
const password = 'Contrasena-QA-1';
const newPassword = 'Contrasena-QA-2';

async function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  const error = await promise.then(
    () => {
      throw new Error(`Se esperaba ${status}${code ? ` ${code}` : ''} pero la llamada tuvo éxito`);
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  if (code) expect((error as ApiError).code).toBe(code);
  return error as ApiError;
}

afterAll(async () => {
  await logout();
});

/** Las listas blancas del cliente, por ruta, frente a `x-sort-properties` de OpenAPI. */
const clientSortFields: Record<string, readonly string[]> = {
  '/api/movies': movieSortFields,
  '/api/movies/now-showing': nowShowingSortFields,
  '/api/rooms': roomSortFields,
  '/api/screenings': screeningSortFields,
  '/api/products': productSortFields,
  '/api/inventory': inventorySortFields,
  '/api/inventory/{uuid}/adjustments': adjustmentSortFields,
  '/api/reservations': reservationSortFields,
  '/api/reservations/all': reservationSortFields,
  '/api/users': userSortFields,
};
/** Alias que el servidor acepta y el cliente no necesita usar. */
const SORT_ALIASES = new Set(['screeningStartsAt']);

interface OpenApiDoc {
  readonly paths: Record<string, Record<string, { parameters?: { name: string; schema?: unknown }[] }>>;
  readonly components: { readonly schemas: Record<string, { enum?: string[] }> };
}

describe('contrato OpenAPI', () => {
  it('las listas blancas de orden del cliente coinciden con x-sort-properties', async () => {
    const doc = (await (await fetch(`${apiBaseUrl}/v3/api-docs`)).json()) as OpenApiDoc;
    const server: Record<string, string[]> = {};
    for (const [path, operations] of Object.entries(doc.paths)) {
      const sort = operations['get']?.parameters?.find((parameter) => parameter.name === 'sort');
      const fields = (sort as { 'x-sort-properties'?: string[] } | undefined)?.['x-sort-properties'];
      if (fields) server[path] = fields;
    }
    expect(Object.keys(server).toSorted()).toEqual(Object.keys(clientSortFields).toSorted());
    for (const [path, fields] of Object.entries(clientSortFields)) {
      const expected = server[path]!.filter((field) => !SORT_ALIASES.has(field));
      expect([...fields].toSorted(), path).toEqual(expected.toSorted());
    }
  });

  it('el registro de códigos de error del cliente coincide con el enum ErrorCode', async () => {
    const doc = (await (await fetch(`${apiBaseUrl}/v3/api-docs`)).json()) as OpenApiDoc;
    expect([...apiErrorCodes].toSorted()).toEqual(doc.components.schemas['ErrorCode']?.enum?.toSorted());
  });

  it('todo error trae `type` derivado del código', async () => {
    const error = await expectApiError(getScreening(NIL), 404, 'NOT_FOUND');
    expect(error.problem?.type).toBe('https://cine.example/problems/not-found');
  });

  it('VALIDATION_FAILED trae violations y el cliente las traduce', async () => {
    const error = await expectApiError(
      requestJson('/api/auth/register', {
        method: 'POST',
        body: { firstName: '', lastName: 'QA', email: 'no-es-email', password: 'corta' },
      }),
      400,
      'VALIDATION_FAILED',
    );
    expect(error.problem?.violations?.map((violation) => violation.field).toSorted()).toEqual(
      ['email', 'firstName', 'password'],
    );
    expect(error.fieldError('password')).toBe('Tiene que tener entre 8 y 72 caracteres.');
    expect(error.fieldError('firstName')).toBe('Completá este campo.');
  });
});

describe('catálogo público', () => {
  it('metadata: config y enums coinciden con los valores del cliente', async () => {
    const config = await getMetadataConfig();
    expect(config.currency).toBe('USD');
    expect(config.premiumSeatMultiplier).toBeGreaterThan(1);
    const enums = await getMetadataEnums();
    expect(enums.movieGenre.map((entry) => entry.value).toSorted()).toEqual(
      [...movieGenreValues].toSorted(),
    );
  });

  it('películas: género repetible y releaseYear', async () => {
    const page = await listMovies({ genre: ['ACTION', 'DRAMA'], releaseYear: 1888, size: 5 });
    expect(Array.isArray(page.content)).toBe(true);
  });

  it('un orden fuera de la lista blanca da 400 INVALID_SORT_PROPERTY con mensaje en español', async () => {
    const error = await expectApiError(
      requestJson('/api/movies', { query: { sort: 'nope,asc' } }),
      400,
      'INVALID_SORT_PROPERTY',
    );
    expect(error.userMessage).toBe('No se puede ordenar por ese campo.');
  });

  it('salas: listado público', async () => {
    await expect(listRooms({ size: 1 })).resolves.toHaveProperty('content');
  });

  it('collectAllPages recorre listas con el tamaño máximo', async () => {
    const movies = await collectAllPages((page, size) => listMovies({ page, size }));
    expect(Array.isArray(movies)).toBe(true);
  });

  it('funciones: el listado responde (lo usan la cartelera y el detalle de película)', async () => {
    await expect(listScreenings({ upcomingOnly: true, size: 5 })).resolves.toHaveProperty(
      'content',
    );
  });

  it('cartelera agregada: cada película trae sus funciones ordenadas y no archivadas', async () => {
    const page = await listNowShowing({ size: 10, sort: 'movieName,asc' });
    for (const { movie, screenings } of page.content) {
      expect(movie.archived).toBe(false);
      expect(screenings.length).toBeGreaterThan(0);
      const starts = screenings.map((screening) => screening.startsAt);
      expect(starts).toEqual(starts.toSorted());
    }
  });

  it('include=seatMap embebe el mapa de la función', async () => {
    const [first] = (await listScreenings({ upcomingOnly: true, size: 1 })).content;
    if (!first) return; // sin funciones programadas no hay nada que comparar
    const screening = await getScreeningWithSeatMap(first.uuid);
    expect(screening.seatMap.screeningId).toBe(first.uuid);
    expect(screening.seatMap.seats).toEqual((await getScreeningSeatMap(first.uuid)).seats);
  });

  it('funciones: un id inexistente da 404 en detalle y mapa de asientos', async () => {
    await expectApiError(getScreening(NIL), 404);
    await expectApiError(getScreeningSeatMap(NIL), 404);
  });
});

describe('sesión de cliente', () => {
  it('registro y login', async () => {
    await register({ firstName: 'QA', lastName: 'Front', email, password });
    const user = await login({ email, password });
    expect(user.email).toBe(email);
    expect(user.role).toBe('CUSTOMER');
    expect(getAuthState().tokens?.tokenType).toBe('Bearer');
  });

  it('registrar el mismo email da 409 EMAIL_TAKEN', async () => {
    await expectApiError(
      register({ firstName: 'QA', lastName: 'Front', email, password }),
      409,
      'EMAIL_TAKEN',
    );
  });

  it('login con contraseña incorrecta da 401 INVALID_CREDENTIALS sin tocar la sesión', async () => {
    const before = getAuthState().tokens?.token;
    const error = await expectApiError(
      requestJson('/api/auth/login', { method: 'POST', body: { email, password: 'incorrecta-1' } }),
      401,
      'INVALID_CREDENTIALS',
    );
    expect(error.userMessage).toBe('El email o la contraseña no son correctos.');
    expect(getAuthState().tokens?.token).toBe(before);
  });

  it('perfil: lectura y actualización', async () => {
    const updated = await updateMyProfile({ firstName: 'QA2', lastName: 'Front2' });
    expect(updated.firstName).toBe('QA2');
    expect((await getCurrentUser()).lastName).toBe('Front2');
  });

  it('cambio de contraseña incorrecto: 422 WRONG_PASSWORD y la sesión sigue activa', async () => {
    const error = await expectApiError(
      changeMyPassword({ currentPassword: 'no-es-esta-1', newPassword }),
      422,
      'WRONG_PASSWORD',
    );
    expect(error.userMessage).toBe('La contraseña actual no es correcta.');
    expect(getAuthState().tokens).not.toBeNull();
    await expect(getCurrentUser()).resolves.toHaveProperty('email', email);
  });

  it('cambio de contraseña correcto conservando esta sesión', async () => {
    const refreshToken = getAuthState().tokens?.refreshToken;
    expect(refreshToken).toBeDefined();
    await changeMyPassword({ currentPassword: password, newPassword, refreshToken: refreshToken! });
    await expect(getCurrentUser()).resolves.toHaveProperty('email', email);
  });

  it('refresh: rota ambos tokens y la sesión sigue funcionando', async () => {
    const before = getAuthState().tokens!;
    const results = await Promise.all([refreshTokens(), refreshTokens()]);
    expect(results).toEqual([true, true]);
    const after = getAuthState().tokens!;
    expect(after.refreshToken).not.toBe(before.refreshToken);
    await expect(getCurrentUser()).resolves.toHaveProperty('email', email);
  });

  it('mis reservas: todos los campos de orden del cliente funcionan', async () => {
    for (const field of reservationSortFields) {
      await expect(listMyReservations({ sort: `${field},desc`, size: 1 })).resolves.toHaveProperty(
        'content',
      );
    }
    const filtered = await listMyReservations({ upcomingOnly: true, screeningId: NIL });
    expect(filtered.content).toEqual([]);
  });

  it("lecturas con auth: 'optional' envían el token (404 limpio, sin cerrar sesión)", async () => {
    await expectApiError(getScreeningSeatMap(NIL), 404);
    expect(getAuthState().tokens).not.toBeNull();
  });

  it('retención y cotización sobre una función inexistente dan 404', async () => {
    await expectApiError(createHold(NIL, { seatIds: [NIL] }), 404);
    await expectApiError(quoteReservation({ movieScreeningId: NIL, seatIds: [NIL] }), 404);
  });

  it('las rutas de admin dan 403 FORBIDDEN a un cliente sin cerrar la sesión', async () => {
    await expectApiError(listUsers(), 403, 'FORBIDDEN');
    await expectApiError(listInventory(), 403, 'FORBIDDEN');
    await expectApiError(listAllReservations(), 403, 'FORBIDDEN');
    expect(getAuthState().tokens).not.toBeNull();
  });

  it('logout revoca el refresh token', async () => {
    const refreshToken = getAuthState().tokens!.refreshToken;
    await logout();
    expect(getAuthState().tokens).toBeNull();
    await expectApiError(
      requestJson('/api/auth/refresh', { method: 'POST', body: { refreshToken } }),
      401,
    );
  });

  it('login con la contraseña nueva', async () => {
    await expect(login({ email, password: newPassword })).resolves.toHaveProperty('email', email);
  });
});
