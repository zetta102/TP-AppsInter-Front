import { requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { CreateSeatHoldRequest, SeatHoldResponse, Uuid } from '../types.ts';

/**
 * Retenciones de asientos (frontend-spec.md §8.4 "Seat holds").
 *
 * Una retención reserva asientos por algunos minutos mientras se completa la compra. El TTL es
 * `CINE_SEAT_HOLD_TTL_SECONDS` (300 s por defecto, publicado en
 * `GET /api/metadata/config`). `expiresAt` es autoritativo; `ttlSeconds` representa
 * el mismo instante como cuenta regresiva para un cliente con el reloj desfasado.
 *
 * Flujo recomendado: seleccionar asientos -> `createHold` -> mostrar la cuenta regresiva ->
 * `quoteReservation` para el total -> `createReservation` con `holdId`.
 * Si se abandona, llama a `releaseHold` o simplemente deja que expire.
 */

/** `201` + `Location: /api/holds/{uuid}`. `404` por función/asiento desconocido, `422 SCREENING_STARTED`,
 * `409 SEATS_UNAVAILABLE` (ya vendido o retenido por otra persona, `context.seatIds`). */
export function createHold(screeningId: Uuid, body: CreateSeatHoldRequest) {
  return requestCreated<SeatHoldResponse>(`/api/screenings/${screeningId}/holds`, {
    body,
    auth: true,
  });
}

/** Una retención vencida o liberada es `404`: ya no reserva nada. */
export function getHold(uuid: Uuid, options: CallOptions = {}): Promise<SeatHoldResponse> {
  return requestJson<SeatHoldResponse>(`/api/holds/${uuid}`, { ...options, auth: true });
}

/** `204`, idempotente: liberar dos veces o liberar un id desconocido sigue devolviendo `204`. */
export function releaseHold(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/holds/${uuid}`, { method: 'DELETE', auth: true });
}
