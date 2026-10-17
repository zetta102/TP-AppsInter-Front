import { cx } from '../../lib/cx.ts';
import { formatCount, formatNumber } from '../../lib/format.ts';
import type { Page } from '../../lib/types.ts';

/**
 * Paginador para el contenedor compartido de listas (backend-status-for-frontend.md §3.3).
 *
 * `page` es base cero en el wire; lo mostramos con base uno. La cadena `sort`
 * del contenedor es el `Sort.toString()` de Spring y es solo de visualización,
 * así que nunca se parsea aquí.
 */
export function Pagination<T>({
  page,
  onPageChange,
  className = '',
}: {
  readonly page: Page<T> | null;
  readonly onPageChange: (page: number) => void;
  readonly className?: string;
}) {
  if (!page || page.totalPages <= 1) return null;

  const current = page.page;
  const windowed = pageWindow(current, page.totalPages);

  return (
    <nav
      aria-label="Paginación"
      className={cx('flex items-center justify-between gap-4', className)}
    >
      <p className="text-xs text-ink-500">
        {formatCount(page.totalElements, 'resultado', 'resultados')} · página {current + 1} de{' '}
        {formatNumber(page.totalPages)}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="cine-btn cine-btn-ghost"
          disabled={page.first}
          onClick={() => onPageChange(current - 1)}
        >
          Anterior
        </button>

        {windowed.map((entry, index) =>
          entry === null ? (
            <span key={`gap-${index}`} className="px-2 text-sm text-ink-500">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === current ? 'page' : undefined}
              onClick={() => onPageChange(entry)}
              className={cx(
                'cine-btn min-w-9',
                entry === current ? 'cine-btn-primary' : 'cine-btn-ghost',
              )}
            >
              {entry + 1}
            </button>
          ),
        )}

        <button
          type="button"
          className="cine-btn cine-btn-ghost"
          disabled={page.last}
          onClick={() => onPageChange(current + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

/** Números de página alrededor de la actual; `null` marca una omisión. */
function pageWindow(current: number, total: number): readonly (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index);

  const pages = new Set<number>([0, total - 1, current]);
  if (current - 1 > 0) pages.add(current - 1);
  if (current + 1 < total - 1) pages.add(current + 1);

  const sorted = [...pages].toSorted((a, b) => a - b);
  const result: (number | null)[] = [];
  let previous = -1;

  for (const value of sorted) {
    if (previous >= 0 && value - previous > 1) result.push(null);
    result.push(value);
    previous = value;
  }
  return result;
}
