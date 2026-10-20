import { requestJson, requestVoid } from './shared.ts';
import type { Seat, SeatRequest, Uuid } from '../types.ts';

/**
 * `/api/seats`: escrituras ADMIN sobre asientos individuales (la grilla completa se arma con
 * `generateSeats` en `rooms.ts`).
 *
 * Normalización: `row` se recorta y se convierte a mayúsculas, `column` se recorta. Se envía
 * `"a"` y se recibe `"A"`. Los valores vacíos se rechazan con `400`.
 */

/** La unicidad de la posición se vuelve a verificar excluyéndose a sí misma. */
export function updateSeat(uuid: Uuid, body: SeatRequest): Promise<Seat> {
  return requestJson<Seat>(`/api/seats/${uuid}`, { method: 'PUT', body, auth: true });
}

export function deleteSeat(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/seats/${uuid}`, { method: 'DELETE', auth: true });
}
