import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth-context.tsx';
import { LoadingBlock } from './SubmitButton.tsx';

/**
 * Protección de rutas del lado del cliente.
 *
 * El backend es la única barrera real: estos guards existen para evitar renderizar
 * solicitudes condenadas al fallo y para ofrecer una experiencia razonable al cerrar sesión.
 * Cada pantalla sigue manejando `403` de forma defensiva, porque la verificación de rol aquí
 * viene de `GET /api/users/me` y puede estar desactualizada.
 */

function SignInPrompt({ message }: { readonly message: string }) {
  const next =
    typeof window === 'undefined'
      ? '/'
      : `${window.location.pathname}${window.location.search}`;

  return (
    <div className="cine-card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="text-ink-100 text-lg font-semibold">Iniciá sesión para continuar</p>
      <p className="text-ink-500 text-sm">{message}</p>
      <a href={`/login?next=${encodeURIComponent(next)}`} className="cine-btn cine-btn-primary">
        Iniciar sesión
      </a>
    </div>
  );
}

export function AuthGuard({
  children,
  message = 'Necesitás una cuenta para ver esta página.',
}: {
  readonly children: ReactNode;
  readonly message?: string;
}) {
  const { ready, isAuthenticated } = useAuth();

  if (!ready) return <LoadingBlock label="Verificando tu sesión…" />;
  if (!isAuthenticated) return <SignInPrompt message={message} />;
  return <>{children}</>;
}

export function AdminGuard({ children }: { readonly children: ReactNode }) {
  const { ready, isAuthenticated, isAdmin } = useAuth();

  if (!ready) return <LoadingBlock label="Verificando tu sesión…" />;
  if (!isAuthenticated) {
    return <SignInPrompt message="Se requiere acceso de administrador para esta consola." />;
  }
  if (!isAdmin) {
    return (
      <div className="cine-card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-ink-100 text-lg font-semibold">No permitido</p>
        <p className="text-ink-500 text-sm">
          Esta consola está restringida a administradores. No existe un alta de administrador de
          autoservicio: un admin solo se crea al iniciar a partir de{' '}
          <code>CINE_ADMIN_EMAIL</code> y <code>CINE_ADMIN_PASSWORD</code>.
        </p>
        <a href="/" className="cine-btn cine-btn-secondary">
          Volver al cine
        </a>
      </div>
    );
  }
  return <>{children}</>;
}
