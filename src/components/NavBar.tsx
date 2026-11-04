import { useId } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/use-auth.ts';
import { cx } from '../lib/cx.ts';

/**
 * Navegación principal del sitio, en el layout raíz.
 *
 * Los enlaces de administración se ocultan salvo que `/api/users/me` informe `ADMIN`.
 * Eso es solo una comodidad: el backend es la barrera real y cada pantalla de admin
 * sigue manejando `403`.
 */

const publicLinks = [
  { href: '/', label: 'En cartelera' },
  { href: '/movies', label: 'Películas' },
  { href: '/contact', label: 'Contacto' },
] as const;

const adminLinks = [
  { href: '/admin/movies', label: 'Películas' },
  { href: '/admin/rooms', label: 'Salas' },
  { href: '/admin/screenings', label: 'Funciones' },
  { href: '/admin/inventory', label: 'Confitería' },
  { href: '/admin/reservations', label: 'Reservas' },
  { href: '/admin/users', label: 'Usuarios' },
  // Las etiquetas coinciden con el título de cada consola (WCAG 3 "Consistent navigation labels").
  { href: '/admin/contact', label: 'Mensajes de contacto' },
] as const;

export default function NavBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { ready, isAuthenticated, isAdmin, user, logout } = useAuth();
  // Menú de administración sobre la Popover API nativa (`popover="auto"`): el navegador resuelve
  // abrir/cerrar, Escape, el clic afuera, la capa superior y `aria-expanded` del botón.
  const adminMenuId = useId();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // El estado activo no puede ser solo visual: los lectores de pantalla lo leen de `aria-current`.
  const currentFor = (href: string) => (isActive(href) ? 'page' : undefined);

  // Todo control de la barra comparte la caja de `cine-btn` (alto, relleno, peso y la pulsación);
  // las pestañas solo cambian los colores: sin marco en reposo y, en la actual, fondo oscuro con
  // una barra de marca abajo. No se rellena de marca para no confundirse con "Crear cuenta"
  // (`cine-btn-primary`); con colores forzados la sombra desaparece y queda el subrayado.
  const linkClass = (href: string) =>
    cx(
      'cine-btn',
      isActive(href)
        ? 'border-ink-500 bg-ink-800 text-white shadow-[inset_0_-4px_0_var(--color-brand-400)] forced-colors:underline'
        : 'text-ink-300 hover:border-ink-600 hover:bg-ink-800 hover:text-ink-100',
    );

  return (
    <nav aria-label="Principal" className="flex flex-wrap items-center gap-2">
      {publicLinks.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          aria-current={currentFor(link.href)}
          className={linkClass(link.href)}
        >
          {link.label}
        </Link>
      ))}

      {isAuthenticated && (
        <Link
          to="/reservations"
          aria-current={currentFor('/reservations')}
          className={linkClass('/reservations')}
        >
          Mis reservas
        </Link>
      )}

      {isAdmin && (
        <>
          <button
            type="button"
            popoverTarget={adminMenuId}
            className={cx(linkClass('/admin'), '[anchor-name:--admin-menu]')}
          >
            Administración ▾
          </button>
          {/*
            CSS anchor positioning: el popover vive en la capa superior, anclado bajo el botón. Sin
            soporte, `@supports` deja el centrado predeterminado del navegador en lugar de tirarlo
            a la esquina superior izquierda.

            La navegación no se vuelve a montar al cambiar de página: la `key` reemplaza el popover
            en cada ruta, así no queda abierto sobre la página nueva.
          */}
          <div
            key={pathname}
            id={adminMenuId}
            popover="auto"
            className="w-56 cine-card p-1 [position-anchor:--admin-menu] supports-[position-area:bottom]:inset-auto supports-[position-area:bottom]:m-0 supports-[position-area:bottom]:mt-1 supports-[position-area:bottom]:[position-area:bottom_span-left]"
          >
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                aria-current={currentFor(link.href)}
                className="block px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-100 aria-[current=page]:bg-ink-800 aria-[current=page]:text-white aria-[current=page]:shadow-[inset_4px_0_0_var(--color-brand-400)] forced-colors:aria-[current=page]:underline"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!ready ? (
          <span role="status" className="text-sm text-ink-500">
            <span aria-hidden="true">…</span>
            <span className="sr-only">Verificando sesión</span>
          </span>
        ) : isAuthenticated ? (
          <>
            {/* Visible en todos los anchos: es el único camino a la cuenta. */}
            <Link
              to="/account"
              aria-current={currentFor('/account')}
              className={linkClass('/account')}
            >
              <span className="sr-only">Tu cuenta: </span>
              {/* El recorte va en un hijo: `text-overflow` no aplica a la caja `inline-flex`. */}
              <span className="max-w-[12ch] truncate">{user?.firstName ?? 'Cuenta'}</span>
            </Link>
            <button
              type="button"
              className="cine-btn cine-btn-ghost"
              onClick={() => {
                void logout().then(() => navigate('/'));
              }}
            >
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="cine-btn cine-btn-ghost">
              Iniciar sesión
            </Link>
            <Link to="/register" className="cine-btn cine-btn-primary">
              Crear cuenta
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
