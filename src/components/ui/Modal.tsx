import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Dialog built on the native `<dialog>` element, so focus trapping, the top
 * layer and Escape handling come from the platform rather than from us.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className={`bg-ink-900 text-ink-100 border-ink-800 rounded-card m-auto w-full border p-0 backdrop:bg-black/70 ${
        wide ? 'max-w-3xl' : 'max-w-lg'
      }`}
    >
      <div className="border-ink-800 flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cine-btn cine-btn-ghost px-2 py-1"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="border-ink-800 flex justify-end gap-2 border-t px-5 py-4">{footer}</div>
      )}
    </dialog>
  );
}

/** Small coloured chip for enum values and statuses. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'premium';
}) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-300',
    success: 'bg-emerald-500/15 text-emerald-400',
    warning: 'bg-gold-500/15 text-gold-400',
    danger: 'bg-brand-500/15 text-brand-400',
    premium: 'bg-gold-500/15 text-gold-400',
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
