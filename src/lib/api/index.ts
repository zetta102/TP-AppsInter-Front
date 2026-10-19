/**
 * Barrel de clientes de recursos.
 *
 * Las llamadas de auth viven deliberadamente en `auth-store.ts`, que controla el
 * ciclo de vida de los tokens; importarlas desde aquí invitaría a saltear el mutex de refresh.
 */

export * as movies from './movies.ts';
export * as rooms from './rooms.ts';
export * as seats from './seats.ts';
export * as screenings from './screenings.ts';
export * as inventory from './inventory.ts';
export * as products from './products.ts';
export * as reservations from './reservations.ts';
export * as holds from './holds.ts';
export * as users from './users.ts';
export * as metadata from './metadata.ts';
export * as contactMessages from './contact-messages.ts';
