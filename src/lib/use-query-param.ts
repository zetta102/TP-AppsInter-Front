import { useSyncExternalStore } from 'react';

/**
 * Lee parámetros de la query string en el cliente.
 *
 * La salida estática no puede prerenderizar UUIDs desconocidos, así que las rutas `:id` del
 * contrato se implementan como query params (`/movies/detail?id=…`). La URL es un store externo:
 * `useSyncExternalStore` la lee en cada render y se suscribe a sus cambios (historial del
 * navegador y swaps de `<ClientRouter />`). En el servidor y durante la hidratación el snapshot
 * es `null`, así que cada consumidor debe manejar ese caso.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  // `<ClientRouter />` cambia de página sin recargar.
  document.addEventListener('astro:after-swap', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    document.removeEventListener('astro:after-swap', onChange);
  };
}

const getSearch = () => window.location.search;
const getServerSearch = () => null;

/** El `location.search` actual, o `null` durante el prerender y la hidratación. */
function useSearch(): string | null {
  return useSyncExternalStore(subscribe, getSearch, getServerSearch);
}

/** Lee un único parámetro de la query string. */
export function useQueryParam(name: string): string | null {
  const search = useSearch();
  return search === null ? null : new URLSearchParams(search).get(name);
}

/** Lee varios parámetros a la vez. */
export function useQueryParams<const Names extends readonly string[]>(
  names: Names,
): Readonly<Record<Names[number], string | null>> {
  const search = useSearch();
  const params = new URLSearchParams(search ?? '');
  return Object.fromEntries(
    names.map((name) => [name, search === null ? null : params.get(name)]),
  ) as Readonly<Record<Names[number], string | null>>;
}
