import { describe, expect, it } from 'vitest';
import { SeatType } from './enums.ts';
import { estimateTotal, lineTotal, roundHalfUp, ticketPrice } from './pricing.ts';

describe('roundHalfUp', () => {
  it('redondea .5 hacia arriba, como BigDecimal HALF_UP', () => {
    expect(roundHalfUp(2.345)).toBe(2.35);
    expect(roundHalfUp(2.344)).toBe(2.34);
  });

  it('no se deja engañar por el error de representación binaria', () => {
    // 1.005 * 100 === 100.49999999999999 en IEEE-754.
    expect(roundHalfUp(1.005)).toBe(1.01);
  });
});

describe('ticketPrice', () => {
  it('aplica el multiplicador solo a los asientos premium', () => {
    expect(ticketPrice(10, SeatType.NORMAL)).toBe(10);
    expect(ticketPrice(10, SeatType.PREMIUM)).toBe(15);
  });

  it('usa el multiplicador recibido en lugar del valor por defecto', () => {
    expect(ticketPrice(10, SeatType.PREMIUM, 2)).toBe(20);
    expect(ticketPrice(10, SeatType.NORMAL, 2)).toBe(10);
  });

  it('redondea el precio de cada entrada', () => {
    expect(ticketPrice(9.99, SeatType.PREMIUM)).toBe(14.99); // 14.985 -> 14.99
  });
});

describe('estimateTotal', () => {
  it('suma entradas y confitería redondeando cada componente', () => {
    const estimate = estimateTotal(
      9.99,
      [{ seatType: SeatType.NORMAL }, { seatType: SeatType.PREMIUM }],
      [{ cost: 3.335, quantity: 3 }],
    );
    expect(estimate.seatsTotal).toBe(24.98);
    expect(estimate.productsTotal).toBe(lineTotal(3.335, 3));
    expect(estimate.total).toBe(roundHalfUp(estimate.seatsTotal + estimate.productsTotal));
  });

  it('devuelve ceros sin asientos ni productos', () => {
    expect(estimateTotal(10, [])).toEqual({ seatsTotal: 0, productsTotal: 0, total: 0 });
  });
});
