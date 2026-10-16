import { useEffect, useEffectEvent, useState } from 'react';
import { openStream } from './http.ts';
import { getAuthState, refreshTokens } from './auth-store.ts';
import { readSse } from './sse.ts';
import { isApiErrorWithStatus } from './problem.ts';
import type { SeatMapResponse, SeatState, Uuid } from './types.ts';

/**
 * Disponibilidad de asientos en vivo por Server-Sent Events
 * (`GET /api/screenings/{id}/seats/stream`, backend-status-for-frontend.md §7.6).
 *
 * Cada evento `seats` trae solo los asientos que cambiaron, ya con la semántica del
 * suscriptor: con token, las retenciones propias llegan como disponibles. Los cambios
 * ocurridos mientras el stream está caído no se repiten, así que en cada (re)conexión se
 * llama a `onReconnect` para volver a pedir el mapa completo. El servidor cierra el stream
 * a los 30 min y se reconecta con backoff (1 s → 30 s).
 */

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
/** Margen para refrescar un access token que vencería durante la reconexión. */
const TOKEN_MARGIN_MS = 30_000;

export interface SeatStreamOptions {
  readonly onSeats: (states: readonly SeatState[]) => void;
  /** El stream se (re)abrió: el mapa en pantalla puede tener huecos y conviene recargarlo. */
  readonly onReconnect?: () => void;
  /**
   * Identifica a quién mira el mapa (p. ej. el uuid del usuario o `null`). Al cambiar, se
   * reabre el stream para que la semántica "mis retenciones están disponibles" sea la correcta.
   */
  readonly viewer?: string | null;
  readonly enabled?: boolean;
}

/** Aplica estados recibidos por el stream sobre un mapa ya cargado. */
export function patchSeatMap<T extends SeatMapResponse>(map: T, states: readonly SeatState[]): T {
  if (states.length === 0) return map;
  const byId = new Map(states.map((state) => [state.seatId, state]));
  return {
    ...map,
    seats: map.seats.map((seat) => {
      const next = byId.get(seat.seatId);
      return next ? { ...seat, available: next.available, held: next.held } : seat;
    }),
  };
}

function parseStates(data: string): readonly SeatState[] {
  try {
    const parsed: unknown = JSON.parse(data);
    return Array.isArray(parsed) ? (parsed as SeatState[]) : [];
  } catch {
    return [];
  }
}

async function ensureFreshToken(): Promise<void> {
  const tokens = getAuthState().tokens;
  if (!tokens) return;
  if (new Date(tokens.expiresAt).getTime() - Date.now() < TOKEN_MARGIN_MS) await refreshTokens();
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}

/** Devuelve `true` mientras el stream está conectado. */
export function useSeatStream(screeningId: Uuid | undefined, options: SeatStreamOptions): boolean {
  const { viewer = null, enabled = true } = options;
  const [connected, setConnected] = useState(false);

  const handleSeats = useEffectEvent((states: readonly SeatState[]) => options.onSeats(states));
  const handleReconnect = useEffectEvent(() => options.onReconnect?.());

  useEffect(() => {
    if (!screeningId || !enabled) return;
    const controller = new AbortController();
    const { signal } = controller;

    void (async () => {
      let backoff = MIN_BACKOFF_MS;
      let first = true;
      while (!signal.aborted) {
        try {
          await ensureFreshToken();
          const response = await openStream(`/api/screenings/${screeningId}/seats/stream`, {
            signal,
          });
          setConnected(true);
          backoff = MIN_BACKOFF_MS;
          // La primera conexión sigue a la carga inicial del mapa: solo las siguientes recargan.
          if (!first) handleReconnect();
          first = false;
          await readSse(response.body!, (event) => {
            if (event.event === 'seats') handleSeats(parseStates(event.data));
          });
        } catch (error) {
          // Una función inexistente no va a aparecer reintentando.
          if (isApiErrorWithStatus(error, 404)) {
            setConnected(false);
            return;
          }
        }
        if (signal.aborted) return;
        setConnected(false);
        first = false;
        await wait(backoff, signal);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    })();

    return () => {
      controller.abort();
      setConnected(false);
    };
    // `viewer` no se lee adentro a propósito: cambiarlo debe reabrir el stream con el token nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screeningId, viewer, enabled]);

  return connected;
}
