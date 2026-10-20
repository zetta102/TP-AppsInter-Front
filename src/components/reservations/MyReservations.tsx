import { useOptimistic, useState } from 'react';
import { listMovies } from '../../lib/api/movies.ts';
import { listMyReservations } from '../../lib/api/reservations.ts';
import { collectAllPages } from '../../lib/api/shared.ts';
import {
  isEnumValue,
  ReservationStatus,
  reservationStatusLabels,
  reservationStatusValues,
} from '../../lib/enums.ts';
import { formatDateTime, formatMoney } from '../../lib/format.ts';
import type { Page, Reservation } from '../../lib/types.ts';
import { useResource } from '../../lib/use-resource.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock, Spinner } from '../ui/Feedback.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import {
  ItemLines,
  StatusBadge,
  TicketSummary,
  useCancelReservation,
} from './ReservationParts.tsx';

const PAGE_SIZE = 10;

/**
 * `<input type="date">` da `YYYY-MM-DD`, que `new Date()` interpreta como medianoche **UTC**
 * (en es-AR, 21:00 del día anterior). Se fija la hora local explícitamente: el inicio del día
 * para "desde" y el final del día para "hasta", así el filtro incluye el día elegido completo.
 */
const startOfLocalDay = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const endOfLocalDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();

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
  const [status, setStatus] = useState<ReservationStatus | ''>('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [movieId, setMovieId] = useState('');

  // Para el selector de película: el catálogo completo, aunque supere el `size` máximo.
  const movies = useResource(
    (signal) =>
      collectAllPages((pageIndex, size) =>
        listMovies({ page: pageIndex, size, sort: 'movieName,asc' }, { signal }),
      ),
    [],
  );

  const resource = useResource<Page<Reservation>>(
    (signal) =>
      listMyReservations(
        {
          page,
          size: PAGE_SIZE,
          sort: upcomingOnly ? 'screening.startsAt,asc' : 'createdAt,desc',
          ...(status ? { status } : {}),
          ...(upcomingOnly ? { upcomingOnly: true } : {}),
          ...(from ? { from: startOfLocalDay(from) } : {}),
          ...(to ? { to: endOfLocalDay(to) } : {}),
          ...(movieId ? { movieId } : {}),
        },
        { signal },
      ),
    [page, status, upcomingOnly, from, to, movieId],
  );

  const resetToFirstPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  const rows = resource.data?.content ?? [];
  const { refetch } = resource;

  // Marca optimistamente una fila como cancelada mientras la petición está en curso.
  const [optimisticRows, markCancelling] = useOptimistic(
    rows,
    (current: readonly Reservation[], uuid: string) =>
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

  const cancellation = useCancelReservation({ onSettled: refetch, onCancelling: markCancelling });

  const hasActiveFilters = Boolean(status || upcomingOnly || from || to || movieId);

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3 cine-card p-4">
      <SelectInput
        label="Estado"
        fieldClassName="min-w-40"
        value={status}
        onChange={(event) => {
          const { value } = event.target;
          resetToFirstPage(setStatus)(isEnumValue(reservationStatusValues, value) ? value : '');
        }}
      >
        <option value="">Todos los estados</option>
        {reservationStatusValues.map((value) => (
          <option key={value} value={value}>
            {reservationStatusLabels[value]}
          </option>
        ))}
      </SelectInput>

      <SelectInput
        label="Película"
        fieldClassName="min-w-48"
        value={movieId}
        onChange={(event) => resetToFirstPage(setMovieId)(event.target.value)}
      >
        <option value="">Todas las películas</option>
        {(movies.data ?? []).map((movie) => (
          <option key={movie.uuid} value={movie.uuid}>
            {movie.movieName}
          </option>
        ))}
      </SelectInput>

      <TextInput
        label="Desde"
        type="date"
        value={from}
        onChange={(event) => resetToFirstPage(setFrom)(event.target.value)}
      />

      <TextInput
        label="Hasta"
        type="date"
        value={to}
        onChange={(event) => resetToFirstPage(setTo)(event.target.value)}
      />

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={upcomingOnly}
          onChange={(event) => resetToFirstPage(setUpcomingOnly)(event.target.checked)}
        />
        Solo mis próximas funciones
      </label>

      {hasActiveFilters && (
        <button
          type="button"
          className="cine-btn cine-btn-ghost"
          onClick={() => {
            setStatus('');
            setUpcomingOnly(false);
            setFrom('');
            setTo('');
            setMovieId('');
            setPage(0);
          }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );

  if (resource.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <LoadingBlock label="Cargando tus reservas…" />
      </div>
    );
  }
  if (resource.error) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <ErrorBanner error={resource.error} onRetry={resource.refetch} />
      </div>
    );
  }

  if (optimisticRows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <EmptyState
          title={
            hasActiveFilters
              ? 'Ninguna reserva coincide con estos filtros'
              : 'Todavía no tenés reservas'
          }
          description={
            hasActiveFilters
              ? 'Probá ajustar o limpiar los filtros para ver más resultados.'
              : 'Cuando reserves asientos van a aparecer acá, con tus entradas y cualquier producto adicional.'
          }
          action={
            hasActiveFilters ? undefined : (
              <a href="/" className="cine-btn cine-btn-primary">
                Buscar una función
              </a>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filterBar}
      {cancellation.dialog}
      {cancellation.error !== null && <ErrorBanner error={cancellation.error} />}

      <ul className="flex flex-col gap-3">
        {optimisticRows.map((reservation) => {
          const cancelled = reservation.status === ReservationStatus.CANCELLED;

          return (
            <li key={reservation.uuid} className="flex flex-col gap-3 cine-card p-4">
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
                  <p className="text-xs text-ink-500">
                    Función el {formatDateTime(reservation.screeningStartsAt)} ·{' '}
                    {reservation.roomName}
                  </p>
                  <p className="text-xs text-ink-500">
                    Reservada el {formatDateTime(reservation.createdAt)}
                  </p>
                </div>
                <StatusBadge status={reservation.status} />
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-300">
                <span>
                  <span className="text-ink-500">Asientos: </span>
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
                    // Una cancelación a la vez; la fila ya se muestra cancelada de forma optimista.
                    disabled={cancellation.isPending}
                    onClick={() => cancellation.cancel(reservation)}
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
        <p className="flex items-center justify-center gap-2 text-xs text-ink-500">
          <Spinner /> Actualizando…
        </p>
      )}

      <Pagination page={resource.data} onPageChange={setPage} />
    </div>
  );
}
