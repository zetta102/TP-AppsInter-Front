import { useEffect, useState } from 'react';

/** Espera tras la última tecla antes de buscar. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * El texto de un campo de búsqueda, recortado y estable durante `delayMs` desde el último cambio.
 *
 * A diferencia de `useDeferredValue` (que solo baja la prioridad del render y puede emitir cada
 * valor intermedio), esto evita una solicitud por tecla. Vaciar el campo se aplica de inmediato.
 */
export function useDebouncedSearch(value: string, delayMs = SEARCH_DEBOUNCE_MS): string {
  const trimmed = value.trim();
  const [debounced, setDebounced] = useState(trimmed);

  // Ajuste durante el render (no en un efecto): al vaciar el campo no queda un valor viejo que
  // reaparezca mientras corre la espera de la próxima búsqueda.
  if (trimmed === '' && debounced !== '') setDebounced('');

  useEffect(() => {
    if (trimmed === '') return;
    const id = window.setTimeout(() => setDebounced(trimmed), delayMs);
    return () => window.clearTimeout(id);
  }, [trimmed, delayMs]);

  return trimmed === '' ? '' : debounced;
}
