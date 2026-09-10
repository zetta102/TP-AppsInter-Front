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

export type ReservationSortField = 'createdAt' | 'status' | 'totalPrice' | 'screening.startsAt';

/**
 * Filtros de tiempo resueltos contra la sesión (`screening.startsAt`), no contra la
 * reserva, para poder pedir "mis próximas funciones" sin traer todo el historial
 * y filtrar en memoria (frontend-spec.md §12).
 */
export type ReservationFilters = {
  readonly status?: ReservationStatus;
  readonly upcomingOnly?: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly movieId?: Uuid;
};

export type ListReservationsParams = PageParams<ReservationSortField> & ReservationFilters;

export type AdminReservationFilters = ReservationFilters;

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
 * Cancela una reserva (cancelación lógica). Devuelve **`200` con el body cancelado**,
 * no `204`: `tickets` e `items` se conservan tal cual estaban, `totalPrice` pasa a `0`,
 * `originalTotalPrice` guarda lo que se había cobrado y `cancelledAt` queda seteado.
 * No hace falta ningún snapshot del lado del cliente. Cancelar una reserva ya
 * cancelada devuelve `422`.
 */
export function cancelReservation(uuid: Uuid): Promise<ReservationResponse> {
  return requestJson<ReservationResponse>(`/api/reservations/${uuid}`, {
    method: 'DELETE',
    auth: true,
  });
}
