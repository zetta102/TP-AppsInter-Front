import { createContext, use, useEffect } from 'react';

/**
 * Título específico para páginas de detalle (`/movies/:id`, `/reservations/:id`, …).
 *
 * El layout raíz arma el `<title>` con el `handle` de la ruta, que no sabe qué película o reserva
 * se muestra. Esta página lo reemplaza mientras está montada; con `null` (datos todavía
 * cargando) se conserva el título genérico.
 */

/** La provee `RootLayout.tsx`: fija o (con `null`) quita el título de la página actual. */
export const DocumentTitleContext = createContext<(title: string | null) => void>(() => {});

export function useDocumentTitle(title: string | null | undefined): void {
  const setTitle = use(DocumentTitleContext);
  useEffect(() => {
    if (!title) return;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
}
