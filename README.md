# Cine — frontend

Un frontend Astro + React para el backend de reservas de cine **Cine**, que
implementa por completo [`frontend-spec.md`](./frontend-spec.md): el catálogo
público, la autenticación JWT, la selección de butacas, el checkout con
concesiones, la gestión de reservas y las siete consolas de administración.

Las carencias detectadas en el backend al construir este frontend están
documentadas en [`backend-spec.md`](./backend-spec.md).

## Stack

| Elemento | Elección | Notas |
| --- | --- | --- |
| Framework | Astro 7.2, `output: 'static'` | Sin adaptador, sin SSR — cada llamada a la API se hace desde el cliente. |
| Islands | React 19.2 vía `@astrojs/react` | Actions (`useActionState`/`useFormStatus`), `useOptimistic`, ref-as-prop. |
| Estilos | Tailwind CSS 4 vía `@tailwindcss/vite` | Sin `tailwind.config.js`; los tokens viven en `@theme` en `src/styles/global.css`. |
| Tipos | TypeScript 7 | `verbatimModuleSyntax` + `erasableSyntaxOnly`, por lo que no hay `enum` — los enums de la API son objetos `as const`. |
| Runtime | Node 26 | `Promise.withResolvers`, `AbortSignal.any`/`timeout`, `Object.groupBy`, `structuredClone`. |

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
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | Typecheck y luego un build completo |

> `astro check` no está integrado: `@astrojs/check` todavía depende de
> TypeScript `^5 || ^6` y se niega a instalarse con TypeScript 7. `npm run check`
> cubre lo mismo con `tsc` más un build.

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

| `frontend-spec.md` §10 | Implementado como |
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
    types.ts              DTOs de solo tipos, Page<T>, ProblemDetail
    enums.ts              enums de la API como uniones `as const` + mapas de etiquetas
    problem.ts            ApiError, parseo de RFC 7807, extracción de errores de campo
    http.ts               el único cuello de botella de fetch: timeouts, reintento en 401
    auth-store.ts         tokens, perfil, el mutex de refresco
    auth-context.tsx      contexto de React 19 + snapshot con useSyncExternalStore
    api/                  un módulo por recurso
    pricing.ts            cálculos HALF_UP de entradas y totales de línea
    query.ts              constructor tipado de page/size/sort
    format.ts             formateadores Intl de moneda y fecha
    reservation-snapshots.ts  snapshots previos a la cancelación
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
- **Los errores de validación se enlazan solo por nombre de campo.** Los
  mensajes de bean-validation se localizan en el servidor, así que el texto
  del mensaje nunca se usa para comparar.
- **El mapa de butacas es un snapshot, no un bloqueo.** Las butacas solo se
  reservan en `POST /api/reservations`; un `409` significa que hay que volver
  a obtener el mapa y resaltar lo que se perdió.
- **`GET /api/inventory` es solo para administradores.** El panel de
  concesiones del checkout se oculta ante un `403`. Esta es la carencia más
  grande del backend — ver `backend-spec.md`.
- **Cancelar devuelve `200` con un cuerpo vacío.** Las reservas se clonan con
  `structuredClone` antes del `DELETE` para que la UI pueda seguir mostrando
  lo que se canceló.
- **`endsAt` se calcula en el servidor** como `startsAt + runtime + 15 min`. El
  programador (scheduler) previsualiza la misma aritmética pero nunca envía
  el campo.

