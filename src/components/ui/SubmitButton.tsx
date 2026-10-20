import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Spinner } from './Feedback.tsx';

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
