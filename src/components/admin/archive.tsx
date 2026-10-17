import { useState, useTransition, type ReactNode } from 'react';
import { isApiErrorWithCode } from '../../lib/problem.ts';
import type { Uuid } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Badge } from '../ui/Modal.tsx';

/**
 * Piezas compartidas para archivar recursos desde admin (backend-status-for-frontend.md §3.7).
 *
 * Películas, salas, funciones y productos con historial no se pueden borrar
 * (`409 RESOURCE_IN_USE`), pero sí archivar: desaparecen de los listados públicos y se siguen
 * resolviendo por id (las reservas pasadas no se rompen). Los listados de admin los muestran
 * con "Mostrar archivados".
 */

interface Archivable {
  readonly uuid: Uuid;
  readonly archived: boolean;
}

/** Casilla de la barra de herramientas que agrega `includeArchived=true` al listado. */
export function ShowArchivedToggle({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 pb-2 text-sm text-ink-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Mostrar archivados
    </label>
  );
}

export function ArchivedBadge({ archived }: { readonly archived: boolean }) {
  return archived ? <Badge tone="warning">Archivado</Badge> : null;
}

export interface ArchiveActions<T extends Archivable> {
  /** Pide confirmación y borra; si el recurso está en uso, ofrece archivarlo en su lugar. */
  readonly remove: (item: T) => void;
  readonly toggleArchived: (item: T) => void;
  /** `true` mientras corre una acción de fila; los botones quedan deshabilitados. */
  readonly isPending: boolean;
  /** Error de la última acción de fila (con el botón "Archivar en su lugar" cuando aplica). */
  readonly banner: ReactNode;
  /** Botones "Archivar"/"Restaurar" y "Eliminar" para la columna de acciones. */
  readonly buttons: (item: T) => ReactNode;
}

export function useArchiveActions<T extends Archivable>(options: {
  readonly remove: (uuid: Uuid) => Promise<void>;
  readonly setArchived: (uuid: Uuid, archived: boolean) => Promise<unknown>;
  readonly refetch: () => void;
  /** Texto de confirmación antes de borrar. */
  readonly confirmDelete: (item: T) => string;
  /** Nombre del ítem para el botón "Archivar … en su lugar". */
  readonly name: (item: T) => string;
}): ArchiveActions<T> {
  const [rowError, setRowError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState<T | null>(null);
  // Una acción a la vez: mientras está pendiente, los botones no aceptan otro clic.
  const [isPending, startTransition] = useTransition();

  const toggleArchived = (item: T) => {
    setRowError(null);
    setBlocked(null);
    startTransition(async () => {
      try {
        await options.setArchived(item.uuid, !item.archived);
      } catch (error) {
        setRowError(error);
      } finally {
        options.refetch();
      }
    });
  };

  const remove = (item: T) => {
    if (!window.confirm(options.confirmDelete(item))) return;
    setRowError(null);
    setBlocked(null);
    startTransition(async () => {
      try {
        await options.remove(item.uuid);
      } catch (error) {
        setRowError(error);
        // Tiene historial: no se puede borrar, pero sí archivar.
        if (isApiErrorWithCode(error, 'RESOURCE_IN_USE') && !item.archived) setBlocked(item);
      } finally {
        options.refetch();
      }
    });
  };

  const banner =
    rowError === null ? null : (
      <div className="flex flex-col gap-2">
        <ErrorBanner error={rowError} onRetry={options.refetch} />
        {blocked && (
          <div>
            <button
              type="button"
              className="cine-btn cine-btn-ghost"
              disabled={isPending}
              onClick={() => toggleArchived(blocked)}
            >
              Archivar “{options.name(blocked)}” en su lugar
            </button>
          </div>
        )}
      </div>
    );

  const buttons = (item: T) => (
    <>
      <button
        type="button"
        className="cine-btn cine-btn-ghost"
        disabled={isPending}
        onClick={() => toggleArchived(item)}
      >
        {item.archived ? 'Restaurar' : 'Archivar'}
      </button>
      <button
        type="button"
        className="cine-btn cine-btn-danger"
        disabled={isPending}
        onClick={() => remove(item)}
      >
        Eliminar
      </button>
    </>
  );

  return { remove, toggleArchived, isPending, banner, buttons };
}
