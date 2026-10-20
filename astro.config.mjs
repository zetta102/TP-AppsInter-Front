// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  // React Compiler (Oxc): memoiza componentes y hooks automáticamente, sin useMemo/useCallback.
  // `oxc-transform-react` lo consume `@vitejs/plugin-react`; ver `overrides` en package.json.
  integrations: [react({ compiler: true })],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  server: {
    // El 3000 lo usa el stack de observabilidad compose del backend, y el 5173 ya está en el
    // CINE_CORS_ALLOWED_ORIGINS por defecto del backend.
    port: 5173,
    host: true,
  },
  env: {
    schema: {
      PUBLIC_API_BASE_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://localhost:8080',
      }),
      PUBLIC_API_TIMEOUT_MS: envField.number({
        context: 'client',
        access: 'public',
        default: 15000,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
