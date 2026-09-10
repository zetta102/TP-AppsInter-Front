import { getPage, requestCreated, requestJson, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ReservationStatus } from '../enums.ts';
import type {
  CreateReservationRequest,
  Page,
  ReservationQuoteResponse,
  ReservationResponse,
  Uuid,
} from '../types.ts';

/**
 * `/api/reservations` (frontend-spec.md §8.6).
 *
 * El propietario se toma del JWT: no existe `userId` ni en la solicitud ni en
 * ningún parámetro de query.
 */

export type ReservationSortField = 'createdAt' | 'status' | 'totalPrice';

export type ListReservationsParams = PageParams<ReservationSortField>;

export type AdminReservationFilters = {
  readonly status?: ReservationStatus;
};

export type ListAllReservationsParams = PageParams<ReservationSortField> & AdminReservationFilters;

/** Siempre las reservas del propio llamador. */
export function listMyReservations(
  params: ListReservationsParams = {},
  options: CallOptions = {},
): Promise<Page<ReservationResponse>> {
  return getPage<ReservationResponse>('/api/reservations', params, { ...options, auth: true });
}

/** Solo ADMIN; `403` para clientes. */
export function listAllReservations(
  params: ListAllReservationsParams = {},
  options: CallOptions = {},
): Promise<Page<ReservationResponse>> {
  return getPage<ReservationResponse>('/api/reservations/all', params, { ...options, auth: true });
}

/** `404` —no `403`— cuando la reserva pertenece a otra persona. */
export function getReservation(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<ReservationResponse> {
  return requestJson<ReservationResponse>(`/api/reservations/${uuid}`, { ...options, auth: true });
}

/**
 * Crea una reserva. Los ids de asientos se deduplican y los productos repetidos se
 * combinan del lado del servidor. La cadena de validación está ordenada, así que un
 * error de asiento siempre se informa antes que un error de producto.
 */
export function createReservation(body: CreateReservationRequest) {
  return requestCreated<ReservationResponse>('/api/reservations', { body, auth: true });
}

/**
 * `POST /api/reservations:quote`: mismo body y misma cadena de validación que create,
 * pero no escribe nada: no genera reserva, ticket ni movimiento de stock. Conviene
 * usar esto antes que el espejo de precios del cliente para la vista previa de compra,
 * porque es exactamente el mismo camino de código que usará el cobro real y nunca puede divergir.
 */
export function quoteReservation(
  body: CreateReservationRequest,
  options: CallOptions = {},
): Promise<ReservationQuoteResponse> {
  return requestJson<ReservationQuoteResponse>('/api/reservations:quote', {
    ...options,
    method: 'POST',
    body,
    auth: true,
  });
}

/**
 * Cancela una reserva. Devuelve **`200` con el body cancelado**, no `204`:
 * `tickets: []`, `items: []`, `totalPrice: 0.00`. Si necesitas mostrar qué se canceló,
 * guarda primero un snapshot en el cliente, porque el servidor ya no lo conserva.
 * Cancelar una reserva ya cancelada devuelve `422`.
 */
export function cancelReservation(uuid: Uuid): Promise<ReservationResponse> {
  return requestJson<ReservationResponse>(`/api/reservations/${uuid}`, {
    method: 'DELETE',
    auth: true,
  });
}
