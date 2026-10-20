import { requestJson } from './shared.ts';
import { PREMIUM_MULTIPLIER } from '../pricing.ts';
import type { MetadataConfig, MetadataEnums } from '../types.ts';

/**
 * `/api/metadata`: público y cacheable.
 *
 * Ambas respuestas llevan un `ETag` derivado del contenido y `Cache-Control:
 * max-age=86400, public`; la caché HTTP del navegador ya respeta esto en un
 * `fetch` común, así que este módulo solo necesita memoizar la promesa en vuelo
 * por carga de página para evitar solicitudes duplicadas de llamadores independientes.
 *
 * Por eso estas funciones no reciben un `AbortSignal`: si el primer componente se desmontara,
 * abortaría la solicitud para todos los demás que la esperan. Es una respuesta chica y
 * cacheable, así que se deja completar siempre.
 */

/** Comparte una única promesa en vuelo; ante un fallo se olvida para que el próximo llamado reintente. */
function sharedRequest<T>(path: string): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= requestJson<T>(path).catch((error: unknown) => {
      pending = null;
      throw error;
    }));
}

/** Los seis enums como listas `{ value, label }`. Las etiquetas son solo en inglés. */
export const getMetadataEnums = sharedRequest<MetadataEnums>('/api/metadata/enums');

/** `premiumSeatMultiplier`, `screeningTurnoverMinutes`, `currency`, `seatHoldTtlSeconds`. */
export const getMetadataConfig = sharedRequest<MetadataConfig>('/api/metadata/config');

/** Valores por defecto documentados, usados solo hasta que `getMetadataConfig` se resuelva. */
export const DEFAULT_METADATA_CONFIG: MetadataConfig = {
  premiumSeatMultiplier: PREMIUM_MULTIPLIER,
  screeningTurnoverMinutes: 15,
  currency: 'USD',
  seatHoldTtlSeconds: 300,
};

/**
 * Resuelve la configuración real y, ante un fallo (por ejemplo, sin conexión), recurre a los
 * valores documentados en lugar de romper precios o la cuenta regresiva de la retención.
 */
export async function getMetadataConfigOrDefault(): Promise<MetadataConfig> {
  try {
    return await getMetadataConfig();
  } catch {
    return DEFAULT_METADATA_CONFIG;
  }
}
