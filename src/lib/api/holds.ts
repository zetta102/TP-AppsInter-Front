import { requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { SeatHoldRequest, SeatHold, Uuid } from '../types.ts';

/**
 * Retenciones de asientos.
 *
 * Una retención reserva asientos por algunos minutos mientras se completa la compra. El TTL es
 * `CINE_SEAT_HOLD_TTL_SECONDS` (300 s por defecto, publicado en
 * `GET /api/metadata/config`). `expiresAt` es autoritativo; `ttlSeconds` representa
 * el mismo instante como cuenta regresiva para un cliente con el reloj desfasado.
 *
 * Flujo recomendado: seleccionar asientos -> `createHold` -> mostrar la cuenta regresiva ->
 * `replaceHold` en cada cambio posterior de la selección ->
 * `quoteReservation` para el total -> `createReservation` con `holdId`.
 * Si se abandona, se llama a `releaseHold` o simplemente se deja que expire.
 */

/** `201` + `Location: /api/holds/{uuid}`. `404` por función/asiento desconocido, `422 SCREENING_STARTED`,
 * `409 SEATS_UNAVAILABLE` (ya vendido o retenido por otra persona, `context.seatIds`). */
export function createHold(screeningId: Uuid, body: SeatHoldRequest) {
  return requestCreated<SeatHold>(`/api/screenings/${screeningId}/holds`, {
    body,
    auth: true,
  });
}

/**
 * `PUT /api/holds/{uuid}`: reemplaza los asientos retenidos de forma atómica (los que siguen
 * seleccionados nunca se liberan en el medio). Conserva el `uuid` y el `expiresAt`: no extiende
 * la retención. `404` si venció, se liberó o se consumió; si no, los mismos errores que al crearla.
 * Ante un fallo, la retención conserva sus asientos anteriores.
 */
export function replaceHold(uuid: Uuid, body: SeatHoldRequest): Promise<SeatHold> {
  return requestJson<SeatHold>(`/api/holds/${uuid}`, { method: 'PUT', body, auth: true });
}

/** Una retención vencida o liberada es `404`: ya no reserva nada. */
export function getHold(uuid: Uuid, options: CallOptions = {}): Promise<SeatHold> {
  return requestJson<SeatHold>(`/api/holds/${uuid}`, { ...options, auth: true });
}

/** `204`, idempotente: liberar dos veces o liberar un id desconocido sigue devolviendo `204`. */
export function releaseHold(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/holds/${uuid}`, { method: 'DELETE', auth: true });
}
