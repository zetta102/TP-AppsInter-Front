import type { SeatMapResponse, SeatMapSeat } from '../../lib/types.ts';
import { cx } from '../../lib/cx.ts';
import { SeatType } from '../../lib/enums.ts';
import { formatMoney, seatLabel } from '../../lib/format.ts';
import { PREMIUM_MULTIPLIER, ticketPrice } from '../../lib/pricing.ts';

/**
 * Contrato del componente de mapa de asientos (backend-status-for-frontend.md §7.3).
 *
 * Reglas de renderizado que no deben violarse:
 *  - `rows` y `columns` ya están ordenados de forma natural (`A2` va antes que `A10`),
 *    por lo que la grilla se construye directamente con esos arreglos, sin volver a ordenarlos aquí.
 *  - La grilla es **dispersa**: un par `(row, column)` sin asiento asociado es un
 *    pasillo o espacio y se renderiza como una celda vacía.
 *  - `available: false` significa que ya existe una entrada. El mapa es una instantánea,
 *    no un bloqueo: los asientos solo se retienen en `POST /api/reservations`.
 */

/** `${row}-${column}`: clave de coordenada usada para indexar una grilla dispersa. */
type CoordKey = `${string}-${string}`;

const coordKey = (row: string, column: string): CoordKey => `${row}-${column}`;

export function indexSeats(seats: readonly SeatMapSeat[]): ReadonlyMap<CoordKey, SeatMapSeat> {
  return new Map(seats.map((seat) => [coordKey(seat.row, seat.column), seat]));
}

/** Índice por `seatId`, para resolver una selección (lista de ids) contra el mapa. */
export function indexSeatsById(seats: readonly SeatMapSeat[]): ReadonlyMap<string, SeatMapSeat> {
  return new Map(seats.map((seat) => [seat.seatId, seat]));
}

export interface SeatMapProps {
  readonly seatMap: SeatMapResponse;
  readonly basePrice: number;
  /** `premiumSeatMultiplier` de `GET /api/metadata/config`; el valor documentado es solo el fallback. */
  readonly premiumMultiplier?: number;
  /** IDs de asientos seleccionados, en el orden de selección. */
  readonly selected: readonly string[];
  readonly onToggle?: (seat: SeatMapSeat) => void;
  /**
   * Asientos perdidos a manos de otro cliente desde el último renderizado; se resaltan después de un
   * `409` para que el usuario vea exactamente qué cambió.
   */
  readonly lostSeatIds?: readonly string[];
  readonly disabled?: boolean;
}

export function SeatMap({
  seatMap,
  basePrice,
  premiumMultiplier = PREMIUM_MULTIPLIER,
  selected,
  onToggle,
  lostSeatIds = [],
  disabled = false,
}: SeatMapProps) {
  // Sin useMemo: el React Compiler memoiza estos índices mientras sus entradas no cambien.
  const byCoord = indexSeats(seatMap.seats);
  const selectedSet = new Set(selected);
  const lostSet = new Set(lostSeatIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto h-1.5 w-3/4 rounded-full bg-linear-to-b from-ink-700 to-transparent" />
      <p className="text-center text-xs tracking-[0.3em] text-ink-500 uppercase">Pantalla</p>

      <div className="overflow-x-auto pb-2">
        {/* Cada fila es un grupo con nombre: el lector anuncia "Fila A" al entrar en ella. */}
        <div
          role="group"
          aria-label="Mapa de asientos"
          className="mx-auto flex w-fit flex-col gap-1.5"
        >
          {seatMap.rows.map((row) => (
            <div
              key={row}
              role="group"
              aria-label={`Fila ${row}`}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className="w-5 shrink-0 text-center text-xs font-medium text-ink-500"
              >
                {row}
              </span>

              {seatMap.columns.map((column) => {
                const seat = byCoord.get(coordKey(row, column));

                // Un hueco en la grilla dispersa: es un pasillo, no un asiento.
                if (!seat) return <span key={column} className="size-7 shrink-0" />;

                const isSelected = selectedSet.has(seat.seatId);
                const isLost = lostSet.has(seat.seatId);
                const isPremium = seat.seatType === SeatType.PREMIUM;
                // Un asiento retenido por otra persona no está disponible temporalmente, igual que uno
                // vendido, pero se renderiza de forma distinta para que el usuario sepa que puede intentar más tarde.
                const interactive = Boolean(onToggle) && seat.available && !seat.held && !disabled;

                return (
                  <button
                    key={column}
                    type="button"
                    disabled={!interactive}
                    onClick={() => onToggle?.(seat)}
                    aria-pressed={isSelected}
                    aria-label={`Asiento ${seatLabel(seat.row, seat.column)}, ${
                      isPremium ? 'premium' : 'estándar'
                    }, ${
                      seat.held
                        ? 'retenido por otro cliente'
                        : !seat.available
                          ? 'vendido'
                          : formatMoney(ticketPrice(basePrice, seat.seatType, premiumMultiplier))
                    }${isLost ? ', recién ocupado por otro cliente' : ''}`}
                    title={`${seatLabel(seat.row, seat.column)} · ${formatMoney(
                      ticketPrice(basePrice, seat.seatType, premiumMultiplier),
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

      <SeatLegend basePrice={basePrice} premiumMultiplier={premiumMultiplier} />
    </div>
  );
}

const HELD_CLASS = 'border border-dashed border-gold-600 bg-gold-900/60';

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
  // `scroll-mb-32`: al enfocar con teclado, el asiento queda por encima de la barra fija inferior
  // del selector (WCAG 2.4.11).
  const base =
    'size-7 shrink-0 scroll-mb-32 rounded-md text-[10px] font-semibold transition-colors flex items-center justify-center';

  if (isLost)
    return cx(base, 'bg-brand-600 ring-brand-400 motion-safe:animate-pulse text-white ring-2');
  if (isSelected) return cx(base, 'text-ink-950 bg-emerald-500');
  if (!seat.available) return cx(base, 'bg-ink-800 text-ink-500 cursor-not-allowed line-through');
  // Borde punteado: el estado "retenido" no puede distinguirse solo por color (WCAG 1.4.1).
  if (seat.held) return cx(base, HELD_CLASS, 'text-gold-600 cursor-not-allowed');
  if (!interactive) {
    return cx(base, isPremium ? 'bg-gold-500/25 text-gold-400' : 'bg-ink-700 text-ink-300');
  }
  return cx(
    base,
    isPremium
      ? 'bg-gold-500/25 text-gold-400 hover:bg-gold-500/45'
      : 'bg-ink-700 text-ink-100 hover:bg-ink-600',
  );
}

export function SeatLegend({
  basePrice,
  premiumMultiplier = PREMIUM_MULTIPLIER,
}: {
  readonly basePrice: number;
  readonly premiumMultiplier?: number;
}) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-500">
      <li className="flex items-center gap-2">
        <span className="size-4 rounded-sm bg-ink-700" />
        Estándar · {formatMoney(ticketPrice(basePrice, SeatType.NORMAL, premiumMultiplier))}
      </li>
      <li className="flex items-center gap-2">
        <span className="size-4 rounded-sm bg-gold-500/25" />
        Premium · {formatMoney(ticketPrice(basePrice, SeatType.PREMIUM, premiumMultiplier))}
      </li>
      <li className="flex items-center gap-2">
        <span className="size-4 rounded-sm bg-emerald-500" />
        Seleccionado
      </li>
      <li className="flex items-center gap-2">
        <span className="flex size-4 items-center justify-center rounded-sm bg-ink-800 text-[10px] text-ink-500 line-through">
          <span aria-hidden="true">1</span>
        </span>
        Ocupado
      </li>
      <li className="flex items-center gap-2">
        <span className={cx('size-4 rounded-sm', HELD_CLASS)} />
        Retenido por otro cliente
      </li>
    </ul>
  );
}
