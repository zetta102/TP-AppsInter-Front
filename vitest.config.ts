/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// `getViteConfig` resuelve los módulos virtuales de Astro (`astro:env/client`, …) en los tests.
// Las pruebas `*.integration.test.ts` necesitan el backend: ver `vitest.integration.config.ts`.
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
    environment: 'node',
  },
});
