import { useState } from 'react';
import { useAuth } from '../lib/auth-context.tsx';

/**
 * Isla de navegaci`n del sitio.
 *
 * Los enlaces de administraci`n se ocultan salvo que `/api/users/me` informe `ADMIN`.
 * Eso es solo una comodidad: el backend es la barrera real y cada pantalla de admin
 * sigue manejando `403`.
 */

const publicLinks = [
  { href: '/', label: 'En cartelera' },
  { href: '/movies', label: 'Pel?culas' },
] as const;

const adminLinks = [
  { href: '/admin/movies', label: 'Pel?culas' },
  { href: '/admin/rooms', label: 'Salas' },
  { href: '/admin/screenings', label: 'Funciones' },
  { href: '/admin/inventory', label: 'Confiter?a' },
  { href: '/admin/reservations', label: 'Reservas' },
  { href: '/admin/users', label: 'Usuarios' },
] as const;

export default function NavBar({ pathname }: { readonly pathname: string }) {
  const { ready, isAuthenticated, isAdmin, user, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const linkClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive(href) ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:text-ink-100'
    }`;

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {publicLinks.map((link) => (
        <a key={link.href} href={link.href} className={linkClass(link.href)}>
          {link.label}
        </a>
      ))}

      {isAuthenticated && (
        <a href="/reservations" className={linkClass('/reservations')}>
          Mis reservas
        </a>
      )}

      {isAdmin && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setAdminOpen((open) => !open)}
            aria-expanded={adminOpen}
            className={linkClass('/admin')}
          >
            Administración ▾
          </button>
          {adminOpen && (
            <div className="cine-card absolute right-0 z-20 mt-1 w-48 p-1 shadow-xl">
              {adminLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-ink-300 hover:bg-ink-800 hover:text-ink-100 block rounded-md px-3 py-2 text-sm"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!ready ? (
          <span className="text-ink-600 text-sm">…</span>
        ) : isAuthenticated ? (
          <>
            <a
              href="/account"
              className="text-ink-500 hover:text-ink-100 hidden text-sm sm:inline"
            >
              {user?.firstName ?? 'Cuenta'}
            </a>
            <button
              type="button"
              className="cine-btn cine-btn-ghost"
              onClick={() => {
                void logout().then(() => window.location.assign('/'));
              }}
            >
              Cerrar sesi?n
            </button>
          </>
        ) : (
          <>
            <a href="/login" className="cine-btn cine-btn-ghost">
              Iniciar sesi?n
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
