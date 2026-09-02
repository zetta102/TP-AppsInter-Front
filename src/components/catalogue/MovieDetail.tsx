import { getMovie } from '../../lib/api/movies.ts';
import { listScreenings } from '../../lib/api/screenings.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { formatDayHeading, formatRuntime } from '../../lib/format.ts';
import type { MovieResponse, MovieScreeningResponse } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { GenreList, PosterPlaceholder, ScreeningRow, groupByDay } from './MovieCard.tsx';

/**
 * Movie detail plus that movie's upcoming screenings
 * (`GET /api/screenings?movieId=…&upcomingOnly=true`).
 *
 * Static output cannot prerender an unknown UUID, so the id arrives as a query
 * parameter rather than as `/movies/:id`.
 */
export default function MovieDetail() {
  const movieId = useQueryParam('id');

  const resource = useResource<{
    readonly movie: MovieResponse;
    readonly screenings: readonly MovieScreeningResponse[];
  }>(
    async (signal) => {
      const [movie, screenings] = await Promise.all([
        getMovie(movieId!, { signal }),
        listScreenings(
          { movieId: movieId!, upcomingOnly: true, size: 100, sort: 'startsAt,asc' },
          { signal },
        ),
      ]);
      return { movie, screenings: screenings.content };
    },
    [movieId],
    { enabled: Boolean(movieId) },
  );

  if (!movieId) {
    return (
      <EmptyState
        title="No movie selected"
        description="Pick a title from the catalogue."
        action={
          <a href="/movies" className="cine-btn cine-btn-primary">
            Browse movies
          </a>
        }
      />
    );
  }

  if (resource.isLoading) return <LoadingBlock />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  if (!resource.data) return null;

  const { movie, screenings } = resource.data;
  const days = groupByDay(screenings);

  return (
    <article className="flex flex-col gap-10">
      <header className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="max-w-50">
          <PosterPlaceholder title={movie.movieName} />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">{movie.movieName}</h1>
          <p className="text-ink-500 text-sm">{formatRuntime(movie.runtime)}</p>
          <GenreList genres={movie.genres} />

          {movie.description && (
            <p className="text-ink-300 max-w-prose text-sm leading-relaxed">{movie.description}</p>
          )}

          <dl className="text-sm">
            {movie.director && (
              <div className="flex gap-2">
                <dt className="text-ink-500">Director</dt>
                <dd>{movie.director}</dd>
              </div>
            )}
            {movie.mainCast.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-ink-500">Cast</dt>
                <dd>{movie.mainCast.join(', ')}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-bold">Upcoming screenings</h2>

        {days.length === 0 ? (
          <EmptyState
            title="No upcoming screenings"
            description="This title is in the catalogue but is not currently scheduled."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {days.map(([day, dayScreenings]) => (
              <div key={day}>
                <h3 className="text-ink-500 mb-2 text-xs font-semibold uppercase tracking-wide">
                  {formatDayHeading(dayScreenings[0]!.startsAt)}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {dayScreenings.map((screening) => (
                    <ScreeningRow key={screening.uuid} screening={screening} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
