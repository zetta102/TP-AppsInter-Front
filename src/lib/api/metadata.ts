import { requestJson, type CallOptions } from './shared.ts';
import type { MetadataConfigResponse, MetadataEnumsResponse } from '../types.ts';

/**
 * `/api/metadata`: público y cacheable (frontend-spec.md §8.7).
 *
 * Ambas respuestas llevan un `ETag` derivado del contenido y `Cache-Control:
 * max-age=86400, public`; la caché HTTP del navegador ya respeta esto en un
 * `fetch` común, así que este módulo solo necesita memoizar la promesa en vuelo
 * por carga de página para evitar solicitudes duplicadas de llamadores independientes.
 */

let enumsPromise: Promise<MetadataEnumsResponse> | null = null;
let configPromise: Promise<MetadataConfigResponse> | null = null;

/** Los seis enums como listas `{ value, label }`. Las etiquetas son solo en inglés. */
export function getMetadataEnums(options: CallOptions = {}): Promise<MetadataEnumsResponse> {
  enumsPromise ??= requestJson<MetadataEnumsResponse>('/api/metadata/enums', options).catch(
    (error: unknown) => {
      enumsPromise = null;
      throw error;
    },
  );
  return enumsPromise;
}

/** `premiumSeatMultiplier`, `screeningTurnoverMinutes`, `currency`, `seatHoldTtlSeconds`. */
export function getMetadataConfig(options: CallOptions = {}): Promise<MetadataConfigResponse> {
  configPromise ??= requestJson<MetadataConfigResponse>('/api/metadata/config', options).catch(
    (error: unknown) => {
      configPromise = null;
      throw error;
    },
  );
  return configPromise;
}

/** Valores por defecto documentados, usados solo hasta que `getMetadataConfig` se resuelva. */
export const DEFAULT_METADATA_CONFIG: MetadataConfigResponse = {
  premiumSeatMultiplier: 1.5,
  screeningTurnoverMinutes: 15,
  currency: 'USD',
  seatHoldTtlSeconds: 300,
};

/**
 * Resuelve la configuración real y, ante un fallo (por ejemplo, sin conexión),
 * recurre a los valores documentados en lugar de romper precios o la cuenta regresiva de la retención.
 */
export async function getMetadataConfigOrDefault(
  options: CallOptions = {},
): Promise<MetadataConfigResponse> {
  try {
    return await getMetadataConfig(options);
  } catch {
    return DEFAULT_METADATA_CONFIG;
  }
}
