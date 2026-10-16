import {
  getPage,
  requestCreated,
  requestJson,
  requestVoid,
  setArchived,
  type CallOptions,
} from './shared.ts';
import { DEFAULT_METADATA_CONFIG } from './metadata.ts';
import type { PageParams } from '../query.ts';
import type {
  CreateMovieScreeningRequest,
  MovieScreeningResponse,
  Page,
  SeatMapResponse,
  Uuid,
} from '../types.ts';

/** `/api/screenings`: las lecturas son públicas y las escrituras son ADMIN (backend-status-for-frontend.md §5.8).
 * Las lecturas envían el token si hay sesión (`auth: 'optional'`): así la disponibilidad
 * no descuenta las retenciones propias del usuario. */

export const screeningSortFields = ['startsAt', 'endsAt', 'basePrice'] as const;
export type ScreeningSortField = (typeof screeningSortFields)[number];

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
  /** Incluye las archivadas (pantallas de admin). */
  readonly includeArchived?: boolean;
};

export type ListScreeningsParams = PageParams<ScreeningSortField> & ScreeningFilters;

export function listScreenings(
  params: ListScreeningsParams = {},
  options: CallOptions = {},
): Promise<Page<MovieScreeningResponse>> {
  return getPage<MovieScreeningResponse>('/api/screenings', params, { ...options, auth: 'optional' });
}

export interface GetScreeningOptions extends CallOptions {
  readonly includeAvailability?: boolean;
  /** `'seatMap'` embebe el mapa de asientos (misma semántica que `/seats`) en una sola llamada. */
  readonly include?: 'seatMap';
}

/** La función también se lee cuando está archivada (`archived: true`). */
export function getScreening(
  uuid: Uuid,
  options: GetScreeningOptions = {},
): Promise<MovieScreeningResponse> {
  const { includeAvailability, include, ...callOptions } = options;
  return requestJson<MovieScreeningResponse>(`/api/screenings/${uuid}`, {
    ...callOptions,
    query: { includeAvailability, include },
    auth: 'optional',
  });
}

export type ScreeningWithSeatMap = MovieScreeningResponse & { readonly seatMap: SeatMapResponse };

/** Función + mapa de asientos en una sola llamada (`include=seatMap`). */
export async function getScreeningWithSeatMap(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<ScreeningWithSeatMap> {
  const screening = await getScreening(uuid, { ...options, include: 'seatMap' });
  if (!screening.seatMap) throw new Error('El servidor no devolvió el mapa de asientos.');
  return screening as ScreeningWithSeatMap;
}

/**
 * El mapa de asientos es **público** y es un snapshot, no un bloqueo. Con sesión, los
 * asientos retenidos por el propio usuario aparecen como disponibles; los retenidos por
 * otros llegan con `held: true`. Siempre hay que estar listo para un `409` al comprar.
 */
export function getScreeningSeatMap(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<SeatMapResponse> {
  return requestJson<SeatMapResponse>(`/api/screenings/${uuid}/seats`, {
    ...options,
    auth: 'optional',
  });
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

/**
 * Archivar: `409 RESOURCE_IN_USE` si no empezó y tiene entradas activas. Restaurar:
 * `409 SCREENING_OVERLAP` si el horario se ocupó, `422 RESOURCE_ARCHIVED` si la película o la sala
 * están archivadas.
 */
export function setScreeningArchived(
  uuid: Uuid,
  archived: boolean,
): Promise<MovieScreeningResponse> {
  return setArchived<MovieScreeningResponse>(`/api/screenings/${uuid}`, archived);
}

/** `409 RESOURCE_IN_USE` si tiene entradas (incluso canceladas): archivala. */
export function deleteScreening(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/screenings/${uuid}`, { method: 'DELETE', auth: true });
}

/**
 * Valor por defecto documentado. El valor real se sirve en `GET /api/metadata/config`
 * como `screeningTurnoverMinutes`: conviene usarlo en el planificador de admin; esta
 * constante es solo el fallback.
 */
export const TURNOVER_MINUTES = DEFAULT_METADATA_CONFIG.screeningTurnoverMinutes;
