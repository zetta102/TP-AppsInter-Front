import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

/**
 * Ref callback a nivel de módulo: una identidad estable evita que React ejecute el cleanup
 * (cerrar) y vuelva a abrir el diálogo en cada render.
 */
function showWhileMounted(dialog: HTMLDialogElement) {
  if (!dialog.open) dialog.showModal();
  return () => dialog.close();
}

/**
 * Diálogo sobre el elemento nativo `<dialog>`: el foco atrapado, la capa superior
 * y el manejo de Escape los resuelve la plataforma.
 *
 * El diálogo está abierto mientras está montado: el llamador lo renderiza de forma condicional
 * (`{open && <Modal …/>}`), lo que además descarta el estado del formulario al cerrarlo. El ref
 * callback con cleanup de React 19 lo abre al montar y lo cierra al desmontar.
 */
export function Modal({
  onClose,
  title,
  children,
  footer,
  wide = false,
  role,
}: {
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly wide?: boolean;
  /** `alertdialog` para confirmaciones que interrumpen una acción. */
  readonly role?: 'alertdialog';
}) {
  const titleId = useId();
  const bodyId = useId();

  return (
    <dialog
      ref={showWhileMounted}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={role === 'alertdialog' ? bodyId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cx(
        'm-auto w-full cine-card bg-ink-900 p-0 text-ink-100 backdrop:bg-black/70',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {/* Barra de título de ventana: el diálogo no tiene relleno, así que no hay que compensarlo. */}
      <div className="cine-titlebar justify-between py-1.5 pr-1.5 [--cine-titlebar-inset:0px]">
        <h2 id={titleId} className="mr-auto text-base font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="cine-btn border-brand-300 px-2 py-1 text-white hover:bg-brand-600"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div id={bodyId} className="max-h-[70vh] overflow-y-auto px-5 py-4">
        {children}
      </div>
      {footer && (
        <div className="flex justify-end gap-2 border-t-2 border-ink-700 px-5 py-4">{footer}</div>
      )}
    </dialog>
  );
}
