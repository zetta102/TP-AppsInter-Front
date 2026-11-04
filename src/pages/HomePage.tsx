import NowShowing from '../components/catalogue/NowShowing.tsx';

export default function HomePage() {
  return (
    <>
      <section className="mb-10 cine-plate">
        <h1 className="text-xl sm:text-3xl">Hoy en el cine</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-500">
          Podés recorrer todo el catálogo sin cuenta: solo necesitás iniciar sesión para reservar.
        </p>
      </section>

      <NowShowing />
    </>
  );
}
