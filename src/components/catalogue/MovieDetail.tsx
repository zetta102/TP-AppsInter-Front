import { getMovie } from '../../lib/api/movies.ts';
import { listScreenings } from '../../lib/api/screenings.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { formatDayHeading, formatRuntime } from '../../lib/format.ts';
import type { MovieResponse, MovieScreeningResponse } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { GenreList, MovieMeta, Poster, ScreeningRow, groupByDay } from './MovieCard.tsx';

/**
 * Detalle de la película más sus próximas sesiones
 * (`GET /api/screenings?movieId=…&upcomingOnly=true`).
 *
 * La salida estática no puede prerenderizar un UUID desconocido, así que el id
 * llega como parámetro de consulta en lugar de como `/movies/:id`.
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
        title="No has seleccionado ninguna película"
        description="Elige un título del catálogo."
        action={
          <a href="/movies" className="cine-btn cine-btn-primary">
            Ver películas
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
      {movie.backdropUrl && (
        <div className="border-ink-800 -mx-4 -mt-4 overflow-hidden rounded-b-xl border-b sm:-mx-8 sm:-mt-8">
          <img
            src={movie.backdropUrl}
            alt=""
            aria-hidden="true"
            className="aspect-21/9 w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <header className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="max-w-50">
          <Poster movie={movie} />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">{movie.movieName}</h1>
          <p className="text-ink-500 text-sm">{formatRuntime(movie.runtime)}</p>
          <MovieMeta movie={movie} />
          <GenreList genres={movie.genres} />

          {movie.description && (
            <p className="text-ink-300 max-w-prose text-sm leading-relaxed">{movie.description}</p>
          )}

          <dl className="text-sm">
            {movie.director && (
              <div className="flex gap-2">
                <dt className="text-ink-500">Dirección</dt>
                <dd>{movie.director}</dd>
              </div>
            )}
            {movie.mainCast.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-ink-500">Reparto</dt>
                <dd>{movie.mainCast.join(', ')}</dd>
              </div>
            )}
          </dl>

          {movie.trailerUrl && (
            <a
              href={movie.trailerUrl}
              target="_blank"
              rel="noreferrer"
              className="cine-btn cine-btn-secondary self-start"
            >
              Ver tráiler
            </a>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-bold">Próximas sesiones</h2>

        {days.length === 0 ? (
          <EmptyState
            title="No hay próximas sesiones"
            description="Este título está en el catálogo, pero ahora mismo no está programado."
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
