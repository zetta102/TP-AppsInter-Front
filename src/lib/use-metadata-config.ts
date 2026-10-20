import { DEFAULT_METADATA_CONFIG, getMetadataConfigOrDefault } from './api/metadata.ts';
import { useResource } from './use-resource.ts';
import type { MetadataConfig } from './types.ts';

/**
 * La configuración de `GET /api/metadata/config` para textos de ayuda y vistas previas.
 *
 * Devuelve los valores documentados mientras carga o si el endpoint falla: un texto de ayuda
 * nunca debe bloquear la pantalla. Las pantallas que calculan precios a cobrar (selector de
 * asientos, checkout) esperan la configuración real junto con el resto de sus datos.
 */
export function useMetadataConfig(): MetadataConfig {
  const config = useResource(() => getMetadataConfigOrDefault(), []);
  return config.data ?? DEFAULT_METADATA_CONFIG;
}
