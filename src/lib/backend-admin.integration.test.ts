import { afterAll, describe, expect, it, vi } from 'vitest';
import { createRoom, generateSeats, getRoomLayout, setRoomArchived } from './api/rooms.ts';
import { createMovie, deleteMovie, listNowShowing, setMovieArchived } from './api/movies.ts';
import {
  createScreening,
  deleteScreening,
  getScreening,
  getScreeningSeatMap,
  getScreeningWithSeatMap,
  listScreenings,
  setScreeningArchived,
} from './api/screenings.ts';
import { createHold, getHold, replaceHold } from './api/holds.ts';
import {
  cancelReservation,
  createReservation,
  listAllReservations,
  listMyReservations,
  quoteReservation,
} from './api/reservations.ts';
import {
  adjustInventory,
  createInventoryItem,
  listInventoryAdjustments,
  setInventoryArchived,
} from './api/inventory.ts';
import { deleteUser, listUsers } from './api/users.ts';
import { getMetadataConfig } from './api/metadata.ts';
import { MAX_PAGE_SIZE } from './api/shared.ts';
import { getAuthState, login, logout, register } from './auth-store.ts';
import { estimateTotal } from './pricing.ts';
import { ApiError } from './problem.ts';
import { apiBaseUrl, requestJson } from './http.ts';
import { readSse } from './sse.ts';
import type { SeatHold, SeatMap, SeatState, Uuid } from './types.ts';

/**
 * Flujo completo de admin + cliente contra el backend real:
 * sala → asientos → película → función → retención (y reemplazo, visto por el stream SSE) →
 * cotización → reserva → cancelación → archivo.
 *
 * Necesita una cuenta ADMIN en `QA_ADMIN_EMAIL` / `QA_ADMIN_PASSWORD` (variables de entorno,
 * nunca versionadas). Sin ellas, la suite se omite.
 *
 * Efecto secundario: deja en la base una sala, una película, una función y un producto con
 * prefijo `QA`. El backend no permite borrarlos (la función tiene entradas, aunque estén
 * canceladas), así que al final se **archivan**: dejan de aparecer en los listados. El cliente
 * desechable se da de baja.
 */

// El proyecto no incluye los tipos de Node: se lee `process.env` con un tipo mínimo.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const adminEmail = env?.['QA_ADMIN_EMAIL'];
const adminPassword = env?.['QA_ADMIN_PASSWORD'];
const stamp = Date.now();
const customerEmail = `qa.front.flow+${stamp}@example.com`;
const customerPassword = 'Contrasena-QA-1';

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

/** El mapa de asientos visto sin sesión (como lo ve un visitante anónimo). */
function anonymousSeatMap(screeningId: Uuid): Promise<SeatMap> {
  return requestJson<SeatMap>(`/api/screenings/${screeningId}/seats`);
}

describe.skipIf(!adminEmail || !adminPassword)('flujo completo admin + cliente', () => {
  let roomId: Uuid;
  let movieId: Uuid;
  let screeningId: Uuid;
  let productId: Uuid;
  let normalSeat: Uuid;
  let premiumSeat: Uuid;
  let hold: SeatHold;
  let reservationId: Uuid;
  let customerId: Uuid;

  afterAll(async () => {
    await logout();
  });

  it('admin: crea sala y genera la grilla con una fila premium', async () => {
    await login({ email: adminEmail!, password: adminPassword! });
    expect(getAuthState().user?.role).toBe('ADMIN');

    const { data: room } = await createRoom({
      roomName: `QA Sala ${stamp}`,
      screenRoomType: 'NORMAL',
    });
    roomId = room.uuid;
    const { data: layout } = await generateSeats(roomId, {
      rows: 2,
      columns: 3,
      premiumRows: ['B'],
    });
    expect(layout.seats).toHaveLength(6);

    const fresh = await getRoomLayout(roomId);
    normalSeat = fresh.seats.find((s) => s.seatType === 'NORMAL')!.uuid;
    premiumSeat = fresh.seats.find((s) => s.seatType === 'PREMIUM')!.uuid;
  });

  it('admin: crea película, función y producto', async () => {
    const { data: movie } = await createMovie({
      movieName: `QA Película ${stamp}`,
      genres: ['DRAMA'],
      runtime: 100,
    });
    movieId = movie.uuid;

    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: screening } = await createScreening({
      movieId,
      screenRoomId: roomId,
      startsAt,
      basePrice: 9.99,
    });
    screeningId = screening.uuid;

    await expectApiError(
      createScreening({ movieId, screenRoomId: roomId, startsAt, basePrice: 5 }),
      409,
      'SCREENING_OVERLAP',
    );

    const { data: product } = await createInventoryItem({
      productName: `QA Pochoclo ${stamp}`,
      category: 'SNACK',
      cost: 3.335,
      quantity: 5,
    });
    productId = product.uuid;
  });

  it('admin: ajustes de stock atómicos y auditoría', async () => {
    const after = await adjustInventory(productId, { delta: 5, reason: 'QA reposición' });
    expect(after.quantity).toBe(10);
    await expectApiError(
      adjustInventory(productId, { delta: -100, reason: 'QA' }),
      422,
      'INSUFFICIENT_STOCK',
    );
    const audit = await listInventoryAdjustments(productId, { sort: 'delta,desc' });
    expect(audit.content[0]?.delta).toBe(5);
  });

  it('el listado de funciones incluye la nueva (cartelera y detalle de película)', async () => {
    const page = await listScreenings({ movieId, upcomingOnly: true });
    expect(page.content.map((s) => s.uuid)).toContain(screeningId);
    await logout();
  });

  it('cliente: registro y login', async () => {
    await register({
      firstName: 'QA',
      lastName: 'Flujo',
      email: customerEmail,
      password: customerPassword,
    });
    const user = await login({ email: customerEmail, password: customerPassword });
    customerId = user.uuid;
  });

  it('cliente: retiene, reemplaza de forma atómica y el stream SSE lo anuncia', async () => {
    // Un espectador anónimo mira el stream de la función.
    const controller = new AbortController();
    const received: SeatState[] = [];
    const response = await fetch(`${apiBaseUrl}/api/screenings/${screeningId}/seats/stream`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reading = readSse(response.body!, (event) => {
      if (event.event === 'seats') received.push(...(JSON.parse(event.data) as SeatState[]));
    }).catch(() => undefined);

    const { data: first } = await createHold(screeningId, { seatIds: [normalSeat] });
    hold = await replaceHold(first.uuid, { seatIds: [normalSeat, premiumSeat] });
    // El reemplazo conserva la retención y su vencimiento: no la extiende.
    expect(hold.uuid).toBe(first.uuid);
    expect(new Date(hold.expiresAt).getTime()).toBe(new Date(first.expiresAt).getTime());
    expect(hold.seatIds.toSorted()).toEqual([normalSeat, premiumSeat].toSorted());

    await vi.waitFor(
      () => {
        expect(received).toContainEqual({ seatId: premiumSeat, available: false, held: true });
      },
      { timeout: 5_000, interval: 100 },
    );
    controller.abort();
    await reading;
  });

  it('cliente: ve sus retenciones disponibles, otros las ven retenidas', async () => {
    // Con token (auth: 'optional'), las retenciones propias siguen disponibles.
    const mine = await getScreeningSeatMap(screeningId);
    expect(mine.seats.find((s) => s.seatId === normalSeat)).toMatchObject({
      available: true,
      held: false,
    });

    // Sin token, el backend las informa como retenidas por otro cliente.
    const anonymous = await anonymousSeatMap(screeningId);
    expect(anonymous.seats.find((s) => s.seatId === normalSeat)).toMatchObject({
      available: false,
      held: true,
    });

    // La disponibilidad de la función no descuenta las retenciones propias.
    const screening = await getScreening(screeningId);
    expect(screening.availableSeats).toBe(6);

    // include=seatMap, con token, aplica la misma semántica que /seats.
    const embedded = await getScreeningWithSeatMap(screeningId);
    expect(embedded.seatMap.seats.find((s) => s.seatId === premiumSeat)).toMatchObject({
      available: true,
      held: false,
    });
  });

  it('cliente: la cotización con holdId coincide con la estimación del cliente al centavo', async () => {
    const config = await getMetadataConfig();
    const quote = await quoteReservation({
      movieScreeningId: screeningId,
      seatIds: [normalSeat, premiumSeat],
      products: [{ inventoryId: productId, quantity: 3 }],
      holdId: hold.uuid,
    });
    const estimate = estimateTotal(
      9.99,
      [{ seatType: 'NORMAL' }, { seatType: 'PREMIUM' }],
      [{ cost: quote.items[0]!.unitPrice, quantity: 3 }],
      config.premiumSeatMultiplier,
    );
    expect(quote.ticketsTotal).toBe(estimate.seatsTotal);
    expect(quote.totalPrice).toBe(estimate.total);
    // Cotizar no consume la retención.
    await expect(getHold(hold.uuid)).resolves.toHaveProperty('uuid', hold.uuid);
  });

  it('cliente: reserva con holdId y la retención queda consumida', async () => {
    const { data } = await createReservation({
      movieScreeningId: screeningId,
      seatIds: [normalSeat, premiumSeat],
      products: [{ inventoryId: productId, quantity: 3 }],
      holdId: hold.uuid,
    });
    reservationId = data.uuid;
    expect(data.status).toBe('CONFIRMED');
    await expectApiError(getHold(hold.uuid), 404);

    const sold = await anonymousSeatMap(screeningId);
    expect(sold.seats.find((s) => s.seatId === premiumSeat)).toMatchObject({
      available: false,
      held: false,
    });
  });

  it('cliente: cancela por POST /cancellation y no puede cancelar dos veces', async () => {
    const mine = await listMyReservations({ screeningId });
    expect(mine.content.map((r) => r.uuid)).toEqual([reservationId]);

    const cancelled = await cancelReservation(reservationId);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.totalPrice).toBe(0);
    expect(cancelled.originalTotalPrice).toBeGreaterThan(0);

    const error = await expectApiError(cancelReservation(reservationId), 422, 'ALREADY_CANCELLED');
    expect(error.userMessage).toBe('La reserva ya estaba cancelada.');
    await logout();
  });

  it('admin: filtra reservas y usuarios, y da de baja al cliente desechable', async () => {
    await login({ email: adminEmail!, password: adminPassword! });
    const all = await listAllReservations({ email: customerEmail, sort: 'userEmail,asc' });
    expect(all.content.map((r) => r.uuid)).toContain(reservationId);

    const byEmail = await listUsers({ email: customerEmail.toUpperCase() });
    expect(byEmail.content.map((u) => u.uuid)).toEqual([customerId]);
    const byName = await listUsers({ name: 'qa flujo', size: MAX_PAGE_SIZE });
    expect(byName.content.map((u) => u.uuid)).toContain(customerId);

    await deleteUser(customerId);
  });

  it('admin: una función archivada no acepta retenciones y se puede restaurar', async () => {
    // Tiene entradas (canceladas): no se puede borrar, pero sí archivar.
    await expectApiError(deleteScreening(screeningId), 409, 'RESOURCE_IN_USE');
    expect((await setScreeningArchived(screeningId, true)).archived).toBe(true);

    expect((await listScreenings({ movieId })).content.map((s) => s.uuid)).not.toContain(
      screeningId,
    );
    expect(
      (await listScreenings({ movieId, includeArchived: true })).content.map((s) => s.uuid),
    ).toContain(screeningId);
    await expectApiError(
      createHold(screeningId, { seatIds: [normalSeat] }),
      422,
      'RESOURCE_ARCHIVED',
    );

    expect((await setScreeningArchived(screeningId, false)).archived).toBe(false);
  });

  it('admin: limpieza — archiva función, película, sala y producto de QA', async () => {
    await setScreeningArchived(screeningId, true);
    await expectApiError(deleteMovie(movieId), 409, 'RESOURCE_IN_USE');
    expect((await setMovieArchived(movieId, true)).archived).toBe(true);
    expect((await setRoomArchived(roomId, true)).archived).toBe(true);
    expect((await setInventoryArchived(productId, true)).archived).toBe(true);

    const showing = await listNowShowing({ size: MAX_PAGE_SIZE });
    expect(showing.content.map((entry) => entry.movie.uuid)).not.toContain(movieId);
  });
});
