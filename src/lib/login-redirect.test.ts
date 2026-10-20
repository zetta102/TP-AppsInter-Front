import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, loginHref, safeNext } from './login-redirect.ts';

describe('safeNext', () => {
  it.for([
    ['/checkout?screening=1&seats=a,b', '/checkout?screening=1&seats=a,b'],
    ['/reservations/detail?id=x#entradas', '/reservations/detail?id=x#entradas'],
  ])('acepta la ruta del mismo origen %s', ([raw, expected]) => {
    expect(safeNext(raw)).toBe(expected);
  });

  it.for([
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    'javascript:alert(1)',
    'reservations',
    '',
  ])('descarta %j y usa el destino por defecto', (raw) => {
    expect(safeNext(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('usa el fallback indicado cuando falta `next`', () => {
    expect(safeNext(null, '/')).toBe('/');
    expect(safeNext(undefined)).toBe(DEFAULT_AFTER_LOGIN);
  });
});

describe('loginHref', () => {
  it('codifica el destino en `next`', () => {
    expect(loginHref('/checkout?screening=1&seats=a,b')).toBe(
      '/login?next=%2Fcheckout%3Fscreening%3D1%26seats%3Da%2Cb',
    );
  });

  it('sin destino es `/login` a secas', () => {
    expect(loginHref(null)).toBe('/login');
    expect(loginHref()).toBe('/login');
  });

  it('ida y vuelta: lo que arma `loginHref` lo acepta `safeNext`', () => {
    const next = '/screenings/seats?id=abc';
    const param = new URL(loginHref(next), 'https://cine.test').searchParams.get('next');
    expect(safeNext(param)).toBe(next);
  });
});
