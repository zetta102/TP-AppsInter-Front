import { useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Modal } from './Modal.tsx';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: ReactNode;
  /** Texto del botón que confirma; por defecto "Confirmar". */
  readonly confirmLabel?: string;
  /** Texto del botón que desiste; por defecto "Cancelar" (usar otro si la acción es cancelar). */
  readonly dismissLabel?: string;
  /** `danger` para acciones destructivas (borrar, cancelar una reserva…). */
  readonly tone?: 'danger' | 'primary';
}

interface PendingConfirm {
  readonly options: ConfirmOptions;
  readonly resolve: (confirmed: boolean) => void;
}

/**
 * Confirmación dentro de la app, en lugar de `window.confirm()`: respeta el diseño, sus botones
 * están en español (los del navegador siguen su idioma) y se anuncia como `alertdialog`.
 *
 * `confirm()` devuelve una promesa que resuelve `true` al confirmar y `false` al cancelar o cerrar;
 * el llamador renderiza `dialog` en cualquier lugar de su árbol.
 */
export function useConfirm(): {
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  readonly dialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = (options: ConfirmOptions) => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    // Una confirmación nueva reemplaza a la anterior, que cuenta como cancelada.
    setPending((previous) => {
      previous?.resolve(false);
      return { options, resolve };
    });
    return promise;
  };

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const dialog = pending && (
    <Modal
      role="alertdialog"
      title={pending.options.title}
      onClose={() => settle(false)}
      footer={
        <>
          {/* `showModal()` enfoca el primer control (cerrar): el foco nunca empieza en la acción. */}
          <button type="button" className="cine-btn cine-btn-ghost" onClick={() => settle(false)}>
            {pending.options.dismissLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            className={cx(
              'cine-btn',
              pending.options.tone === 'danger' ? 'cine-btn-danger' : 'cine-btn-primary',
            )}
            onClick={() => settle(true)}
          >
            {pending.options.confirmLabel ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-300">{pending.options.message}</p>
    </Modal>
  );

  return { confirm, dialog };
}
