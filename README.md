# Cine — frontend

Un frontend Astro + React para el backend de reservas de cine **Cine**: el
catálogo público, la autenticación JWT, la selección de butacas con retención,
el checkout con confitería, la gestión de reservas y las consolas de administración.

El contrato del backend (endpoints, tipos, flujos y códigos de error) está en
[`backend-status-for-frontend.md`](./backend-status-for-frontend.md): es la
fuente de verdad para cualquier cambio en `src/lib/api` y `src/lib/types.ts`.

El documento inverso, [`frontend-status-for-backend.md`](./frontend-status-for-backend.md), describe
cómo usa la API este frontend, qué comportamientos del backend da por sentados y las mejoras
pedidas al backend.

## Stack

| Elemento | Elección | Notas |
| --- | --- | --- |
| Framework | Astro 7.4, `output: 'static'` | Sin adaptador, sin SSR — cada llamada a la API se hace desde el cliente. |
| Islands | React 19.3 vía `@astrojs/react` | Actions (`useActionState`/`useFormStatus`), `useOptimistic`, ref-as-prop. |
| Estilos | Tailwind CSS 4.3 vía `@tailwindcss/vite` | Sin `tailwind.config.js`; los tokens viven en `@theme` en `src/styles/global.css`. |
| Tipos | TypeScript 7 | `verbatimModuleSyntax` + `erasableSyntaxOnly`, por lo que no hay `enum` — los enums de la API son objetos `as const`. |
| Runtime | Node ≥ 22.22 (desarrollo en Node 26) | `Promise.withResolvers`, `AbortSignal.any`/`timeout`, `Object.groupBy`, `structuredClone`. |

## Primeros pasos

```sh
npm install
cp .env.example .env   # ajusta PUBLIC_API_BASE_URL si el backend no está en :8080
npm run dev            # http://localhost:5173
```

El servidor de desarrollo corre en el puerto **5173** de forma deliberada: el
stack de observabilidad compose del backend usa el `3000`, y el `5173` ya está
incluido en el `CINE_CORS_ALLOWED_ORIGINS` por defecto del backend.

### Comandos

| Comando | Acción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en `localhost:5173` |
| `npm run build` | Build estático en `./dist/` |
| `npm run preview` | Sirve el resultado del build |
| `npm run typecheck` | `astro sync` (genera los tipos de `astro:env`) + `tsc --noEmit` |
| `npm run lint` | `oxlint` (reglas de React Hooks, a11y y correctness) |
| `npm run format` / `format:check` | Prettier con los plugins de Astro y Tailwind (orden de clases) |
| `npm run check:astro` | `astro check` sobre los `.astro` con TypeScript 6 aislado en `tools/astro-check` |
| `npm test` | Pruebas unitarias (Vitest) de `src/lib` |
| `npm run test:integration` | Pruebas contra el backend real; el flujo de admin necesita `QA_ADMIN_EMAIL`/`QA_ADMIN_PASSWORD` en `.env.test.local` (ver `.env.test.local.example`) |
| `npm run check` | Typecheck (TS + `.astro`), lint, pruebas unitarias y build completo |

> ESLint no se usa porque `typescript-eslint` todavía no soporta TypeScript 7; `oxlint` no depende
> de la API de TypeScript.
>
> `@astrojs/check` todavía no soporta TypeScript 7, así que `check:astro` lo ejecuta desde
> `tools/astro-check`, con su propio TypeScript 6 fijado. El proyecto sigue usando TypeScript 7.

### Entorno

| Variable | Por defecto | Propósito |
| --- | --- | --- |
| `PUBLIC_API_BASE_URL` | `http://localhost:8080` | Origen del backend. |
| `PUBLIC_API_TIMEOUT_MS` | `15000` | Timeout por solicitud. |

Ambas están declaradas en el esquema `astro:env` en `astro.config.mjs` y se
leen desde `astro:env/client` — nunca directamente mediante `import.meta.env`.

## Desviaciones de rutas

El build es SSG puro, y un UUID desconocido no puede prerenderizarse, así que
los parámetros de ruta de la especificación se llevan como parámetros de
consulta en su lugar. El comportamiento es idéntico en todo lo demás.

| Ruta conceptual | Implementado como |
| --- | --- |
| `/movies/:id` | `/movies/detail?id=<uuid>` |
| `/screenings/:id/seats` | `/screenings/seats?id=<uuid>` |
| `/checkout/:screeningId` | `/checkout?screening=<uuid>&seats=<uuid,uuid>` |
| `/reservations/:id` | `/reservations/detail?id=<uuid>` |
| `/admin/rooms/:id/seats` | `/admin/rooms/seats?id=<uuid>` |

## Estructura

```
src/
  lib/
    types.ts              DTOs de solo tipos (nombres de §6), Page<T>, Problem
    enums.ts              enums de la API como uniones `as const` + mapas de etiquetas
    problem.ts            ApiError, parseo de RFC 7807, extracción de errores de campo
    http.ts               el único cuello de botella de fetch: timeouts, reintento en 401
    auth-store.ts         tokens, perfil, el mutex de refresco
    auth-context.tsx      contexto de React 19 + snapshot con useSyncExternalStore
    api/                  un módulo por recurso
    pricing.ts            cálculos HALF_UP de entradas y totales de línea
    query.ts              constructor tipado de page/size/sort
    format.ts             formateadores Intl de moneda y fecha
    use-resource.ts       hook de lectura con AbortSignal y refetch
    use-seat-hold.ts      ciclo de vida de la retención de asientos (crear, reemplazar, renovar)
    use-seat-stream.ts    disponibilidad de asientos en vivo por SSE
    sse.ts                parser de Server-Sent Events sobre fetch
  components/
    ui/                   Field, DataTable, Pagination, Modal, Guards, …
    catalogue/ booking/ reservations/ admin/ auth/
  layouts/Layout.astro    shell con <ClientRouter /> y una navegación persistente
  pages/                  rutas públicas, de autenticación, cuenta y /admin
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
- **El mapa de butacas se actualiza en vivo.** Se carga con
  `GET /api/screenings/{id}?include=seatMap` y se parchea con los eventos del stream
  SSE `/seats/stream` (con `fetch`, para poder enviar el token); tras cada reconexión
  se vuelve a pedir completo y un polling lento queda como red de seguridad.
- **El checkout retiene los asientos.** La primera selección crea la retención
  (`POST /api/screenings/{id}/holds`) y cada cambio la reemplaza de forma atómica
  (`PUT /api/holds/{id}`, sin extenderla); el `holdId` viaja en la cotización y en la
  compra. Un `409` igual significa que hay que volver a obtener el mapa y resaltar lo
  que se perdió.
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
- **`endsAt` se calcula en el servidor** como `startsAt + runtime + 15 min`. El
  programador (scheduler) previsualiza la misma aritmética pero nunca envía
  el campo.

