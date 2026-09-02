import type { Money, OffsetDateTimeString } from './types.ts';

/**
 * Presentation helpers built on `Intl`.
 *
 * The backend sends `OffsetDateTime`, so `new Date(...)` always parses. We
 * deliberately do not use `Temporal`: browser support is still uneven and the
 * contract only requires offset-aware parsing.
 */

const locale = 'en-US';

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

/** `"in 3 days"` / `"2 hours ago"`, for screening times and reservation ages. */
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

/** `142` minutes -> `"2h 22m"`. */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Local-time `YYYY-MM-DDTHH:mm` value for `<input type="datetime-local">`. */
export function toDateTimeLocalValue(value: OffsetDateTimeString | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Converts a `datetime-local` value into the offset-aware ISO string the
 * backend expects. The input is interpreted in the browser's zone.
 */
export function fromDateTimeLocalValue(value: string): OffsetDateTimeString {
  return new Date(value).toISOString();
}

/** Stable key for grouping screenings by calendar day in the local zone. */
export function dayKey(value: OffsetDateTimeString): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `"A"`, `"12"` -> `"A12"`. */
export function seatLabel(row: string, column: string): string {
  return `${row}${column}`;
}
