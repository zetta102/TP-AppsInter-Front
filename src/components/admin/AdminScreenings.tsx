import { useActionState, useState } from 'react';
import {
  createScreening,
  deleteScreening,
  setScreeningArchived,
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
  formatMultiplier,
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
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import { PREMIUM_MULTIPLIER } from '../../lib/pricing.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { ArchivedBadge, ShowArchivedToggle, useArchiveActions } from './archive.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Modal } from '../ui/Modal.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { ScreeningAvailability } from '../catalogue/MovieCard.tsx';
import { getMetadataConfigOrDefault } from '../../lib/api/metadata.ts';
import { Pagination } from '../ui/Pagination.tsx';
import { useNow } from '../../lib/use-now.ts';
import { MAX_PAGE_SIZE } from '../../lib/api/shared.ts';

const PAGE_SIZE = 15;
const OPTIONS_PAGE_SIZE = MAX_PAGE_SIZE;

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const initialFormState: FormState = { error: null, fieldErrors: {} };

/**
 * `/admin/screenings` — el programador de funciones.
 *
 * `endsAt` se calcula del lado del servidor como `startsAt + runtime + 15 min`
 * de recambio y nunca debe enviarse. Reflejamos la misma cuenta solo como
 * vista previa para que el administrador vea el bloque que ocupará una función
 * antes de guardar.
 *
 * Una función con entradas (aunque estén canceladas) no se puede borrar: se archiva, lo que
 * libera su horario en la sala. Restaurarla puede fallar con `409 SCREENING_OVERLAP` (el horario
 * se ocupó) o `422 RESOURCE_ARCHIVED` (la película o la sala están archivadas).
 */
export default function AdminScreenings() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<ScreeningSortField>>('startsAt,asc');
  const [movieId, setMovieId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [editing, setEditing] = useState<MovieScreeningResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const movies = useResource<Page<MovieResponse>>(
    (signal) => listMovies({ size: OPTIONS_PAGE_SIZE, sort: 'movieName,asc' }, { signal }),
    [],
  );
  const rooms = useResource<Page<ScreenRoomResponse>>(
    (signal) => listRooms({ size: OPTIONS_PAGE_SIZE, sort: 'roomName,asc' }, { signal }),
    [],
  );

  // Si falla, vuelve al valor predeterminado documentado (15), para que el programador
  // siga funcionando aunque el endpoint de metadatos no esté disponible momentáneamente.
  const config = useResource((signal) => getMetadataConfigOrDefault({ signal }), []);
  const turnoverMinutes = config.data?.screeningTurnoverMinutes ?? TURNOVER_MINUTES;
  const premiumMultiplier = config.data?.premiumSeatMultiplier ?? PREMIUM_MULTIPLIER;

  const resource = useResource<Page<MovieScreeningResponse>>(
    (signal) =>
      listScreenings(
        {
          page,
          size: PAGE_SIZE,
          sort,
          upcomingOnly,
          includeArchived: showArchived,
          ...(movieId ? { movieId } : {}),
          ...(roomId ? { roomId } : {}),
        },
        { signal },
      ),
    [page, sort, movieId, roomId, upcomingOnly, showArchived],
  );

  const actions = useArchiveActions<MovieScreeningResponse>({
    remove: deleteScreening,
    setArchived: setScreeningArchived,
    refetch: resource.refetch,
    confirmDelete: (screening) => `¿Eliminar la función de ${formatDateTime(screening.startsAt)}?`,
    name: (screening) => `${screening.movieName} · ${formatDateTime(screening.startsAt)}`,
  });

  const columns: readonly Column<MovieScreeningResponse, ScreeningSortField>[] = [
    {
      key: 'movie',
      header: 'Película',
      cell: (screening) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{screening.movieName}</span>
          <ArchivedBadge archived={screening.archived} />
        </span>
      ),
    },
    { key: 'room', header: 'Sala', cell: (s) => s.roomName },
    {
      key: 'startsAt',
      header: 'Comienza',
      sortField: 'startsAt',
      cell: (s) => formatDateTime(s.startsAt),
    },
    {
      key: 'endsAt',
      header: 'Termina',
      sortField: 'endsAt',
      cell: (s) => (
        <span title={`Duración más ${turnoverMinutes} minutos de recambio`}>
          {formatDateTime(s.endsAt)}
        </span>
      ),
    },
    {
      key: 'basePrice',
      header: 'Precio base',
      sortField: 'basePrice',
      className: 'tabular-nums',
      cell: (s) => formatMoney(s.basePrice),
    },
    {
      key: 'availability',
      header: 'Asientos',
      className: 'tabular-nums',
      cell: (s) => <ScreeningAvailability screening={s} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (screening) => (
        <div className="flex justify-end gap-1">
          <a href={`/screenings/seats?id=${screening.uuid}`} className="cine-btn cine-btn-ghost">
            Asientos
          </a>
          <button
            type="button"
            className="cine-btn cine-btn-ghost"
            onClick={() => setEditing(screening)}
          >
            Editar
          </button>
          {actions.buttons(screening)}
        </div>
      ),
    },
  ];

  return (
    <AdminPage
      title="Funciones"
      description={`Las horas de finalización se calculan como inicio + duración + ${turnoverMinutes} minutos de recambio, y las funciones en la misma sala no pueden superponerse.`}
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          Nueva función
        </button>
      }
    >
      <AdminToolbar>
        <SelectInput
          label="Película"
          fieldClassName="min-w-48 flex-1"
          value={movieId}
          onChange={(event) => {
            setMovieId(event.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas las películas</option>
          {(movies.data?.content ?? []).map((movie) => (
            <option key={movie.uuid} value={movie.uuid}>
              {movie.movieName}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          label="Sala"
          fieldClassName="min-w-48 flex-1"
          value={roomId}
          onChange={(event) => {
            setRoomId(event.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas las salas</option>
          {(rooms.data?.content ?? []).map((room) => (
            <option key={room.uuid} value={room.uuid}>
              {room.roomName}
            </option>
          ))}
        </SelectInput>

        <label className="flex items-center gap-2 pb-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={upcomingOnly}
            onChange={(event) => {
              setUpcomingOnly(event.target.checked);
              setPage(0);
            }}
          />
          Solo próximas
        </label>

        <ShowArchivedToggle
          checked={showArchived}
          onChange={(checked) => {
            setShowArchived(checked);
            setPage(0);
          }}
        />
      </AdminToolbar>

      {actions.banner}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(screening) => screening.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No hay funciones"
        emptyDescription="Programá una función para habilitar sus reservas."
        activeSort={parseSort(sort)}
        onSort={(field) => {
          setSort((current) => toggleSort(current, field));
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      {(creating || editing !== null) && (
        <ScreeningFormModal
          key={editing?.uuid ?? 'new'}
          screening={editing}
          movies={movies.data?.content ?? []}
          rooms={rooms.data?.content ?? []}
          turnoverMinutes={turnoverMinutes}
          premiumMultiplier={premiumMultiplier}
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
  turnoverMinutes,
  premiumMultiplier,
  onClose,
  onSaved,
}: {
  readonly screening: MovieScreeningResponse | null;
  readonly movies: readonly MovieResponse[];
  readonly rooms: readonly ScreenRoomResponse[];
  readonly turnoverMinutes: number;
  readonly premiumMultiplier: number;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [movieId, setMovieId] = useState(screening?.movieId ?? movies[0]?.uuid ?? '');
  const [startsAt, setStartsAt] = useState(
    screening ? toDateTimeLocalValue(screening.startsAt) : '',
  );

  // Derivados en el render; el React Compiler los memoiza sin useMemo.
  const runtime = movies.find((movie) => movie.uuid === movieId)?.runtime ?? null;

  // Reflejo local del cálculo del servidor, mostrado solo como vista previa.
  const start = startsAt ? new Date(startsAt) : null;
  const endsAtPreview =
    start && runtime !== null && !Number.isNaN(start.getTime())
      ? new Date(start.getTime() + (runtime + turnoverMinutes) * 60_000)
      : null;

  const now = useNow();
  const startsInPast = startsAt !== '' && new Date(startsAt).getTime() <= now;

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
      // 409 significa que la ventana [startsAt, endsAt) se superpone con otra función en
      // la sala; en PUT la validación excluye a esta misma función.
      return { error, fieldErrors: toFieldErrors(error) };
    }
  }, initialFormState);

  return (
    <Modal onClose={onClose} title={screening ? 'Editar función' : 'Nueva función'}>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        <SelectInput
          label="Película"
          name="movieId"
          required
          value={movieId}
          onChange={(event) => setMovieId(event.target.value)}
          error={state.fieldErrors['movieId']}
          {...(runtime !== null ? { hint: `Duración ${formatRuntime(runtime)}` } : {})}
        >
          {movies.map((movie) => (
            <option key={movie.uuid} value={movie.uuid}>
              {movie.movieName}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          label="Sala"
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
          label="Comienza el"
          name="startsAt"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          error={
            state.fieldErrors['startsAt'] ??
            (startsInPast ? 'La fecha y hora de inicio deben ser futuras.' : undefined)
          }
        />

        {endsAtPreview && (
          <p className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs text-ink-300">
            Termina a las <strong>{formatDateTime(endsAtPreview.toISOString())}</strong>: duración
            más {turnoverMinutes} minutos de recambio. La sala queda bloqueada durante toda esa
            franja.
          </p>
        )}

        <TextInput
          label="Precio base"
          name="basePrice"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={screening?.basePrice ?? ''}
          hint={`Los asientos premium se cobran a ${formatMultiplier(premiumMultiplier)} este precio.`}
          error={state.fieldErrors['basePrice']}
        />

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton pendingLabel="Guardando…" disabled={startsInPast}>
            {screening ? 'Guardar cambios' : 'Programar'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
