import { getPage, requestCreated, requestJson, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ReservationStatus } from '../enums.ts';
import type { ReservationRequest, Page, Quote, Reservation, Uuid } from '../types.ts';

/**
 * `/api/reservations`.
 *
 * El propietario se toma del JWT: no existe `userId` ni en la solicitud ni en
 * ningún parámetro de query.
 */

export const reservationSortFields = [
  'createdAt',
  'status',
  'totalPrice',
  'cancelledAt',
  'screening.startsAt',
  'userEmail',
] as const;
export type ReservationSortField = (typeof reservationSortFields)[number];

/**
 * Filtros de las reservas propias. `from`/`to` se comparan contra el **inicio de la
 * función** (`screening.startsAt`), para poder pedir "mis próximas funciones" sin traer
 * todo el historial y filtrar en memoria.
 */
export type ReservationFilters = {
  readonly status?: ReservationStatus;
  readonly upcomingOnly?: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly movieId?: Uuid;
  readonly screeningId?: Uuid;
};

export type ListReservationsParams = PageParams<ReservationSortField> & ReservationFilters;

/** Filtros de admin. Ojo: acá `from`/`to` se comparan contra la **fecha de compra**. */
export type AdminReservationFilters = ReservationFilters & {
  readonly userId?: Uuid;
  /** Coincidencia parcial sobre el email del cliente. */
  readonly email?: string;
};

export type ListAllReservationsParams = PageParams<ReservationSortField> & AdminReservationFilters;

/** Siempre las reservas del propio llamador. */
export function listMyReservations(
  params: ListReservationsParams = {},
  options: CallOptions = {},
): Promise<Page<Reservation>> {
  return getPage<Reservation>('/api/reservations', params, { ...options, auth: true });
}

/** Solo ADMIN; `403` para clientes. */
export function listAllReservations(
  params: ListAllReservationsParams = {},
  options: CallOptions = {},
): Promise<Page<Reservation>> {
  return getPage<Reservation>('/api/reservations/all', params, { ...options, auth: true });
}

/** `404` —no `403`— cuando la reserva pertenece a otra persona. */
export function getReservation(uuid: Uuid, options: CallOptions = {}): Promise<Reservation> {
  return requestJson<Reservation>(`/api/reservations/${uuid}`, { ...options, auth: true });
}

/**
 * Crea una reserva. Los ids de asientos se deduplican y los productos repetidos se
 * combinan del lado del servidor. La cadena de validación está ordenada, así que un
 * error de asiento siempre se informa antes que un error de producto.
 */
export function createReservation(body: ReservationRequest) {
  return requestCreated<Reservation>('/api/reservations', { body, auth: true });
}

/**
 * `POST /api/reservations:quote`: mismo body y misma cadena de validación que create,
 * pero no escribe nada: no genera reserva, ticket ni movimiento de stock. Conviene
 * usar esto antes que el espejo de precios del cliente para la vista previa de compra,
 * porque es exactamente el mismo camino de código que usará el cobro real y nunca puede divergir.
 */
export function quoteReservation(
  body: ReservationRequest,
  options: CallOptions = {},
): Promise<Quote> {
  return requestJson<Quote>('/api/reservations:quote', {
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
 * cancelada devuelve `422 ALREADY_CANCELLED`; un cliente que cancela después del inicio
 * recibe `422 SCREENING_STARTED` (los admins pueden cancelar en cualquier momento).
 */
export function cancelReservation(uuid: Uuid): Promise<Reservation> {
  return requestJson<Reservation>(`/api/reservations/${uuid}/cancellation`, {
    method: 'POST',
    auth: true,
  });
}
