import { listMovies } from '../../lib/api/movies.ts';
import { listScreenings } from '../../lib/api/screenings.ts';
import { useResource } from '../../lib/use-resource.ts';
import type { MovieResponse, MovieScreeningResponse } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { MovieCard } from './MovieCard.tsx';

/**
 * The now-showing grid: `GET /api/movies` joined client-side with
 * `GET /api/screenings?upcomingOnly=true`.
 *
 * Both reads are anonymous, so the whole home page renders without a token.
 * The screening response already carries `movieName`/`movieId`, so grouping is
 * a pure client-side join with no extra fetches.
 */
export default function NowShowing() {
  const resource = useResource<{
    readonly movies: readonly MovieResponse[];
    readonly screenings: readonly MovieScreeningResponse[];
  }>(
    async (signal) => {
      const [movies, screenings] = await Promise.all([
        listMovies({ size: 100, sort: 'movieName,asc' }, { signal }),
        listScreenings(
          { upcomingOnly: true, size: 200, sort: 'startsAt,asc' },
          { signal },
        ),
      ]);
      return { movies: movies.content, screenings: screenings.content };
    },
    [],
  );

  if (resource.isLoading) return <LoadingBlock label="Loading the schedule…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;

  const movies = resource.data?.movies ?? [];
  const screenings = resource.data?.screenings ?? [];
  const byMovie = Object.groupBy(screenings, (screening) => screening.movieId);

  const showing = movies.filter((movie) => (byMovie[movie.uuid]?.length ?? 0) > 0);
  const rest = movies.filter((movie) => (byMovie[movie.uuid]?.length ?? 0) === 0);

  if (movies.length === 0) {
    return (
      <EmptyState
        title="No movies yet"
        description="The catalogue is empty. An administrator needs to add movies and schedule screenings."
      />
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Now showing</h2>
          <p className="text-ink-500 text-sm">{screenings.length} upcoming screenings</p>
        </div>

        {showing.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            description="There are movies in the catalogue, but no upcoming screenings."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {showing.map((movie) => (
              <MovieCard key={movie.uuid} movie={movie} screenings={byMovie[movie.uuid] ?? []} />
            ))}
          </div>
        )}
      </section>

      {rest.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Also in the catalogue</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {rest.map((movie) => (
              <MovieCard key={movie.uuid} movie={movie} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
