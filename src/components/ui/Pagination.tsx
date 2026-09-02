import type { Page } from '../../lib/types.ts';

/**
 * Pager for the shared list envelope (frontend-spec.md §6).
 *
 * `page` is zero-based on the wire; we display it one-based. The envelope's
 * `sort` string is Spring's `Sort.toString()` and is display-only, so it is
 * never parsed here.
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
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-4 ${className}`}>
      <p className="text-ink-500 text-xs">
        {page.totalElements.toLocaleString()} result{page.totalElements === 1 ? '' : 's'} · page{' '}
        {current + 1} of {page.totalPages}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="cine-btn cine-btn-ghost"
          disabled={page.first}
          onClick={() => onPageChange(current - 1)}
        >
          Previous
        </button>

        {windowed.map((entry, index) =>
          entry === null ? (
            <span key={`gap-${index}`} className="text-ink-600 px-2 text-sm">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === current ? 'page' : undefined}
              onClick={() => onPageChange(entry)}
              className={
                entry === current
                  ? 'cine-btn cine-btn-primary min-w-9'
                  : 'cine-btn cine-btn-ghost min-w-9'
              }
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
          Next
        </button>
      </div>
    </nav>
  );
}

/** Page numbers around the current one; `null` marks an elision. */
function pageWindow(current: number, total: number): readonly (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index);

  const pages = new Set<number>([0, total - 1, current]);
  if (current - 1 > 0) pages.add(current - 1);
  if (current + 1 < total - 1) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  let previous = -1;

  for (const value of sorted) {
    if (previous >= 0 && value - previous > 1) result.push(null);
    result.push(value);
    previous = value;
  }
  return result;
}
