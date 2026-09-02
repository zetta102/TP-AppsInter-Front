/**
 * Typed query-string construction for the paged list endpoints
 * (frontend-spec.md §6).
 *
 * `page` is zero-based. `sort` must name an **entity property** (`movieName`,
 * `startsAt`, `createdAt`, `email`, `productName`), not a response field; an
 * unknown property yields `400 "Unknown sort property '…'"`.
 */

export type SortDirection = 'asc' | 'desc';

/** `field,asc` — the exact shape Spring expects. */
export type SortSpec<Field extends string = string> = `${Field},${SortDirection}`;

export type PageParams<Field extends string = string> = {
  /** Zero-based. */
  readonly page?: number;
  readonly size?: number;
  /** A single spec, or several for multi-key ordering (`sort` is repeated). */
  readonly sort?: SortSpec<Field> | readonly SortSpec<Field>[];
};

/**
 * A value that can appear in a query string. Query-param carrier types must be
 * **type aliases**, not interfaces: only aliases receive the implicit index
 * signature that makes them assignable to `QueryParams`.
 */
type QueryValue = string | number | boolean | Date | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

/** Builds `field,asc` with the field name checked against the caller's union. */
export function sortBy<const Field extends string>(
  field: Field,
  direction: SortDirection = 'asc',
): SortSpec<Field> {
  return `${field},${direction}`;
}

function serialize(value: Exclude<QueryValue, null | undefined>): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Serialises params into a query string, skipping `null`/`undefined`/`''` and
 * repeating array-valued keys (which is how multi-key `sort` is expressed).
 * Returns `''` when there is nothing to append.
 */
export function buildQuery(params: QueryParams | undefined): string {
  if (!params) return '';
  const search = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : [raw as QueryValue];
    for (const value of values) {
      if (value === null || value === undefined) continue;
      const serialized = serialize(value);
      if (serialized === '') continue;
      search.append(key, serialized);
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Merges page/sort params with endpoint-specific filters into a query string. */
export function buildPageQuery<Field extends string>(
  params: (PageParams<Field> & QueryParams) | undefined,
): string {
  return buildQuery(params);
}

/** Reads pagination state out of a browser `URLSearchParams`. */
export function readPageParams(
  search: URLSearchParams,
  defaults: { readonly size?: number } = {},
): { page: number; size: number } {
  const page = Number.parseInt(search.get('page') ?? '', 10);
  const size = Number.parseInt(search.get('size') ?? '', 10);
  return {
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size: Number.isFinite(size) && size > 0 ? size : (defaults.size ?? 20),
  };
}
