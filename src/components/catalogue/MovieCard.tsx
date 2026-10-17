import type { MovieResponse, MovieScreeningResponse } from '../../lib/types.ts';
import { movieGenreLabels, type MovieGenre } from '../../lib/enums.ts';
import { cx } from '../../lib/cx.ts';
import { formatMoney, formatRuntime, formatTime, dayKey } from '../../lib/format.ts';
import { Badge } from '../ui/Modal.tsx';

/**
 * Piezas de presentación del catálogo compartidas por la cuadrícula de inicio,
 * el explorador de películas y la página de detalle.
 *
 * Las respuestas de funciones desnormalizan `movieName` y `roomName`, así que
 * un listado nunca necesita una segunda petición.
 */

export function GenreList({ genres }: { readonly genres: readonly MovieGenre[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {genres.map((genre) => (
        <Badge key={genre}>{movieGenreLabels[genre]}</Badge>
      ))}
    </div>
  );
}

/** Sustituto determinista del póster: hoy el backend no tiene un campo de imagen. */
export function PosterPlaceholder({ title }: { readonly title: string }) {
  const hue = [...title].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 360, 7);
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      aria-hidden="true"
      className="flex aspect-2/3 w-full items-center justify-center rounded-lg text-3xl font-black text-white/80"
      style={{
        background: `linear-gradient(150deg, oklch(0.34 0.09 ${hue}), oklch(0.2 0.05 ${(hue + 60) % 360}))`,
      }}
    >
      {initials}
    </div>
  );
}

/**
 * Póster de la película cuando existe; en caso contrario, usa el marcador determinista.
 * `priority` es para el póster principal de una página (sobre el pliegue): se carga sin
 * `lazy` y con `fetchPriority="high"`, en lugar de esperar al layout.
 */
export function Poster({
  movie,
  priority = false,
}: {
  readonly movie: MovieResponse;
  readonly priority?: boolean;
}) {
  if (!movie.posterUrl) return <PosterPlaceholder title={movie.movieName} />;
  return (
    <img
      src={movie.posterUrl}
      alt={`Póster de ${movie.movieName}`}
      className="aspect-2/3 w-full rounded-lg object-cover"
      {...(priority ? { fetchPriority: 'high' } : { loading: 'lazy' })}
    />
  );
}

/** Año de estreno / calificación / idioma original, cuando el backend los tenga. */
export function MovieMeta({ movie }: { readonly movie: MovieResponse }) {
  const parts = [
    movie.releaseYear !== null ? String(movie.releaseYear) : null,
    movie.certification,
    movie.originalLanguage ? movie.originalLanguage.toUpperCase() : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;
  return <p className="text-xs text-ink-500">{parts.join(' · ')}</p>;
}

export function MovieCard({
  movie,
  screenings = [],
}: {
  readonly movie: MovieResponse;
  readonly screenings?: readonly MovieScreeningResponse[];
}) {
  return (
    <article className="flex flex-col gap-3 cine-card p-4">
      <a href={`/movies/detail?id=${movie.uuid}`} className="block">
        <Poster movie={movie} />
      </a>

      <div className="flex flex-col gap-2">
        <h3 className="text-base leading-tight font-semibold">
          <a href={`/movies/detail?id=${movie.uuid}`} className="hover:text-brand-400">
            {movie.movieName}
          </a>
        </h3>
        <p className="text-xs text-ink-500">{formatRuntime(movie.runtime)}</p>
        <MovieMeta movie={movie} />
        <GenreList genres={movie.genres} />
      </div>

      {screenings.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 border-t border-ink-800 pt-3">
          {screenings.slice(0, 4).map((screening) =>
            screening.soldOut ? (
              <span
                key={screening.uuid}
                className="cine-btn cursor-not-allowed cine-btn-secondary px-2 py-1 text-xs opacity-50"
                title={`${screening.roomName} · Agotado`}
              >
                {formatTime(screening.startsAt)}
              </span>
            ) : (
              <a
                key={screening.uuid}
                href={`/screenings/seats?id=${screening.uuid}`}
                className="cine-btn cine-btn-secondary px-2 py-1 text-xs"
                title={`${screening.roomName} · ${formatMoney(screening.basePrice)}`}
              >
                {formatTime(screening.startsAt)}
              </a>
            ),
          )}
          {screenings.length > 4 && (
            <a
              href={`/movies/detail?id=${movie.uuid}`}
              className="self-center px-2 text-xs text-ink-500 hover:text-ink-100"
            >
              +{screenings.length - 4} más
            </a>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * `totalSeats` / `availableSeats` / `soldOut` son `null` cuando el backend
 * omitió la agregación (`includeAvailability=false`), nunca `0`/`false` —
 * muestra siempre "—" en lugar de asumir que está agotado o vacío.
 */
export function ScreeningAvailability({
  screening,
}: {
  readonly screening: MovieScreeningResponse;
}) {
  if (
    screening.soldOut === null ||
    screening.availableSeats === null ||
    screening.totalSeats === null
  ) {
    return <span className="text-ink-600">—</span>;
  }
  if (screening.soldOut) {
    return <Badge tone="danger">Agotado</Badge>;
  }
  if (screening.availableSeats === 0) {
    // Quedan asientos sin vender, pero otros clientes los tienen retenidos (§5.8).
    return (
      <Badge tone="warning">
        <span title="Otros clientes están comprando estos asientos. Volvé a mirar en unos minutos.">
          En compra
        </span>
      </Badge>
    );
  }
  return (
    <span>
      {screening.availableSeats} / {screening.totalSeats}
    </span>
  );
}

/** Una única fila de función, usada en la página de detalle de la película. */
export function ScreeningRow({ screening }: { readonly screening: MovieScreeningResponse }) {
  const Tag = screening.soldOut ? 'div' : 'a';
  return (
    <Tag
      {...(screening.soldOut ? {} : { href: `/screenings/seats?id=${screening.uuid}` })}
      className={cx(
        'flex items-center justify-between gap-4 rounded-lg border border-ink-800 px-4 py-3 transition-colors',
        screening.soldOut ? 'opacity-50' : 'hover:bg-ink-800/50',
      )}
    >
      <div>
        <p className="font-semibold">{formatTime(screening.startsAt)}</p>
        <p className="text-xs text-ink-500">
          {screening.roomName} · termina a las {formatTime(screening.endsAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium">{formatMoney(screening.basePrice)}</p>
        <ScreeningAvailability screening={screening} />
      </div>
    </Tag>
  );
}

export interface DayGroup {
  /** `YYYY-MM-DD` en la zona local. */
  readonly day: string;
  /** La primera función del día (todo grupo tiene al menos una). */
  readonly first: MovieScreeningResponse;
  readonly screenings: readonly MovieScreeningResponse[];
}

/** Agrupa las funciones por día local del calendario, conservando el orden del servidor. */
export function groupByDay(screenings: readonly MovieScreeningResponse[]): readonly DayGroup[] {
  const groups: DayGroup[] = [];
  // `Map.groupBy` conserva el orden de inserción dentro de cada grupo.
  for (const [day, items] of Map.groupBy(screenings, (screening) => dayKey(screening.startsAt))) {
    const [first] = items;
    if (first) groups.push({ day, first, screenings: items });
  }
  return groups.toSorted((a, b) => a.day.localeCompare(b.day));
}
