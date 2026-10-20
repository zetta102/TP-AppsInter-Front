import { useActionState, useState } from 'react';
import {
  createMovie,
  deleteMovie,
  listMovies,
  setMovieArchived,
  updateMovie,
  type MovieSortField,
} from '../../lib/api/movies.ts';
import { isEnumValue, movieGenreLabels, movieGenreValues } from '../../lib/enums.ts';
import {
  fieldErrors,
  formError,
  formOptionalText,
  formText,
  initialFormState,
  type FormState,
} from '../../lib/form.ts';
import { formatRuntime } from '../../lib/format.ts';
import { violationMessage } from '../../lib/problem.ts';
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import type { Movie, MovieRequest, Page } from '../../lib/types.ts';
import { useDebouncedSearch } from '../../lib/use-debounced-search.ts';
import { useMetadataConfig } from '../../lib/use-metadata-config.ts';
import { useResource } from '../../lib/use-resource.ts';
import { GenreList } from '../catalogue/MovieCard.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextArea, TextInput } from '../ui/Field.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { ArchivedBadge, ShowArchivedToggle, useArchiveActions } from './archive.tsx';

const PAGE_SIZE = 15;

const URL_FIELDS = ['posterUrl', 'backdropUrl', 'trailerUrl'] as const;

/** Misma regla que el backend (`HttpUrl`): URL absoluta http(s), con host y sin espacios. */
function isLoadableUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  const url = URL.parse(value);
  return (
    url !== null && (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  );
}

/**
 * `/admin/movies` — CRUD completo. `PUT` es un reemplazo total, por eso los formularios envían todos
 * los campos. Una película con funciones no se puede borrar: se archiva.
 */
export default function AdminMovies() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<MovieSortField>>('movieName,asc');
  const [search, setSearch] = useState('');
  // Una sola petición cuando se deja de escribir, no una por tecla.
  const debouncedSearch = useDebouncedSearch(search);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const resource = useResource<Page<Movie>>(
    (signal) =>
      listMovies(
        {
          page,
          size: PAGE_SIZE,
          sort,
          includeArchived: showArchived,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        { signal },
      ),
    [page, sort, debouncedSearch, showArchived],
  );

  const actions = useArchiveActions<Movie>({
    remove: deleteMovie,
    setArchived: setMovieArchived,
    refetch: resource.refetch,
    confirmDelete: (movie) => `¿Eliminar “${movie.movieName}”? Esta acción no se puede deshacer.`,
    name: (movie) => movie.movieName,
  });

  const columns: readonly Column<Movie, MovieSortField>[] = [
    {
      key: 'movieName',
      header: 'Título',
      sortField: 'movieName',
      cell: (movie) => (
        <div className="flex items-center gap-3">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt=""
              className="h-12 w-8 shrink-0 rounded-sm object-cover"
              loading="lazy"
            />
          ) : null}
          <span className="font-medium">{movie.movieName}</span>
          <ArchivedBadge archived={movie.archived} />
        </div>
      ),
    },
    {
      key: 'genres',
      header: 'Géneros',
      cell: (movie) => <GenreList genres={movie.genres} />,
    },
    {
      key: 'runtime',
      header: 'Duración',
      sortField: 'runtime',
      cell: (movie) => formatRuntime(movie.runtime),
    },
    {
      key: 'director',
      header: 'Director',
      sortField: 'director',
      cell: (movie) => movie.director ?? <span className="text-ink-500">—</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (movie) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="cine-btn cine-btn-ghost"
            onClick={() => setEditing(movie)}
          >
            Editar
          </button>
          {actions.buttons(movie)}
        </div>
      ),
    },
  ];

  return (
    <AdminPage
      title="Películas"
      description="Títulos, géneros y duraciones. La duración determina la hora de fin calculada de cada función."
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          Nueva película
        </button>
      }
    >
      <AdminToolbar>
        <TextInput
          label="Buscar"
          fieldClassName="min-w-56 flex-1"
          type="search"
          value={search}
          placeholder="El título contiene…"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
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
        rowKey={(movie) => movie.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No hay películas"
        emptyDescription="Agregá una película para comenzar a programar funciones."
        activeSort={parseSort(sort)}
        onSort={(field) => {
          setSort((current) => toggleSort(current, field));
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      {/* Montado solo mientras está abierto (y con `key` por película): cerrar descarta el estado. */}
      {(creating || editing !== null) && (
        <MovieFormModal
          key={editing?.uuid ?? 'new'}
          movie={editing}
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

function MovieFormModal({
  movie,
  onClose,
  onSaved,
}: {
  readonly movie: Movie | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const { screeningTurnoverMinutes } = useMetadataConfig();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const releaseYear = formText(formData, 'releaseYear');

    const body: MovieRequest = {
      movieName: formText(formData, 'movieName'),
      genres: formData.getAll('genres').filter((value) => isEnumValue(movieGenreValues, value)),
      runtime: Number(formText(formData, 'runtime')),
      description: formOptionalText(formData, 'description'),
      director: formOptionalText(formData, 'director'),
      mainCast: formText(formData, 'mainCast')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      posterUrl: formOptionalText(formData, 'posterUrl'),
      backdropUrl: formOptionalText(formData, 'backdropUrl'),
      trailerUrl: formOptionalText(formData, 'trailerUrl'),
      releaseYear: releaseYear ? Number(releaseYear) : null,
      certification: formOptionalText(formData, 'certification'),
      originalLanguage: formOptionalText(formData, 'originalLanguage'),
    };

    // Mismo texto que la violación `HttpUrl` del servidor, para no esperar la respuesta.
    const urlErrors = Object.fromEntries(
      URL_FIELDS.filter((field) => {
        const value = body[field];
        return value ? !isLoadableUrl(value) : false;
      }).map((field) => [field, violationMessage({ field, code: 'HttpUrl', params: {} }) ?? '']),
    );
    if (Object.keys(urlErrors).length > 0) return fieldErrors(urlErrors);

    try {
      // PUT es un reemplazo total, así que la misma carga completa sirve para ambos casos.
      if (movie) await updateMovie(movie.uuid, body);
      else await createMovie(body);
      onSaved();
      return initialFormState;
    } catch (error) {
      return formError(error);
    }
  }, initialFormState);

  return (
    <Modal onClose={onClose} title={movie ? 'Editar película' : 'Nueva película'} wide>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        <TextInput
          label="Título"
          name="movieName"
          required
          defaultValue={movie?.movieName ?? ''}
          error={state.fieldErrors['movieName']}
        />

        <fieldset>
          <legend className="cine-label">Géneros</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {movieGenreValues.map((genre) => (
              <label key={genre} className="flex items-center gap-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  name="genres"
                  value={genre}
                  defaultChecked={movie?.genres.includes(genre) ?? false}
                />
                {movieGenreLabels[genre]}
              </label>
            ))}
          </div>
          {state.fieldErrors['genres'] && (
            <p role="alert" className="mt-1 text-xs text-brand-400">
              Seleccioná al menos un género.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Duración (minutos)"
            name="runtime"
            type="number"
            min={1}
            required
            defaultValue={movie?.runtime ?? ''}
            hint={`Las funciones terminan en inicio + duración + ${screeningTurnoverMinutes} min de recambio.`}
            error={state.fieldErrors['runtime']}
          />
          <TextInput
            label="Director"
            name="director"
            defaultValue={movie?.director ?? ''}
            error={state.fieldErrors['director']}
          />
        </div>

        <TextInput
          label="Reparto principal"
          name="mainCast"
          defaultValue={movie?.mainCast.join(', ') ?? ''}
          hint="Separado por comas."
          error={state.fieldErrors['mainCast']}
        />

        <TextArea
          label="Descripción"
          name="description"
          maxLength={2000}
          defaultValue={movie?.description ?? ''}
          error={state.fieldErrors['description']}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="Año de estreno"
            name="releaseYear"
            type="number"
            min={1888}
            defaultValue={movie?.releaseYear ?? ''}
            error={state.fieldErrors['releaseYear']}
          />
          <TextInput
            label="Clasificación"
            name="certification"
            maxLength={16}
            placeholder="p. ej. PG-13"
            defaultValue={movie?.certification ?? ''}
            error={state.fieldErrors['certification']}
          />
          <TextInput
            label="Idioma original"
            name="originalLanguage"
            maxLength={2}
            placeholder="p. ej. en"
            defaultValue={movie?.originalLanguage ?? ''}
            hint="ISO 639-1, p. ej. en, es."
            error={state.fieldErrors['originalLanguage']}
          />
        </div>

        <TextInput
          label="URL del póster"
          name="posterUrl"
          type="url"
          maxLength={2048}
          defaultValue={movie?.posterUrl ?? ''}
          error={state.fieldErrors['posterUrl']}
        />
        <TextInput
          label="URL de la imagen de fondo"
          name="backdropUrl"
          type="url"
          maxLength={2048}
          defaultValue={movie?.backdropUrl ?? ''}
          error={state.fieldErrors['backdropUrl']}
        />
        <TextInput
          label="URL del tráiler"
          name="trailerUrl"
          type="url"
          maxLength={2048}
          defaultValue={movie?.trailerUrl ?? ''}
          error={state.fieldErrors['trailerUrl']}
        />

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton pendingLabel="Guardando…">
            {movie ? 'Guardar cambios' : 'Crear'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
