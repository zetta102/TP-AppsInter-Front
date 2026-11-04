import MovieBrowser from '../components/catalogue/MovieBrowser.tsx';

export default function MoviesPage() {
  return (
    <>
      <h1 className="mb-6 cine-plate text-lg sm:text-2xl">Películas</h1>
      <MovieBrowser />
    </>
  );
}
