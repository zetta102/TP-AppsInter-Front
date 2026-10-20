import { useActionState, useState } from 'react';
import { listMovies } from '../../lib/api/movies.ts';
import { listRooms } from '../../lib/api/rooms.ts';
import {
  createScreening,
  deleteScreening,
  listScreenings,
  setScreeningArchived,
  updateScreening,
  type ScreeningSortField,
} from '../../lib/api/screenings.ts';
import { collectAllPages } from '../../lib/api/shared.ts';
import { screenRoomTypeLabels } from '../../lib/enums.ts';
import {
  fieldErrors,
  formError,
  formText,
  initialFormState,
  type FormState,
} from '../../lib/form.ts';
import {
  formatDateTime,
  formatMoney,
  formatMultiplier,
  formatRuntime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../lib/format.ts';
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import type { Movie, Page, Room, Screening, ScreeningRequest } from '../../lib/types.ts';
import { useMetadataConfig } from '../../lib/use-metadata-config.ts';
import { useNow } from '../../lib/use-now.ts';
import { useResource } from '../../lib/use-resource.ts';
import { ScreeningAvailability } from '../catalogue/MovieCard.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { ArchivedBadge, ShowArchivedToggle, useArchiveActions } from './archive.tsx';

const PAGE_SIZE = 15;

/**
 * `/admin/screenings` — el programador de funciones.
 *
 * `endsAt` se calcula del lado del servidor como `startsAt + runtime +` los minutos de recambio
 * (`screeningTurnoverMinutes`) y nunca debe enviarse. Reflejamos la misma cuenta solo como
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
  const [editing, setEditing] = useState<Screening | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Opciones de los selectores: los catálogos completos, aunque superen el `size` máximo.
  const movies = useResource<readonly Movie[]>(
    (signal) =>
      collectAllPages((pageIndex, size) =>
        listMovies({ page: pageIndex, size, sort: 'movieName,asc' }, { signal }),
      ),
    [],
  );
  const rooms = useResource<readonly Room[]>(
    (signal) =>
      collectAllPages((pageIndex, size) =>
        listRooms({ page: pageIndex, size, sort: 'roomName,asc' }, { signal }),
      ),
    [],
  );

  // Los valores documentados mientras carga o si el endpoint de metadatos falla.
  const { screeningTurnoverMinutes: turnoverMinutes, premiumSeatMultiplier: premiumMultiplier } =
    useMetadataConfig();

  const resource = useResource<Page<Screening>>(
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

  const actions = useArchiveActions<Screening>({
    remove: deleteScreening,
    setArchived: setScreeningArchived,
    refetch: resource.refetch,
    confirmDelete: (screening) => `¿Eliminar la función de ${formatDateTime(screening.startsAt)}?`,
    name: (screening) => `${screening.movieName} · ${formatDateTime(screening.startsAt)}`,
  });

  const columns: readonly Column<Screening, ScreeningSortField>[] = [
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
          {(movies.data ?? []).map((movie) => (
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
          {(rooms.data ?? []).map((room) => (
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

      {actions.feedback}

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
          movies={movies.data ?? []}
          rooms={rooms.data ?? []}
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
  readonly screening: Screening | null;
  readonly movies: readonly Movie[];
  readonly rooms: readonly Room[];
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
    const startsAtValue = formText(formData, 'startsAt');
    // `new Date('')` es inválida y `toISOString()` lanzaría: se valida antes de convertir.
    if (!startsAtValue) return fieldErrors({ startsAt: 'Completá este campo.' });

    const body: ScreeningRequest = {
      movieId: formText(formData, 'movieId'),
      screenRoomId: formText(formData, 'screenRoomId'),
      startsAt: fromDateTimeLocalValue(startsAtValue),
      basePrice: Number(formText(formData, 'basePrice')),
    };

    try {
      if (screening) await updateScreening(screening.uuid, body);
      else await createScreening(body);
      onSaved();
      return initialFormState;
    } catch (error) {
      // 409 significa que la ventana [startsAt, endsAt) se superpone con otra función en
      // la sala; en PUT la validación excluye a esta misma función.
      return formError(error);
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
