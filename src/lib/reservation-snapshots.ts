import type { ReservationResponse } from './types.ts';

/**
 * Pre-cancellation snapshots.
 *
 * Cancelling deletes the tickets, restores concession stock and clears the
 * items, so the response body comes back with `tickets: []`, `items: []` and
 * `totalPrice: 0.00`. The server no longer holds what was cancelled, so the
 * only way to show the user what they lost is to snapshot it client-side
 * *before* issuing the `DELETE`.
 *
 * Mirrored into `sessionStorage` so the detail page can still render the
 * snapshot after a navigation.
 */

const STORAGE_KEY = 'cine.cancelled.snapshots';

const snapshots = new Map<string, ReservationResponse>();

const isBrowser = typeof window !== 'undefined';

function persist(): void {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...snapshots]));
  } catch {
    // Snapshots are a nicety; storage failures must not break cancellation.
  }
}

function hydrate(): void {
  if (!isBrowser || snapshots.size > 0) return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed as [string, ReservationResponse][]) {
      snapshots.set(entry[0], entry[1]);
    }
  } catch {
    // Ignore an unreadable mirror.
  }
}

/** Deep-copies the reservation so later mutations cannot corrupt the record. */
export function snapshotReservation(reservation: ReservationResponse): ReservationResponse {
  const copy = structuredClone(reservation);
  snapshots.set(reservation.uuid, copy);
  persist();
  return copy;
}

export function getSnapshot(uuid: string): ReservationResponse | null {
  hydrate();
  return snapshots.get(uuid) ?? null;
}

/**
 * Merges a cancelled response with its snapshot so the UI can show the
 * cancelled seats and items while still reporting the authoritative status and
 * `totalPrice: 0` from the server.
 */
export function withSnapshot(cancelled: ReservationResponse): ReservationResponse {
  const snapshot = getSnapshot(cancelled.uuid);
  if (!snapshot) return cancelled;
  return {
    ...cancelled,
    tickets: cancelled.tickets.length > 0 ? cancelled.tickets : snapshot.tickets,
    items: cancelled.items.length > 0 ? cancelled.items : snapshot.items,
  };
}
