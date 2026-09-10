import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type {
  CreateMovieScreeningRequest,
  MovieScreeningResponse,
  Page,
  SeatMapResponse,
  Uuid,
} from '../types.ts';

/** `/api/screenings`: las lecturas son públicas y las escrituras son ADMIN (frontend-spec.md §8.4). */

export type ScreeningSortField = 'startsAt' | 'endsAt' | 'basePrice' | 'movieName' | 'roomName';

export type ScreeningFilters = {
  readonly movieId?: Uuid;
  readonly roomId?: Uuid;
  /** Fechas y horas ISO-8601 con offset comparadas contra `startsAt`. */
  readonly from?: string;
  readonly to?: string;
  /** Atajo para "desde ahora". Nunca sobrescribe un `from` explícito. */
  readonly upcomingOnly?: boolean;
  /** En el servidor vale `true` por defecto; usa `false` para omitir la agregación de disponibilidad. */
  readonly includeAvailability?: boolean;
};

export type ListScreeningsParams = PageParams<ScreeningSortField> & ScreeningFilters;

export function listScreenings(
  params: ListScreeningsParams = {},
  options: CallOptions = {},
): Promise<Page<MovieScreeningResponse>> {
  return getPage<MovieScreeningResponse>('/api/screenings', params, options);
}

export function getScreening(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<MovieScreeningResponse> {
  return requestJson<MovieScreeningResponse>(`/api/screenings/${uuid}`, options);
}

/**
 * El mapa de asientos es **público** y es un snapshot, no un bloqueo: los asientos
 * solo se retienen en `POST /api/reservations`, así que siempre hay que estar listo para un `409` al comprar.
 */
export function getScreeningSeatMap(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<SeatMapResponse> {
  return requestJson<SeatMapResponse>(`/api/screenings/${uuid}/seats`, options);
}

/** `409` cuando la ventana `[startsAt, endsAt)` se superpone con otra función en la sala. */
export function createScreening(body: CreateMovieScreeningRequest) {
  return requestCreated<MovieScreeningResponse>('/api/screenings', { body, auth: true });
}

/** Recalcula `endsAt` y vuelve a verificar superposición **excluyéndose a sí misma**. */
export function updateScreening(
  uuid: Uuid,
  body: CreateMovieScreeningRequest,
): Promise<MovieScreeningResponse> {
  return requestJson<MovieScreeningResponse>(`/api/screenings/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

export function deleteScreening(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/screenings/${uuid}`, { method: 'DELETE', auth: true });
}

/**
 * Valor por defecto documentado: 15 minutos. El valor real se sirve en
 * `GET /api/metadata/config` como `screeningTurnoverMinutes`: conviene usarlo en
 * el planificador de admin; esta constante es solo el fallback.
 */
export const TURNOVER_MINUTES = 15;
