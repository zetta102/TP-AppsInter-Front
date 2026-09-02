import type { Money } from './types.ts';
import { SeatType } from './enums.ts';

/**
 * Client-side mirror of the backend's pricing rules (frontend-spec.md §9).
 *
 * The server value is always authoritative — this only powers the checkout
 * preview, and it must agree with `totalPrice` to the cent.
 */

/** Premium seats cost 1.5× the screening's base price. */
export const PREMIUM_MULTIPLIER = 1.5;

/**
 * `HALF_UP` to `decimals` places, matching `BigDecimal.setScale(2, HALF_UP)`.
 *
 * `Math.round` is already half-up for non-negative values; the `toPrecision`
 * pass first cancels binary representation error (`1.005 * 100` is
 * `100.49999999999999` in IEEE-754, which would otherwise round down).
 */
export function roundHalfUp(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const scaled = Number((value * factor).toPrecision(12));
  return Math.round(scaled) / factor;
}

/** `basePrice × (seatType === PREMIUM ? 1.50 : 1.00)`, HALF_UP to 2 decimals. */
export function ticketPrice(basePrice: Money, seatType: SeatType): Money {
  const multiplier = seatType === SeatType.PREMIUM ? PREMIUM_MULTIPLIER : 1;
  return roundHalfUp(basePrice * multiplier);
}

/** `inventory.cost × quantity`, HALF_UP to 2 decimals. */
export function lineTotal(unitCost: Money, quantity: number): Money {
  return roundHalfUp(unitCost * quantity);
}

export interface PricedSeat {
  readonly seatType: SeatType;
}

export interface PricedProduct {
  readonly cost: Money;
  readonly quantity: number;
}

export interface PriceEstimate {
  readonly seatsTotal: Money;
  readonly productsTotal: Money;
  readonly total: Money;
}

/**
 * Sums per-seat ticket prices, then adds concession line totals — in that
 * order, rounding each component exactly as the backend does.
 */
export function estimateTotal(
  basePrice: Money,
  seats: readonly PricedSeat[],
  products: readonly PricedProduct[] = [],
): PriceEstimate {
  const seatsTotal = roundHalfUp(
    seats.reduce((sum, seat) => sum + ticketPrice(basePrice, seat.seatType), 0),
  );
  const productsTotal = roundHalfUp(
    products.reduce((sum, product) => sum + lineTotal(product.cost, product.quantity), 0),
  );
  return {
    seatsTotal,
    productsTotal,
    total: roundHalfUp(seatsTotal + productsTotal),
  };
}
