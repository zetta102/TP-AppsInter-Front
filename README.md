# Cine — frontend

Un frontend React (SPA sobre Vite) para el backend de reservas de cine **Cine**: el
catálogo público, la autenticación JWT, la selección de asientos con retención,
el checkout con confitería, la gestión de reservas y las consolas de administración.

La fuente de verdad para cualquier cambio en `src/lib/api` y `src/lib/types.ts` es el
OpenAPI del backend (`GET /v3/api-docs`); `npm run test:integration` verifica que las listas
de ordenación y el registro de códigos de error del cliente no se desvíen de él.

## Stack

| Elemento | Elección                                               | Notas                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI       | React 19.3 + React Compiler (Oxc)                      | Actions (`useActionState`/`useFormStatus`), `useOptimistic`, Effect Events (`useEffectEvent`), `<ViewTransition>`, ref-as-prop; sin `useMemo`/`useCallback` manuales salvo donde el compilador no llega (`use-resource.ts`).       |
| Build    | Vite 8 vía `@vitejs/plugin-react`                      | SPA sin SSR: un único `index.html` y un fragmento por página — cada llamada a la API se hace desde el cliente.                                                                                                                     |
| Rutas    | React Router 8, modo data (`createBrowserRouter`)      | Rutas `lazy` en `src/router.tsx`; la documentación viene con el paquete, en `node_modules/react-router/docs`.                                                                                                                      |
| Estilos  | Tailwind CSS 4.3 vía `@tailwindcss/vite`               | Sin `tailwind.config.js`; los tokens viven en `@theme` en `src/styles/global.css`.                                                                                                                                                 |
| Tipos    | TypeScript 7                                           | `verbatimModuleSyntax` + `erasableSyntaxOnly`, por lo que no hay `enum` — los enums de la API son objetos `as const`.                                                                                                              |
| Runtime  | Node ≥ 24 (desarrollo en Node 26, ver `.node-version`) | `using` (Explicit Resource Management), `Intl.DurationFormat`, métodos de `Set` (`intersection`, `difference`, `isSubsetOf`), `Array.fromAsync`, `Map.groupBy`, `URL.parse`, `Promise.withResolvers`, `AbortSignal.any`/`timeout`. |

## Primeros pasos

```sh
npm install
cp .env.example .env   # ajustá PUBLIC_API_BASE_URL si el backend no está en :8080
npm run dev            # http://localhost:5173
```

El servidor de desarrollo corre en el puerto **5173** de forma deliberada: el
stack de observabilidad compose del backend usa el `3000`, y el `5173` ya está
incluido en el `CINE_CORS_ALLOWED_ORIGINS` por defecto del backend.

### Comandos

| Comando                           | Acción                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo en `localhost:5173`                                                                                                                                    |
| `npm run build`                   | Build de producción en `./dist/`                                                                                                                                              |
| `npm run preview`                 | Sirve el resultado del build en `localhost:5173`                                                                                                                              |
| `npm run typecheck`               | `tsc --noEmit`                                                                                                                                                                |
| `npm run lint`                    | `oxlint` (reglas de React Hooks, a11y y correctness)                                                                                                                          |
| `npm run format` / `format:check` | Prettier con el plugin de Tailwind (orden de clases)                                                                                                                          |
| `npm test`                        | Pruebas unitarias de `src/lib` (proyecto `unit` de Vitest)                                                                                                                    |
| `npm run test:integration`        | Pruebas contra el backend real (proyecto `integration`); el flujo de admin necesita `QA_ADMIN_EMAIL`/`QA_ADMIN_PASSWORD` en `.env.test.local` (ver `.env.test.local.example`) |
| `npm run check`                   | Typecheck, lint, pruebas unitarias y build completo                                                                                                                           |

> ESLint no se usa porque `typescript-eslint` todavía no soporta TypeScript 7; `oxlint` no depende
> de la API de TypeScript.

### Entorno

| Variable                | Por defecto             | Propósito              |
| ----------------------- | ----------------------- | ---------------------- |
| `PUBLIC_API_BASE_URL`   | `http://localhost:8080` | Origen del backend.    |
| `PUBLIC_API_TIMEOUT_MS` | `15000`                 | Timeout por solicitud. |

Vite solo expone al cliente las variables `PUBLIC_*`. `src/lib/env.ts` les aplica
los valores por defecto y las valida al cargar; el resto del código las importa
de ahí, nunca directamente de `import.meta.env`.

## Rutas

Las rutas con parámetros siguen el contrato tal cual. Las armá siempre con
`src/lib/paths.ts`.

| Ruta                     | Notas                                                |
| ------------------------ | ---------------------------------------------------- |
| `/movies/:id`            |                                                      |
| `/screenings/:id/seats`  |                                                      |
| `/checkout/:screeningId` | La selección de asientos va en `?seats=<uuid,uuid>`. |
| `/reservations/:id`      |                                                      |
| `/admin/rooms/:id/seats` |                                                      |

Hasta la migración a React Router el build era estático y esas rutas viajaban en
la query string (`/movies/detail?id=<uuid>`, `/checkout?screening=<uuid>&seats=…`).
Esas URLs siguen funcionando: redirigen a las actuales (`legacyRedirects` en
`src/lib/paths.ts`).

## Despliegue

`dist/` es una SPA: cualquier ruta que no sea un archivo existente tiene que
responder con `index.html` (fallback de SPA), o las URLs profundas como
`/movies/<uuid>` darán 404 al recargar. Por ejemplo, en nginx:

```nginx
location / {
  try_files $uri /index.html;
}
```

Los archivos de `dist/assets/` llevan hash en el nombre y se pueden cachear para
siempre; `index.html` no.

## Estructura

```
index.html                el documento de la SPA (monta src/main.tsx)
src/
  main.tsx                arranque: tipografías, estilos y <RouterProvider>
  router.tsx              tabla de rutas (lazy), títulos y redirecciones de las URLs viejas
  layouts/RootLayout.tsx  shell: fondo, navegación, <main> con <ViewTransition>, pie
  pages/                  páginas con contenido propio (inicio, login, privacidad, …)
  lib/
    env.ts                PUBLIC_API_BASE_URL / PUBLIC_API_TIMEOUT_MS validadas
    paths.ts              constructores de rutas con parámetros y redirecciones de las URLs viejas
    navigation.ts         navegación para el código fuera de React (lo registra el router)
    types.ts              DTOs de solo tipos (mismos nombres que los schemas de OpenAPI), Page<T>, Problem
    enums.ts              enums de la API como uniones `as const` + mapas de etiquetas
    problem.ts            ApiError, parseo de RFC 7807, extracción de errores de campo
    http.ts               el único cuello de botella de fetch: timeouts, reintento en 401
    auth-store.ts         tokens, perfil, el mutex de refresco
    use-auth.ts           hook de React 19 sobre el store (useSyncExternalStore)
    login-redirect.ts     enlaces a /login con `?next=` y su validación (sin redirecciones abiertas)
    api/                  un módulo por recurso
    pricing.ts            cálculos HALF_UP de entradas y totales de línea
    query.ts              constructor tipado de page/size/sort
    format.ts             formateadores Intl de moneda y fecha
    form.ts               estado y lectura de FormData para las Actions de formulario
    use-resource.ts       hook de lectura con AbortSignal y refetch
    use-debounced-search.ts  texto de búsqueda con debounce (una solicitud al dejar de escribir)
    use-metadata-config.ts   configuración de /api/metadata/config con valores por defecto
    use-seat-hold.ts      ciclo de vida de la retención de asientos (crear, reemplazar, renovar)
    use-seat-stream.ts    disponibilidad de asientos en vivo por SSE
    use-live-seat-map.ts  stream SSE + refetch al reconectar + polling de seguridad sobre el mapa
    sse.ts                parser de Server-Sent Events sobre fetch
    use-net-mode.ts       modo del fondo "Net" (animado/quieto/liso) recordado en localStorage
  components/
    ui/                   Field, DataTable, Pagination, Modal, ConfirmDialog, Badge, Feedback, Guards, …
    catalogue/ booking/ reservations/ admin/ auth/ account/ contact/
    NavBar.tsx            navegación principal
    NetBackground.tsx     el fondo de baldosas y el selector "Fondo" del pie
    RouteError.tsx        404 y límite de errores de las páginas
```

## Comportamientos a tener en cuenta

Estos son requisitos de contrato, no preferencias — cambiarlos rompe la
corrección del sistema.

- **Un solo refresco a la vez.** Los refresh tokens rotan y se revocan al
  usarse, así que dos refrescos concurrentes cierran la sesión del usuario.
  `auth-store.ts` comparte una única promesa en curso mediante
  `Promise.withResolvers()`.
- **Los roles provienen de `GET /api/users/me`**, nunca de decodificar el JWT.
- **Los errores de validación se traducen desde `violations`.** Cada
  restricción llega como `{ field, code, params }` y `problem.ts` arma el texto
  en español; el texto de `errors` depende del idioma del servidor y solo se usa
  como respaldo.
- **Refresco solo ante `401 TOKEN_EXPIRED`.** Cualquier otro `401` cierra la
  sesión sin reintentar.
- **Las lecturas de funciones envían el token si hay sesión** (`auth: 'optional'`):
  así la disponibilidad no descuenta las retenciones propias del usuario.
- **El mapa de asientos se actualiza en vivo.** Se carga con
  `GET /api/screenings/{id}?include=seatMap` y se parchea con los eventos del stream
  SSE `/seats/stream` (con `fetch`, para poder enviar el token); tras cada reconexión
  se vuelve a pedir completo y un polling lento queda como red de seguridad.
- **El checkout retiene los asientos.** La primera selección crea la retención
  (`POST /api/screenings/{id}/holds`) y cada cambio la reemplaza de forma atómica
  (`PUT /api/holds/{id}`, sin extenderla); el `holdId` viaja en la cotización y en la
  compra solo si cubre toda la selección (`holdIdFor`). Un `409` igual significa que hay
  que volver a obtener el mapa y resaltar lo que se perdió.
- **Las acciones destructivas se confirman** con `useConfirm` (`ConfirmDialog.tsx`), un
  `alertdialog` dentro de la app, nunca con `window.confirm()`.
- **Archivar, no borrar.** Películas, salas, funciones y productos con historial no
  se pueden eliminar (`409 RESOURCE_IN_USE`): admin los archiva y los listados los
  ocultan salvo con "Mostrar archivados".
- **La confitería del checkout usa `GET /api/products`** (público); `/api/inventory`
  es solo para administradores.
- **Cancelar es `POST /api/reservations/{id}/cancellation`** y devuelve `200` con la
  reserva cancelada (`totalPrice = 0`, `originalTotalPrice` con el monto anterior).
- **`size` máximo 100.** El backend lo recorta en silencio; para listas completas
  se usa `collectAllPages` (`src/lib/api/shared.ts`).
- **Textos en español rioplatense (voseo).** El texto del backend nunca se muestra:
  los mensajes de error se traducen en el cliente a partir de `code`
  (`src/lib/problem.ts`).
- **`endsAt` se calcula en el servidor** como `startsAt + runtime + screeningTurnoverMinutes`
  (15 min por defecto, publicado en `GET /api/metadata/config`). El programador (scheduler)
  previsualiza la misma aritmética pero nunca envía el campo.
