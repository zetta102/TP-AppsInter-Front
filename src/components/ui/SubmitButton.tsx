import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Submit control driven by React 19's `useFormStatus`.
 *
 * It must render *inside* the `<form>` it belongs to — that is how the hook
 * discovers the pending state of the enclosing Action.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
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
      className={`cine-btn cine-btn-${variant} ${className}`}
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
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/** Full-block loading placeholder for resource-backed regions. */
export function LoadingBlock({ label = 'Loading…' }: { readonly label?: string }) {
  return (
    <div className="text-ink-500 flex items-center justify-center gap-3 py-16 text-sm">
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
    <div className="cine-card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-ink-100 text-base font-semibold">{title}</p>
      {description && <p className="text-ink-500 max-w-prose text-sm">{description}</p>}
      {action}
    </div>
  );
}
