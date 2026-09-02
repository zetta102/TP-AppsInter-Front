# Cine — frontend

An Astro + React frontend for the **Cine** cinema-booking backend, implementing
[`frontend-spec.md`](./frontend-spec.md) in full: the public catalogue, JWT
authentication, seat selection, checkout with concessions, reservation
management, and all seven admin consoles.

Gaps discovered in the backend while building this are written up in
[`backend-spec.md`](./backend-spec.md).

## Stack

| Piece | Choice | Notes |
| --- | --- | --- |
| Framework | Astro 7.2, `output: 'static'` | No adapter, no SSR — every API call is client-side. |
| Islands | React 19.2 via `@astrojs/react` | Actions (`useActionState`/`useFormStatus`), `useOptimistic`, ref-as-prop. |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` | No `tailwind.config.js`; tokens live in `@theme` in `src/styles/global.css`. |
| Types | TypeScript 7 | `verbatimModuleSyntax` + `erasableSyntaxOnly`, so no `enum` — wire enums are `as const` objects. |
| Runtime | Node 26 | `Promise.withResolvers`, `AbortSignal.any`/`timeout`, `Object.groupBy`, `structuredClone`. |

## Getting started

```sh
npm install
cp .env.example .env   # adjust PUBLIC_API_BASE_URL if the backend is not on :8080
npm run dev            # http://localhost:5173
```

The dev server runs on **5173** deliberately: the backend's observability compose
stack binds `3000`, and `5173` is already in the backend's default
`CINE_CORS_ALLOWED_ORIGINS`.

### Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Dev server on `localhost:5173` |
| `npm run build` | Static build to `./dist/` |
| `npm run preview` | Serve the built output |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | Typecheck, then a full build |

> `astro check` is not wired up: `@astrojs/check` still peers on TypeScript
> `^5 || ^6` and refuses to install against TypeScript 7. `npm run check` covers
> the same ground with `tsc` plus a build.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_API_BASE_URL` | `http://localhost:8080` | Backend origin. |
| `PUBLIC_API_TIMEOUT_MS` | `15000` | Per-request timeout. |

Both are declared in the `astro:env` schema in `astro.config.mjs` and read from
`astro:env/client` — never through `import.meta.env` directly.

## Route deviations

The build is pure SSG, and an unknown UUID cannot be prerendered, so the spec's
path parameters are carried as query parameters instead. Behaviour is otherwise
identical.

| `frontend-spec.md` §10 | Implemented as |
| --- | --- |
| `/movies/:id` | `/movies/detail?id=<uuid>` |
| `/screenings/:id/seats` | `/screenings/seats?id=<uuid>` |
| `/checkout/:screeningId` | `/checkout?screening=<uuid>&seats=<uuid,uuid>` |
| `/reservations/:id` | `/reservations/detail?id=<uuid>` |
| `/admin/rooms/:id/seats` | `/admin/rooms/seats?id=<uuid>` |

## Structure

```
src/
  lib/
    types.ts              type-only DTOs, Page<T>, ProblemDetail
    enums.ts              wire enums as `as const` unions + label maps
    problem.ts            ApiError, RFC 7807 parsing, field-error extraction
    http.ts               the single fetch chokepoint: timeouts, 401 replay
    auth-store.ts         tokens, profile, the refresh mutex
    auth-context.tsx      React 19 context + useSyncExternalStore snapshot
    api/                  one module per resource
    pricing.ts            HALF_UP ticket and line-total maths
    query.ts              typed page/size/sort builder
    format.ts             Intl money and date formatters
    reservation-snapshots.ts  pre-cancellation snapshots
  components/
    ui/                   Field, DataTable, Pagination, Modal, Guards, …
    catalogue/ booking/ reservations/ admin/ auth/
  layouts/Layout.astro    shell with <ClientRouter /> and a persisted nav
  pages/                  public, auth, account and /admin routes
```

## Behaviours worth knowing

These are contract requirements, not preferences — changing them breaks
correctness.

- **One refresh at a time.** Refresh tokens rotate and revoke on use, so two
  concurrent refreshes log the user out. `auth-store.ts` shares a single
  in-flight promise via `Promise.withResolvers()`.
- **Roles come from `GET /api/users/me`**, never from decoding the JWT.
- **Validation errors bind by field name only.** Bean-validation messages are
  localised server-side, so message text is never matched on.
- **The seat map is a snapshot, not a lock.** Seats are only held at
  `POST /api/reservations`; a `409` means refetch the map and highlight what was
  lost.
- **`GET /api/inventory` is admin-only.** The checkout concessions panel hides
  itself on `403`. This is the largest backend gap — see `backend-spec.md`.
- **Cancelling returns `200` with an emptied body.** Reservations are
  `structuredClone`d before the `DELETE` so the UI can still show what was
  cancelled.
- **`endsAt` is computed server-side** as `startsAt + runtime + 15 min`. The
  scheduler previews the same arithmetic but never sends the field.
