import { describe, expect, it } from 'vitest';
import {
  cardFields,
  cardProgress,
  detectBrand,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  validateCard,
} from './card.ts';

/** Números de prueba públicos de las redes: pasan Luhn y no son tarjetas reales. */
const testNumbers = {
  visa: '4111111111111111',
  mastercard: '5555555555554444',
  mastercard2: '2223003122003222',
  amex: '378282246310005',
  discover: '6011111111111117',
  diners: '30569309025904',
  jcb: '3530111333300000',
} as const;

// 15 de marzo de 2027: el mes actual es 03/27.
const now = new Date(2027, 2, 15);

const valid = {
  number: testNumbers.visa,
  name: 'Ada Lovelace',
  expiry: '03/27',
  cvv: '123',
  kind: 'credit',
};

const expiryError = (value: string) =>
  validateCard({ ...valid, expiry: value }, now)[cardFields.expiry];

const cvvError = (number: string, value: string) =>
  validateCard({ ...valid, number, cvv: value }, now)[cardFields.cvv];

describe('detectBrand', () => {
  it('decide apenas los dígitos alcanzan', () => {
    expect(detectBrand('')).toBeNull();
    expect(detectBrand('4')).toBe('visa');
    expect(detectBrand('5')).toBeNull();
    expect(detectBrand('51')).toBe('mastercard');
    expect(detectBrand('56')).toBeNull();
    expect(detectBrand('222')).toBeNull();
    expect(detectBrand('2221')).toBe('mastercard');
    expect(detectBrand('2721')).toBeNull();
    expect(detectBrand('3')).toBeNull();
    expect(detectBrand('34')).toBe('amex');
    expect(detectBrand('36')).toBe('diners');
    expect(detectBrand('305')).toBe('diners');
    expect(detectBrand('306')).toBeNull();
    expect(detectBrand('35')).toBeNull();
    expect(detectBrand('3528')).toBe('jcb');
    expect(detectBrand('65')).toBe('discover');
    expect(detectBrand('644')).toBe('discover');
    expect(detectBrand('6011')).toBe('discover');
    expect(detectBrand('6012')).toBeNull();
  });

  it('reconoce los números de prueba de cada red', () => {
    expect(detectBrand(testNumbers.mastercard2)).toBe('mastercard');
    expect(detectBrand(testNumbers.amex)).toBe('amex');
    expect(detectBrand(testNumbers.diners)).toBe('diners');
    expect(detectBrand(testNumbers.jcb)).toBe('jcb');
  });
});

describe('luhnValid', () => {
  it('acepta los números de prueba', () => {
    for (const number of Object.values(testNumbers)) expect(luhnValid(number)).toBe(true);
  });

  it('rechaza un dígito cambiado y lo que no son dígitos', () => {
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('')).toBe(false);
    expect(luhnValid('4111 1111')).toBe(false);
  });
});

describe('formatCardNumber', () => {
  it('agrupa según la marca', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
    expect(formatCardNumber('30569309025904')).toBe('3056 930902 5904');
    expect(formatCardNumber('41111')).toBe('4111 1');
  });

  it('descarta lo que no es dígito y recorta al largo máximo', () => {
    expect(formatCardNumber('4111-1111 abc')).toBe('4111 1111');
    expect(formatCardNumber('3782822463100059999')).toBe('3782 822463 10005');
  });
});

describe('formatExpiry', () => {
  it('agrega la barra con el tercer dígito', () => {
    expect(formatExpiry('0')).toBe('0');
    expect(formatExpiry('04')).toBe('04');
    expect(formatExpiry('042')).toBe('04/2');
    expect(formatExpiry('04/28')).toBe('04/28');
    expect(formatExpiry('042899')).toBe('04/28');
  });

  it('completa con cero un mes de una cifra', () => {
    expect(formatExpiry('4')).toBe('04');
    expect(formatExpiry('428')).toBe('04/28');
  });
});

describe('cardProgress', () => {
  it('sigue al número a medida que se escribe', () => {
    expect(cardProgress('')).toBe('empty');
    expect(cardProgress('5')).toBe('scanning');
    expect(cardProgress('4111')).toBe('detected');
    expect(cardProgress(testNumbers.visa)).toBe('complete');
    expect(cardProgress('4111111111111112')).toBe('invalid');
    expect(cardProgress(testNumbers.amex)).toBe('complete');
  });
});

describe('validateCard', () => {
  it('acepta una tarjeta válida que vence este mes', () => {
    expect(validateCard(valid, now)).toEqual({});
    expect(validateCard({ ...valid, name: "María José O'Brien-Núñez" }, now)).toEqual({});
  });

  it('informa todos los campos vacíos', () => {
    const errors = validateCard({ number: '', name: '', expiry: '', cvv: '', kind: '' }, now);
    expect(Object.keys(errors).toSorted()).toEqual(Object.values(cardFields).toSorted());
  });

  it('valida el número', () => {
    expect(validateCard({ ...valid, number: '4111111111111112' }, now)[cardFields.number]).toMatch(
      /no es válido/,
    );
    expect(validateCard({ ...valid, number: '41111111' }, now)[cardFields.number]).toMatch(
      /13, 16 o 19/,
    );
    expect(validateCard({ ...valid, number: '9999999999999995' }, now)[cardFields.number]).toMatch(
      /No reconocemos/,
    );
  });

  it('valida el vencimiento', () => {
    expect(expiryError('02/27')).toMatch(/vencida/);
    expect(expiryError('12/26')).toMatch(/vencida/);
    expect(expiryError('13/30')).toMatch(/mes/);
    expect(expiryError('00/30')).toMatch(/mes/);
    expect(expiryError('0430')).toMatch(/MM\/AA/);
    expect(expiryError('04/48')).toMatch(/año/);
    expect(expiryError('04/47')).toBeUndefined();
  });

  it('exige el largo de CVV de la marca', () => {
    expect(cvvError(testNumbers.visa, '1234')).toMatch(/3 dígitos/);
    expect(cvvError(testNumbers.amex, '123')).toMatch(/4 dígitos/);
    expect(cvvError(testNumbers.amex, '1234')).toBeUndefined();
    expect(cvvError(testNumbers.visa, '12a')).toBeDefined();
  });

  it('valida el nombre y el tipo', () => {
    expect(validateCard({ ...valid, name: 'A' }, now)[cardFields.name]).toMatch(/entre 2 y 26/);
    expect(validateCard({ ...valid, name: 'R2D2' }, now)[cardFields.name]).toMatch(/solo letras/);
    expect(validateCard({ ...valid, name: ' -. ' }, now)[cardFields.name]).toBeDefined();
    expect(validateCard({ ...valid, kind: 'prepaid' }, now)[cardFields.kind]).toBeDefined();
  });
});
