import { useDeferredValue, useState } from 'react';
import { listMovies, type MovieSortField } from '../../lib/api/movies.ts';
import { useResource } from '../../lib/use-resource.ts';
import {
  isEnumValue,
  movieGenreLabels,
  movieGenreValues,
  type MovieGenre,
} from '../../lib/enums.ts';
import type { MovieResponse, Page } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { MovieCard } from './MovieCard.tsx';

const PAGE_SIZE = 12;

const sortOptions = [
  { value: 'movieName,asc', label: 'Título (A–Z)' },
  { value: 'movieName,desc', label: 'Título (Z–A)' },
  { value: 'runtime,asc', label: 'Más corta primero' },
  { value: 'runtime,desc', label: 'Más larga primero' },
] as const satisfies readonly { value: SortSpec<MovieSortField>; label: string }[];

const sortValues = sortOptions.map((option) => option.value);

/**
 * Explorador de películas: filtros de `search` (subcadena sin distinguir mayúsculas)
 * y `genre` sobre el catálogo paginado. La ordenación usa nombres de
 * **propiedades de la entidad** — una propiedad desconocida provoca un `400`,
 * así que las opciones son una lista fija.
 */
export default function MovieBrowser() {
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState<MovieGenre | ''>('');
  const [sort, setSort] = useState<SortSpec<MovieSortField>>('movieName,asc');
  const [page, setPage] = useState(0);

  // Mantiene la escritura fluida sin lanzar una petición por cada tecla.
  const deferredSearch = useDeferredValue(search);

  const resource = useResource<Page<MovieResponse>>(
    (signal) =>
      listMovies(
        {
          page,
          size: PAGE_SIZE,
          sort,
          ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
          ...(genre ? { genre } : {}),
        },
        { signal },
      ),
    [page, sort, deferredSearch, genre],
  );

  const resetTo = (mutate: () => void) => {
    mutate();
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3 cine-card p-4">
        <TextInput
          label="Buscar"
          fieldClassName="min-w-56 flex-1"
          type="search"
          value={search}
          placeholder="El título contiene…"
          onChange={(event) => resetTo(() => setSearch(event.target.value))}
        />

        <SelectInput
          label="Género"
          fieldClassName="w-44"
          value={genre}
          onChange={(event) => {
            const { value } = event.target;
            resetTo(() => setGenre(isEnumValue(movieGenreValues, value) ? value : ''));
          }}
        >
          <option value="">Todos los géneros</option>
          {movieGenreValues.map((value) => (
            <option key={value} value={value}>
              {movieGenreLabels[value]}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          label="Ordenar"
          fieldClassName="w-48"
          value={sort}
          onChange={(event) => {
            const { value } = event.target;
            if (isEnumValue(sortValues, value)) resetTo(() => setSort(value));
          }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectInput>
      </div>

      {resource.error ? (
        <ErrorBanner error={resource.error} onRetry={resource.refetch} />
      ) : resource.isLoading ? (
        <LoadingBlock />
      ) : resource.data && resource.data.content.length === 0 ? (
        <EmptyState
          title="No encontramos películas"
          description="Probá con otro fragmento del título o borrá el filtro de género."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {resource.data?.content.map((movie) => (
            <MovieCard key={movie.uuid} movie={movie} />
          ))}
        </div>
      )}

      <Pagination page={resource.data} onPageChange={setPage} />
    </div>
  );
}
