import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

/**
 * Diálogo sobre el elemento nativo `<dialog>`: el foco atrapado, la capa superior
 * y el manejo de Escape los resuelve la plataforma.
 *
 * El diálogo está abierto mientras está montado: el llamador lo renderiza de forma condicional
 * (`{open && <Modal …/>}`), lo que además descarta el estado del formulario al cerrarlo. El ref
 * callback con cleanup de React 19 lo abre al montar y lo cierra al desmontar.
 */
/**
 * Ref callback a nivel de módulo: una identidad estable evita que React ejecute el cleanup
 * (cerrar) y vuelva a abrir el diálogo en cada render.
 */
function showWhileMounted(dialog: HTMLDialogElement) {
  if (!dialog.open) dialog.showModal();
  return () => dialog.close();
}

export function Modal({
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly wide?: boolean;
}) {
  const titleId = useId();

  return (
    <dialog
      ref={showWhileMounted}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cx(
        'm-auto w-full rounded-card border border-ink-800 bg-ink-900 p-0 text-ink-100 backdrop:bg-black/70',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="cine-btn cine-btn-ghost px-2 py-1"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex justify-end gap-2 border-t border-ink-800 px-5 py-4">{footer}</div>
      )}
    </dialog>
  );
}

/** Etiqueta de color para valores de enums y estados. */
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
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
