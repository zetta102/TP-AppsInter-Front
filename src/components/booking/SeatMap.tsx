import { useMemo } from 'react';
import type { SeatMapResponse, SeatMapSeat } from '../../lib/types.ts';
import { SeatType } from '../../lib/enums.ts';
import { formatMoney, seatLabel } from '../../lib/format.ts';
import { ticketPrice } from '../../lib/pricing.ts';

/**
 * Seat-map component contract (frontend-spec.md §8.4).
 *
 * Rendering rules that must not be violated:
 *  - `rows` and `columns` are already sorted naturally (`A2` precedes `A10`),
 *    so the grid is built from those arrays verbatim — never re-sorted here.
 *  - The grid is **sparse**: a `(row, column)` pair with no matching seat is an
 *    aisle or gap and renders as a blank cell.
 *  - `available: false` means a ticket already exists. The map is a snapshot,
 *    not a lock — seats are only held at `POST /api/reservations`.
 */

/** `${row}-${column}` — the coordinate key used to index a sparse grid. */
type CoordKey = `${string}-${string}`;

const coordKey = (row: string, column: string): CoordKey => `${row}-${column}`;

export function indexSeats(seats: readonly SeatMapSeat[]): ReadonlyMap<CoordKey, SeatMapSeat> {
  return new Map(seats.map((seat) => [coordKey(seat.row, seat.column), seat]));
}

export interface SeatMapProps {
  readonly seatMap: SeatMapResponse;
  readonly basePrice: number;
  /** Selected seat ids, in selection order. */
  readonly selected: readonly string[];
  readonly onToggle?: (seat: SeatMapSeat) => void;
  /**
   * Seats lost to another customer since the last render — highlighted after a
   * `409` so the user can see exactly what changed.
   */
  readonly lostSeatIds?: readonly string[];
  readonly disabled?: boolean;
}

export function SeatMap({
  seatMap,
  basePrice,
  selected,
  onToggle,
  lostSeatIds = [],
  disabled = false,
}: SeatMapProps) {
  const byCoord = useMemo(() => indexSeats(seatMap.seats), [seatMap.seats]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const lostSet = useMemo(() => new Set(lostSeatIds), [lostSeatIds]);

  return (
    <div className="flex flex-col gap-5">
      <div className="from-ink-700 mx-auto h-1.5 w-3/4 rounded-full bg-linear-to-b to-transparent" />
      <p className="text-ink-600 text-center text-xs uppercase tracking-[0.3em]">Screen</p>

      <div className="overflow-x-auto pb-2">
        <div className="mx-auto flex w-fit flex-col gap-1.5">
          {seatMap.rows.map((row) => (
            <div key={row} className="flex items-center gap-1.5">
              <span className="text-ink-600 w-5 shrink-0 text-center text-xs font-medium">
                {row}
              </span>

              {seatMap.columns.map((column) => {
                const seat = byCoord.get(coordKey(row, column));

                // A gap in the sparse grid: an aisle, not a seat.
                if (!seat) return <span key={column} className="size-7 shrink-0" />;

                const isSelected = selectedSet.has(seat.seatId);
                const isLost = lostSet.has(seat.seatId);
                const isPremium = seat.seatType === SeatType.PREMIUM;
                const interactive = Boolean(onToggle) && seat.available && !disabled;

                return (
                  <button
                    key={column}
                    type="button"
                    disabled={!interactive}
                    onClick={() => onToggle?.(seat)}
                    aria-pressed={isSelected}
                    aria-label={`Seat ${seatLabel(seat.row, seat.column)}, ${
                      isPremium ? 'premium' : 'normal'
                    }, ${seat.available ? formatMoney(ticketPrice(basePrice, seat.seatType)) : 'unavailable'}`}
                    title={`${seatLabel(seat.row, seat.column)} · ${formatMoney(
                      ticketPrice(basePrice, seat.seatType),
                    )}`}
                    className={seatClass({ isSelected, isLost, isPremium, seat, interactive })}
                  >
                    {column}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <SeatLegend basePrice={basePrice} />
    </div>
  );
}

function seatClass({
  isSelected,
  isLost,
  isPremium,
  seat,
  interactive,
}: {
  readonly isSelected: boolean;
  readonly isLost: boolean;
  readonly isPremium: boolean;
  readonly seat: SeatMapSeat;
  readonly interactive: boolean;
}): string {
  const base =
    'size-7 shrink-0 rounded-md text-[10px] font-semibold transition-colors flex items-center justify-center';

  if (isLost) return `${base} bg-brand-600 text-white ring-2 ring-brand-400 animate-pulse`;
  if (isSelected) return `${base} bg-emerald-500 text-ink-950`;
  if (!seat.available) return `${base} bg-ink-800 text-ink-600 cursor-not-allowed line-through`;
  if (!interactive) {
    return isPremium
      ? `${base} bg-gold-500/25 text-gold-400`
      : `${base} bg-ink-700 text-ink-300`;
  }
  return isPremium
    ? `${base} bg-gold-500/25 text-gold-400 hover:bg-gold-500/45`
    : `${base} bg-ink-700 text-ink-100 hover:bg-ink-600`;
}

export function SeatLegend({ basePrice }: { readonly basePrice: number }) {
  return (
    <ul className="text-ink-500 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
      <li className="flex items-center gap-2">
        <span className="bg-ink-700 size-4 rounded" />
        Normal · {formatMoney(ticketPrice(basePrice, SeatType.NORMAL))}
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-gold-500/25 size-4 rounded" />
        Premium · {formatMoney(ticketPrice(basePrice, SeatType.PREMIUM))}
      </li>
      <li className="flex items-center gap-2">
        <span className="size-4 rounded bg-emerald-500" />
        Selected
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-ink-800 size-4 rounded" />
        Taken
      </li>
    </ul>
  );
}
