import { useCallback, useOptimistic, useState, useTransition } from 'react';
import { cancelReservation, listMyReservations } from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
import { snapshotReservation } from '../../lib/reservation-snapshots.ts';
import { formatDateTime, formatMoney } from '../../lib/format.ts';
import { ReservationStatus } from '../../lib/enums.ts';
import type { Page, ReservationResponse } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock, Spinner } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { ItemLines, StatusBadge, TicketSummary } from './ReservationParts.tsx';

const PAGE_SIZE = 10;

/**
 * The caller's own reservations. There is no user filter — ownership comes from
 * the JWT, and another user's reservation returns `404`, never `403`.
 */
export default function MyReservations() {
  return (
    <AuthGuard message="Your reservations are tied to your account.">
      <ReservationList />
    </AuthGuard>
  );
}

function ReservationList() {
  const [page, setPage] = useState(0);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [, startTransition] = useTransition();

  const resource = useResource<Page<ReservationResponse>>(
    (signal) => listMyReservations({ page, size: PAGE_SIZE, sort: 'createdAt,desc' }, { signal }),
    [page],
  );

  const rows = resource.data?.content ?? [];

  // Optimistically flip a row to cancelled while the request is in flight.
  const [optimisticRows, markCancelling] = useOptimistic(
    rows,
    (current: readonly ReservationResponse[], uuid: string) =>
      current.map((row) =>
        row.uuid === uuid
          ? { ...row, status: ReservationStatus.CANCELLED, totalPrice: 0 }
          : row,
      ),
  );

  const cancel = useCallback(
    (reservation: ReservationResponse) => {
      setCancelError(null);
      // Snapshot first: the server drops the tickets and items on cancellation.
      snapshotReservation(reservation);

      startTransition(async () => {
        markCancelling(reservation.uuid);
        try {
          await cancelReservation(reservation.uuid);
        } catch (error) {
          // 422 when it was already cancelled; anything else is unexpected.
          setCancelError(error);
        } finally {
          resource.refetch();
        }
      });
    },
    [markCancelling, resource],
  );

  if (resource.isLoading) return <LoadingBlock label="Loading your reservations…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;

  if (optimisticRows.length === 0) {
    return (
      <EmptyState
        title="No reservations yet"
        description="Once you book seats they will appear here, with your tickets and any concessions."
        action={
          <a href="/" className="cine-btn cine-btn-primary">
            Find a screening
          </a>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {cancelError !== null && <ErrorBanner error={cancelError} />}

      <ul className="flex flex-col gap-3">
        {optimisticRows.map((reservation) => {
          const cancelled = reservation.status === ReservationStatus.CANCELLED;

          return (
            <li key={reservation.uuid} className="cine-card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">
                    <a
                      href={`/reservations/detail?id=${reservation.uuid}`}
                      className="hover:text-brand-400"
                    >
                      {reservation.movieName}
                    </a>
                  </h2>
                  <p className="text-ink-500 text-xs">
                    Booked {formatDateTime(reservation.createdAt)}
                  </p>
                </div>
                <StatusBadge status={reservation.status} />
              </div>

              <div className="text-ink-300 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span>
                  <span className="text-ink-500">Seats: </span>
                  <TicketSummary reservation={reservation} />
                </span>
                <span>
                  <span className="text-ink-500">Total: </span>
                  <span className="tabular-nums">{formatMoney(reservation.totalPrice)}</span>
                </span>
              </div>

              <ItemLines reservation={reservation} />

              <div className="flex justify-end gap-2">
                <a
                  href={`/reservations/detail?id=${reservation.uuid}`}
                  className="cine-btn cine-btn-ghost"
                >
                  Details
                </a>
                {!cancelled && (
                  <button
                    type="button"
                    className="cine-btn cine-btn-danger"
                    onClick={() => cancel(reservation)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {resource.isRefreshing && (
        <p className="text-ink-600 flex items-center justify-center gap-2 text-xs">
          <Spinner /> Refreshing…
        </p>
      )}

      <Pagination page={resource.data} onPageChange={setPage} />
    </div>
  );
}
