import { describe, expect, it } from 'vitest';
import {
  checkoutPath,
  legacyRedirects,
  moviePath,
  reservationPath,
  roomSeatsPath,
  screeningSeatsPath,
} from './paths.ts';

describe('rutas con parámetros', () => {
  it('ponen el id en la ruta', () => {
    expect(moviePath('m1')).toBe('/movies/m1');
    expect(screeningSeatsPath('s1')).toBe('/screenings/s1/seats');
    expect(reservationPath('r1')).toBe('/reservations/r1');
    expect(roomSeatsPath('h1')).toBe('/admin/rooms/h1/seats');
  });

  it('codifican un id que cambiaría la forma de la ruta', () => {
    expect(moviePath('a/b?c')).toBe('/movies/a%2Fb%3Fc');
  });

  it('el checkout conserva el orden de los asientos', () => {
    expect(checkoutPath('s1', ['b', 'a'])).toBe('/checkout/s1?seats=b,a');
    expect(checkoutPath('s1', [])).toBe('/checkout/s1');
  });
});

const redirect = (path: keyof typeof legacyRedirects, query: string) =>
  legacyRedirects[path](new URLSearchParams(query));

describe('legacyRedirects', () => {
  it.for([
    ['/movies/detail', 'id=m1', '/movies/m1'],
    ['/screenings/seats', 'id=s1', '/screenings/s1/seats'],
    ['/checkout', 'screening=s1&seats=a,b', '/checkout/s1?seats=a,b'],
    ['/checkout', 'screening=s1', '/checkout/s1'],
    ['/reservations/detail', 'id=r1', '/reservations/r1'],
    ['/admin/rooms/seats', 'id=h1', '/admin/rooms/h1/seats'],
  ] as const)('%s?%s lleva a %s', ([path, query, expected]) => {
    expect(redirect(path, query)).toBe(expected);
  });

  it.for([
    ['/movies/detail', '/movies'],
    ['/screenings/seats', '/'],
    ['/checkout', '/'],
    ['/reservations/detail', '/reservations'],
    ['/admin/rooms/seats', '/admin/rooms'],
  ] as const)('%s sin id lleva al listado %s', ([path, expected]) => {
    expect(redirect(path, '')).toBe(expected);
  });
});
