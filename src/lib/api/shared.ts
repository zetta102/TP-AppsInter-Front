import {
  requestJson,
  requestVoid,
  requestCreated,
  type AuthMode,
  type CreatedResource,
} from '../http.ts';
import type { PageParams, QueryParams, SortSpec } from '../query.ts';
import type { ArchiveRequest, Page } from '../types.ts';

/**
 * Helpers compartidos para los clientes de recursos.
 *
 * Cada endpoint de lista devuelve el mismo contenedor `Page<T>` y acepta
 * `page`/`size`/`sort`; solo cambian los filtros, así que cada cliente declara
 * su propia unión de propiedades ordenables y su interfaz de filtros.
 */

export type { CreatedResource, SortSpec };
export { requestJson, requestVoid, requestCreated };

/** El backend recorta en silencio cualquier `size` mayor (backend-status-for-frontend.md §3). */
export const MAX_PAGE_SIZE = 100;

/** Query params comunes a cada endpoint de lista, más filtros específicos del endpoint. */
export type ListParams<Field extends string, Filters extends QueryParams = QueryParams> =
  PageParams<Field> & Filters;

export interface CallOptions {
  readonly signal?: AbortSignal;
}

/**
 * `PATCH {path}` con `{ archived }` (backend-status-for-frontend.md §3.7): archivar oculta el
 * recurso de los listados sin borrarlo; `false` lo restaura. Devuelve el recurso actualizado.
 */
export function setArchived<T>(path: string, archived: boolean): Promise<T> {
  const body: ArchiveRequest = { archived };
  return requestJson<T>(path, { method: 'PATCH', body, auth: true });
}

/** Ejecuta un `GET` paginado y serializa página/sort/filtros en la query string. */
export function getPage<T>(
  path: string,
  params: QueryParams | undefined,
  options: CallOptions & { readonly auth?: AuthMode } = {},
): Promise<Page<T>> {
  return requestJson<Page<T>>(path, {
    ...(params ? { query: params } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.auth ? { auth: options.auth } : {}),
  });
}

/**
 * Recorre todas las páginas de una lista con el tamaño máximo permitido.
 * `maxPages` acota el costo ante catálogos inesperadamente grandes.
 */
export async function collectAllPages<T>(
  fetchPage: (page: number, size: number) => Promise<Page<T>>,
  maxPages = 10,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(page, MAX_PAGE_SIZE);
    items.push(...result.content);
    if (result.last) break;
  }
  return items;
}
