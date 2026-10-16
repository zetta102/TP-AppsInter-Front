import type { Money, OffsetDateTimeString } from './types.ts';

/**
 * Helpers de presentación sobre `Intl`, en español rioplatense.
 *
 * El backend envía `OffsetDateTime`, así que `new Date(...)` siempre parsea. No se
 * usa `Temporal` a propósito: el soporte de navegadores todavía es desparejo y el
 * contrato solo requiere parseo con offset. La moneda es siempre USD (§1 del contrato).
 */

const locale = 'es-AR';

const money = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateOnly = new Intl.DateTimeFormat(locale, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const timeOnly = new Intl.DateTimeFormat(locale, {
  hour: '2-digit',
  minute: '2-digit',
});

const dayHeading = new Intl.DateTimeFormat(locale, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

const multiplier = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

const pad = (n: number) => String(n).padStart(2, '0');

export function formatMoney(value: Money | null | undefined): string {
  return money.format(value ?? 0);
}

export function formatDateTime(value: OffsetDateTimeString | null | undefined): string {
  if (!value) return '—';
  return dateTime.format(new Date(value));
}

export function formatDate(value: OffsetDateTimeString | null | undefined): string {
  if (!value) return '—';
  return dateOnly.format(new Date(value));
}

export function formatTime(value: OffsetDateTimeString | null | undefined): string {
  if (!value) return '—';
  return timeOnly.format(new Date(value));
}

export function formatDayHeading(value: OffsetDateTimeString): string {
  return dayHeading.format(new Date(value));
}

/** `"dentro de 3 días"` / `"hace 2 horas"`, para horarios de funciones y antigüedad de reservas. */
export function formatRelative(value: OffsetDateTimeString | null | undefined): string {
  if (!value) return '—';
  const deltaMs = new Date(value).getTime() - Date.now();
  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ] as const satisfies readonly (readonly [Intl.RelativeTimeFormatUnit, number])[];

  for (const [unit, ms] of units) {
    if (Math.abs(deltaMs) >= ms) return relative.format(Math.round(deltaMs / ms), unit);
  }
  return relative.format(Math.round(deltaMs / 1000), 'second');
}

/** `1.5` -> `"1,5×"`, para mostrar el multiplicador de asientos premium. */
export function formatMultiplier(value: number): string {
  return `${multiplier.format(value)}×`;
}

/** `142` minutos -> `"2h 22m"`. */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Valor `YYYY-MM-DDTHH:mm` en hora local para `<input type="datetime-local">`. */
export function toDateTimeLocalValue(value: OffsetDateTimeString | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Convierte un valor `datetime-local` en el string ISO con offset que espera el
 * backend. La entrada se interpreta en la zona horaria del navegador.
 */
export function fromDateTimeLocalValue(value: string): OffsetDateTimeString {
  return new Date(value).toISOString();
}

/** Clave estable para agrupar funciones por día calendario en la zona local. */
export function dayKey(value: OffsetDateTimeString): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `"A"`, `"12"` -> `"A12"`. */
export function seatLabel(row: string, column: string): string {
  return `${row}${column}`;
}
