import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

/** Indicadores de carga y estados vacíos compartidos por todas las pantallas. */

export function Spinner({ className = '' }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin',
        className,
      )}
    />
  );
}

/** Placeholder de carga en bloque completo para regiones respaldadas por recursos. */
export function LoadingBlock({ label = 'Cargando…' }: { readonly label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-16 text-sm text-ink-500"
    >
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 cine-card px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink-100">{title}</p>
      {description && <p className="max-w-prose text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  );
}
