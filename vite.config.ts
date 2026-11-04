import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // React Compiler (Oxc): memoiza componentes y hooks automáticamente, sin useMemo/useCallback.
    // Lo ejecuta `oxc-transform-react`, una devDependency.
    react({ compiler: { target: '19' } }),
    tailwindcss(),
  ],
  // Solo las variables `PUBLIC_*` llegan al bundle del cliente; `src/lib/env.ts` las valida.
  envPrefix: 'PUBLIC_',
  server: {
    // El 3000 lo usa el stack de observabilidad compose del backend, y el 5173 ya está en el
    // CINE_CORS_ALLOWED_ORIGINS por defecto del backend.
    port: 5173,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: true,
  },
});
