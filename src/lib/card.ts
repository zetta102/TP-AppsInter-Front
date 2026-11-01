/**
 * Validación y formato de tarjetas de crédito/débito para el paso de pago del checkout.
 *
 * El backend no procesa pagos: los datos de la tarjeta se validan solo en el navegador y nunca
 * se envían ni se guardan. Todo es puro (sin DOM ni red) para poder probarlo en `card.test.ts`.
 */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb';

export type CardKind = 'credit' | 'debit';

interface BrandSpec {
  readonly name: string;
  /** Rangos de prefijo inclusivos; los dos extremos de cada rango tienen la misma longitud. */
  readonly ranges: readonly (readonly [string, string])[];
  readonly lengths: readonly number[];
  /** La longitud habitual: a partir de ella un número que no pasa Luhn ya se marca inválido. */
  readonly typicalLength: number;
  readonly cvvLength: number;
}

export const cardBrands: Readonly<Record<CardBrand, BrandSpec>> = {
  visa: {
    name: 'Visa',
    ranges: [['4', '4']],
    lengths: [13, 16, 19],
    typicalLength: 16,
    cvvLength: 3,
  },
  mastercard: {
    name: 'Mastercard',
    ranges: [
      ['51', '55'],
      ['2221', '2720'],
    ],
    lengths: [16],
    typicalLength: 16,
    cvvLength: 3,
  },
  amex: {
    name: 'American Express',
    ranges: [
      ['34', '34'],
      ['37', '37'],
    ],
    lengths: [15],
    typicalLength: 15,
    cvvLength: 4,
  },
  discover: {
    name: 'Discover',
    ranges: [
      ['6011', '6011'],
      ['644', '649'],
      ['65', '65'],
    ],
    lengths: [16, 17, 18, 19],
    typicalLength: 16,
    cvvLength: 3,
  },
  diners: {
    name: 'Diners Club',
    ranges: [
      ['300', '305'],
      ['36', '36'],
      ['38', '39'],
    ],
    lengths: [14, 15, 16, 17, 18, 19],
    typicalLength: 14,
    cvvLength: 3,
  },
  jcb: {
    name: 'JCB',
    ranges: [['3528', '3589']],
    lengths: [16, 17, 18, 19],
    typicalLength: 16,
    cvvLength: 3,
  },
};

const brandOrder = Object.keys(cardBrands) as CardBrand[];

/** Longitud máxima de un número de tarjeta cualquiera (ISO/IEC 7812). */
const MAX_PAN_LENGTH = 19;
const NAME_MIN = 2;
const NAME_MAX = 26;
/** Ningún emisor vence una tarjeta a más de 20 años. */
const MAX_EXPIRY_YEARS = 20;

const listOr = new Intl.ListFormat('es-AR', { type: 'disjunction' });

/** `"Visa, Mastercard, … y JCB"`, para los textos de ayuda. */
export const acceptedBrands = new Intl.ListFormat('es-AR', { type: 'conjunction' }).format(
  brandOrder.map((brand) => cardBrands[brand].name),
);

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * La marca, solo cuando los dígitos escritos alcanzan para decidirla: `4` ya es Visa, pero `5`
 * espera al segundo dígito (`51`–`55`) y `2` al cuarto (`2221`–`2720`). Los rangos no se
 * superponen, así que nunca hay ambigüedad.
 */
export function detectBrand(digits: string): CardBrand | null {
  for (const brand of brandOrder) {
    for (const [low, high] of cardBrands[brand].ranges) {
      if (digits.length < low.length) continue;
      const prefix = digits.slice(0, low.length);
      // Mismo largo y solo dígitos: el orden de strings coincide con el numérico.
      if (prefix >= low && prefix <= high) return brand;
    }
  }
  return null;
}

export function maxCardLength(brand: CardBrand | null): number {
  return brand ? Math.max(...cardBrands[brand].lengths) : MAX_PAN_LENGTH;
}

export function cvvLengthFor(brand: CardBrand | null): number {
  return brand ? cardBrands[brand].cvvLength : 4;
}

/** Algoritmo de Luhn (módulo 10), el dígito verificador de todas las tarjetas. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Los tamaños de los grupos como figuran impresos en la tarjeta. */
function groupsFor(brand: CardBrand | null, length: number): readonly number[] {
  if (brand === 'amex') return [4, 6, 5];
  if (brand === 'diners' && length === 14) return [4, 6, 4];
  return [4, 4, 4, 4, 3];
}

/**
 * Agrupa caracteres como los imprime la marca (`4-4-4-4`, `4-6-5`…). Acepta cualquier carácter
 * para poder agrupar también la plantilla con comodines de la tarjeta animada.
 */
export function groupCardNumber(chars: string, brand: CardBrand | null): string {
  const groups: string[] = [];
  let start = 0;
  for (const size of groupsFor(brand, chars.length)) {
    if (start >= chars.length) break;
    groups.push(chars.slice(start, start + size));
    start += size;
  }
  return groups.join(' ');
}

/** `"4111111111111111"` -> `"4111 1111 1111 1111"`; recorta al largo máximo de la marca. */
export function formatCardNumber(value: string): string {
  const digits = onlyDigits(value);
  const brand = detectBrand(digits);
  return groupCardNumber(digits.slice(0, maxCardLength(brand)), brand);
}

/**
 * `"0428"` -> `"04/28"`; `"4"` -> `"04"`. La barra aparece recién con el tercer dígito, así
 * que borrar hacia atrás nunca queda trabado en ella.
 */
export function formatExpiry(value: string): string {
  let digits = onlyDigits(value).slice(0, 4);
  // Un primer dígito mayor que 1 solo puede ser un mes de una cifra.
  if (/^[2-9]/.test(digits)) digits = `0${digits}`.slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Estado del número a medida que se escribe; maneja la animación de la tarjeta. */
export type CardProgress = 'empty' | 'scanning' | 'detected' | 'complete' | 'invalid';

export function cardProgress(digits: string): CardProgress {
  if (digits.length === 0) return 'empty';
  const brand = detectBrand(digits);
  if (!brand) return 'scanning';
  const spec = cardBrands[brand];
  if (!spec.lengths.includes(digits.length)) return 'detected';
  if (luhnValid(digits)) return 'complete';
  return digits.length >= spec.typicalLength ? 'invalid' : 'detected';
}

export interface CardInput {
  readonly number: string;
  readonly name: string;
  readonly expiry: string;
  readonly cvv: string;
  readonly kind: string;
}

/** Nombres de campo del formulario de pago; las claves de los errores de `validateCard`. */
export const cardFields = {
  number: 'cardNumber',
  name: 'cardName',
  expiry: 'cardExpiry',
  cvv: 'cardCvv',
  kind: 'cardKind',
} as const;

function numberError(digits: string): string | null {
  if (digits.length === 0) return 'Ingresá el número de la tarjeta.';
  const brand = detectBrand(digits);
  if (!brand) return `No reconocemos esta tarjeta. Aceptamos ${acceptedBrands}.`;
  const spec = cardBrands[brand];
  if (!spec.lengths.includes(digits.length)) {
    const lengths =
      spec.lengths.length > 3
        ? `entre ${spec.lengths[0]} y ${spec.lengths.at(-1)}`
        : listOr.format(spec.lengths.map(String));
    return `Un número de ${spec.name} tiene ${lengths} dígitos.`;
  }
  if (!luhnValid(digits)) return 'El número de tarjeta no es válido. Revisalo.';
  return null;
}

function nameError(name: string): string | null {
  if (name.length === 0) return 'Ingresá el nombre como figura en la tarjeta.';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return `El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.`;
  }
  if (!/^[\p{L}' .-]+$/u.test(name) || !/\p{L}/u.test(name)) {
    return 'Usá solo letras, espacios, apóstrofos, guiones o puntos.';
  }
  return null;
}

function expiryError(expiry: string, now: Date): string | null {
  if (expiry.length === 0) return 'Ingresá el vencimiento.';
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!match) return 'Usá el formato MM/AA.';
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return 'El mes debe estar entre 01 y 12.';
  // La tarjeta vale hasta el último día del mes impreso.
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  if (year < nowYear || (year === nowYear && month < nowMonth)) return 'La tarjeta está vencida.';
  if (year > nowYear + MAX_EXPIRY_YEARS) return 'Revisá el año de vencimiento.';
  return null;
}

function cvvError(cvv: string, brand: CardBrand | null): string | null {
  if (cvv.length === 0) return 'Ingresá el código de seguridad.';
  const expected = brand ? [cardBrands[brand].cvvLength] : [3, 4];
  if (!/^\d+$/.test(cvv) || !expected.includes(cvv.length)) {
    return `El código de seguridad tiene ${listOr.format(expected.map(String))} dígitos.`;
  }
  return null;
}

/** Errores por campo (vacío si la tarjeta es válida), con las claves de `cardFields`. */
export function validateCard(input: CardInput, now: Date): Record<string, string> {
  const digits = onlyDigits(input.number);
  const brand = detectBrand(digits);
  const errors: Record<string, string> = {};
  const checks = [
    [cardFields.number, numberError(digits)],
    [cardFields.name, nameError(input.name.trim())],
    [cardFields.expiry, expiryError(input.expiry.trim(), now)],
    [cardFields.cvv, cvvError(input.cvv.trim(), brand)],
    [
      cardFields.kind,
      input.kind === 'credit' || input.kind === 'debit'
        ? null
        : 'Elegí si es de crédito o de débito.',
    ],
  ] as const;
  for (const [field, error] of checks) if (error) errors[field] = error;
  return errors;
}
