import { useActionState, useMemo, useState } from 'react';
import {
  createScreening,
  deleteScreening,
  listScreenings,
  updateScreening,
  TURNOVER_MINUTES,
  type ScreeningSortField,
} from '../../lib/api/screenings.ts';
import { listMovies } from '../../lib/api/movies.ts';
import { listRooms } from '../../lib/api/rooms.ts';
import { useResource } from '../../lib/use-resource.ts';
import { toFieldErrors } from '../../lib/problem.ts';
import { screenRoomTypeLabels } from '../../lib/enums.ts';
import {
  formatDateTime,
  formatMoney,
  formatRuntime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../lib/format.ts';
import type {
  CreateMovieScreeningRequest,
  MovieResponse,
  MovieScreeningResponse,
  Page,
  ScreenRoomResponse,
} from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Modal } from '../ui/Modal.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 15;
const OPTIONS_PAGE_SIZE = 200;

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const initialFormState: FormState = { error: null, fieldErrors: {} };

/**
 * `/admin/screenings` — the scheduler.
 *
 * `endsAt` is computed server-side as `startsAt + runtime + 15 min` turnover and
 * must never be sent. We mirror the same arithmetic purely as a preview so the
 * admin can see the block a screening will occupy before saving.
 */
export default function AdminScreenings() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<ScreeningSortField>>('startsAt,asc');
  const [movieId, setMovieId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [editing, setEditing] = useState<MovieScreeningResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<unknown>(null);

  const movies = useResource<Page<MovieResponse>>(
    (signal) => listMovies({ size: OPTIONS_PAGE_SIZE, sort: 'movieName,asc' }, { signal }),
    [],
  );
  const rooms = useResource<Page<ScreenRoomResponse>>(
    (signal) => listRooms({ size: OPTIONS_PAGE_SIZE, sort: 'roomName,asc' }, { signal }),
    [],
  );

  const resource = useResource<Page<MovieScreeningResponse>>(
    (signal) =>
      listScreenings(
        {
          page,
          size: PAGE_SIZE,
          sort,
          upcomingOnly,
          ...(movieId ? { movieId } : {}),
          ...(roomId ? { roomId } : {}),
        },
        { signal },
      ),
    [page, sort, movieId, roomId, upcomingOnly],
  );

  const remove = async (screening: MovieScreeningResponse) => {
    if (!window.confirm(`Delete the ${formatDateTime(screening.startsAt)} screening?`)) return;
    setRowError(null);
    try {
      await deleteScreening(screening.uuid);
    } catch (error) {
      // 409 when reservations already exist for the screening.
      setRowError(error);
    } finally {
      resource.refetch();
    }
  };

  const columns: readonly Column<MovieScreeningResponse>[] = [
    {
      key: 'movie',
      header: 'Movie',
      sortField: 'movieName',
      cell: (screening) => <span className="font-medium">{screening.movieName}</span>,
    },
    { key: 'room', header: 'Room', sortField: 'roomName', cell: (s) => s.roomName },
    {
      key: 'startsAt',
      header: 'Starts',
      sortField: 'startsAt',
      cell: (s) => formatDateTime(s.startsAt),
    },
    {
      key: 'endsAt',
      header: 'Ends',
      sortField: 'endsAt',
      cell: (s) => (
        <span title={`Runtime plus a ${TURNOVER_MINUTES} minute turnover`}>
          {formatDateTime(s.endsAt)}
        </span>
      ),
    },
    {
      key: 'basePrice',
      header: 'Base price',
      sortField: 'basePrice',
      className: 'tabular-nums',
      cell: (s) => formatMoney(s.basePrice),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (screening) => (
        <div className="flex justify-end gap-1">
          <a
            href={`/screenings/seats?id=${screening.uuid}`}
            className="cine-btn cine-btn-ghost"
          >
            Seats
          </a>
          <button
            type="button"
            className="cine-btn cine-btn-ghost"
            onClick={() => setEditing(screening)}
          >
            Edit
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-danger"
            onClick={() => void remove(screening)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [ScreeningSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Screenings"
      description={`End times are computed as start + runtime + ${TURNOVER_MINUTES} minutes of turnover, and screenings in the same room may not overlap.`}
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          New screening
        </button>
      }
    >
      <AdminToolbar>
        <div className="min-w-48 flex-1">
          <label htmlFor="filter-movie" className="cine-label">
            Movie
          </label>
          <select
            id="filter-movie"
            className="cine-input"
            value={movieId}
            onChange={(event) => {
              setMovieId(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All movies</option>
            {(movies.data?.content ?? []).map((movie) => (
              <option key={movie.uuid} value={movie.uuid}>
                {movie.movieName}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-48 flex-1">
          <label htmlFor="filter-room" className="cine-label">
            Room
          </label>
          <select
            id="filter-room"
            className="cine-input"
            value={roomId}
            onChange={(event) => {
              setRoomId(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All rooms</option>
            {(rooms.data?.content ?? []).map((room) => (
              <option key={room.uuid} value={room.uuid}>
                {room.roomName}
              </option>
            ))}
          </select>
        </div>

        <label className="text-ink-300 flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={upcomingOnly}
            onChange={(event) => {
              setUpcomingOnly(event.target.checked);
              setPage(0);
            }}
          />
          Upcoming only
        </label>
      </AdminToolbar>

      {rowError !== null && <ErrorBanner error={rowError} onRetry={resource.refetch} />}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(screening) => screening.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No screenings"
        emptyDescription="Schedule a screening to open it for booking."
        activeSort={{ field: sortField, direction: sortDirection }}
        onSort={(field) => {
          setSort(
            (current) =>
              (current === `${field},asc`
                ? `${field},desc`
                : `${field},asc`) as SortSpec<ScreeningSortField>,
          );
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      {(creating || editing !== null) && (
        <ScreeningFormModal
          screening={editing}
          movies={movies.data?.content ?? []}
          rooms={rooms.data?.content ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            resource.refetch();
          }}
        />
      )}
    </AdminPage>
  );
}

function ScreeningFormModal({
  screening,
  movies,
  rooms,
  onClose,
  onSaved,
}: {
  readonly screening: MovieScreeningResponse | null;
  readonly movies: readonly MovieResponse[];
  readonly rooms: readonly ScreenRoomResponse[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [movieId, setMovieId] = useState(screening?.movieId ?? movies[0]?.uuid ?? '');
  const [startsAt, setStartsAt] = useState(
    screening ? toDateTimeLocalValue(screening.startsAt) : '',
  );

  const runtime = useMemo(
    () => movies.find((movie) => movie.uuid === movieId)?.runtime ?? null,
    [movies, movieId],
  );

  // Local mirror of the server's computation, shown as a preview only.
  const endsAtPreview = useMemo(() => {
    if (!startsAt || runtime === null) return null;
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) return null;
    return new Date(start.getTime() + (runtime + TURNOVER_MINUTES) * 60_000);
  }, [startsAt, runtime]);

  const startsInPast = startsAt !== '' && new Date(startsAt).getTime() <= Date.now();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const body: CreateMovieScreeningRequest = {
      movieId: String(formData.get('movieId') ?? ''),
      screenRoomId: String(formData.get('screenRoomId') ?? ''),
      startsAt: fromDateTimeLocalValue(String(formData.get('startsAt') ?? '')),
      basePrice: Number(formData.get('basePrice') ?? 0),
    };

    try {
      if (screening) await updateScreening(screening.uuid, body);
      else await createScreening(body);
      onSaved();
      return initialFormState;
    } catch (error) {
      // 409 means the [startsAt, endsAt) window overlaps another screening in
      // the room; on PUT the check excludes this screening itself.
      return { error, fieldErrors: toFieldErrors(error) };
    }
  }, initialFormState);

  return (
    <Modal open onClose={onClose} title={screening ? 'Edit screening' : 'New screening'}>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        <SelectInput
          label="Movie"
          name="movieId"
          required
          value={movieId}
          onChange={(event) => setMovieId(event.target.value)}
          error={state.fieldErrors['movieId']}
          {...(runtime !== null ? { hint: `Runtime ${formatRuntime(runtime)}` } : {})}
        >
          {movies.map((movie) => (
            <option key={movie.uuid} value={movie.uuid}>
              {movie.movieName}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          label="Room"
          name="screenRoomId"
          required
          defaultValue={screening?.screenRoomId ?? rooms[0]?.uuid ?? ''}
          error={state.fieldErrors['screenRoomId']}
        >
          {rooms.map((room) => (
            <option key={room.uuid} value={room.uuid}>
              {room.roomName} · {screenRoomTypeLabels[room.screenRoomType]}
            </option>
          ))}
        </SelectInput>

        <TextInput
          label="Starts at"
          name="startsAt"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          error={
            state.fieldErrors['startsAt'] ??
            (startsInPast ? 'The start time must be in the future.' : undefined)
          }
        />

        {endsAtPreview && (
          <p className="border-ink-800 bg-ink-900 text-ink-300 rounded-lg border px-3 py-2 text-xs">
            Ends at <strong>{formatDateTime(endsAtPreview.toISOString())}</strong> — runtime plus a{' '}
            {TURNOVER_MINUTES} minute turnover. The room is blocked for that whole window.
          </p>
        )}

        <TextInput
          label="Base price"
          name="basePrice"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={screening?.basePrice ?? ''}
          hint="Premium seats are charged at 1.5× this price."
          error={state.fieldErrors['basePrice']}
        />

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton pendingLabel="Saving…" disabled={startsInPast}>
            {screening ? 'Save changes' : 'Schedule'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
