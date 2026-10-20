import type { ReactNode } from 'react';
import { currentPath, loginHref } from '../../lib/login-redirect.ts';
import { useAuth } from '../../lib/use-auth.ts';
import { LoadingBlock } from './Feedback.tsx';

/**
 * Protección de rutas del lado del cliente.
 *
 * El backend es la única barrera real: estos guards existen para evitar renderizar
 * solicitudes condenadas al fallo y para ofrecer una experiencia razonable al cerrar sesión.
 * Cada pantalla sigue manejando `403` de forma defensiva, porque la verificación de rol acá
 * viene de `GET /api/users/me` y puede estar desactualizada.
 */

function SignInPrompt({ message }: { readonly message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 cine-card px-6 py-12 text-center">
      <p className="text-lg font-semibold text-ink-100">Iniciá sesión para continuar</p>
      <p className="text-sm text-ink-500">{message}</p>
      <a href={loginHref(currentPath())} className="cine-btn cine-btn-primary">
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
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 cine-card px-6 py-12 text-center">
        <p className="text-lg font-semibold text-ink-100">No permitido</p>
        <p className="text-sm text-ink-500">
          Esta consola está restringida a administradores. No existe un alta de administrador de
          autoservicio: un admin solo se crea al iniciar a partir de <code>CINE_ADMIN_EMAIL</code> y{' '}
          <code>CINE_ADMIN_PASSWORD</code>.
        </p>
        <a href="/" className="cine-btn cine-btn-secondary">
          Volver al cine
        </a>
      </div>
    );
  }
  return <>{children}</>;
}
