import type { MovieResponse, MovieScreeningResponse } from '../../lib/types.ts';
import { movieGenreLabels } from '../../lib/enums.ts';
import { formatMoney, formatRuntime, formatTime, dayKey } from '../../lib/format.ts';
import { Badge } from '../ui/Modal.tsx';

/**
 * Catalogue presentation pieces shared by the home grid, the movie browser and
 * the movie detail page.
 *
 * Screening responses denormalise `movieName` and `roomName`, so a listing
 * never needs a second fetch.
 */

export function GenreList({ genres }: { readonly genres: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {genres.map((genre) => (
        <Badge key={genre}>{movieGenreLabels[genre as keyof typeof movieGenreLabels] ?? genre}</Badge>
      ))}
    </div>
  );
}

/** Deterministic poster stand-in: the backend has no artwork field today. */
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

export function MovieCard({
  movie,
  screenings = [],
}: {
  readonly movie: MovieResponse;
  readonly screenings?: readonly MovieScreeningResponse[];
}) {
  return (
    <article className="cine-card flex flex-col gap-3 p-4">
      <a href={`/movies/detail?id=${movie.uuid}`} className="block">
        <PosterPlaceholder title={movie.movieName} />
      </a>

      <div className="flex flex-col gap-2">
        <h3 className="text-base leading-tight font-semibold">
          <a href={`/movies/detail?id=${movie.uuid}`} className="hover:text-brand-400">
            {movie.movieName}
          </a>
        </h3>
        <p className="text-ink-500 text-xs">{formatRuntime(movie.runtime)}</p>
        <GenreList genres={movie.genres} />
      </div>

      {screenings.length > 0 && (
        <div className="border-ink-800 mt-auto flex flex-wrap gap-1 border-t pt-3">
          {screenings.slice(0, 4).map((screening) => (
            <a
              key={screening.uuid}
              href={`/screenings/seats?id=${screening.uuid}`}
              className="cine-btn cine-btn-secondary px-2 py-1 text-xs"
              title={`${screening.roomName} · ${formatMoney(screening.basePrice)}`}
            >
              {formatTime(screening.startsAt)}
            </a>
          ))}
          {screenings.length > 4 && (
            <a
              href={`/movies/detail?id=${movie.uuid}`}
              className="text-ink-500 hover:text-ink-100 self-center px-2 text-xs"
            >
              +{screenings.length - 4} more
            </a>
          )}
        </div>
      )}
    </article>
  );
}

/** A single showtime row, used on the movie detail page. */
export function ScreeningRow({ screening }: { readonly screening: MovieScreeningResponse }) {
  return (
    <a
      href={`/screenings/seats?id=${screening.uuid}`}
      className="border-ink-800 hover:bg-ink-800/50 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors"
    >
      <div>
        <p className="font-semibold">{formatTime(screening.startsAt)}</p>
        <p className="text-ink-500 text-xs">
          {screening.roomName} · ends {formatTime(screening.endsAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium">{formatMoney(screening.basePrice)}</p>
        <p className="text-ink-500 text-xs">from</p>
      </div>
    </a>
  );
}

/** Groups screenings by local calendar day, preserving the server's ordering. */
export function groupByDay(
  screenings: readonly MovieScreeningResponse[],
): readonly (readonly [string, readonly MovieScreeningResponse[]])[] {
  const grouped = Object.groupBy(screenings, (screening) => dayKey(screening.startsAt));
  return Object.entries(grouped)
    .filter((entry): entry is [string, MovieScreeningResponse[]] => Boolean(entry[1]?.length))
    .sort(([a], [b]) => a.localeCompare(b));
}
