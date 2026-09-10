import { useCallback, useOptimistic, useState, useTransition } from 'react';
import { cancelReservation, listMyReservations } from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
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
 * Las reservas del propio usuario. No hay filtro de usuario — la titularidad
 * viene del JWT, y la reserva de otro usuario devuelve `404`, nunca `403`.
 */
export default function MyReservations() {
  return (
    <AuthGuard message="Tus reservas están vinculadas a tu cuenta.">
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

  // Marca optimistamente una fila como cancelada mientras la petición está en curso.
  const [optimisticRows, markCancelling] = useOptimistic(
    rows,
    (current: readonly ReservationResponse[], uuid: string) =>
      current.map((row) =>
        row.uuid === uuid
          ? {
              ...row,
              status: ReservationStatus.CANCELLED,
              originalTotalPrice: row.totalPrice,
              totalPrice: 0,
              cancelledAt: new Date().toISOString(),
            }
          : row,
      ),
  );

  const cancel = useCallback(
    (reservation: ReservationResponse) => {
      setCancelError(null);

      startTransition(async () => {
        markCancelling(reservation.uuid);
        try {
          await cancelReservation(reservation.uuid);
        } catch (error) {
          // 422 cuando ya estaba cancelada; cualquier otra cosa es inesperada.
          setCancelError(error);
        } finally {
          resource.refetch();
        }
      });
    },
    [markCancelling, resource],
  );

  if (resource.isLoading) return <LoadingBlock label="Cargando tus reservas…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;

  if (optimisticRows.length === 0) {
    return (
      <EmptyState
        title="Aún no tienes reservas"
        description="Cuando reserves butacas aparecerán aquí, con tus entradas y cualquier producto adicional."
        action={
          <a href="/" className="cine-btn cine-btn-primary">
            Buscar una sesión
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
                    Reservada el {formatDateTime(reservation.createdAt)}
                  </p>
                </div>
                <StatusBadge status={reservation.status} />
              </div>

              <div className="text-ink-300 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span>
                  <span className="text-ink-500">Butacas: </span>
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
                  Detalle
                </a>
                {!cancelled && (
                  <button
                    type="button"
                    className="cine-btn cine-btn-danger"
                    onClick={() => cancel(reservation)}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {resource.isRefreshing && (
        <p className="text-ink-600 flex items-center justify-center gap-2 text-xs">
          <Spinner /> Actualizando…
        </p>
      )}

      <Pagination page={resource.data} onPageChange={setPage} />
    </div>
  );
}
