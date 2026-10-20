import type { Money } from './types.ts';
import { SeatType } from './enums.ts';

/**
 * Espejo del lado del cliente de las reglas de precios del backend.
 *
 * El valor del servidor siempre es el autoritativo: esto solo alimenta la vista previa
 * de compra y debe coincidir con `totalPrice` hasta el último centavo.
 */

/**
 * Valor por defecto documentado: 1.50×, y la fuente de `DEFAULT_METADATA_CONFIG`. El valor real
 * se sirve en `GET /api/metadata/config` como `premiumSeatMultiplier` y se pasa explícitamente
 * donde está disponible (ver `lib/api/metadata.ts`); esta constante es solo el fallback usado
 * antes de que ese valor cargue.
 */
export const PREMIUM_MULTIPLIER = 1.5;

/**
 * `HALF_UP` con `decimals` decimales, en línea con `BigDecimal.setScale(2, HALF_UP)`.
 *
 * `Math.round` ya aplica half-up para valores no negativos; el paso previo con `toPrecision`
 * elimina el error de representación binaria (`1.005 * 100` es
 * `100.49999999999999` en IEEE-754, lo que de otro modo redondearía hacia abajo).
 */
export function roundHalfUp(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const scaled = Number((value * factor).toPrecision(12));
  return Math.round(scaled) / factor;
}

/** `basePrice × (seatType === PREMIUM ? multiplier : 1.00)`, HALF_UP a 2 decimales. */
export function ticketPrice(
  basePrice: Money,
  seatType: SeatType,
  multiplier: number = PREMIUM_MULTIPLIER,
): Money {
  return roundHalfUp(basePrice * (seatType === SeatType.PREMIUM ? multiplier : 1));
}

/** `inventory.cost × quantity`, HALF_UP a 2 decimales. */
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
 * Suma los precios de entradas por asiento y luego agrega los totales de confitería,
 * en ese orden, redondeando cada componente exactamente como lo hace el backend.
 */
export function estimateTotal(
  basePrice: Money,
  seats: readonly PricedSeat[],
  products: readonly PricedProduct[] = [],
  premiumMultiplier: number = PREMIUM_MULTIPLIER,
): PriceEstimate {
  const seatsTotal = roundHalfUp(
    seats.reduce((sum, seat) => sum + ticketPrice(basePrice, seat.seatType, premiumMultiplier), 0),
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
