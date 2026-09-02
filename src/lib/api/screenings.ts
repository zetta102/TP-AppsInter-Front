import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type {
  CreateMovieScreeningRequest,
  MovieScreeningResponse,
  Page,
  SeatMapResponse,
  Uuid,
} from '../types.ts';

/** `/api/screenings` — reads are public, writes are ADMIN (frontend-spec.md §8.4). */

export type ScreeningSortField = 'startsAt' | 'endsAt' | 'basePrice' | 'movieName' | 'roomName';

export type ScreeningFilters = {
  readonly movieId?: Uuid;
  readonly roomId?: Uuid;
  /** ISO-8601 offset date-times matched against `startsAt`. */
  readonly from?: string;
  readonly to?: string;
  /** Shorthand for "from now". Never overrides an explicit `from`. */
  readonly upcomingOnly?: boolean;
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
 * The seat map is **public** and is a snapshot, not a lock: seats are only held
 * at `POST /api/reservations`, so always be ready for a `409` at checkout.
 */
export function getScreeningSeatMap(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<SeatMapResponse> {
  return requestJson<SeatMapResponse>(`/api/screenings/${uuid}/seats`, options);
}

/** `409` when the `[startsAt, endsAt)` window overlaps another screening in the room. */
export function createScreening(body: CreateMovieScreeningRequest) {
  return requestCreated<MovieScreeningResponse>('/api/screenings', { body, auth: true });
}

/** Recomputes `endsAt` and re-checks overlap **excluding itself**. */
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

/** Minutes of turnover the backend adds after the runtime when computing `endsAt`. */
export const TURNOVER_MINUTES = 15;
