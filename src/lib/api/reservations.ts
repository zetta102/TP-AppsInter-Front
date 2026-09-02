import { getPage, requestCreated, requestJson, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ReservationStatus } from '../enums.ts';
import type { CreateReservationRequest, Page, ReservationResponse, Uuid } from '../types.ts';

/**
 * `/api/reservations` (frontend-spec.md §8.6).
 *
 * The owner is taken from the JWT — there is no `userId` in the request or in
 * any query parameter.
 */

export type ReservationSortField = 'createdAt' | 'status' | 'totalPrice';

export type ListReservationsParams = PageParams<ReservationSortField>;

export type AdminReservationFilters = {
  readonly status?: ReservationStatus;
};

export type ListAllReservationsParams = PageParams<ReservationSortField> & AdminReservationFilters;

/** Always the caller's own reservations. */
export function listMyReservations(
  params: ListReservationsParams = {},
  options: CallOptions = {},
): Promise<Page<ReservationResponse>> {
  return getPage<ReservationResponse>('/api/reservations', params, { ...options, auth: true });
}

/** ADMIN only; `403` for customers. */
export function listAllReservations(
  params: ListAllReservationsParams = {},
  options: CallOptions = {},
): Promise<Page<ReservationResponse>> {
  return getPage<ReservationResponse>('/api/reservations/all', params, { ...options, auth: true });
}

/** `404` — not `403` — when the reservation belongs to another user. */
export function getReservation(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<ReservationResponse> {
  return requestJson<ReservationResponse>(`/api/reservations/${uuid}`, { ...options, auth: true });
}

/**
 * Creates a reservation. Seat ids are de-duplicated and repeated products are
 * merged server-side. The validation chain is ordered, so a seat error is
 * always reported before a product error.
 */
export function createReservation(body: CreateReservationRequest) {
  return requestCreated<ReservationResponse>('/api/reservations', { body, auth: true });
}

/**
 * Cancels a reservation. Returns **`200` with the cancelled body**, not `204`:
 * `tickets: []`, `items: []`, `totalPrice: 0.00`. Snapshot the reservation
 * client-side first if you need to show what was cancelled — the server no
 * longer holds it. Cancelling an already-cancelled reservation is `422`.
 */
export function cancelReservation(uuid: Uuid): Promise<ReservationResponse> {
  return requestJson<ReservationResponse>(`/api/reservations/${uuid}`, {
    method: 'DELETE',
    auth: true,
  });
}
