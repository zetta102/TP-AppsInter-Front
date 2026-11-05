import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  ViewTransition,
} from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useMatches } from 'react-router';
import NavBar from '../components/NavBar.tsx';
import { NetBackground, NetModeControl } from '../components/NetBackground.tsx';
import { cx } from '../lib/cx.ts';
import { DocumentTitleContext } from '../lib/use-document-title.ts';

/** El `handle` de cada ruta de página (`src/router.tsx`). */
export interface PageMeta {
  readonly title: string;
  readonly description: string;
  /** Las páginas anchas (mapas de asientos, tablas de admin) salen del contenedor angosto. */
  readonly wide?: boolean;
}

const defaultMeta: PageMeta = {
  title: 'Cine',
  description: 'Reservá asientos, elegí tu confitería y gestioná funciones.',
};

function isPageMeta(handle: unknown): handle is PageMeta {
  return typeof handle === 'object' && handle !== null && 'title' in handle;
}

function formatTitle(title: string): string {
  return title === 'Cine' ? 'Cine' : `${title} · Cine`;
}

/**
 * El shell de todas las páginas: fondo, encabezado con la navegación, `<main>` y pie.
 *
 * Es la ruta raíz, así que el fondo y la navegación no se vuelven a montar al navegar. Cada
 * página sí: su `<ViewTransition>` lleva la ruta como `key`, de modo que ir de una función a otra
 * arranca con estado limpio, igual que una carga de página.
 */
export default function RootLayout() {
  const location = useLocation();
  const meta =
    useMatches()
      .map((match) => match.handle)
      .findLast(isPageMeta) ?? defaultMeta;
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const title = formatTitle(titleOverride ?? meta.title);

  // Efectos de layout: con la transición de vista en curso, los efectos comunes corren recién al
  // terminar la animación; estos van en el mismo commit que el contenido nuevo.
  useLayoutEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [meta.description]);

  // Al cambiar de página, el contenido anterior desaparece: el foco pasa a `<main>` (que ya es el
  // destino del enlace de salto) y una región viva anuncia la página nueva, como una carga
  // completa. La primera carga no se anuncia: el lector ya lee el título del documento.
  const mainRef = useRef<HTMLElement>(null);
  const lastPathname = useRef(location.pathname);
  const [announcement, setAnnouncement] = useState('');
  const announce = useEffectEvent(() => setAnnouncement(formatTitle(meta.title)));

  useLayoutEffect(() => {
    if (lastPathname.current === location.pathname) return;
    lastPathname.current = location.pathname;
    mainRef.current?.focus({ preventScroll: true });
    announce();
  }, [location.pathname]);

  return (
    <DocumentTitleContext value={setTitleOverride}>
      <NetBackground />
      {/* Primer elemento enfocable: permite saltar la navegación repetida (WCAG 2.4.1). */}
      <a
        href="#contenido"
        className="sr-only cine-btn cine-btn-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Saltar al contenido principal
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-brand-600 bg-ink-950/95 shadow-ledge">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link
            to="/"
            className="shrink-0 font-display text-base text-brand-400 text-shadow-brand-700 text-shadow-pixel"
          >
            CINE
          </Link>
          <NavBar />
        </div>
      </header>

      <main
        id="contenido"
        ref={mainRef}
        tabIndex={-1}
        className={cx(
          'mx-auto w-full flex-1 px-4 py-8 focus:outline-none',
          meta.wide ? 'max-w-7xl' : 'max-w-5xl',
        )}
      >
        {/*
          Transición de vista solo al cambiar de página: la `key` saca la página anterior (`exit`)
          y monta la nueva (`enter`), que se cruzan; la navegación queda fuera de la región
          animada. Las actualizaciones dentro de una página (acciones de formulario, refetch) también
          son transiciones de React, pero `default="none"` no las anima.
        */}
        <ViewTransition key={location.pathname} default="none" enter="auto" exit="auto">
          <Outlet />
        </ViewTransition>
      </main>

      <footer className="mt-16 flex flex-col items-center gap-3 border-t-2 border-ink-700 bg-ink-950/85 px-4 py-8 text-center text-xs text-ink-500">
        <p>
          Cine · frontend del backend TP-AppsInter. La disponibilidad de asientos es orientativa
          hasta que confirmás la reserva.

          Contenido diseñado y desarrollado por el equipo compuesto por José Sierra, Naiara Sánchez, Santiago Herrera, y Agustín Mollo, que componen
          el equipo 67.
        </p>
        <nav aria-label="Legal">
          <Link to="/privacidad" className="cine-link">
            Política de privacidad
          </Link>
        </nav>
        <NetModeControl />
      </footer>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <ScrollRestoration />
    </DocumentTitleContext>
  );
}
