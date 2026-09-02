import { useState } from 'react';
import {
  cancelReservation,
  listAllReservations,
  type ReservationSortField,
} from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
import { snapshotReservation } from '../../lib/reservation-snapshots.ts';
import {
  ReservationStatus,
  reservationStatusLabels,
  reservationStatusValues,
} from '../../lib/enums.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import type { Page, ReservationResponse } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { StatusBadge } from '../reservations/ReservationParts.tsx';

const PAGE_SIZE = 20;

/**
 * `/admin/reservations` — every reservation in the system via
 * `GET /api/reservations/all`. Admins may cancel any reservation, not just
 * their own.
 */
export default function AdminReservations() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<ReservationSortField>>('createdAt,desc');
  const [status, setStatus] = useState<ReservationStatus | ''>('');
  const [rowError, setRowError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resource = useResource<Page<ReservationResponse>>(
    (signal) =>
      listAllReservations(
        { page, size: PAGE_SIZE, sort, ...(status ? { status } : {}) },
        { signal },
      ),
    [page, sort, status],
  );

  const cancel = async (reservation: ReservationResponse) => {
    if (!window.confirm(`Cancel reservation ${reservation.uuid.slice(0, 8)}? Seats will be released.`)) {
      return;
    }
    setRowError(null);
    setBusyId(reservation.uuid);
    // Snapshot first — cancelling deletes the tickets and items.
    snapshotReservation(reservation);
    try {
      await cancelReservation(reservation.uuid);
    } catch (error) {
      // 422 when it was already cancelled.
      setRowError(error);
    } finally {
      setBusyId(null);
      resource.refetch();
    }
  };

  const columns: readonly Column<ReservationResponse>[] = [
    {
      key: 'reference',
      header: 'Reservation',
      cell: (reservation) => (
        <div>
          <div className="font-medium">{reservation.movieName}</div>
          {/* `ReservationResponse` carries no customer identity, so the
              reference is the only thing an admin can match on. */}
          <code className="text-ink-500 text-xs">{reservation.uuid.slice(0, 8)}</code>
        </div>
      ),
    },
    {
      key: 'seats',
      header: 'Seats',
      cell: (reservation) =>
        reservation.tickets.length === 0 ? (
          <span className="text-ink-600">—</span>
        ) : (
          reservation.tickets.map((ticket) => seatLabel(ticket.row, ticket.column)).join(', ')
        ),
    },
    {
      key: 'items',
      header: 'Concessions',
      cell: (reservation) =>
        reservation.items.length === 0 ? (
          <span className="text-ink-600">—</span>
        ) : (
          `${reservation.items.length} line${reservation.items.length === 1 ? '' : 's'}`
        ),
    },
    {
      key: 'total',
      header: 'Total',
      sortField: 'totalPrice',
      className: 'tabular-nums',
      cell: (reservation) => formatMoney(reservation.totalPrice),
    },
    {
      key: 'status',
      header: 'Status',
      sortField: 'status',
      cell: (reservation) => <StatusBadge status={reservation.status} />,
    },
    {
      key: 'createdAt',
      header: 'Booked',
      sortField: 'createdAt',
      cell: (reservation) => formatDateTime(reservation.createdAt),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (reservation) =>
        reservation.status === ReservationStatus.CANCELLED ? null : (
          <button
            type="button"
            disabled={busyId === reservation.uuid}
            className="cine-btn cine-btn-danger"
            onClick={() => void cancel(reservation)}
          >
            {busyId === reservation.uuid ? 'Cancelling…' : 'Cancel'}
          </button>
        ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [ReservationSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Reservations"
      description="Every reservation in the system. Cancelling releases the seats and returns concession stock."
    >
      <AdminToolbar>
        <div className="min-w-48">
          <label htmlFor="res-status" className="cine-label">
            Status
          </label>
          <select
            id="res-status"
            className="cine-input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ReservationStatus | '');
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {reservationStatusValues.map((value) => (
              <option key={value} value={value}>
                {reservationStatusLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </AdminToolbar>

      {rowError !== null && <ErrorBanner error={rowError} onRetry={resource.refetch} />}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(reservation) => reservation.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No reservations"
        emptyDescription="Nothing has been booked yet for this filter."
        activeSort={{ field: sortField, direction: sortDirection }}
        onSort={(field) => {
          setSort(
            (current) =>
              (current === `${field},asc`
                ? `${field},desc`
                : `${field},asc`) as SortSpec<ReservationSortField>,
          );
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />
    </AdminPage>
  );
}
