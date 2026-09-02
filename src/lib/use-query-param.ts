import { useEffect, useState } from 'react';

/**
 * Reads a query-string parameter on the client.
 *
 * Static output cannot prerender unknown UUIDs, so the spec's `:id` routes are
 * implemented as query parameters (`/movies/detail?id=…`). During prerender
 * there is no `window`, so the value starts `null` and settles on hydration —
 * every consumer must handle the `null` case.
 */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name),
  );

  useEffect(() => {
    const read = () => setValue(new URLSearchParams(window.location.search).get(name));
    read();

    // Astro's <ClientRouter /> swaps pages without a full reload.
    window.addEventListener('popstate', read);
    document.addEventListener('astro:after-swap', read);
    return () => {
      window.removeEventListener('popstate', read);
      document.removeEventListener('astro:after-swap', read);
    };
  }, [name]);

  return value;
}

/** Reads several query parameters at once. */
export function useQueryParams<const Names extends readonly string[]>(
  names: Names,
): Readonly<Record<Names[number], string | null>> {
  const [values, setValues] = useState<Record<string, string | null>>(() => {
    const search =
      typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
    return Object.fromEntries(names.map((name) => [name, search.get(name)]));
  });

  const key = names.join('|');

  useEffect(() => {
    const read = () => {
      const search = new URLSearchParams(window.location.search);
      setValues(Object.fromEntries(key.split('|').map((name) => [name, search.get(name)])));
    };
    read();

    window.addEventListener('popstate', read);
    document.addEventListener('astro:after-swap', read);
    return () => {
      window.removeEventListener('popstate', read);
      document.removeEventListener('astro:after-swap', read);
    };
  }, [key]);

  return values as Readonly<Record<Names[number], string | null>>;
}
