/**
 * Configuración pública del cliente, leída de `import.meta.env` y validada una sola vez.
 *
 * Vite solo expone las variables `PUBLIC_*` (`envPrefix` en `vite.config.ts`) y las inyecta en
 * el build como texto: acá se aplican los valores por defecto y se rechazan los inválidos, para
 * que un `.env` mal escrito falle al cargar en lugar de en la primera solicitud.
 */

function parseBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() || 'http://localhost:8080';
  const url = URL.parse(value);
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(`PUBLIC_API_BASE_URL no es una URL http(s) válida: "${value}"`);
  }
  return value;
}

function parseTimeout(raw: string | undefined): number {
  const value = raw?.trim() || '15000';
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`PUBLIC_API_TIMEOUT_MS debe ser un número positivo: "${value}"`);
  }
  return timeout;
}

/** Origen del backend. */
export const PUBLIC_API_BASE_URL = parseBaseUrl(import.meta.env.PUBLIC_API_BASE_URL);

/** Timeout por solicitud, en milisegundos. */
export const PUBLIC_API_TIMEOUT_MS = parseTimeout(import.meta.env.PUBLIC_API_TIMEOUT_MS);
