import type { ReactNode } from 'react';
import { LoadingBlock, EmptyState } from './SubmitButton.tsx';
import { ErrorBanner } from './ErrorBanner.tsx';

/**
 * Table shell shared by the admin consoles.
 *
 * Columns are declared as data so every console gets identical loading, empty
 * and error affordances without repeating markup.
 */

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly className?: string;
  /** Entity property to sort on, when the endpoint supports it. */
  readonly sortField?: string;
}

export interface DataTableProps<T> {
  readonly rows: readonly T[] | null;
  readonly columns: readonly Column<T>[];
  readonly rowKey: (row: T) => string;
  readonly isLoading?: boolean;
  readonly error?: unknown;
  readonly onRetry?: () => void;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly activeSort?: { readonly field: string; readonly direction: 'asc' | 'desc' } | undefined;
  readonly onSort?: (field: string) => void;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  isLoading = false,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  activeSort,
  onSort,
}: DataTableProps<T>) {
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
    <div className="cine-card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-ink-500 border-ink-800 border-b text-xs uppercase tracking-wide">
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortField && onSort);
              const isActive = activeSort?.field === column.sortField;
              return (
                <th key={column.key} scope="col" className={`px-4 py-3 ${column.className ?? ''}`}>
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(column.sortField!)}
                      className="hover:text-ink-100 inline-flex items-center gap-1 uppercase"
                    >
                      {column.header}
                      <span aria-hidden="true">
                        {isActive && activeSort ? (activeSort.direction === 'asc' ? '▲' : '▼') : '↕'}
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
        <tbody className="divide-ink-800 divide-y">
          {(rows ?? []).map((row) => (
            <tr key={rowKey(row)} className="hover:bg-ink-800/40">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 align-middle ${column.className ?? ''}`}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isLoading && rows && (
        <p className="text-ink-500 border-ink-800 border-t px-4 py-2 text-xs">Refreshing…</p>
      )}
    </div>
  );
}
