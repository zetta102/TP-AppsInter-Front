/**
 * Las URLs de la app con parámetros de ruta, en un solo lugar.
 *
 * Los ids son UUID del backend; igual se codifican, para que un valor raro nunca cambie la forma
 * de la ruta.
 *
 * Sin dependencias del navegador ni del router, para poder probarlo en Node.
 */

const segment = encodeURIComponent;

export function moviePath(movieId: string): string {
  return `/movies/${segment(movieId)}`;
}

export function screeningSeatsPath(screeningId: string): string {
  return `/screenings/${segment(screeningId)}/seats`;
}

/** El checkout de una función, con la selección de asientos en orden (`?seats=`). */
export function checkoutPath(screeningId: string, seatIds: readonly string[]): string {
  const base = `/checkout/${segment(screeningId)}`;
  return seatIds.length === 0 ? base : `${base}?seats=${seatIds.map(segment).join(',')}`;
}

export function reservationPath(reservationId: string): string {
  return `/reservations/${segment(reservationId)}`;
}

export function roomSeatsPath(roomId: string): string {
  return `/admin/rooms/${segment(roomId)}/seats`;
}

/**
 * Hasta noviembre de 2026 el build era estático y los parámetros de ruta viajaban en la query
 * string (`/movies/detail?id=…`). Estas funciones traducen esas URLs viejas (marcadores,
 * historial, `?next=` guardados) a las actuales; sin id, llevan al listado correspondiente.
 */
export const legacyRedirects = {
  '/movies/detail': (query: URLSearchParams) => {
    const id = query.get('id');
    return id ? moviePath(id) : '/movies';
  },
  '/screenings/seats': (query: URLSearchParams) => {
    const id = query.get('id');
    return id ? screeningSeatsPath(id) : '/';
  },
  '/checkout': (query: URLSearchParams) => {
    const id = query.get('screening');
    const seats = query.get('seats')?.split(',').filter(Boolean) ?? [];
    return id ? checkoutPath(id, seats) : '/';
  },
  '/reservations/detail': (query: URLSearchParams) => {
    const id = query.get('id');
    return id ? reservationPath(id) : '/reservations';
  },
  '/admin/rooms/seats': (query: URLSearchParams) => {
    const id = query.get('id');
    return id ? roomSeatsPath(id) : '/admin/rooms';
  },
} as const satisfies Readonly<Record<string, (query: URLSearchParams) => string>>;
