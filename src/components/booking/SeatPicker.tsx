import { useState } from 'react';
import { getScreeningWithSeatMap } from '../../lib/api/screenings.ts';
import { getMetadataConfigOrDefault } from '../../lib/api/metadata.ts';
import { useKeyedResource } from '../../lib/use-resource.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { useNow } from '../../lib/use-now.ts';
import { usePolling } from '../../lib/use-polling.ts';
import { patchSeatMap, useSeatStream } from '../../lib/use-seat-stream.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import type {
  MetadataConfigResponse,
  MovieScreeningResponse,
  SeatMapResponse,
  SeatMapSeat,
} from '../../lib/types.ts';
import { formatCount, formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { estimateTotal } from '../../lib/pricing.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { indexSeatsById, SeatMap } from './SeatMap.tsx';

/**
 * Selector público de asientos para una función.
 *
 * Cualquier persona puede ver y seleccionar; solo el envío requiere una cuenta, por lo que
 * se invita a quien navega de forma anónima a iniciar sesión y volver aquí después.
 *
 * El mapa se mantiene al día con el stream SSE de la función; el polling queda como red de
 * seguridad (más espaciado mientras el stream está conectado).
 */
const SEAT_MAP_POLL_MS = 15_000;
const SEAT_MAP_SAFETY_POLL_MS = 60_000;

export default function SeatPicker() {
  const screeningId = useQueryParam('id');
  const now = useNow();
  const { isAuthenticated, ready, user } = useAuth();

  // Se conserva el orden de selección: `seatIds` se envía en el mismo orden en que se eligen.
  const [selected, setSelected] = useState<readonly string[]>([]);

  const resource = useKeyedResource<
    string,
    {
      readonly screening: MovieScreeningResponse;
      readonly seatMap: SeatMapResponse;
      readonly config: MetadataConfigResponse;
    }
  >(screeningId, async (id, signal) => {
    const [screening, config] = await Promise.all([
      getScreeningWithSeatMap(id, { signal }),
      getMetadataConfigOrDefault({ signal }),
    ]);
    return { screening, seatMap: screening.seatMap, config };
  });

  const seatsById = indexSeatsById(resource.data?.seatMap.seats ?? []);
  useDocumentTitle(resource.data && `Asientos · ${resource.data.screening.movieName}`);

  const { refetch, setData } = resource;
  // Ventas y retenciones de otros clientes, en vivo. Se espera a conocer la sesión para que el
  // stream la use desde la primera conexión.
  const live = useSeatStream(screeningId ?? undefined, {
    viewer: user?.uuid ?? null,
    enabled: ready,
    onReconnect: refetch,
    onSeats: (states) => {
      setData(
        (current) => current && { ...current, seatMap: patchSeatMap(current.seatMap, states) },
      );
      // Un asiento elegido que otra persona acaba de tomar sale de la selección.
      const taken = new Set(
        states.filter((state) => !state.available).map((state) => state.seatId),
      );
      // Los Set conservan el orden de inserción, así que el orden de selección se mantiene.
      if (taken.size > 0) setSelected((current) => [...new Set(current).difference(taken)]);
    },
  });
  usePolling(refetch, live ? SEAT_MAP_SAFETY_POLL_MS : SEAT_MAP_POLL_MS, Boolean(screeningId));

  const toggle = (seat: SeatMapSeat) => {
    setSelected((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    );
  };

  if (!screeningId) {
    return (
      <EmptyState
        title="No se seleccionó ninguna función"
        description="Elegí un horario desde la cartelera."
        action={
          <a href="/" className="cine-btn cine-btn-primary">
            Ver cartelera
          </a>
        }
      />
    );
  }

  if (resource.isLoading) return <LoadingBlock label="Cargando el mapa de asientos…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  if (!resource.data) return null;

  const { screening, seatMap, config } = resource.data;
  const chosen = selected.map((id) => seatsById.get(id)).filter((seat) => seat !== undefined);
  const estimate = estimateTotal(screening.basePrice, chosen, [], config.premiumSeatMultiplier);
  const hasStarted = new Date(screening.startsAt).getTime() <= now;
  const closed = hasStarted || screening.archived;

  const checkoutHref = `/checkout?screening=${screening.uuid}&seats=${selected.join(',')}`;
  const signInHref = `/login?next=${encodeURIComponent(checkoutHref)}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{screening.movieName}</h1>
          <p className="text-sm text-ink-500">
            {formatDateTime(screening.startsAt)} · {screening.roomName} · desde{' '}
            {formatMoney(screening.basePrice)}
          </p>
        </div>
        <a href={`/movies/detail?id=${screening.movieId}`} className="cine-btn cine-btn-ghost">
          Otros horarios
        </a>
      </header>

      {closed && (
        <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
          {screening.archived
            ? 'Esta función ya no está disponible.'
            : 'Esta función ya comenzó, por lo que ya no puede reservarse.'}
        </div>
      )}

      <div className="cine-card p-5">
        <SeatMap
          seatMap={seatMap}
          basePrice={screening.basePrice}
          premiumMultiplier={config.premiumSeatMultiplier}
          selected={selected}
          onToggle={toggle}
          disabled={closed}
        />
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 cine-card p-4">
        {/* Región viva: cada cambio de selección se anuncia sin mover el foco del mapa. */}
        <div className="min-w-0" aria-live="polite">
          <p className="text-sm font-semibold">
            {chosen.length === 0
              ? 'No hay asientos seleccionados'
              : chosen.map((seat) => seatLabel(seat.row, seat.column)).join(', ')}
          </p>
          <p className="text-xs text-ink-500">
            {formatCount(chosen.length, 'asiento', 'asientos')} · estimado{' '}
            {formatMoney(estimate.total)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              type="button"
              className="cine-btn cine-btn-ghost"
              onClick={() => setSelected([])}
            >
              Limpiar
            </button>
          )}

          {!ready ? (
            <span className="text-sm text-ink-500">…</span>
          ) : isAuthenticated ? (
            // Un enlace no se puede deshabilitar (sigue activo con el teclado): sin selección se
            // renderiza un botón deshabilitado de verdad.
            selected.length === 0 || closed ? (
              <button type="button" disabled className="cine-btn cine-btn-primary">
                Continuar con la reserva
              </button>
            ) : (
              <a href={checkoutHref} className="cine-btn cine-btn-primary">
                Continuar con la reserva
              </a>
            )
          ) : (
            <a
              href={selected.length === 0 ? '/login' : signInHref}
              className="cine-btn cine-btn-primary"
            >
              Iniciá sesión para reservar
            </a>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-ink-500">
        {live
          ? 'La disponibilidad se actualiza en vivo.'
          : 'La disponibilidad se actualiza cada pocos segundos.'}{' '}
        Los asientos quedan retenidos para vos al continuar con la reserva.
      </p>
    </div>
  );
}
