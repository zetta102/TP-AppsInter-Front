import { useState, useTransition, type ReactNode } from 'react';
import { cancelReservation } from '../../lib/api/reservations.ts';
import { ReservationStatus, reservationStatusLabels } from '../../lib/enums.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import type { Reservation, Uuid } from '../../lib/types.ts';
import { Badge } from '../ui/Badge.tsx';
import { useConfirm } from '../ui/ConfirmDialog.tsx';

/** Presentación y acciones compartidas para reservas, usadas en vistas de cliente y de admin. */

export function StatusBadge({ status }: { readonly status: ReservationStatus }) {
  const tone =
    status === ReservationStatus.CONFIRMED
      ? 'success'
      : status === ReservationStatus.CANCELLED
        ? 'danger'
        : 'warning';
  return <Badge tone={tone}>{reservationStatusLabels[status]}</Badge>;
}

/** Lista compacta de asientos — se conserva incluso tras cancelar (la cancelación lógica mantiene las entradas). */
export function TicketSummary({ reservation }: { readonly reservation: Reservation }) {
  if (reservation.tickets.length === 0) {
    return <span className="text-sm text-ink-500">Sin entradas</span>;
  }
  return (
    <span className="text-sm">
      {reservation.tickets.map((ticket) => seatLabel(ticket.row, ticket.column)).join(', ')}
    </span>
  );
}

/**
 * Las líneas renderizan `productName` y `unitPrice` **capturados en la compra** —
 * editar el catálogo después nunca debe reescribir una compra pasada.
 */
export function ItemLines({ reservation }: { readonly reservation: Reservation }) {
  if (reservation.items.length === 0) return null;

  return (
    <ul className="divide-y divide-ink-800 text-sm">
      {reservation.items.map((item) => (
        <li key={item.uuid} className="flex justify-between gap-3 py-2">
          <span>
            {item.productName}
            <span className="text-ink-500"> × {item.quantity}</span>
          </span>
          <span className="tabular-nums">
            {formatMoney(item.lineTotal)}
            <span className="text-ink-500"> ({formatMoney(item.unitPrice)} cada uno)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface CancelReservationAction {
  /** Pide confirmación y cancela. */
  readonly cancel: (reservation: Reservation) => void;
  /** `true` mientras corre una cancelación; los botones quedan deshabilitados. */
  readonly isPending: boolean;
  /** La reserva que se está cancelando, para mostrar "Cancelando…" en su botón. */
  readonly cancellingId: Uuid | null;
  /** Error de la última cancelación (`422 ALREADY_CANCELLED`, `422 SCREENING_STARTED`, …). */
  readonly error: unknown;
  /** El diálogo de confirmación: se renderiza en cualquier lugar del árbol. */
  readonly dialog: ReactNode;
}

/**
 * Cancelación lógica de una reserva, con confirmación. Devuelve `200` con la reserva cancelada:
 * se conservan entradas y productos, `totalPrice` pasa a `0` y `originalTotalPrice` guarda lo
 * cobrado. Una cancelación a la vez.
 */
export function useCancelReservation({
  onSettled,
  onCancelling,
}: {
  /** Se llama al terminar, con o sin error (normalmente un refetch). */
  readonly onSettled: () => void;
  /** Dentro de la transición, antes de la solicitud (p. ej. una actualización optimista). */
  readonly onCancelling?: (uuid: Uuid) => void;
}): CancelReservationAction {
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<unknown>(null);
  const [target, setTarget] = useState<Uuid | null>(null);
  const [isPending, startTransition] = useTransition();

  const cancel = async (reservation: Reservation) => {
    const confirmed = await confirm({
      title: 'Cancelar reserva',
      message: `Se cancela la reserva de “${reservation.movieName}” del ${formatDateTime(
        reservation.screeningStartsAt,
      )}: los asientos se liberan y la confitería vuelve al stock. No se puede deshacer.`,
      confirmLabel: 'Cancelar reserva',
      dismissLabel: 'Volver',
      tone: 'danger',
    });
    if (!confirmed) return;

    setError(null);
    setTarget(reservation.uuid);
    startTransition(async () => {
      onCancelling?.(reservation.uuid);
      try {
        await cancelReservation(reservation.uuid);
      } catch (caught) {
        setError(caught);
      } finally {
        onSettled();
      }
    });
  };

  return {
    cancel: (reservation) => void cancel(reservation),
    isPending,
    cancellingId: isPending ? target : null,
    error,
    dialog,
  };
}
