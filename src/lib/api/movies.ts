import {
  getPage,
  requestCreated,
  requestJson,
  requestVoid,
  setArchived,
  type CallOptions,
} from './shared.ts';
import type { PageParams } from '../query.ts';
import type { MovieGenre } from '../enums.ts';
import type { Movie, MovieRequest, NowShowing, Page, Uuid } from '../types.ts';

/**
 * `/api/movies`: las lecturas son públicas y las escrituras son ADMIN.
 */

/** Propiedades de **entidad** ordenables, no nombres de campos de respuesta. */
export const movieSortFields = [
  'movieName',
  'runtime',
  'releaseYear',
  'director',
  'originalLanguage',
  'certification',
] as const;
export type MovieSortField = (typeof movieSortFields)[number];

export const nowShowingSortFields = ['movieName', 'releaseYear'] as const;
export type NowShowingSortField = (typeof nowShowingSortFields)[number];

export type MovieFilters = {
  /** Subcadena del título sin distinguir mayúsculas. */
  readonly search?: string;
  /** Repetible, con semántica OR. */
  readonly genre?: MovieGenre | readonly MovieGenre[];
  readonly releaseYear?: number;
  /** Incluye las archivadas (pantallas de admin). */
  readonly includeArchived?: boolean;
};

export type ListMoviesParams = PageParams<MovieSortField> & MovieFilters;

export function listMovies(
  params: ListMoviesParams = {},
  options: CallOptions = {},
): Promise<Page<Movie>> {
  return getPage<Movie>('/api/movies', params, options);
}

export type NowShowingParams = PageParams<NowShowingSortField> & {
  /** Ventana sobre `startsAt` de las funciones: `from` vale "ahora" por defecto y `to` no tiene límite. */
  readonly from?: string;
  readonly to?: string;
};

/**
 * La cartelera agregada: películas no archivadas con al menos una función vigente en la
 * ventana, cada una con esas funciones ordenadas por `startsAt` y con disponibilidad. La
 * paginación es sobre películas. Envía el token si hay sesión (disponibilidad propia).
 */
export function listNowShowing(
  params: NowShowingParams = {},
  options: CallOptions = {},
): Promise<Page<NowShowing>> {
  return getPage<NowShowing>('/api/movies/now-showing', params, {
    ...options,
    auth: 'optional',
  });
}

export function getMovie(uuid: Uuid, options: CallOptions = {}): Promise<Movie> {
  return requestJson<Movie>(`/api/movies/${uuid}`, options);
}

export function createMovie(body: MovieRequest) {
  return requestCreated<Movie>('/api/movies', { body, auth: true });
}

/** `PUT` es un reemplazo completo: se envían todos los campos, no solo los que cambiaron. */
export function updateMovie(uuid: Uuid, body: MovieRequest): Promise<Movie> {
  return requestJson<Movie>(`/api/movies/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** `409 RESOURCE_IN_USE` si la película tiene funciones vigentes que no terminaron. */
export function setMovieArchived(uuid: Uuid, archived: boolean): Promise<Movie> {
  return setArchived<Movie>(`/api/movies/${uuid}`, archived);
}

/** `409 RESOURCE_IN_USE` cuando funciones existentes todavía referencian la película: archivala. */
export function deleteMovie(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/movies/${uuid}`, { method: 'DELETE', auth: true });
}
