import LoginForm from '../components/auth/LoginForm.tsx';

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 cine-plate">
        <h1 className="mb-1 text-lg sm:text-2xl">Hola de nuevo</h1>
        <p className="text-sm text-ink-500">
          Cualquiera puede ver la cartelera: solo necesitás una cuenta para reservar asientos.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
