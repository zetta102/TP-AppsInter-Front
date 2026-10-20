import {
  requestJson,
  requestVoid,
  requestCreated,
  type AuthMode,
  type CreatedResource,
} from '../http.ts';
import type { QueryParams, SortSpec } from '../query.ts';
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

/** El backend recorta en silencio cualquier `size` mayor. */
export const MAX_PAGE_SIZE = 100;

export interface CallOptions {
  readonly signal?: AbortSignal;
}

/**
 * `PATCH {path}` con `{ archived }`: archivar oculta el
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
 * Recorre las páginas de una lista con el tamaño máximo permitido, una a la vez y solo a
 * medida que se consumen. `maxPages` acota el costo ante catálogos inesperadamente grandes.
 */
export async function* iteratePages<T>(
  fetchPage: (page: number, size: number) => Promise<Page<T>>,
  maxPages = 10,
): AsyncGenerator<T> {
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(page, MAX_PAGE_SIZE);
    yield* result.content;
    if (result.last) return;
  }
}

/** Junta todos los elementos de `iteratePages` en un array. */
export function collectAllPages<T>(
  fetchPage: (page: number, size: number) => Promise<Page<T>>,
  maxPages = 10,
): Promise<T[]> {
  return Array.fromAsync(iteratePages(fetchPage, maxPages));
}
