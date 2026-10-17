import { useEffect } from 'react';

/**
 * Título específico para páginas de detalle cuyo id viaja en la query string (`?id=…`).
 *
 * El `<title>` lo emite `Layout.astro` en el prerender, cuando todavía no se sabe qué película
 * o reserva se muestra; el `<title>` de React 19 no sirve acá porque el navegador usa el primero
 * del documento. Con `null` (datos todavía cargando) se conserva el título genérico.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} · Cine`;
  }, [title]);
}
