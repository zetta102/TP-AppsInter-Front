import { requestCreated, requestJson, requestVoid } from './shared.ts';
import type { CallOptions } from './shared.ts';
import type { CreateSeatRequest, SeatResponse, Uuid } from '../types.ts';

/**
 * `/api/seats`: las lecturas son públicas y las escrituras son ADMIN (backend-status-for-frontend.md §5.7).
 *
 * Normalización: `row` se recorta y se convierte a mayúsculas, `column` se recorta. Envía
 * `"a"` y recibe `"A"`. Los valores vacíos se rechazan con `400`.
 */

export function getSeat(uuid: Uuid, options: CallOptions = {}): Promise<SeatResponse> {
  return requestJson<SeatResponse>(`/api/seats/${uuid}`, options);
}

/** `409 "Seat A1 already exists in room …"` ante una posición duplicada. */
export function createSeat(body: CreateSeatRequest) {
  return requestCreated<SeatResponse>('/api/seats', { body, auth: true });
}

/** La unicidad de la posición se vuelve a verificar excluyéndose a sí misma. */
export function updateSeat(uuid: Uuid, body: CreateSeatRequest): Promise<SeatResponse> {
  return requestJson<SeatResponse>(`/api/seats/${uuid}`, { method: 'PUT', body, auth: true });
}

export function deleteSeat(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/seats/${uuid}`, { method: 'DELETE', auth: true });
}
