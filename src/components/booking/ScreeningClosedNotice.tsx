import type { Screening } from '../../lib/types.ts';

/** `true` si la función ya no admite reservas: archivada o ya comenzada (según `now`). */
export function isScreeningClosed(screening: Screening, now: number): boolean {
  return screening.archived || new Date(screening.startsAt).getTime() <= now;
}

/** Aviso del selector de asientos y del checkout cuando la función ya no admite reservas. */
export function ScreeningClosedNotice({ screening }: { readonly screening: Screening }) {
  return (
    <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
      {screening.archived
        ? 'Esta función ya no está disponible.'
        : 'Esta función ya comenzó, por lo que ya no puede reservarse.'}
    </div>
  );
}
