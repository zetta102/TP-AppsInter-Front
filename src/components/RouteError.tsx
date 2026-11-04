import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState } from './ui/Feedback.tsx';

/** La ruta no existe (cualquier URL fuera de la tabla de `src/router.tsx`). */
export function NotFound() {
  return (
    <EmptyState
      title="No encontramos esta página"
      description="Puede que el enlace esté mal escrito o que la página ya no exista."
      action={
        <Link to="/" className="cine-btn cine-btn-primary">
          Ver cartelera
        </Link>
      }
    />
  );
}

/**
 * Límite de errores de las páginas: un error de render o un fragmento de código que no se pudo
 * descargar (p. ej. tras publicar una versión nueva) cae acá, dentro del layout, en lugar de
 * dejar la pantalla en blanco.
 */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  return (
    <EmptyState
      title="Algo salió mal al mostrar esta página"
      description="Recargá la página para volver a intentarlo. Si el problema sigue, escribinos desde Contacto."
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
      }
    />
  );
}
