import { useState, useTransition } from 'react';
import { generateSeats, getRoom, getRoomLayout } from '../../lib/api/rooms.ts';
import { deleteSeat, updateSeat } from '../../lib/api/seats.ts';
import { cx } from '../../lib/cx.ts';
import { SeatType, seatTypeLabels } from '../../lib/enums.ts';
import { formatMultiplier, seatLabel } from '../../lib/format.ts';
import { isApiErrorWithCode, toUserMessage } from '../../lib/problem.ts';
import type { Seat, SeatLayout } from '../../lib/types.ts';
import { useMetadataConfig } from '../../lib/use-metadata-config.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { useKeyedResource } from '../../lib/use-resource.ts';
import { Badge } from '../ui/Badge.tsx';
import { useConfirm } from '../ui/ConfirmDialog.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/Feedback.tsx';
import { TextInput } from '../ui/Field.tsx';
import { Modal } from '../ui/Modal.tsx';
import { AdminPage } from './AdminPage.tsx';

/** Letras de fila A, B, … Z, AA, AB: el mismo formato que suele usar una sala de cine. */
function rowName(index: number): string {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

const coord = (row: string, column: string) => `${row}-${column}`;

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * `/admin/rooms/seats?id=<uuid>` — el generador de distribución de asientos.
 *
 * Generar una grilla llama a `POST /api/rooms/{id}/seats:generate` en una única
 * transacción, de modo que o bien existe toda la distribución solicitada o no
 * cambia nada. Se usa `onConflict: 'SKIP'` para que volver a ejecutar el generador al
 * ampliar una sala nunca falle por las filas que ya existen.
 */
export default function AdminRoomSeats() {
  const roomId = useQueryParam('id');

  const room = useKeyedResource(roomId, (id, signal) => getRoom(id, { signal }));

  const layout = useKeyedResource<string, SeatLayout>(roomId, (id, signal) =>
    getRoomLayout(id, { signal }),
  );

  // El valor documentado mientras carga o si falla: el texto de ayuda nunca bloquea la pantalla.
  const premiumMultiplier = formatMultiplier(useMetadataConfig().premiumSeatMultiplier);
  const { confirm, dialog } = useConfirm();

  // Transiciones async de React 19: el estado pendiente lo lleva React, sin flags manuales.
  const [generating, startGenerate] = useTransition();
  const [seatPending, startSeatAction] = useTransition();
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);
  const [rowError, setRowError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Seat | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  if (!roomId) {
    return (
      <AdminPage title="Plano de asientos">
        <EmptyState
          title="No hay ninguna sala seleccionada"
          action={
            <a href="/admin/rooms" className="cine-btn cine-btn-primary">
              Seleccionar sala
            </a>
          }
        />
      </AdminPage>
    );
  }

  const existing = new Map(
    (layout.data?.seats ?? []).map((seat) => [coord(seat.row, seat.column), seat]),
  );

  const generate = (spec: {
    rows: number;
    columns: number;
    startRowIndex: number;
    premiumFrom: number;
  }) => {
    setShowGenerator(false);
    setGenerateError(null);
    setGenerateSuccess(null);

    const startRow = rowName(spec.startRowIndex);
    const preview = Array.from({ length: spec.rows }, (_, index) =>
      rowName(spec.startRowIndex + index),
    );
    const premiumRows = preview.slice(Math.max(0, preview.length - spec.premiumFrom));

    startGenerate(async () => {
      try {
        const { data } = await generateSeats(roomId, {
          rows: spec.rows,
          columns: spec.columns,
          startRow,
          ...(premiumRows.length > 0 ? { premiumRows } : {}),
          onConflict: 'SKIP',
        });
        setGenerateSuccess(`La distribución ahora tiene ${data.seats.length} asientos.`);
      } catch (error) {
        setGenerateError(error);
      } finally {
        layout.refetch();
      }
    });
  };

  const remove = async (seat: Seat) => {
    const confirmed = await confirm({
      title: 'Eliminar asiento',
      message: `¿Eliminar el asiento ${seatLabel(seat.row, seat.column)}?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) return;
    setRowError(null);
    startSeatAction(async () => {
      try {
        await deleteSeat(seat.uuid);
      } catch (error) {
        // 409 cuando los tickets ya referencian el asiento.
        setRowError(error);
      } finally {
        layout.refetch();
      }
    });
  };

  const toggleType = (seat: Seat) => {
    setRowError(null);
    const next = seat.seatType === SeatType.PREMIUM ? SeatType.NORMAL : SeatType.PREMIUM;
    startSeatAction(async () => {
      try {
        await updateSeat(seat.uuid, {
          screenRoomId: seat.screenRoomId,
          row: seat.row,
          column: seat.column,
          seatType: next,
        });
      } catch (error) {
        setRowError(error);
      } finally {
        layout.refetch();
      }
    });
  };

  const { data: layoutData } = layout;

  return (
    <AdminPage
      title={room.data ? `Asientos · ${room.data.roomName}` : 'Plano de asientos'}
      description={`Seleccioná un asiento para alternar entre normal y premium. Las entradas premium cuestan ${premiumMultiplier} el precio base.`}
      action={
        <div className="flex gap-2">
          <a href="/admin/rooms" className="cine-btn cine-btn-ghost">
            Todas las salas
          </a>
          <button
            type="button"
            className="cine-btn cine-btn-primary"
            disabled={generating}
            onClick={() => setShowGenerator(true)}
          >
            Generar asientos
          </button>
        </div>
      }
    >
      {dialog}

      {rowError !== null && <ErrorBanner error={rowError} />}

      {generating && <div className="cine-card p-4 text-sm">Generando la distribución…</div>}

      {generateSuccess && (
        <div role="status" className="cine-alert-success px-4 py-3 text-sm">
          {generateSuccess}
        </div>
      )}

      {generateError !== null && (
        <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
          {toUserMessage(generateError)}
          {isApiErrorWithCode(generateError, 'NAME_TAKEN') &&
            isStringArray(generateError.context.conflicts) && (
              <p className="mt-1 text-ink-300">
                Asientos en conflicto: {generateError.context.conflicts.join(', ')}
              </p>
            )}
        </div>
      )}

      {layout.isLoading ? (
        <LoadingBlock label="Cargando distribución…" />
      ) : layout.error ? (
        <ErrorBanner error={layout.error} onRetry={layout.refetch} />
      ) : !layoutData || layoutData.seats.length === 0 ? (
        <EmptyState
          title="Esta sala no tiene asientos"
          description="Genere una grilla para comenzar. Después podrá ajustar los asientos de forma individual."
        />
      ) : (
        <div className="overflow-x-auto cine-card p-5">
          <p className="mb-4 text-center text-xs tracking-[0.3em] text-ink-500 uppercase">
            Pantalla
          </p>
          <div
            role="group"
            aria-label="Distribución de asientos"
            className="mx-auto flex w-fit flex-col gap-1.5"
          >
            {layoutData.rows.map((row) => (
              <div
                key={row}
                role="group"
                aria-label={`Fila ${row}`}
                className="flex items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  className="w-6 shrink-0 text-center text-xs font-medium text-ink-500"
                >
                  {row}
                </span>
                {layoutData.columns.map((column) => {
                  const seat = existing.get(coord(row, column));
                  if (!seat) return <span key={column} className="size-8 shrink-0" />;
                  return (
                    <button
                      key={column}
                      type="button"
                      onClick={() => setEditing(seat)}
                      disabled={seatPending}
                      aria-label={`Editar asiento ${seatLabel(seat.row, seat.column)}, ${seatTypeLabels[seat.seatType]}`}
                      title={`${seatLabel(seat.row, seat.column)} · ${seatTypeLabels[seat.seatType]}`}
                      className={cx(
                        'size-8 shrink-0 rounded-md text-[10px] font-semibold disabled:opacity-50',
                        seat.seatType === SeatType.PREMIUM
                          ? 'bg-gold-500/25 text-gold-400 hover:bg-gold-500/45'
                          : 'bg-ink-700 text-ink-100 hover:bg-ink-600',
                      )}
                    >
                      {column}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-ink-500">
            {layoutData.seats.length} asientos · {layoutData.rows.length} filas ×{' '}
            {layoutData.columns.length} columnas
          </p>
        </div>
      )}

      {showGenerator && (
        <GeneratorModal
          existingRows={layoutData?.rows ?? []}
          premiumMultiplier={premiumMultiplier}
          onClose={() => setShowGenerator(false)}
          onGenerate={generate}
        />
      )}

      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          title={`Asiento ${seatLabel(editing.row, editing.column)}`}
        >
          <div className="flex flex-col gap-4 text-sm">
            <p>
              Actualmente{' '}
              <Badge tone={editing.seatType === SeatType.PREMIUM ? 'premium' : 'neutral'}>
                {seatTypeLabels[editing.seatType]}
              </Badge>
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="cine-btn cine-btn-danger"
                onClick={() => {
                  const seat = editing;
                  setEditing(null);
                  void remove(seat);
                }}
              >
                Eliminar asiento
              </button>
              <button
                type="button"
                className="cine-btn cine-btn-primary"
                onClick={() => {
                  const seat = editing;
                  setEditing(null);
                  toggleType(seat);
                }}
              >
                Convertir en{' '}
                {editing.seatType === SeatType.PREMIUM
                  ? seatTypeLabels[SeatType.NORMAL]
                  : seatTypeLabels[SeatType.PREMIUM]}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

function GeneratorModal({
  existingRows,
  premiumMultiplier,
  onClose,
  onGenerate,
}: {
  readonly existingRows: readonly string[];
  /** Multiplicador ya formateado, p. ej. `"1,5×"`. */
  readonly premiumMultiplier: string;
  readonly onClose: () => void;
  readonly onGenerate: (spec: {
    rows: number;
    columns: number;
    startRowIndex: number;
    premiumFrom: number;
  }) => void;
}) {
  const [rows, setRows] = useState(8);
  const [columns, setColumns] = useState(12);
  const [premiumFrom, setPremiumFrom] = useState(0);

  // Se agrega después de las filas que la sala ya tiene, para que volver a ejecutarlo amplíe la grilla.
  const startRowIndex = existingRows.length;
  const preview = Array.from({ length: rows }, (_, index) => rowName(startRowIndex + index));
  const premiumRows = new Set(preview.slice(Math.max(0, preview.length - premiumFrom)));

  return (
    <Modal onClose={onClose} title="Generar asientos">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-500">
          Los asientos se crean en una sola transacción: o se genera toda la distribución o no
          cambia nada. Las posiciones existentes se mantienen intactas.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Filas"
            type="number"
            min={1}
            max={100}
            value={rows}
            onChange={(event) => setRows(Math.max(1, Number(event.target.value)))}
          />
          <TextInput
            label="Asientos por fila"
            type="number"
            min={1}
            max={100}
            value={columns}
            onChange={(event) => setColumns(Math.max(1, Number(event.target.value)))}
          />
        </div>

        <TextInput
          label="Filas traseras premium"
          type="number"
          min={0}
          max={rows}
          value={premiumFrom}
          onChange={(event) => setPremiumFrom(Math.max(0, Number(event.target.value)))}
          hint={`Las últimas N filas se convierten en asientos premium a ${premiumMultiplier} el precio base.`}
        />

        <p className="text-xs text-ink-400">
          Se crearán hasta <strong>{rows * columns}</strong> asientos en las filas {preview[0]}–
          {preview.at(-1)}
          {premiumRows.size > 0 && ` (premium: ${[...premiumRows].join(', ')})`}.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-primary"
            onClick={() => onGenerate({ rows, columns, startRowIndex, premiumFrom })}
          >
            Generar
          </button>
        </div>
      </div>
    </Modal>
  );
}
