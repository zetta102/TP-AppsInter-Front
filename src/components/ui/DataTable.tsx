import type { ReactNode } from 'react';
import { LoadingBlock, EmptyState } from './SubmitButton.tsx';
import { ErrorBanner } from './ErrorBanner.tsx';
import { cx } from '../../lib/cx.ts';

/**
 * Contenedor de tabla compartido por las consolas de admin.
 *
 * Las columnas se declaran como datos, así cada consola obtiene los mismos estados
 * de carga, vacío y error sin repetir markup.
 */

export interface Column<T, Field extends string = string> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly className?: string;
  /** Propiedad de la entidad por la que ordenar, si el endpoint lo soporta. */
  readonly sortField?: Field;
}

export interface DataTableProps<T, Field extends string = string> {
  readonly rows: readonly T[] | null;
  readonly columns: readonly Column<T, Field>[];
  readonly rowKey: (row: T) => string;
  readonly isLoading?: boolean;
  readonly error?: unknown;
  readonly onRetry?: () => void;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly activeSort?: { readonly field: Field; readonly direction: 'asc' | 'desc' } | undefined;
  readonly onSort?: (field: Field) => void;
}

export function DataTable<T, Field extends string = string>({
  rows,
  columns,
  rowKey,
  isLoading = false,
  error,
  onRetry,
  emptyTitle = 'Todavía no hay nada acá',
  emptyDescription,
  activeSort,
  onSort,
}: DataTableProps<T, Field>) {
  if (error) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (isLoading && !rows) return <LoadingBlock />;
  if (rows && rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        {...(emptyDescription === undefined ? {} : { description: emptyDescription })}
      />
    );
  }

  return (
    <div className="overflow-x-auto cine-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-800 text-xs tracking-wide text-ink-500 uppercase">
          <tr>
            {columns.map((column) => {
              const { sortField } = column;
              const direction =
                activeSort && sortField !== undefined && activeSort.field === sortField
                  ? activeSort.direction
                  : null;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    direction === null
                      ? undefined
                      : direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                  }
                  className={cx('px-4 py-3', column.className)}
                >
                  {sortField !== undefined && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(sortField)}
                      className="inline-flex items-center gap-1 uppercase hover:text-ink-100"
                    >
                      {column.header}
                      <span aria-hidden="true">
                        {direction === null ? '↕' : direction === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {(rows ?? []).map((row) => (
            <tr key={rowKey(row)} className="hover:bg-ink-800/40">
              {columns.map((column) => (
                <td key={column.key} className={cx('px-4 py-3 align-middle', column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isLoading && rows && (
        <p className="border-t border-ink-800 px-4 py-2 text-xs text-ink-500">Actualizando…</p>
      )}
    </div>
  );
}
