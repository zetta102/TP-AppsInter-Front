import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { MovieGenre } from '../enums.ts';
import type { CreateMovieRequest, MovieResponse, Page, Uuid } from '../types.ts';

/** `/api/movies` — reads are public, writes are ADMIN (frontend-spec.md §8.1). */

/** Sortable **entity** properties, not response field names. */
export type MovieSortField = 'movieName' | 'runtime' | 'director';

export type MovieFilters = {
  /** Case-insensitive substring of the title. */
  readonly search?: string;
  readonly genre?: MovieGenre;
};

export type ListMoviesParams = PageParams<MovieSortField> & MovieFilters;

export function listMovies(
  params: ListMoviesParams = {},
  options: CallOptions = {},
): Promise<Page<MovieResponse>> {
  return getPage<MovieResponse>('/api/movies', params, options);
}

export function getMovie(uuid: Uuid, options: CallOptions = {}): Promise<MovieResponse> {
  return requestJson<MovieResponse>(`/api/movies/${uuid}`, options);
}

export function createMovie(body: CreateMovieRequest) {
  return requestCreated<MovieResponse>('/api/movies', { body, auth: true });
}

/** `PUT` is a full replacement — send every field, not just the changed ones. */
export function updateMovie(uuid: Uuid, body: CreateMovieRequest): Promise<MovieResponse> {
  return requestJson<MovieResponse>(`/api/movies/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** `409` when screenings still reference the movie. */
export function deleteMovie(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/movies/${uuid}`, { method: 'DELETE', auth: true });
}
