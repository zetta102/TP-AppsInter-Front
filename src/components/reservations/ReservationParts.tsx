import { Badge } from '../ui/Modal.tsx';
import { ReservationStatus, reservationStatusLabels } from '../../lib/enums.ts';
import { formatMoney, seatLabel } from '../../lib/format.ts';
import type { ReservationResponse } from '../../lib/types.ts';

/** Shared presentation for reservations, used by both customer and admin views. */

export function StatusBadge({ status }: { readonly status: ReservationStatus }) {
  const tone =
    status === ReservationStatus.CONFIRMED
      ? 'success'
      : status === ReservationStatus.CANCELLED
        ? 'danger'
        : 'warning';
  return <Badge tone={tone}>{reservationStatusLabels[status]}</Badge>;
}

/** Compact seat list; empty after a cancellation, since the tickets are deleted. */
export function TicketSummary({ reservation }: { readonly reservation: ReservationResponse }) {
  if (reservation.tickets.length === 0) {
    return <span className="text-ink-600 text-sm">No tickets</span>;
  }
  return (
    <span className="text-sm">
      {reservation.tickets.map((ticket) => seatLabel(ticket.row, ticket.column)).join(', ')}
    </span>
  );
}

/**
 * Line items render the **snapshotted** `productName` and `unitPrice` — editing
 * the catalogue later must never rewrite a past purchase.
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
            <span className="text-ink-600"> ({formatMoney(item.unitPrice)} each)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
