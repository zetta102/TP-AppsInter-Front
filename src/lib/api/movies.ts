import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { MovieGenre } from '../enums.ts';
import type { CreateMovieRequest, MovieResponse, Page, Uuid } from '../types.ts';

/** `/api/movies`: las lecturas son públicas y las escrituras son ADMIN (frontend-spec.md §8.1). */

/** Propiedades de **entidad** ordenables, no nombres de campos de respuesta. */
export type MovieSortField = 'movieName' | 'runtime' | 'director';

export type MovieFilters = {
  /** Subcadena del título sin distinguir mayúsculas. */
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

/** `PUT` es un reemplazo completo: envía todos los campos, no solo los que cambiaron. */
export function updateMovie(uuid: Uuid, body: CreateMovieRequest): Promise<MovieResponse> {
  return requestJson<MovieResponse>(`/api/movies/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** `409` cuando funciones existentes todavía referencian la película. */
export function deleteMovie(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/movies/${uuid}`, { method: 'DELETE', auth: true });
}
