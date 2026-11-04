import { Link } from 'react-router';
import { cx } from '../../lib/cx.ts';
import { movieGenreLabels, type MovieGenre } from '../../lib/enums.ts';
import { dayKey, formatMoney, formatRuntime, formatTime } from '../../lib/format.ts';
import { moviePath, screeningSeatsPath } from '../../lib/paths.ts';
import type { Movie, Screening } from '../../lib/types.ts';
import { Badge } from '../ui/Badge.tsx';

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

/** Sustituto determinista del póster para películas sin `posterUrl`. */
function PosterPlaceholder({ title }: { readonly title: string }) {
  const hue = [...title].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 360, 7);
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  // Cuatro bandas duras entre los dos tonos, como una paleta de 16 bits (sin interpolación suave).
  const from = `oklch(0.34 0.09 ${hue})`;
  const to = `oklch(0.2 0.05 ${(hue + 60) % 360})`;
  const band = (share: number) => `color-mix(in oklch, ${from} ${share}%, ${to})`;

  return (
    <div
      aria-hidden="true"
      className="flex aspect-2/3 w-full items-center justify-center font-display text-2xl text-white/80 text-shadow-black/50 text-shadow-pixel"
      style={{
        background: `linear-gradient(150deg, ${from} 0 25%, ${band(67)} 25% 50%, ${band(33)} 50% 75%, ${to} 75% 100%)`,
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
  readonly movie: Movie;
  readonly priority?: boolean;
}) {
  if (!movie.posterUrl) return <PosterPlaceholder title={movie.movieName} />;
  return (
    <img
      src={movie.posterUrl}
      alt={`Póster de ${movie.movieName}`}
      className="aspect-2/3 w-full object-cover"
      {...(priority ? { fetchPriority: 'high' } : { loading: 'lazy' })}
    />
  );
}

/** Año de estreno / calificación / idioma original, cuando el backend los tenga. */
export function MovieMeta({ movie }: { readonly movie: Movie }) {
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
  readonly movie: Movie;
  readonly screenings?: readonly Screening[];
}) {
  return (
    <article className="flex flex-col gap-3 cine-card p-4">
      {/*
        Duplica el enlace del título: se saca del orden de tabulación y del árbol accesible para no
        repetirlo (y porque con el marcador de póster quedaría sin nombre accesible).
      */}
      <Link to={moviePath(movie.uuid)} tabIndex={-1} aria-hidden="true" className="block">
        <Poster movie={movie} />
      </Link>

      <div className="flex flex-col gap-2">
        <h3 className="text-base leading-tight font-semibold">
          <Link
            to={moviePath(movie.uuid)}
            className="decoration-2 underline-offset-3 hover:text-brand-400 hover:underline"
          >
            {movie.movieName}
          </Link>
        </h3>
        <p className="text-xs text-ink-500">{formatRuntime(movie.runtime)}</p>
        <MovieMeta movie={movie} />
        <GenreList genres={movie.genres} />
      </div>

      {screenings.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 border-t-2 border-ink-700 pt-3">
          {screenings.slice(0, 4).map((screening) =>
            screening.soldOut ? (
              // El `title` no llega al teclado ni a los lectores: la sala y el estado van también en
              // texto oculto visualmente, y "agotado" se marca con tachado además de la opacidad.
              <span
                key={screening.uuid}
                className="cine-btn cursor-not-allowed cine-btn-secondary px-2 py-1 text-xs line-through opacity-50"
                title={`${screening.roomName} · Agotado`}
              >
                {formatTime(screening.startsAt)}
                <span className="sr-only">, {screening.roomName}, agotado</span>
              </span>
            ) : (
              <Link
                key={screening.uuid}
                to={screeningSeatsPath(screening.uuid)}
                className="cine-btn cine-btn-secondary px-2 py-1 text-xs"
                title={`${screening.roomName} · ${formatMoney(screening.basePrice)}`}
              >
                {formatTime(screening.startsAt)}
                <span className="sr-only">
                  , {screening.roomName}, {formatMoney(screening.basePrice)}
                </span>
              </Link>
            ),
          )}
          {screenings.length > 4 && (
            <Link
              to={moviePath(movie.uuid)}
              className="self-center px-2 py-1 text-xs text-ink-500 hover:text-ink-100"
            >
              +{screenings.length - 4} más
              <span className="sr-only"> funciones de {movie.movieName}</span>
            </Link>
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
export function ScreeningAvailability({ screening }: { readonly screening: Screening }) {
  if (
    screening.soldOut === null ||
    screening.availableSeats === null ||
    screening.totalSeats === null
  ) {
    return <span className="text-ink-500">—</span>;
  }
  if (screening.soldOut) {
    return <Badge tone="danger">Agotado</Badge>;
  }
  if (screening.availableSeats === 0) {
    // Quedan asientos sin vender, pero otros clientes los tienen retenidos.
    return (
      // El `title` solo llega al puntero: la explicación va también como texto para lectores y
      // teclado.
      <Badge tone="warning">
        <span title="Otros clientes están comprando estos asientos. Volvé a mirar en unos minutos.">
          En compra
          <span className="sr-only">
            : otros clientes están comprando estos asientos. Volvé a mirar en unos minutos.
          </span>
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
export function ScreeningRow({ screening }: { readonly screening: Screening }) {
  const className = cx(
    'flex items-center justify-between gap-4 border-2 border-ink-700 bg-ink-950/50 px-4 py-3 transition-colors',
    screening.soldOut ? 'opacity-50' : 'hover:bg-ink-800/50',
  );
  const content = (
    <>
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
    </>
  );

  // Una función agotada no lleva a ningún lado: es una fila sin enlace.
  return screening.soldOut ? (
    <div className={className}>{content}</div>
  ) : (
    <Link to={screeningSeatsPath(screening.uuid)} className={className}>
      {content}
    </Link>
  );
}

export interface DayGroup {
  /** `YYYY-MM-DD` en la zona local. */
  readonly day: string;
  /** La primera función del día (todo grupo tiene al menos una). */
  readonly first: Screening;
  readonly screenings: readonly Screening[];
}

/** Agrupa las funciones por día local del calendario, conservando el orden del servidor. */
export function groupByDay(screenings: readonly Screening[]): readonly DayGroup[] {
  const groups: DayGroup[] = [];
  // `Map.groupBy` conserva el orden de inserción dentro de cada grupo.
  for (const [day, items] of Map.groupBy(screenings, (screening) => dayKey(screening.startsAt))) {
    const [first] = items;
    if (first) groups.push({ day, first, screenings: items });
  }
  return groups.toSorted((a, b) => a.day.localeCompare(b.day));
}
