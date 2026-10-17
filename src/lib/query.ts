/**
 * Construcción tipada de query strings para los endpoints de lista paginada
 * (backend-status-for-frontend.md §3.3).
 *
 * `page` es base cero. `sort` debe nombrar una **propiedad de la entidad** (`movieName`,
 * `startsAt`, `createdAt`, `email`, `productName`), no un campo de respuesta; una
 * propiedad desconocida devuelve `400 "Unknown sort property '…'"`.
 */

export type SortDirection = 'asc' | 'desc';

/** `field,asc`: la forma exacta que espera Spring. */
export type SortSpec<Field extends string = string> = `${Field},${SortDirection}`;

export type PageParams<Field extends string = string> = {
  /** Base cero. */
  readonly page?: number;
  readonly size?: number;
  /** Una sola especificación, o varias para ordenación por múltiples claves (`sort` se repite). */
  readonly sort?: SortSpec<Field> | readonly SortSpec<Field>[];
};

/**
 * Un valor que puede aparecer en una query string. Los tipos portadores de query params deben ser
 * **aliases de tipo**, no interfaces: solo los aliases reciben la firma de índice implícita
 * que los hace asignables a `QueryParams`.
 */
type QueryValue = string | number | boolean | Date | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

/** Construye `field,asc` con el nombre de campo validado contra la unión del llamador. */
export function sortBy<const Field extends string>(
  field: Field,
  direction: SortDirection = 'asc',
): SortSpec<Field> {
  return `${field},${direction}`;
}

/** Separa `field,asc` en sus partes, conservando el tipo del campo. */
export function parseSort<Field extends string>(
  sort: SortSpec<Field>,
): { readonly field: Field; readonly direction: SortDirection } {
  const comma = sort.lastIndexOf(',');
  // El template literal garantiza la forma; TS no puede inferir las partes de `slice`.
  return {
    field: sort.slice(0, comma) as Field,
    direction: sort.slice(comma + 1) as SortDirection,
  };
}

/** Clic en una columna: ascendente la primera vez, alterna la dirección si ya estaba activa. */
export function toggleSort<const Field extends string>(
  current: SortSpec<Field>,
  field: Field,
): SortSpec<Field> {
  return sortBy(field, current === sortBy(field, 'asc') ? 'desc' : 'asc');
}

function serialize(value: Exclude<QueryValue, null | undefined>): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Serializa parámetros en una query string, omitiendo `null`/`undefined`/`''` y
 * repitiendo las claves con valores de array (que es como se expresa un `sort` de varias claves).
 * Devuelve `''` cuando no hay nada para anexar.
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

/** Combina parámetros de página/sort con filtros específicos del endpoint en una query string. */
export function buildPageQuery<Field extends string>(
  params: (PageParams<Field> & QueryParams) | undefined,
): string {
  return buildQuery(params);
}

/** Lee el estado de paginación desde un `URLSearchParams` del navegador. */
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
