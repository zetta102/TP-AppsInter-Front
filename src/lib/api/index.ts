/**
 * Barrel for the resource clients.
 *
 * Auth calls deliberately live in `auth-store.ts`, which owns the token
 * lifecycle; importing them from here would invite bypassing the refresh mutex.
 */

export * as movies from './movies.ts';
export * as rooms from './rooms.ts';
export * as seats from './seats.ts';
export * as screenings from './screenings.ts';
export * as inventory from './inventory.ts';
export * as reservations from './reservations.ts';
export * as users from './users.ts';
