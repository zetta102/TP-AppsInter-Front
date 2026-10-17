import { getMovie } from '../../lib/api/movies.ts';
import { listScreenings } from '../../lib/api/screenings.ts';
import { useKeyedResource } from '../../lib/use-resource.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useQueryParam } from '../../lib/use-query-param.ts';
import { formatDayHeading, formatRuntime } from '../../lib/format.ts';
import type { Movie, Screening } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { GenreList, MovieMeta, Poster, ScreeningRow, groupByDay } from './MovieCard.tsx';

/**
 * Detalle de la película más sus próximas funciones
 * (`GET /api/screenings?movieId=…&upcomingOnly=true`).
 *
 * La salida estática no puede prerenderizar un UUID desconocido, así que el id
 * llega como parámetro de consulta en lugar de como `/movies/:id`.
 */
export default function MovieDetail() {
  const movieId = useQueryParam('id');

  const resource = useKeyedResource<
    string,
    {
      readonly movie: Movie;
      readonly screenings: readonly Screening[];
    }
  >(movieId, async (id, signal) => {
    const [movie, screenings] = await Promise.all([
      getMovie(id, { signal }),
      listScreenings(
        { movieId: id, upcomingOnly: true, size: 100, sort: 'startsAt,asc' },
        { signal },
      ),
    ]);
    return { movie, screenings: screenings.content };
  });
  useDocumentTitle(resource.data?.movie.movieName);

  if (!movieId) {
    return (
      <EmptyState
        title="No seleccionaste ninguna película"
        description="Elegí un título del catálogo."
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
        <div className="-mx-4 -mt-4 overflow-hidden rounded-b-xl border-b border-ink-800 sm:-mx-8 sm:-mt-8">
          {/* Imagen principal sobre el pliegue (probable LCP): sin `lazy` y con prioridad alta. */}
          <img
            src={movie.backdropUrl}
            alt=""
            className="aspect-21/9 w-full object-cover"
            fetchPriority="high"
          />
        </div>
      )}

      <header className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="max-w-50">
          <Poster movie={movie} priority={!movie.backdropUrl} />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">{movie.movieName}</h1>
          <p className="text-sm text-ink-500">{formatRuntime(movie.runtime)}</p>
          <MovieMeta movie={movie} />
          <GenreList genres={movie.genres} />

          {movie.description && (
            <p className="max-w-prose text-sm leading-relaxed text-ink-300">{movie.description}</p>
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
              className="cine-btn self-start cine-btn-secondary"
            >
              Ver tráiler
            </a>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-bold">Próximas funciones</h2>

        {days.length === 0 ? (
          <EmptyState
            title="No hay próximas funciones"
            description="Este título está en el catálogo, pero ahora mismo no está programado."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {days.map(({ day, first, screenings: dayScreenings }) => (
              <div key={day}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                  {formatDayHeading(first.startsAt)}
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
