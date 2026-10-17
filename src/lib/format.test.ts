import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatCountdown,
  formatMoney,
  formatMultiplier,
  formatNumber,
  formatRuntime,
  fromDateTimeLocalValue,
  plural,
  seatLabel,
  toDateTimeLocalValue,
} from './format.ts';

describe('formatMoney', () => {
  it('formatea USD con convenciones de es-AR', () => {
    // `Intl` puede usar un espacio duro entre el símbolo y el número.
    expect(formatMoney(1234.5).replace(/\s/g, ' ')).toBe('US$ 1.234,50');
  });

  it('trata null/undefined como cero', () => {
    expect(formatMoney(null)).toBe(formatMoney(0));
    expect(formatMoney(undefined)).toBe(formatMoney(0));
  });
});

describe('formatRuntime', () => {
  it('formatea minutos como horas y minutos', () => {
    expect(formatRuntime(45)).toBe('45m');
    expect(formatRuntime(120)).toBe('2h');
    expect(formatRuntime(142)).toBe('2h 22m');
  });
});

describe('datetime-local', () => {
  it('ida y vuelta conserva el instante (a la precisión de minutos)', () => {
    const iso = '2026-10-15T21:30:00.000Z';
    expect(fromDateTimeLocalValue(toDateTimeLocalValue(iso))).toBe(iso);
  });
});

describe('formatMultiplier', () => {
  it('usa coma decimal y el signo ×', () => {
    expect(formatMultiplier(1.5)).toBe('1,5×');
    expect(formatMultiplier(2)).toBe('2×');
  });
});

describe('seatLabel', () => {
  it('concatena fila y columna', () => {
    expect(seatLabel('AA', '12')).toBe('AA12');
  });
});

describe('plural / formatCount', () => {
  it('usa el singular solo para 1', () => {
    expect(plural(1, 'función', 'funciones')).toBe('función');
    expect(plural(0, 'función', 'funciones')).toBe('funciones');
    expect(formatCount(1, 'próxima función', 'próximas funciones')).toBe('1 próxima función');
    expect(formatCount(3, 'asiento', 'asientos')).toBe('3 asientos');
  });

  it('agrupa los miles con la convención local', () => {
    expect(formatNumber(1234)).toBe('1.234');
  });
});

describe('formatCountdown', () => {
  it('muestra mm:ss y nunca valores negativos', () => {
    expect(formatCountdown(245)).toBe('04:05');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(-3)).toBe('00:00');
  });
});
