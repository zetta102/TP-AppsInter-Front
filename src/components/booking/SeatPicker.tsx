import { useId, useState } from 'react';
import { getMetadataConfigOrDefault } from '../../lib/api/metadata.ts';
import { getScreeningWithSeatMap } from '../../lib/api/screenings.ts';
import { formatCount, formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { loginHref } from '../../lib/login-redirect.ts';
import { estimateTotal } from '../../lib/pricing.ts';
import type {
  MetadataConfig,
  Screening,
  SeatAvailability,
  SeatMap as SeatMapData,
} from '../../lib/types.ts';
import { useAuth } from '../../lib/use-auth.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useLiveSeatMap } from '../../lib/use-live-seat-map.ts';
import { useNow } from '../../lib/use-now.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { useKeyedResource } from '../../lib/use-resource.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/Feedback.tsx';
import { PurchaseSteps } from './PurchaseSteps.tsx';
import { isScreeningClosed, ScreeningClosedNotice } from './ScreeningClosedNotice.tsx';
import { indexSeatsById, SeatMap } from './SeatMap.tsx';

interface SeatPickerData {
  readonly screening: Screening;
  readonly seatMap: SeatMapData;
  readonly config: MetadataConfig;
}

/**
 * Selector público de asientos para una función.
 *
 * Cualquier persona puede ver y seleccionar; solo el envío requiere una cuenta, por lo que
 * se invita a quien navega de forma anónima a iniciar sesión y volver acá después.
 *
 * El mapa se mantiene al día con el stream SSE de la función; el polling queda como red de
 * seguridad (más espaciado mientras el stream está conectado).
 */
export default function SeatPicker() {
  const screeningId = useQueryParam('id');
  const now = useNow();
  const { isAuthenticated, ready, user } = useAuth();

  // Se conserva el orden de selección: `seatIds` se envía en el mismo orden en que se eligen.
  const [selected, setSelected] = useState<readonly string[]>([]);
  // Asientos elegidos que otro cliente tomó en vivo: se avisa cuáles y por qué salieron de la
  // selección (WCAG 3 "Change of content notified"). El aviso se va con el próximo cambio.
  const [takenLabels, setTakenLabels] = useState<readonly string[]>([]);
  const blockReasonId = useId();

  const resource = useKeyedResource<string, SeatPickerData>(screeningId, async (id, signal) => {
    const [screening, config] = await Promise.all([
      getScreeningWithSeatMap(id, { signal }),
      getMetadataConfigOrDefault(),
    ]);
    return { screening, seatMap: screening.seatMap, config };
  });

  const seatsById = indexSeatsById(resource.data?.seatMap.seats ?? []);
  useDocumentTitle(resource.data && `Asientos · ${resource.data.screening.movieName}`);

  // Ventas y retenciones de otros clientes, en vivo. Se espera a conocer la sesión para que el
  // stream la use desde la primera conexión.
  const live = useLiveSeatMap(screeningId, resource, {
    viewer: user?.uuid ?? null,
    enabled: ready,
    // Un asiento elegido que otra persona acaba de tomar sale de la selección. Los Set conservan
    // el orden de inserción, así que el orden de selección se mantiene.
    onTaken: (taken) => {
      const lost = selected.filter((id) => taken.has(id));
      if (lost.length === 0) return;
      setTakenLabels(
        lost.map((id) => {
          const seat = seatsById.get(id);
          return seat ? seatLabel(seat.row, seat.column) : id.slice(0, 8);
        }),
      );
      setSelected((current) => [...new Set(current).difference(taken)]);
    },
  });

  const toggle = (seat: SeatAvailability) => {
    setTakenLabels([]);
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
  const closed = isScreeningClosed(screening, now);

  const checkoutHref = `/checkout?screening=${screening.uuid}&seats=${selected.join(',')}`;
  // Por qué no se puede continuar: un botón deshabilitado sin explicación no dice qué hacer
  // (WCAG 3 "Disabled controls explained").
  const blockReason = closed
    ? 'La función ya no admite reservas.'
    : selected.length === 0
      ? 'Elegí al menos un asiento para continuar.'
      : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="cine-plate">
            <h1 className="text-lg sm:text-2xl">{screening.movieName}</h1>
            <p className="text-sm text-ink-500">
              {formatDateTime(screening.startsAt)} · {screening.roomName} · desde{' '}
              {formatMoney(screening.basePrice)}
            </p>
          </div>
          <a
            href={`/movies/detail?id=${screening.movieId}`}
            className="cine-btn cine-btn-ghost bg-ink-950/50"
          >
            Otros horarios
          </a>
        </div>
        <PurchaseSteps current="seats" />
        {/* Lo que pide el proceso, antes de empezar (WCAG 3 "Information requirements available at start"). */}
        <p className="cine-plate max-w-prose text-xs text-ink-300">
          Elegí tus asientos, sumá confitería si querés y pagá con tarjeta (el pago es simulado).
          Necesitás una cuenta para reservar. Al continuar, retenemos tus asientos por tiempo
          limitado y vas a ver la cuenta regresiva.
        </p>
      </header>

      {closed && <ScreeningClosedNotice screening={screening} />}

      {takenLabels.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 cine-alert-warning px-4 py-3 text-sm"
        >
          <span>
            {takenLabels.join(', ')}{' '}
            {takenLabels.length === 1
              ? 'lo tomó otro cliente y se quitó'
              : 'los tomaron otros clientes y se quitaron'}{' '}
            de tu selección.
          </span>
          <button
            type="button"
            className="cine-btn cine-btn-ghost"
            onClick={() => setTakenLabels([])}
          >
            Entendido
          </button>
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
          {isAuthenticated && blockReason && (
            <p id={blockReasonId} className="text-xs text-gold-400">
              {blockReason}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              type="button"
              className="cine-btn cine-btn-ghost"
              onClick={() => {
                setTakenLabels([]);
                setSelected([]);
              }}
            >
              Limpiar
            </button>
          )}

          {!ready ? (
            <span className="text-sm text-ink-500">…</span>
          ) : isAuthenticated ? (
            // Un enlace no se puede deshabilitar (sigue activo con el teclado): sin selección se
            // renderiza un botón deshabilitado de verdad.
            blockReason ? (
              <button
                type="button"
                disabled
                aria-describedby={blockReasonId}
                className="cine-btn cine-btn-primary"
              >
                Continuar con la reserva
              </button>
            ) : (
              <a href={checkoutHref} className="cine-btn cine-btn-primary">
                Continuar con la reserva
              </a>
            )
          ) : (
            <a
              href={loginHref(selected.length === 0 ? null : checkoutHref)}
              className="cine-btn cine-btn-primary"
            >
              Iniciá sesión para reservar
            </a>
          )}
        </div>
      </div>

      <p className="mx-auto cine-plate text-center text-xs text-ink-500">
        {live
          ? 'La disponibilidad se actualiza en vivo.'
          : 'La disponibilidad se actualiza cada pocos segundos.'}{' '}
        Los asientos quedan retenidos para vos al continuar con la reserva.
      </p>
    </div>
  );
}
