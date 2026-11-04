/// <reference types="vitest/config" />
import { defineConfig, loadEnv, mergeConfig } from 'vite';
import viteConfig from './vite.config.ts';

// Hereda la configuración de Vite (plugins y `envPrefix`, que expone `PUBLIC_*` en
// `import.meta.env`); cada proyecto la toma con `extends: true`. Se elige con `--project`:
//  - `unit`: pruebas sin red de `src/lib` (`npm test`).
//  - `integration`: contra el backend real (`PUBLIC_API_BASE_URL`). Comparten una sesión, así
//    que corren en orden y con timeouts de red. Las credenciales de admin (`QA_ADMIN_EMAIL`,
//    `QA_ADMIN_PASSWORD`) se leen de `.env.test.local`, ignorado por git.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.integration.test.ts'],
            environment: 'node',
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            include: ['src/**/*.integration.test.ts'],
            environment: 'node',
            fileParallelism: false,
            testTimeout: 20_000,
            env: loadEnv('test', '.', 'QA_'),
          },
        },
      ],
    },
  }),
);
