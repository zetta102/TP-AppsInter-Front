import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

/**
 * Control de envío impulsado por `useFormStatus` de React 19.
 *
 * Debe renderizarse *dentro* del `<form>` al que pertenece: así es como el hook
 * detecta el estado pendiente de la Action contenedora.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Procesando…',
  variant = 'primary',
  className = '',
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly pendingLabel?: string;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly className?: string;
  readonly disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={cx('cine-btn', `cine-btn-${variant}`, className)}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Spinner({ className = '' }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

/** Placeholder de carga en bloque completo para regiones respaldadas por recursos. */
export function LoadingBlock({ label = 'Cargando…' }: { readonly label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-500">
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
  readonly description?: string;
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
