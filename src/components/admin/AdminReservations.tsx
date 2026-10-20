import { useState } from 'react';
import { listAllReservations, type ReservationSortField } from '../../lib/api/reservations.ts';
import {
  isEnumValue,
  ReservationStatus,
  reservationStatusLabels,
  reservationStatusValues,
} from '../../lib/enums.ts';
import { formatCount, formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import type { Page, Reservation } from '../../lib/types.ts';
import { useResource } from '../../lib/use-resource.ts';
import { StatusBadge, useCancelReservation } from '../reservations/ReservationParts.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { SelectInput } from '../ui/Field.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';

const PAGE_SIZE = 20;

/**
 * `/admin/reservations` — todas las reservas del sistema mediante
 * `GET /api/reservations/all`. Los administradores pueden cancelar cualquier
 * reserva, no solo las propias, y en cualquier momento.
 */
export default function AdminReservations() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<ReservationSortField>>('createdAt,desc');
  const [status, setStatus] = useState<ReservationStatus | ''>('');

  const resource = useResource<Page<Reservation>>(
    (signal) =>
      listAllReservations(
        { page, size: PAGE_SIZE, sort, ...(status ? { status } : {}) },
        { signal },
      ),
    [page, sort, status],
  );

  const cancellation = useCancelReservation({ onSettled: resource.refetch });

  const columns: readonly Column<Reservation, ReservationSortField>[] = [
    {
      key: 'reference',
      header: 'Reserva',
      cell: (reservation) => (
        <div>
          <div className="font-medium">{reservation.movieName}</div>
          <div className="text-xs text-ink-500">
            {reservation.user.firstName} {reservation.user.lastName} · {reservation.user.email}
          </div>
          <code className="text-xs text-ink-500">{reservation.uuid.slice(0, 8)}</code>
        </div>
      ),
    },
    {
      key: 'seats',
      header: 'Asientos',
      cell: (reservation) =>
        reservation.tickets.length === 0 ? (
          <span className="text-ink-500">—</span>
        ) : (
          reservation.tickets.map((ticket) => seatLabel(ticket.row, ticket.column)).join(', ')
        ),
    },
    {
      key: 'items',
      header: 'Confitería',
      cell: (reservation) =>
        reservation.items.length === 0 ? (
          <span className="text-ink-500">—</span>
        ) : (
          formatCount(reservation.items.length, 'ítem', 'ítems')
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
      cell: (reservation) => <StatusBadge status={reservation.status} />,
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
            disabled={cancellation.isPending}
            className="cine-btn cine-btn-danger"
            onClick={() => cancellation.cancel(reservation)}
          >
            {cancellation.cancellingId === reservation.uuid ? 'Cancelando…' : 'Cancelar'}
          </button>
        ),
    },
  ];

  return (
    <AdminPage
      title="Reservas"
      description="Todas las reservas del sistema. Al cancelar se liberan los asientos y se repone el stock de confitería."
    >
      {cancellation.dialog}

      <AdminToolbar>
        <SelectInput
          label="Estado"
          fieldClassName="min-w-48"
          value={status}
          onChange={(event) => {
            const { value } = event.target;
            setStatus(isEnumValue(reservationStatusValues, value) ? value : '');
            setPage(0);
          }}
        >
          <option value="">Todos los estados</option>
          {reservationStatusValues.map((value) => (
            <option key={value} value={value}>
              {reservationStatusLabels[value]}
            </option>
          ))}
        </SelectInput>
      </AdminToolbar>

      {cancellation.error !== null && (
        <ErrorBanner error={cancellation.error} onRetry={resource.refetch} />
      )}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(reservation) => reservation.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No hay reservas"
        emptyDescription="Todavía no se registraron reservas para este filtro."
        activeSort={parseSort(sort)}
        onSort={(field) => {
          setSort((current) => toggleSort(current, field));
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />
    </AdminPage>
  );
}
