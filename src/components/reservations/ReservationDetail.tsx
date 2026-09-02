import { useState } from 'react';
import { cancelReservation, getReservation } from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { getSnapshot, snapshotReservation, withSnapshot } from '../../lib/reservation-snapshots.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { ReservationStatus, seatTypeLabels } from '../../lib/enums.ts';
import type { ReservationResponse } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { StatusBadge } from './ReservationParts.tsx';

/**
 * Ticket and line-item detail.
 *
 * A reservation belonging to someone else returns `404`, not `403`, so the
 * not-found copy has to cover both "gone" and "not yours".
 */
export default function ReservationDetail() {
  return (
    <AuthGuard message="Sign in to view this reservation.">
      <DetailPanel />
    </AuthGuard>
  );
}

function DetailPanel() {
  const reservationId = useQueryParam('id');
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const resource = useResource<ReservationResponse>(
    (signal) => getReservation(reservationId!, { signal }),
    [reservationId],
    { enabled: Boolean(reservationId) },
  );

  if (!reservationId) {
    return (
      <EmptyState
        title="No reservation selected"
        action={
          <a href="/reservations" className="cine-btn cine-btn-primary">
            My reservations
          </a>
        }
      />
    );
  }

  if (resource.isLoading) return <LoadingBlock />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  if (!resource.data) return null;

  // Merge in the pre-cancellation snapshot so a cancelled reservation still
  // shows what was booked — the server discarded the tickets and items.
  const reservation = withSnapshot(resource.data);
  const cancelled = resource.data.status === ReservationStatus.CANCELLED;
  const showingSnapshot = cancelled && getSnapshot(reservation.uuid) !== null;

  const cancel = async () => {
    setCancelError(null);
    setBusy(true);
    snapshotReservation(resource.data!);
    try {
      await cancelReservation(reservation.uuid);
    } catch (error) {
      setCancelError(error);
    } finally {
      setBusy(false);
      resource.refetch();
    }
  };

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{reservation.movieName}</h1>
          <p className="text-ink-500 text-sm">
            Booked {formatDateTime(reservation.createdAt)} · reference{' '}
            <code>{reservation.uuid.slice(0, 8)}</code>
          </p>
        </div>
        <StatusBadge status={resource.data.status} />
      </header>

      {cancelError !== null && <ErrorBanner error={cancelError} />}

      {cancelled && (
        <p className="border-ink-800 bg-ink-900 text-ink-300 rounded-lg border px-4 py-3 text-sm">
          This reservation was cancelled. The seats were released and any concessions were returned
          to stock.
          {showingSnapshot && ' The details below are from before the cancellation.'}
        </p>
      )}

      <section className="cine-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Tickets</h2>
        {reservation.tickets.length === 0 ? (
          <p className="text-ink-500 text-sm">No tickets on this reservation.</p>
        ) : (
          <ul className="divide-ink-800 divide-y text-sm">
            {reservation.tickets.map((ticket) => (
              <li key={ticket.uuid} className="flex justify-between gap-3 py-2">
                <span>
                  Seat {seatLabel(ticket.row, ticket.column)}
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
          <h2 className="mb-3 text-sm font-semibold">Concessions</h2>
          <ul className="divide-ink-800 divide-y text-sm">
            {reservation.items.map((item) => (
              <li key={item.uuid} className="flex justify-between gap-3 py-2">
                <span>
                  {item.productName}
                  <span className="text-ink-500">
                    {' '}
                    × {item.quantity} at {formatMoney(item.unitPrice)}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cine-card flex items-center justify-between p-5">
        <span className="text-sm font-semibold">Total charged</span>
        <span className="text-lg font-bold tabular-nums">
          {formatMoney(resource.data.totalPrice)}
        </span>
      </div>

      <div className="flex justify-end gap-2">
        <a href="/reservations" className="cine-btn cine-btn-ghost">
          Back to my reservations
        </a>
        {!cancelled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="cine-btn cine-btn-danger"
          >
            {busy ? 'Cancelling…' : 'Cancel reservation'}
          </button>
        )}
      </div>
    </article>
  );
}
