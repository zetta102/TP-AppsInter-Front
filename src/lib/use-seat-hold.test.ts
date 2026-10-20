import { describe, expect, it } from 'vitest';
import { holdIdFor } from './use-seat-hold.ts';
import type { SeatHold } from './types.ts';

const hold: SeatHold = {
  uuid: 'hold-1',
  screeningId: 'screening-1',
  seatIds: ['a', 'b'],
  expiresAt: '2099-01-01T00:00:00Z',
  ttlSeconds: 300,
};

describe('holdIdFor', () => {
  it('envía la retención cuando cubre toda la selección, en cualquier orden', () => {
    expect(holdIdFor(hold, ['b', 'a'])).toBe('hold-1');
    expect(holdIdFor(hold, ['a'])).toBe('hold-1');
  });

  it('la omite si la selección tiene asientos que la retención todavía no cubre', () => {
    // Recién se agregó `c`: la retención se está reemplazando; enviarla daría 404/409.
    expect(holdIdFor(hold, ['a', 'c'])).toBeUndefined();
  });

  it('la omite sin retención o sin selección', () => {
    expect(holdIdFor(null, ['a'])).toBeUndefined();
    expect(holdIdFor(hold, [])).toBeUndefined();
  });
});
