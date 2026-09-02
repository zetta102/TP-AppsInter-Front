// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [react()],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  server: {
    // Port 3000 is taken by the backend's observability compose service, and 5173
    // is already in the backend's default CINE_CORS_ALLOWED_ORIGINS.
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
