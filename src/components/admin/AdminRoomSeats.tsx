import { useState } from 'react';
import { generateSeats, getRoom, getRoomLayout } from '../../lib/api/rooms.ts';
import { deleteSeat, updateSeat } from '../../lib/api/seats.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { isApiErrorWithCode, toUserMessage } from '../../lib/problem.ts';
import { SeatType, seatTypeLabels } from '../../lib/enums.ts';
import { seatLabel } from '../../lib/format.ts';
import type { SeatLayoutResponse, SeatResponse } from '../../lib/types.ts';
import { AdminPage } from './AdminPage.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { Badge, Modal } from '../ui/Modal.tsx';

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

/**
 * `/admin/rooms/seats?id=<uuid>` — el generador de distribución de asientos.
 *
 * Generar una grilla llama a `POST /api/rooms/{id}/seats:generate` en una única
 * transacción, de modo que o bien existe toda la distribución solicitada o no
 * cambia nada (frontend-spec.md §8.3 "Creación masiva de asientos"). Se usa
 * `onConflict: 'SKIP'` para que volver a ejecutar el generador al ampliar una
 * sala nunca falle por las filas que ya existen.
 */
export default function AdminRoomSeats() {
  const roomId = useQueryParam('id');

  const room = useResource(
    (signal) => getRoom(roomId!, { signal }),
    [roomId],
    { enabled: Boolean(roomId) },
  );

  const layout = useResource<SeatLayoutResponse>(
    (signal) => getRoomLayout(roomId!, { signal }),
    [roomId],
    { enabled: Boolean(roomId) },
  );

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);
  const [rowError, setRowError] = useState<unknown>(null);
  const [editing, setEditing] = useState<SeatResponse | null>(null);
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

  const generate = async (spec: {
    rows: number;
    columns: number;
    startRowIndex: number;
    premiumFrom: number;
  }) => {
    setShowGenerator(false);
    setGenerateError(null);
    setGenerateSuccess(null);
    setGenerating(true);

    const startRow = rowName(spec.startRowIndex);
    const preview = Array.from({ length: spec.rows }, (_, index) =>
      rowName(spec.startRowIndex + index),
    );
    const premiumRows = preview.slice(Math.max(0, preview.length - spec.premiumFrom));

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
      setGenerating(false);
      layout.refetch();
    }
  };

  const remove = async (seat: SeatResponse) => {
    if (!window.confirm(`¿Eliminar el asiento ${seatLabel(seat.row, seat.column)}?`)) return;
    setRowError(null);
    try {
      await deleteSeat(seat.uuid);
    } catch (error) {
      // 409 cuando los tickets ya referencian el asiento.
      setRowError(error);
    } finally {
      layout.refetch();
    }
  };

  const toggleType = async (seat: SeatResponse) => {
    setRowError(null);
    const next =
      seat.seatType === SeatType.PREMIUM ? SeatType.NORMAL : SeatType.PREMIUM;
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
  };

  return (
    <AdminPage
      title={room.data ? `Asientos · ${room.data.roomName}` : 'Plano de asientos'}
      description="Seleccione un asiento para alternar entre normal y premium. Los tickets premium cuestan 1,5× el precio base."
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
      {rowError !== null && <ErrorBanner error={rowError} />}

      {generating && (
        <div className="cine-card p-4 text-sm">Generando la distribución…</div>
      )}

      {generateSuccess && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {generateSuccess}
        </div>
      )}

      {generateError !== null && (
        <div className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm">
          {toUserMessage(generateError)}
          {isApiErrorWithCode(generateError, 'NAME_TAKEN') &&
            Array.isArray(generateError.context.conflicts) && (
              <p className="text-ink-300 mt-1">
                Asientos en conflicto: {(generateError.context.conflicts as string[]).join(', ')}
              </p>
            )}
        </div>
      )}

      {layout.isLoading ? (
        <LoadingBlock label="Cargando distribución…" />
      ) : layout.error ? (
        <ErrorBanner error={layout.error} onRetry={layout.refetch} />
      ) : !layout.data || layout.data.seats.length === 0 ? (
        <EmptyState
          title="Esta sala no tiene asientos"
          description="Genere una grilla para comenzar. Después podrá ajustar los asientos de forma individual."
        />
      ) : (
        <div className="cine-card overflow-x-auto p-5">
          <p className="text-ink-600 mb-4 text-center text-xs uppercase tracking-[0.3em]">Pantalla</p>
          <div className="mx-auto flex w-fit flex-col gap-1.5">
            {layout.data.rows.map((row) => (
              <div key={row} className="flex items-center gap-1.5">
                <span className="text-ink-600 w-6 shrink-0 text-center text-xs font-medium">
                  {row}
                </span>
                {layout.data!.columns.map((column) => {
                  const seat = existing.get(coord(row, column));
                  if (!seat) return <span key={column} className="size-8 shrink-0" />;
                  return (
                    <button
                      key={column}
                      type="button"
                      onClick={() => setEditing(seat)}
                      title={`${seatLabel(seat.row, seat.column)} · ${seatTypeLabels[seat.seatType]}`}
                      className={`size-8 shrink-0 rounded-md text-[10px] font-semibold ${
                        seat.seatType === SeatType.PREMIUM
                          ? 'bg-gold-500/25 text-gold-400 hover:bg-gold-500/45'
                          : 'bg-ink-700 text-ink-100 hover:bg-ink-600'
                      }`}
                    >
                      {column}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="text-ink-500 mt-5 text-center text-xs">
            {layout.data.seats.length} asientos · {layout.data.rows.length} filas ×{' '}
            {layout.data.columns.length} columnas
          </p>
        </div>
      )}

      {showGenerator && (
        <GeneratorModal
          open={showGenerator}
          existingRows={layout.data?.rows ?? []}
          onClose={() => setShowGenerator(false)}
          onGenerate={(spec) => void generate(spec)}
        />
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={`Asiento ${seatLabel(editing.row, editing.column)}`}
        >
          <div className="flex flex-col gap-4 text-sm">
            <p>
              Actualmente <Badge tone={editing.seatType === SeatType.PREMIUM ? 'premium' : 'neutral'}>
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
                  void toggleType(seat);
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
  open,
  existingRows,
  onClose,
  onGenerate,
}: {
  readonly open: boolean;
  readonly existingRows: readonly string[];
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
    <Modal open={open} onClose={onClose} title="Generar asientos">
      <div className="flex flex-col gap-4">
        <p className="text-ink-500 text-sm">
          Los asientos se crean en una sola transacción: o se genera toda la distribución o no
          cambia nada. Las posiciones existentes se mantienen intactas.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gen-rows" className="cine-label">
              Filas
            </label>
            <input
              id="gen-rows"
              type="number"
              min={1}
              max={100}
              className="cine-input"
              value={rows}
              onChange={(event) => setRows(Math.max(1, Number(event.target.value)))}
            />
          </div>
          <div>
            <label htmlFor="gen-cols" className="cine-label">
              Asientos por fila
            </label>
            <input
              id="gen-cols"
              type="number"
              min={1}
              max={100}
              className="cine-input"
              value={columns}
              onChange={(event) => setColumns(Math.max(1, Number(event.target.value)))}
            />
          </div>
        </div>

        <div>
          <label htmlFor="gen-premium" className="cine-label">
            Filas traseras premium
          </label>
          <input
            id="gen-premium"
            type="number"
            min={0}
            max={rows}
            className="cine-input"
            value={premiumFrom}
            onChange={(event) => setPremiumFrom(Math.max(0, Number(event.target.value)))}
          />
          <p className="text-ink-500 mt-1 text-xs">
            Las últimas N filas se convierten en asientos premium a 1,5× el precio base.
          </p>
        </div>

        <p className="text-ink-400 text-xs">
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
