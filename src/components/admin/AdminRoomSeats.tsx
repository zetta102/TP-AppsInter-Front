import { useState } from 'react';
import { getRoom, getRoomLayout } from '../../lib/api/rooms.ts';
import { createSeats, deleteSeat, updateSeat, type BulkSeatResult } from '../../lib/api/seats.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { toUserMessage } from '../../lib/problem.ts';
import { SeatType, seatTypeLabels } from '../../lib/enums.ts';
import { seatLabel } from '../../lib/format.ts';
import type { CreateSeatRequest, SeatLayoutResponse, SeatResponse } from '../../lib/types.ts';
import { AdminPage } from './AdminPage.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { Badge, Modal } from '../ui/Modal.tsx';

/** Row letters A, B, … Z, AA, AB — the same shape a cinema layout normally uses. */
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
 * `/admin/rooms/seats?id=<uuid>` — the seat layout builder.
 *
 * There is no bulk endpoint, so generating a grid issues one `POST /api/seats`
 * per seat. Requests are run with bounded concurrency and every outcome is
 * reported, because a partial failure would otherwise leave a half-built room
 * with no indication of which seats are missing.
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkSeatResult | null>(null);
  const [rowError, setRowError] = useState<unknown>(null);
  const [editing, setEditing] = useState<SeatResponse | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  if (!roomId) {
    return (
      <AdminPage title="Seat layout">
        <EmptyState
          title="No room selected"
          action={
            <a href="/admin/rooms" className="cine-btn cine-btn-primary">
              Choose a room
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
    premiumRows: ReadonlySet<string>;
  }) => {
    setShowGenerator(false);
    setResult(null);
    setRowError(null);

    const requests: CreateSeatRequest[] = [];
    for (let r = 0; r < spec.rows; r++) {
      const row = rowName(spec.startRowIndex + r);
      for (let c = 1; c <= spec.columns; c++) {
        const column = String(c);
        // Skip seats that already exist — the server would answer 409 anyway.
        if (existing.has(coord(row, column))) continue;
        requests.push({
          screenRoomId: roomId,
          row,
          column,
          seatType: spec.premiumRows.has(row) ? SeatType.PREMIUM : SeatType.NORMAL,
        });
      }
    }

    if (requests.length === 0) {
      setRowError(new Error('Every seat in that range already exists.'));
      return;
    }

    setGenerating(true);
    setProgress({ done: 0, total: requests.length });
    try {
      const outcome = await createSeats(requests, {
        concurrency: 4,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(outcome);
    } finally {
      setGenerating(false);
      setProgress(null);
      layout.refetch();
    }
  };

  const remove = async (seat: SeatResponse) => {
    if (!window.confirm(`Delete seat ${seatLabel(seat.row, seat.column)}?`)) return;
    setRowError(null);
    try {
      await deleteSeat(seat.uuid);
    } catch (error) {
      // 409 when tickets already reference the seat.
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
      title={room.data ? `Seats · ${room.data.roomName}` : 'Seat layout'}
      description="Click a seat to switch between normal and premium. Premium tickets cost 1.5× the base price."
      action={
        <div className="flex gap-2">
          <a href="/admin/rooms" className="cine-btn cine-btn-ghost">
            All rooms
          </a>
          <button
            type="button"
            className="cine-btn cine-btn-primary"
            disabled={generating}
            onClick={() => setShowGenerator(true)}
          >
            Generate seats
          </button>
        </div>
      }
    >
      {rowError !== null && <ErrorBanner error={rowError} />}

      {generating && progress && (
        <div className="cine-card p-4 text-sm">
          Creating seats… {progress.done} of {progress.total}
          <div className="bg-ink-800 mt-2 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-brand-500 h-full transition-[width]"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {result && <BulkReport result={result} />}

      {layout.isLoading ? (
        <LoadingBlock label="Loading layout…" />
      ) : layout.error ? (
        <ErrorBanner error={layout.error} onRetry={layout.refetch} />
      ) : !layout.data || layout.data.seats.length === 0 ? (
        <EmptyState
          title="This room has no seats"
          description="Generate a grid to get started. You can fine-tune individual seats afterwards."
        />
      ) : (
        <div className="cine-card overflow-x-auto p-5">
          <p className="text-ink-600 mb-4 text-center text-xs uppercase tracking-[0.3em]">Screen</p>
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
            {layout.data.seats.length} seats · {layout.data.rows.length} rows ×{' '}
            {layout.data.columns.length} columns
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
          title={`Seat ${seatLabel(editing.row, editing.column)}`}
        >
          <div className="flex flex-col gap-4 text-sm">
            <p>
              Currently <Badge tone={editing.seatType === SeatType.PREMIUM ? 'premium' : 'neutral'}>
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
                Delete seat
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
                Make{' '}
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

/** Per-seat outcomes, so a partial failure never passes unnoticed. */
function BulkReport({ result }: { readonly result: BulkSeatResult }) {
  const tone =
    result.failures.length === 0
      ? 'border-emerald-500/40 bg-emerald-500/10'
      : 'border-gold-500/40 bg-gold-500/10';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <p className="font-medium">
        Created {result.created.length} seat{result.created.length === 1 ? '' : 's'}
        {result.failures.length > 0 && `, ${result.failures.length} failed`}.
      </p>
      {result.failures.length > 0 && (
        <ul className="text-ink-300 mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
          {result.failures.map((failure) => (
            <li key={`${failure.request.row}-${failure.request.column}`}>
              {seatLabel(failure.request.row, failure.request.column)}:{' '}
              {toUserMessage(failure.error)}
            </li>
          ))}
        </ul>
      )}
    </div>
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
    premiumRows: ReadonlySet<string>;
  }) => void;
}) {
  const [rows, setRows] = useState(8);
  const [columns, setColumns] = useState(12);
  const [premiumFrom, setPremiumFrom] = useState(0);

  // Append after the rows the room already has, so re-running extends the grid.
  const startRowIndex = existingRows.length;
  const preview = Array.from({ length: rows }, (_, index) => rowName(startRowIndex + index));
  const premiumRows = new Set(preview.slice(Math.max(0, preview.length - premiumFrom)));

  return (
    <Modal open={open} onClose={onClose} title="Generate seats">
      <div className="flex flex-col gap-4">
        <p className="text-ink-500 text-sm">
          Seats are created one request at a time — there is no bulk endpoint. Existing positions are
          skipped.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gen-rows" className="cine-label">
              Rows
            </label>
            <input
              id="gen-rows"
              type="number"
              min={1}
              max={26}
              className="cine-input"
              value={rows}
              onChange={(event) => setRows(Math.max(1, Number(event.target.value)))}
            />
          </div>
          <div>
            <label htmlFor="gen-cols" className="cine-label">
              Seats per row
            </label>
            <input
              id="gen-cols"
              type="number"
              min={1}
              max={40}
              className="cine-input"
              value={columns}
              onChange={(event) => setColumns(Math.max(1, Number(event.target.value)))}
            />
          </div>
        </div>

        <div>
          <label htmlFor="gen-premium" className="cine-label">
            Premium back rows
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
            The last N rows become premium seats at 1.5× the base price.
          </p>
        </div>

        <p className="text-ink-400 text-xs">
          Will create up to <strong>{rows * columns}</strong> seats in rows {preview[0]}–
          {preview.at(-1)}
          {premiumRows.size > 0 && ` (premium: ${[...premiumRows].join(', ')})`}.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-primary"
            onClick={() => onGenerate({ rows, columns, startRowIndex, premiumRows })}
          >
            Generate
          </button>
        </div>
      </div>
    </Modal>
  );
}
