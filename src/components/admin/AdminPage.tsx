import type { ReactNode } from 'react';
import { AdminGuard } from '../ui/Guards.tsx';

/**
 * Estructura compartida por las consolas de administración: el control de rol,
 * un bloque de título y un espacio para la acción principal. Mantenerlo en un
 * solo lugar hace que todas las consolas gestionen igual la falta de permisos.
 */
export function AdminPage({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <AdminGuard>
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          {action}
        </header>
        {children}
      </div>
    </AdminGuard>
  );
}

/** Fila de barra de herramientas para los filtros sobre una tabla de administración. */
export function AdminToolbar({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 cine-card p-4">{children}</div>;
}
