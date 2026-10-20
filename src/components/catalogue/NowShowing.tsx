import { listMovies, listNowShowing } from '../../lib/api/movies.ts';
import { collectAllPages } from '../../lib/api/shared.ts';
import { useResource } from '../../lib/use-resource.ts';
import { formatCount } from '../../lib/format.ts';
import type { Movie, NowShowing as NowShowingEntry } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock } from '../ui/Feedback.tsx';
import { MovieCard } from './MovieCard.tsx';

/**
 * La cuadrícula de películas en cartel.
 *
 * "En cartel" sale del agregado `GET /api/movies/now-showing`: cada película con sus próximas
 * funciones (ordenadas y con disponibilidad) en una sola lista, sin traer todas las funciones
 * para unirlas en el cliente. "También en el catálogo" son las películas restantes de
 * `GET /api/movies`. Ambas lecturas recorren todas las páginas porque el backend limita `size`
 * a 100; la cartelera envía el token si hay sesión.
 */
export default function NowShowing() {
  const resource = useResource<{
    readonly showing: readonly NowShowingEntry[];
    readonly movies: readonly Movie[];
  }>(async (signal) => {
    const [showing, movies] = await Promise.all([
      collectAllPages((page, size) =>
        listNowShowing({ page, size, sort: 'movieName,asc' }, { signal }),
      ),
      collectAllPages((page, size) =>
        listMovies({ page, size, sort: 'movieName,asc' }, { signal }),
      ),
    ]);
    return { showing, movies };
  }, []);

  if (resource.isLoading) return <LoadingBlock label="Cargando la cartelera…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;

  const showing = resource.data?.showing ?? [];
  const movies = resource.data?.movies ?? [];
  const showingIds = new Set(showing.map((entry) => entry.movie.uuid));
  const rest = movies.filter((movie) => !showingIds.has(movie.uuid));
  const screeningCount = showing.reduce((sum, entry) => sum + entry.screenings.length, 0);

  if (showing.length === 0 && rest.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay películas"
        description="El catálogo está vacío. Un administrador debe agregar películas y programar funciones."
      />
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">En cartel</h2>
          <p className="text-sm text-ink-500">
            {formatCount(screeningCount, 'próxima función', 'próximas funciones')}
          </p>
        </div>

        {showing.length === 0 ? (
          <EmptyState
            title="No hay funciones programadas"
            description="Hay películas en el catálogo, pero no hay próximas funciones."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {showing.map(({ movie, screenings }) => (
              <MovieCard key={movie.uuid} movie={movie} screenings={screenings} />
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
