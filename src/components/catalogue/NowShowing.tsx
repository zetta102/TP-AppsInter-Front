import { listMovies } from '../../lib/api/movies.ts';
import { listScreenings } from '../../lib/api/screenings.ts';
import { useResource } from '../../lib/use-resource.ts';
import type { MovieResponse, MovieScreeningResponse } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/SubmitButton.tsx';
import { MovieCard } from './MovieCard.tsx';

/**
 * La cuadrícula de películas en cartel: `GET /api/movies` unido en cliente con
 * `GET /api/screenings?upcomingOnly=true`.
 *
 * Ambas lecturas son anónimas, así que toda la página de inicio se renderiza
 * sin token. La respuesta de sesiones ya incluye `movieName`/`movieId`, por lo
 * que la agrupación es una unión puramente en cliente, sin peticiones extra.
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

  if (resource.isLoading) return <LoadingBlock label="Cargando la cartelera…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;

  const movies = resource.data?.movies ?? [];
  const screenings = resource.data?.screenings ?? [];
  const byMovie = Object.groupBy(screenings, (screening) => screening.movieId);

  const showing = movies.filter((movie) => (byMovie[movie.uuid]?.length ?? 0) > 0);
  const rest = movies.filter((movie) => (byMovie[movie.uuid]?.length ?? 0) === 0);

  if (movies.length === 0) {
    return (
      <EmptyState
        title="Aún no hay películas"
        description="El catálogo está vacío. Un administrador debe añadir películas y programar sesiones."
      />
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">En cartel</h2>
          <p className="text-ink-500 text-sm">{screenings.length} próximas sesiones</p>
        </div>

        {showing.length === 0 ? (
          <EmptyState
            title="No hay sesiones programadas"
            description="Hay películas en el catálogo, pero no hay próximas sesiones."
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
          <h2 className="mb-4 text-xl font-bold">También en el catálogo</h2>
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
