import { useState } from 'react';
import { useAuth } from '../lib/auth-context.tsx';

/**
 * Site navigation island.
 *
 * Admin links are hidden unless `/api/users/me` reports `ADMIN`. That is a
 * convenience only: the backend is the real gate and every admin screen still
 * handles `403`.
 */

const publicLinks = [
  { href: '/', label: 'Now showing' },
  { href: '/movies', label: 'Movies' },
] as const;

const adminLinks = [
  { href: '/admin/movies', label: 'Movies' },
  { href: '/admin/rooms', label: 'Rooms' },
  { href: '/admin/screenings', label: 'Screenings' },
  { href: '/admin/inventory', label: 'Concessions' },
  { href: '/admin/reservations', label: 'Reservations' },
  { href: '/admin/users', label: 'Users' },
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
          My reservations
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
            Admin ▾
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
            <span className="text-ink-500 hidden text-sm sm:inline">
              {user?.firstName ?? 'Signed in'}
            </span>
            <button
              type="button"
              className="cine-btn cine-btn-ghost"
              onClick={() => {
                void logout().then(() => window.location.assign('/'));
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <a href="/login" className="cine-btn cine-btn-ghost">
              Sign in
            </a>
            <a href="/register" className="cine-btn cine-btn-primary">
              Create account
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
