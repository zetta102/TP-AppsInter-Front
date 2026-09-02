import { useDeferredValue, useState } from 'react';
import { listMovies, type MovieSortField } from '../../lib/api/movies.ts';
import { useResource } from '../../lib/use-resource.ts';
import { movieGenreLabels, movieGenreValues, type MovieGenre } from '../../lib/enums.ts';
import type { MovieResponse, Page } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { MovieCard } from './MovieCard.tsx';

const PAGE_SIZE = 12;

const sortOptions = [
  { value: 'movieName,asc', label: 'Title (A–Z)' },
  { value: 'movieName,desc', label: 'Title (Z–A)' },
  { value: 'runtime,asc', label: 'Shortest first' },
  { value: 'runtime,desc', label: 'Longest first' },
] as const satisfies readonly { value: SortSpec<MovieSortField>; label: string }[];

/**
 * Movie browser: `search` (case-insensitive substring) and `genre` filters over
 * the paged catalogue. Sorting uses **entity property** names — an unknown
 * property is a `400`, so the options are a fixed list.
 */
export default function MovieBrowser() {
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState<MovieGenre | ''>('');
  const [sort, setSort] = useState<SortSpec<MovieSortField>>('movieName,asc');
  const [page, setPage] = useState(0);

  // Keeps typing responsive without firing a request per keystroke.
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
    [page, PAGE_SIZE, sort, deferredSearch, genre],
  );

  const resetTo = (mutate: () => void) => {
    mutate();
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="cine-card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="movie-search" className="cine-label">
            Search
          </label>
          <input
            id="movie-search"
            type="search"
            value={search}
            placeholder="Title contains…"
            onChange={(event) => resetTo(() => setSearch(event.target.value))}
            className="cine-input"
          />
        </div>

        <div className="w-44">
          <label htmlFor="movie-genre" className="cine-label">
            Genre
          </label>
          <select
            id="movie-genre"
            value={genre}
            onChange={(event) => resetTo(() => setGenre(event.target.value as MovieGenre | ''))}
            className="cine-input"
          >
            <option value="">All genres</option>
            {movieGenreValues.map((value) => (
              <option key={value} value={value}>
                {movieGenreLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="w-48">
          <label htmlFor="movie-sort" className="cine-label">
            Sort
          </label>
          <select
            id="movie-sort"
            value={sort}
            onChange={(event) =>
              resetTo(() => setSort(event.target.value as SortSpec<MovieSortField>))
            }
            className="cine-input"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {resource.error ? (
        <ErrorBanner error={resource.error} onRetry={resource.refetch} />
      ) : resource.isLoading ? (
        <LoadingBlock />
      ) : resource.data && resource.data.content.length === 0 ? (
        <EmptyState
          title="No movies match"
          description="Try a different title fragment or clear the genre filter."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {resource.data?.content.map((movie) => <MovieCard key={movie.uuid} movie={movie} />)}
        </div>
      )}

      <Pagination page={resource.data} onPageChange={setPage} />
    </div>
  );
}
