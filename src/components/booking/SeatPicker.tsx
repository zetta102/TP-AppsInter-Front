import { useCallback, useMemo, useState } from 'react';
import { getScreening, getScreeningSeatMap } from '../../lib/api/screenings.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import type { MovieScreeningResponse, SeatMapResponse, SeatMapSeat } from '../../lib/types.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { estimateTotal } from '../../lib/pricing.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { SeatMap } from './SeatMap.tsx';

/**
 * Selector público de asientos para una función.
 *
 * Cualquier persona puede ver y seleccionar; solo el envío requiere una cuenta, por lo que
 * se invita a quien navega de forma anónima a iniciar sesión y volver aquí después.
 */
export default function SeatPicker() {
  const screeningId = useQueryParam('id');
  const { isAuthenticated, ready } = useAuth();

  // Se conserva el orden de selección: `seatIds` se envía en el mismo orden en que se eligen.
  const [selected, setSelected] = useState<readonly string[]>([]);

  const resource = useResource<{
    readonly screening: MovieScreeningResponse;
    readonly seatMap: SeatMapResponse;
  }>(
    async (signal) => {
      const [screening, seatMap] = await Promise.all([
        getScreening(screeningId!, { signal }),
        getScreeningSeatMap(screeningId!, { signal }),
      ]);
      return { screening, seatMap };
    },
    [screeningId],
    { enabled: Boolean(screeningId) },
  );

  const seatsById = useMemo(() => {
    const map = new Map<string, SeatMapSeat>();
    for (const seat of resource.data?.seatMap.seats ?? []) map.set(seat.seatId, seat);
    return map;
  }, [resource.data]);

  const toggle = useCallback((seat: SeatMapSeat) => {
    setSelected((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    );
  }, []);

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

  const { screening, seatMap } = resource.data;
  const chosen = selected.map((id) => seatsById.get(id)).filter((seat) => seat !== undefined);
  const estimate = estimateTotal(screening.basePrice, chosen);
  const hasStarted = new Date(screening.startsAt).getTime() <= Date.now();

  const checkoutHref = `/checkout?screening=${screening.uuid}&seats=${selected.join(',')}`;
  const signInHref = `/login?next=${encodeURIComponent(checkoutHref)}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{screening.movieName}</h1>
          <p className="text-ink-500 text-sm">
            {formatDateTime(screening.startsAt)} · {screening.roomName} · desde{' '}
            {formatMoney(screening.basePrice)}
          </p>
        </div>
        <a href={`/movies/detail?id=${screening.movieId}`} className="cine-btn cine-btn-ghost">
          Otros horarios
        </a>
      </header>

      {hasStarted && (
        <div role="alert" className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm">
          Esta función ya comenzó, por lo que ya no puede reservarse.
        </div>
      )}

      <div className="cine-card p-5">
        <SeatMap
          seatMap={seatMap}
          basePrice={screening.basePrice}
          selected={selected}
          onToggle={toggle}
          disabled={hasStarted}
        />
      </div>

      <div className="cine-card sticky bottom-4 flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {chosen.length === 0
              ? 'No hay asientos seleccionados'
              : chosen.map((seat) => seatLabel(seat.row, seat.column)).join(', ')}
          </p>
          <p className="text-ink-500 text-xs">
            {chosen.length} {chosen.length === 1 ? 'asiento' : 'asientos'} · estimado{' '}
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
            <span className="text-ink-600 text-sm">…</span>
          ) : isAuthenticated ? (
            <a
              href={checkoutHref}
              aria-disabled={selected.length === 0 || hasStarted}
              className={`cine-btn cine-btn-primary ${
                selected.length === 0 || hasStarted ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              Continuar con la reserva
            </a>
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

      <p className="text-ink-600 text-center text-xs">
        La disponibilidad es una instantánea: los asientos solo quedan retenidos cuando se confirma tu reserva.
      </p>
    </div>
  );
}
