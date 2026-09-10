import { requestJson, requestVoid, requestCreated, type CreatedResource } from '../http.ts';
import type { PageParams, QueryParams, SortSpec } from '../query.ts';
import type { Page } from '../types.ts';

/**
 * Helpers compartidos para los clientes de recursos.
 *
 * Cada endpoint de lista devuelve el mismo contenedor `Page<T>` y acepta
 * `page`/`size`/`sort`; solo cambian los filtros, así que cada cliente declara
 * su propia unión de propiedades ordenables y su interfaz de filtros.
 */

export type { CreatedResource, SortSpec };
export { requestJson, requestVoid, requestCreated };

/** Query params comunes a cada endpoint de lista, más filtros específicos del endpoint. */
export type ListParams<Field extends string, Filters extends QueryParams = QueryParams> =
  PageParams<Field> & Filters;

export interface CallOptions {
  readonly signal?: AbortSignal;
}

/** Ejecuta un `GET` paginado y serializa página/sort/filtros en la query string. */
export function getPage<T>(
  path: string,
  params: QueryParams | undefined,
  options: CallOptions & { readonly auth?: boolean } = {},
): Promise<Page<T>> {
  return requestJson<Page<T>>(path, {
    ...(params ? { query: params } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.auth ? { auth: true } : {}),
  });
}
