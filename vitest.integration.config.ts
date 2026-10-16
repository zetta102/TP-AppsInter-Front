/// <reference types="vitest/config" />
import { loadEnv } from 'vite';
import { getViteConfig } from 'astro/config';

// Pruebas contra el backend real (`PUBLIC_API_BASE_URL`). Comparten una sesión, así que
// corren en orden y con timeouts de red. Las credenciales de admin (`QA_ADMIN_EMAIL`,
// `QA_ADMIN_PASSWORD`) se leen de `.env.test.local`, ignorado por git.
export default getViteConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    env: loadEnv('test', '.', 'QA_'),
  },
});
