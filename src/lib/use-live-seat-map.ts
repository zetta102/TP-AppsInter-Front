import { usePolling } from './use-polling.ts';
import { patchSeatMap, useSeatStream } from './use-seat-stream.ts';
import type { Resource } from './use-resource.ts';
import type { SeatMap, Uuid } from './types.ts';

/** Polling de respaldo mientras el stream está caído. */
const SEAT_MAP_POLL_MS = 15_000;
/** Polling de seguridad con el stream conectado (backend escalado a varias instancias, eventos perdidos). */
const SEAT_MAP_SAFETY_POLL_MS = 60_000;

export interface LiveSeatMapOptions {
  /** Quién mira el mapa (uuid del usuario o `null`); al cambiar se reabre el stream. */
  readonly viewer: string | null;
  readonly enabled?: boolean;
  /** Asientos que otro cliente acaba de tomar (vendidos o retenidos). */
  readonly onTaken?: (seatIds: ReadonlySet<Uuid>) => void;
}

/**
 * Mantiene al día el mapa de asientos de un recurso ya cargado: aplica los eventos del stream SSE
 * sobre `seatMap`, vuelve a pedirlo completo tras cada reconexión y deja un polling como red de
 * seguridad (más espaciado mientras el stream está conectado). Devuelve `true` con el stream en vivo.
 */
export function useLiveSeatMap<T extends { readonly seatMap: SeatMap }>(
  screeningId: Uuid | null | undefined,
  resource: Pick<Resource<T>, 'refetch' | 'setData'>,
  { viewer, enabled = true, onTaken }: LiveSeatMapOptions,
): boolean {
  const { refetch, setData } = resource;
  const id = screeningId ?? undefined;

  const live = useSeatStream(id, {
    viewer,
    enabled,
    onReconnect: refetch,
    onSeats: (states) => {
      setData(
        (current) => current && { ...current, seatMap: patchSeatMap(current.seatMap, states) },
      );
      if (!onTaken) return;
      const taken = new Set(
        states.filter((state) => !state.available).map((state) => state.seatId),
      );
      if (taken.size > 0) onTaken(taken);
    },
  });

  usePolling(refetch, live ? SEAT_MAP_SAFETY_POLL_MS : SEAT_MAP_POLL_MS, Boolean(id) && enabled);
  return live;
}
