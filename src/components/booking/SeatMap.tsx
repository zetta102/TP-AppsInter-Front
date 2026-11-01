import { cx } from '../../lib/cx.ts';
import { SeatType } from '../../lib/enums.ts';
import { formatMoney, seatLabel } from '../../lib/format.ts';
import { PREMIUM_MULTIPLIER, ticketPrice } from '../../lib/pricing.ts';
import type { SeatAvailability, SeatMap as SeatMapData } from '../../lib/types.ts';

/**
 * Contrato del componente de mapa de asientos.
 *
 * Reglas de renderizado que no deben violarse:
 *  - `rows` y `columns` ya están ordenados de forma natural (`A2` va antes que `A10`),
 *    por lo que la grilla se construye directamente con esos arreglos, sin volver a ordenarlos acá.
 *  - La grilla es **dispersa**: un par `(row, column)` sin asiento asociado es un
 *    pasillo o espacio y se renderiza como una celda vacía.
 *  - `available: false` con `held: false` es un asiento vendido; con `held: true`, otro cliente
 *    lo tiene retenido. Con sesión, las retenciones propias llegan como disponibles.
 *  - El mapa es una instantánea, no un bloqueo: solo una retención
 *    (`POST /api/screenings/{id}/holds`) reserva asientos durante el checkout.
 */

/** `${row}-${column}`: clave de coordenada usada para indexar una grilla dispersa. */
type CoordKey = `${string}-${string}`;

const coordKey = (row: string, column: string): CoordKey => `${row}-${column}`;

export function indexSeats(
  seats: readonly SeatAvailability[],
): ReadonlyMap<CoordKey, SeatAvailability> {
  return new Map(seats.map((seat) => [coordKey(seat.row, seat.column), seat]));
}

/** Índice por `seatId`, para resolver una selección (lista de ids) contra el mapa. */
export function indexSeatsById(
  seats: readonly SeatAvailability[],
): ReadonlyMap<string, SeatAvailability> {
  return new Map(seats.map((seat) => [seat.seatId, seat]));
}

export interface SeatMapProps {
  readonly seatMap: SeatMapData;
  readonly basePrice: number;
  /** `premiumSeatMultiplier` de `GET /api/metadata/config`; el valor documentado es solo el fallback. */
  readonly premiumMultiplier?: number;
  /** IDs de asientos seleccionados, en el orden de selección. */
  readonly selected: readonly string[];
  readonly onToggle?: (seat: SeatAvailability) => void;
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
      <div className="mx-auto h-2 w-3/4 bg-ink-600 shadow-[0_2px_0_var(--color-ink-800)]" />
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
                if (!seat) return <span key={column} className="size-8 shrink-0" />;

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
                    className={cx(
                      SEAT_BASE,
                      // `scroll-mb-32`: al enfocar con teclado, el asiento queda por encima de la
                      // barra fija inferior del selector (WCAG 2.4.11).
                      'scroll-mb-32',
                      seatShapeClass(isPremium),
                      seatColorClass(
                        seatState({ isSelected, isLost, seat }),
                        isPremium,
                        interactive,
                      ),
                    )}
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

/**
 * Piezas de estilo de un asiento, compartidas con el editor de salas (`AdminRoomSeats.tsx`) y con
 * la leyenda, para que la leyenda no pueda desviarse de los asientos.
 *
 * Cada estado se distingue por algo más que el tono (WCAG 3 "Hue not relied on"): premium lleva
 * un respaldo grueso arriba, seleccionado es mucho más claro, ocupado va tachado, retenido tiene
 * borde punteado y "recién ocupado" suma un marco exterior. Los bordes de los asientos
 * disponibles contrastan ≥3:1 con la tarjeta.
 */
export const SEAT_BASE =
  'flex size-8 shrink-0 items-center justify-center text-xs tabular-nums transition-colors';

export type SeatState = 'available' | 'selected' | 'sold' | 'held' | 'lost';

function seatState({
  isSelected,
  isLost,
  seat,
}: {
  readonly isSelected: boolean;
  readonly isLost: boolean;
  readonly seat: SeatAvailability;
}): SeatState {
  if (isLost) return 'lost';
  if (isSelected) return 'selected';
  if (!seat.available) return 'sold';
  if (seat.held) return 'held';
  return 'available';
}

/** La forma marca el tipo en cualquier estado: premium tiene el borde superior grueso. */
export function seatShapeClass(isPremium: boolean): string {
  return isPremium ? 'border-2 border-t-4' : 'border-2';
}

export function seatColorClass(state: SeatState, isPremium: boolean, interactive: boolean): string {
  switch (state) {
    case 'lost':
      // Parpadeo de tres vueltas (menos de 5 s, WCAG 3 "No visual motion"); el marco exterior
      // queda fijo y lo distingue también sin movimiento.
      return 'border-virus-300 bg-virus-600 text-white ring-2 ring-virus-300 ring-offset-2 ring-offset-ink-900 motion-safe:animate-[pc-blink_800ms_step-end_3]';
    case 'selected':
      return 'border-hp-400 bg-hp-500 text-ink-950 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]';
    case 'sold':
      return 'cursor-not-allowed border-ink-700 bg-ink-800 text-ink-500 line-through';
    case 'held':
      return 'cursor-not-allowed border-dashed border-gold-600 bg-gold-900/60 text-gold-600';
    case 'available':
      if (isPremium) {
        return cx(
          'border-gold-500 border-t-gold-400 bg-gold-900 text-gold-400',
          interactive && 'hover:bg-gold-600/40',
        );
      }
      return cx(
        'border-ink-500 bg-ink-700',
        interactive ? 'text-ink-100 hover:bg-ink-600' : 'text-ink-300',
      );
  }
}

function LegendSwatch({
  state,
  isPremium = false,
  children,
}: {
  readonly state: SeatState;
  readonly isPremium?: boolean;
  readonly children?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-5 shrink-0 items-center justify-center',
        seatShapeClass(isPremium),
        seatColorClass(state, isPremium, false),
      )}
    >
      {children}
    </span>
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
        <LegendSwatch state="available" />
        Estándar · {formatMoney(ticketPrice(basePrice, SeatType.NORMAL, premiumMultiplier))}
      </li>
      <li className="flex items-center gap-2">
        <LegendSwatch state="available" isPremium />
        Premium (respaldo grueso) ·{' '}
        {formatMoney(ticketPrice(basePrice, SeatType.PREMIUM, premiumMultiplier))}
      </li>
      <li className="flex items-center gap-2">
        <LegendSwatch state="selected" />
        Seleccionado
      </li>
      <li className="flex items-center gap-2">
        <LegendSwatch state="sold">1</LegendSwatch>
        Ocupado
      </li>
      <li className="flex items-center gap-2">
        <LegendSwatch state="held" />
        Retenido por otro cliente
      </li>
    </ul>
  );
}
