import { requestJson, type CallOptions } from './shared.ts';
import type { MetadataConfig, MetadataEnums } from '../types.ts';

/**
 * `/api/metadata`: público y cacheable (backend-status-for-frontend.md §5.4).
 *
 * Ambas respuestas llevan un `ETag` derivado del contenido y `Cache-Control:
 * max-age=86400, public`; la caché HTTP del navegador ya respeta esto en un
 * `fetch` común, así que este módulo solo necesita memoizar la promesa en vuelo
 * por carga de página para evitar solicitudes duplicadas de llamadores independientes.
 *
 * La promesa compartida **no** usa el `AbortSignal` del llamador: si el primer componente
 * se desmontara, abortaría la solicitud para todos los demás que la esperan. Es una
 * respuesta chica y cacheable, así que se deja completar siempre.
 */

let enumsPromise: Promise<MetadataEnums> | null = null;
let configPromise: Promise<MetadataConfig> | null = null;

/** Los seis enums como listas `{ value, label }`. Las etiquetas son solo en inglés. */
export function getMetadataEnums(_options: CallOptions = {}): Promise<MetadataEnums> {
  enumsPromise ??= requestJson<MetadataEnums>('/api/metadata/enums').catch(
    (error: unknown) => {
      enumsPromise = null;
      throw error;
    },
  );
  return enumsPromise;
}

/** `premiumSeatMultiplier`, `screeningTurnoverMinutes`, `currency`, `seatHoldTtlSeconds`. */
export function getMetadataConfig(_options: CallOptions = {}): Promise<MetadataConfig> {
  configPromise ??= requestJson<MetadataConfig>('/api/metadata/config').catch(
    (error: unknown) => {
      configPromise = null;
      throw error;
    },
  );
  return configPromise;
}

/** Valores por defecto documentados, usados solo hasta que `getMetadataConfig` se resuelva. */
export const DEFAULT_METADATA_CONFIG: MetadataConfig = {
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
): Promise<MetadataConfig> {
  try {
    return await getMetadataConfig(options);
  } catch {
    return DEFAULT_METADATA_CONFIG;
  }
}
