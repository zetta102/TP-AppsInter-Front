import { requestJson, requestVoid, requestCreated, type CreatedResource } from '../http.ts';
import type { PageParams, QueryParams, SortSpec } from '../query.ts';
import type { Page } from '../types.ts';

/**
 * Shared helpers for the resource clients.
 *
 * Every list endpoint returns the same `Page<T>` envelope and accepts
 * `page`/`size`/`sort`; only the filters differ, so each client declares its
 * own sortable-property union and filter interface.
 */

export type { CreatedResource, SortSpec };
export { requestJson, requestVoid, requestCreated };

/** Query params common to every list endpoint, plus endpoint-specific filters. */
export type ListParams<Field extends string, Filters extends QueryParams = QueryParams> =
  PageParams<Field> & Filters;

export interface CallOptions {
  readonly signal?: AbortSignal;
}

/** Issues a paged `GET`, serialising page/sort/filters into the query string. */
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
