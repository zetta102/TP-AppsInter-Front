import { getReservation } from '../../lib/api/reservations.ts';
import { ReservationStatus, seatTypeLabels } from '../../lib/enums.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import type { Reservation } from '../../lib/types.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { useKeyedResource } from '../../lib/use-resource.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/Feedback.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { ItemLines, StatusBadge, useCancelReservation } from './ReservationParts.tsx';

/**
 * Detalle de entradas y líneas de la reserva.
 *
 * Una reserva que pertenece a otra persona devuelve `404`, no `403`, así que
 * el texto de no encontrado debe cubrir tanto "ya no existe" como "no es tuya".
 *
 * La cancelación es una cancelación lógica: se conservan entradas y productos,
 * `totalPrice` pasa a `0` (lo que queda pendiente) y `originalTotalPrice` registra
 * lo que se cobró.
 */
export default function ReservationDetail() {
  return (
    <AuthGuard message="Iniciá sesión para ver esta reserva.">
      <DetailPanel />
    </AuthGuard>
  );
}

function DetailPanel() {
  const reservationId = useQueryParam('id');

  const resource = useKeyedResource<string, Reservation>(reservationId, (id, signal) =>
    getReservation(id, { signal }),
  );
  useDocumentTitle(resource.data && `Reserva · ${resource.data.movieName}`);

  const cancellation = useCancelReservation({ onSettled: resource.refetch });

  if (!reservationId) {
    return (
      <EmptyState
        title="No seleccionaste ninguna reserva"
        action={
          <a href="/reservations" className="cine-btn cine-btn-primary">
            Mis reservas
          </a>
        }
      />
    );
  }

  if (resource.isLoading) return <LoadingBlock />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  if (!resource.data) return null;

  const reservation = resource.data;
  const cancelled = reservation.status === ReservationStatus.CANCELLED;

  return (
    <article className="flex flex-col gap-6">
      {cancellation.dialog}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{reservation.movieName}</h1>
          <p className="text-sm text-ink-500">
            Reservada el {formatDateTime(reservation.createdAt)} · referencia{' '}
            <code>{reservation.uuid.slice(0, 8)}</code>
          </p>
          <p className="text-sm text-ink-500">
            {formatDateTime(reservation.screeningStartsAt)} · {reservation.roomName}
          </p>
        </div>
        <StatusBadge status={reservation.status} />
      </header>

      {cancellation.error !== null && <ErrorBanner error={cancellation.error} />}

      {cancelled && (
        <p className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 text-sm text-ink-300">
          Esta reserva se canceló
          {reservation.cancelledAt && ` el ${formatDateTime(reservation.cancelledAt)}`}. Los
          asientos se liberaron y cualquier producto adicional volvió al stock.
        </p>
      )}

      <section className="cine-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Entradas</h2>
        {reservation.tickets.length === 0 ? (
          <p className="text-sm text-ink-500">No hay entradas en esta reserva.</p>
        ) : (
          <ul className="divide-y divide-ink-800 text-sm">
            {reservation.tickets.map((ticket) => (
              <li key={ticket.uuid} className="flex justify-between gap-3 py-2">
                <span>
                  Asiento {seatLabel(ticket.row, ticket.column)}
                  <span className="text-ink-500"> · {seatTypeLabels[ticket.seatType]}</span>
                </span>
                <span className="tabular-nums">{formatMoney(ticket.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reservation.items.length > 0 && (
        <section className="cine-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Productos adicionales</h2>
          <ItemLines reservation={reservation} />
        </section>
      )}

      <div className="flex flex-col gap-2 cine-card p-5">
        {cancelled && reservation.originalTotalPrice !== null && (
          <div className="flex items-center justify-between text-sm text-ink-500">
            <span>Importe original</span>
            <span className="tabular-nums line-through">
              {formatMoney(reservation.originalTotalPrice)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {cancelled ? 'Importe pendiente ahora' : 'Total cobrado'}
          </span>
          <span className="text-lg font-bold tabular-nums">
            {formatMoney(reservation.totalPrice)}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <a href="/reservations" className="cine-btn cine-btn-ghost">
          Volver a mis reservas
        </a>
        {!cancelled && (
          <button
            type="button"
            disabled={cancellation.isPending}
            onClick={() => cancellation.cancel(reservation)}
            className="cine-btn cine-btn-danger"
          >
            {cancellation.isPending ? 'Cancelando…' : 'Cancelar reserva'}
          </button>
        )}
      </div>
    </article>
  );
}
