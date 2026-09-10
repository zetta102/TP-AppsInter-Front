import { Badge } from '../ui/Modal.tsx';
import { ReservationStatus, reservationStatusLabels } from '../../lib/enums.ts';
import { formatMoney, seatLabel } from '../../lib/format.ts';
import type { ReservationResponse } from '../../lib/types.ts';

/** Presentación compartida para reservas, usada tanto en vistas de cliente como de admin. */

export function StatusBadge({ status }: { readonly status: ReservationStatus }) {
  const tone =
    status === ReservationStatus.CONFIRMED
      ? 'success'
      : status === ReservationStatus.CANCELLED
        ? 'danger'
        : 'warning';
  return <Badge tone={tone}>{reservationStatusLabels[status]}</Badge>;
}

/** Lista compacta de butacas — se conserva incluso tras cancelar (la cancelación lógica mantiene las entradas). */
export function TicketSummary({ reservation }: { readonly reservation: ReservationResponse }) {
  if (reservation.tickets.length === 0) {
    return <span className="text-ink-600 text-sm">Sin entradas</span>;
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
export function ItemLines({ reservation }: { readonly reservation: ReservationResponse }) {
  if (reservation.items.length === 0) return null;

  return (
    <ul className="divide-ink-800 divide-y text-sm">
      {reservation.items.map((item) => (
        <li key={item.uuid} className="flex justify-between gap-3 py-2">
          <span>
            {item.productName}
            <span className="text-ink-500"> × {item.quantity}</span>
          </span>
          <span className="tabular-nums">
            {formatMoney(item.lineTotal)}
            <span className="text-ink-600"> ({formatMoney(item.unitPrice)} cada uno)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
