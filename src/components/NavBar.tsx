import { navigate } from 'astro:transitions/client';
import { useEffect, useId, useRef } from 'react';
import { useAuth } from '../lib/auth-context.tsx';
import { cx } from '../lib/cx.ts';

/**
 * Isla de navegación del sitio.
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
  { href: '/admin/contact', label: 'Mensajes' },
] as const;

export default function NavBar({ pathname }: { readonly pathname: string }) {
  const { ready, isAuthenticated, isAdmin, user, logout } = useAuth();
  // Menú de administración sobre la Popover API nativa (`popover="auto"`): el navegador resuelve
  // abrir/cerrar, Escape, el clic afuera, la capa superior y `aria-expanded` del botón.
  const adminMenuId = useId();
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // La isla persiste entre transiciones (`transition:persist`), y el popover con ella: se cierra
  // al navegar para no quedar abierto sobre la página nueva.
  useEffect(() => {
    const close = () => {
      const menu = adminMenuRef.current;
      if (menu?.matches(':popover-open')) menu.hidePopover();
    };
    document.addEventListener('astro:before-swap', close);
    return () => document.removeEventListener('astro:before-swap', close);
  }, []);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // El estado activo no puede ser solo visual: los lectores de pantalla lo leen de `aria-current`.
  const currentFor = (href: string) => (isActive(href) ? 'page' : undefined);

  const linkClass = (href: string) =>
    cx(
      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive(href) ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:text-ink-100',
    );

  return (
    <nav aria-label="Principal" className="flex flex-wrap items-center gap-2">
      {publicLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          aria-current={currentFor(link.href)}
          className={linkClass(link.href)}
        >
          {link.label}
        </a>
      ))}

      {isAuthenticated && (
        <a
          href="/reservations"
          aria-current={currentFor('/reservations')}
          className={linkClass('/reservations')}
        >
          Mis reservas
        </a>
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
          {/* CSS anchor positioning: el popover vive en la capa superior, anclado bajo el botón. */}
          <div
            id={adminMenuId}
            ref={adminMenuRef}
            popover="auto"
            className="inset-auto m-0 mt-1 w-48 cine-card p-1 shadow-xl [position-anchor:--admin-menu] [position-area:bottom_span-left]"
          >
            {adminLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-current={currentFor(link.href)}
                className="block rounded-md px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              >
                {link.label}
              </a>
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
            <a href="/account" className="hidden text-sm text-ink-500 hover:text-ink-100 sm:inline">
              {user?.firstName ?? 'Cuenta'}
            </a>
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
            <a href="/login" className="cine-btn cine-btn-ghost">
              Iniciar sesión
            </a>
            <a href="/register" className="cine-btn cine-btn-primary">
              Crear cuenta
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
