import { describe, expect, it } from 'vitest';
import { buildQuery, parseSort, readPageParams, sortBy, toggleSort } from './query.ts';

describe('buildQuery', () => {
  it('devuelve una cadena vacía cuando no hay nada que anexar', () => {
    expect(buildQuery(undefined)).toBe('');
    expect(buildQuery({})).toBe('');
    expect(buildQuery({ search: '', movieId: null, roomId: undefined })).toBe('');
  });

  it('serializa números, booleanos y fechas', () => {
    const query = buildQuery({
      page: 0,
      upcomingOnly: true,
      from: new Date('2026-10-15T12:00:00Z'),
    });
    expect(query).toBe('?page=0&upcomingOnly=true&from=2026-10-15T12%3A00%3A00.000Z');
  });

  it('repite la clave para valores de array (sort de varias claves, géneros)', () => {
    expect(buildQuery({ sort: ['startsAt,asc', 'basePrice,desc'] })).toBe(
      '?sort=startsAt%2Casc&sort=basePrice%2Cdesc',
    );
    expect(buildQuery({ genre: ['ACTION', null, 'DRAMA'] })).toBe('?genre=ACTION&genre=DRAMA');
  });
});

describe('sortBy', () => {
  it('construye la forma `campo,dirección` que espera Spring', () => {
    expect(sortBy('movieName')).toBe('movieName,asc');
    expect(sortBy('createdAt', 'desc')).toBe('createdAt,desc');
  });
});

describe('readPageParams', () => {
  it('usa los valores por defecto ante entradas ausentes o inválidas', () => {
    expect(readPageParams(new URLSearchParams(''))).toEqual({ page: 0, size: 20 });
    expect(readPageParams(new URLSearchParams('page=-1&size=0'), { size: 10 })).toEqual({
      page: 0,
      size: 10,
    });
  });

  it('lee página y tamaño válidos', () => {
    expect(readPageParams(new URLSearchParams('page=3&size=50'))).toEqual({ page: 3, size: 50 });
  });
});

describe('parseSort / toggleSort', () => {
  it('separa campo y dirección', () => {
    expect(parseSort('startsAt,desc')).toEqual({ field: 'startsAt', direction: 'desc' });
  });

  it('empieza ascendente y alterna sobre la misma columna', () => {
    expect(toggleSort('movieName,asc', 'runtime')).toBe('runtime,asc');
    expect(toggleSort('runtime,asc', 'runtime')).toBe('runtime,desc');
    expect(toggleSort('runtime,desc', 'runtime')).toBe('runtime,asc');
  });
});
