/**
 * Enlaces a `/login` que recuerdan adónde volver (`?next=`), y la validación de ese destino.
 *
 * Sin dependencias del navegador ni de Astro, para poder probarlo en Node.
 */

/** Adónde ir tras iniciar sesión cuando no hay un `next` válido. */
export const DEFAULT_AFTER_LOGIN = '/reservations';

/** Origen ficticio para resolver `next`: cualquier destino fuera de él se descarta. */
const SAME_ORIGIN = 'https://cine.invalid';

/**
 * Valida un `?next=` para que no pueda convertirse en una redirección abierta: solo se aceptan
 * rutas del mismo origen. Resolverlo con `URL.parse` cubre también trucos como `//evil.com`,
 * `/\evil.com` (que el navegador trata como `//`) o `javascript:`.
 */
export function safeNext(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!raw?.startsWith('/')) return fallback;
  const url = URL.parse(raw, SAME_ORIGIN);
  return url?.origin === SAME_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : fallback;
}

/** `/login`, con `?next=` cuando hay un destino al que volver. */
export function loginHref(next?: string | null): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

/** La ruta actual (con su query string), o `/` fuera del navegador. */
export function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}
