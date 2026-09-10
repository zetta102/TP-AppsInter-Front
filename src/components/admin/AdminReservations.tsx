import { useState } from 'react';
import {
  cancelReservation,
  listAllReservations,
  type ReservationSortField,
} from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
import {
  ReservationStatus,
  reservationStatusValues,
} from '../../lib/enums.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import type { Page, ReservationResponse } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Badge } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 20;
const reservationStatusDisplayLabels: Readonly<Record<ReservationStatus, string>> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
};

/**
 * `/admin/reservations` — todas las reservas del sistema mediante
 * `GET /api/reservations/all`. Los administradores pueden cancelar cualquier
 * reserva, no solo las propias.
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
    if (!window.confirm(`¿Cancelar la reserva ${reservation.uuid.slice(0, 8)}? Los asientos se liberarán.`)) {
      return;
    }
    setRowError(null);
    setBusyId(reservation.uuid);
    try {
      await cancelReservation(reservation.uuid);
    } catch (error) {
      // 422 cuando ya estaba cancelada.
      setRowError(error);
    } finally {
      setBusyId(null);
      resource.refetch();
    }
  };

  const columns: readonly Column<ReservationResponse>[] = [
    {
      key: 'reference',
      header: 'Reserva',
      cell: (reservation) => (
        <div>
          <div className="font-medium">{reservation.movieName}</div>
          <div className="text-ink-500 text-xs">
            {reservation.user.firstName} {reservation.user.lastName} · {reservation.user.email}
          </div>
          <code className="text-ink-600 text-xs">{reservation.uuid.slice(0, 8)}</code>
        </div>
      ),
    },
    {
      key: 'seats',
      header: 'Asientos',
      cell: (reservation) =>
        reservation.tickets.length === 0 ? (
          <span className="text-ink-600">—</span>
        ) : (
          reservation.tickets.map((ticket) => seatLabel(ticket.row, ticket.column)).join(', ')
        ),
    },
    {
      key: 'items',
      header: 'Confitería',
      cell: (reservation) =>
        reservation.items.length === 0 ? (
          <span className="text-ink-600">—</span>
        ) : (
          `${reservation.items.length} ítem${reservation.items.length === 1 ? '' : 's'}`
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
      header: 'Estado',
      sortField: 'status',
      cell: (reservation) => (
        <Badge
          tone={
            reservation.status === ReservationStatus.CONFIRMED
              ? 'success'
              : reservation.status === ReservationStatus.CANCELLED
                ? 'danger'
                : 'warning'
          }
        >
          {reservationStatusDisplayLabels[reservation.status]}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Reservada',
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
            {busyId === reservation.uuid ? 'Cancelando…' : 'Cancelar'}
          </button>
        ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [ReservationSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Reservas"
      description="Todas las reservas del sistema. Al cancelar se liberan los asientos y se repone el stock de confitería."
    >
      <AdminToolbar>
        <div className="min-w-48">
          <label htmlFor="res-status" className="cine-label">
            Estado
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
            <option value="">Todos los estados</option>
            {reservationStatusValues.map((value) => (
              <option key={value} value={value}>
                {reservationStatusDisplayLabels[value]}
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
        emptyTitle="No hay reservas"
        emptyDescription="Todavía no se registraron reservas para este filtro."
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
