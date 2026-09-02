import { useActionState, useState } from 'react';
import {
  createMovie,
  deleteMovie,
  listMovies,
  updateMovie,
  type MovieSortField,
} from '../../lib/api/movies.ts';
import { useResource } from '../../lib/use-resource.ts';
import { toFieldErrors } from '../../lib/problem.ts';
import { movieGenreLabels, movieGenreValues, type MovieGenre } from '../../lib/enums.ts';
import { formatRuntime } from '../../lib/format.ts';
import type { CreateMovieRequest, MovieResponse, Page } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Modal, Badge } from '../ui/Modal.tsx';
import { TextInput, TextArea } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 15;

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly done: boolean;
}

const initialFormState: FormState = { error: null, fieldErrors: {}, done: false };

/** `/admin/movies` — full CRUD. `PUT` is a full replacement, so forms send every field. */
export default function AdminMovies() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<MovieSortField>>('movieName,asc');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MovieResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<unknown>(null);

  const resource = useResource<Page<MovieResponse>>(
    (signal) =>
      listMovies(
        { page, size: PAGE_SIZE, sort, ...(search.trim() ? { search: search.trim() } : {}) },
        { signal },
      ),
    [page, sort, search],
  );

  const remove = async (movie: MovieResponse) => {
    if (!window.confirm(`Delete “${movie.movieName}”? This cannot be undone.`)) return;
    setRowError(null);
    try {
      await deleteMovie(movie.uuid);
    } catch (error) {
      // 409 when screenings still reference the movie.
      setRowError(error);
    } finally {
      resource.refetch();
    }
  };

  const columns: readonly Column<MovieResponse>[] = [
    {
      key: 'movieName',
      header: 'Title',
      sortField: 'movieName',
      cell: (movie) => <span className="font-medium">{movie.movieName}</span>,
    },
    {
      key: 'genres',
      header: 'Genres',
      cell: (movie) => (
        <div className="flex flex-wrap gap-1">
          {movie.genres.map((genre) => (
            <Badge key={genre}>{movieGenreLabels[genre]}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'runtime',
      header: 'Runtime',
      sortField: 'runtime',
      cell: (movie) => formatRuntime(movie.runtime),
    },
    {
      key: 'director',
      header: 'Director',
      sortField: 'director',
      cell: (movie) => movie.director ?? <span className="text-ink-600">—</span>,
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
            Edit
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-danger"
            onClick={() => void remove(movie)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [MovieSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Movies"
      description="Titles, genres and runtimes. Runtime drives the computed end time of every screening."
      action={
        <button type="button" className="cine-btn cine-btn-primary" onClick={() => setCreating(true)}>
          New movie
        </button>
      }
    >
      <AdminToolbar>
        <div className="min-w-56 flex-1">
          <label htmlFor="admin-movie-search" className="cine-label">
            Search
          </label>
          <input
            id="admin-movie-search"
            type="search"
            className="cine-input"
            value={search}
            placeholder="Title contains…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
      </AdminToolbar>

      {rowError !== null && <ErrorBanner error={rowError} onRetry={resource.refetch} />}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(movie) => movie.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No movies"
        emptyDescription="Add a title to start scheduling screenings."
        activeSort={{ field: sortField, direction: sortDirection }}
        onSort={(field) => {
          setSort(
            (current) =>
              (current === `${field},asc`
                ? `${field},desc`
                : `${field},asc`) as SortSpec<MovieSortField>,
          );
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      <MovieFormModal
        open={creating || editing !== null}
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
    </AdminPage>
  );
}

function MovieFormModal({
  open,
  movie,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly movie: MovieResponse | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const genres = formData.getAll('genres').map((value) => String(value) as MovieGenre);
    const cast = String(formData.get('mainCast') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const body: CreateMovieRequest = {
      movieName: String(formData.get('movieName') ?? '').trim(),
      genres,
      runtime: Number(formData.get('runtime') ?? 0),
      description: String(formData.get('description') ?? '').trim() || null,
      director: String(formData.get('director') ?? '').trim() || null,
      mainCast: cast,
    };

    try {
      // PUT is a full replacement, so the same complete payload serves both paths.
      if (movie) await updateMovie(movie.uuid, body);
      else await createMovie(body);
      onSaved();
      return { ...initialFormState, done: true };
    } catch (error) {
      return { error, fieldErrors: toFieldErrors(error), done: false };
    }
  }, initialFormState);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={movie ? 'Edit movie' : 'New movie'} wide>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        <TextInput
          label="Title"
          name="movieName"
          required
          defaultValue={movie?.movieName ?? ''}
          error={state.fieldErrors['movieName']}
        />

        <fieldset>
          <legend className="cine-label">Genres</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {movieGenreValues.map((genre) => (
              <label key={genre} className="text-ink-300 flex items-center gap-2 text-sm">
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
            <p role="alert" className="text-brand-400 mt-1 text-xs">
              Select at least one genre.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Runtime (minutes)"
            name="runtime"
            type="number"
            min={1}
            required
            defaultValue={movie?.runtime ?? ''}
            hint="Screenings end at start + runtime + 15 min turnover."
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
          label="Main cast"
          name="mainCast"
          defaultValue={movie?.mainCast.join(', ') ?? ''}
          hint="Comma separated."
          error={state.fieldErrors['mainCast']}
        />

        <TextArea
          label="Description"
          name="description"
          maxLength={2000}
          defaultValue={movie?.description ?? ''}
          error={state.fieldErrors['description']}
        />

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton pendingLabel="Saving…">{movie ? 'Save changes' : 'Create'}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
