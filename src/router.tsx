import type { ComponentType } from 'react';
import { createBrowserRouter, redirect, type RouteObject } from 'react-router';
import { NotFound, RouteError } from './components/RouteError.tsx';
import { LoadingBlock } from './components/ui/Feedback.tsx';
import RootLayout, { type PageMeta } from './layouts/RootLayout.tsx';
import { registerNavigator } from './lib/navigation.ts';
import { legacyRedirects } from './lib/paths.ts';

/**
 * La tabla de rutas de la app.
 *
 * Cada página es un fragmento aparte que se descarga al entrar (`lazy`); mientras llega en la
 * primera carga se muestra su `LoadingBlock` dentro del layout. Al navegar, la página anterior
 * queda en pantalla hasta que la nueva está lista. El `handle` lleva el título y la descripción
 * que aplica `RootLayout.tsx`.
 */

type PageLoader = () => Promise<{ readonly default: ComponentType }>;

const pageLoaders: PageLoader[] = [];

function page(path: string, load: PageLoader, meta: PageMeta, loading = 'Cargando…'): RouteObject {
  pageLoaders.push(load);
  return {
    path,
    handle: meta,
    lazy: async () => ({ Component: (await load()).default }),
    HydrateFallback: () => <LoadingBlock label={loading} />,
  };
}

/** Una URL anterior a las rutas con parámetros: redirige a la actual (ver `paths.ts`). */
function legacy(path: keyof typeof legacyRedirects): RouteObject {
  return {
    path,
    loader: ({ request }) => redirect(legacyRedirects[path](new URL(request.url).searchParams)),
    HydrateFallback: () => null,
  };
}

const routes: RouteObject[] = [
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    children: [
      {
        // Sin `path`: el límite de errores queda dentro del layout, con la navegación visible.
        ErrorBoundary: RouteError,
        children: [
          page('/', () => import('./pages/HomePage.tsx'), {
            title: 'Cine',
            description: 'Mirá qué hay en cartelera y reservá tus asientos.',
            wide: true,
          }),
          page('/movies', () => import('./pages/MoviesPage.tsx'), {
            title: 'Películas',
            description: 'Buscá en el catálogo por título y género.',
            wide: true,
          }),
          page(
            '/movies/:id',
            () => import('./components/catalogue/MovieDetail.tsx'),
            { title: 'Película', description: 'Detalle de la película y próximas funciones.' },
            'Cargando la película…',
          ),
          page(
            '/screenings/:id/seats',
            () => import('./components/booking/SeatPicker.tsx'),
            {
              title: 'Elegí tus asientos',
              description: 'Elegí tus asientos para esta función.',
              wide: true,
            },
            'Cargando el mapa de asientos…',
          ),
          page(
            '/checkout/:screeningId',
            () => import('./components/booking/Checkout.tsx'),
            {
              title: 'Confirmar reserva',
              description: 'Confirmá tus asientos y tu confitería.',
              wide: true,
            },
            'Preparando tu pedido…',
          ),
          page(
            '/reservations',
            () => import('./pages/MyReservationsPage.tsx'),
            { title: 'Mis reservas', description: 'Tus entradas y tu confitería.' },
            'Cargando tus reservas…',
          ),
          page(
            '/reservations/:id',
            () => import('./components/reservations/ReservationDetail.tsx'),
            { title: 'Reserva', description: 'Detalle de entradas y confitería.' },
            'Cargando la reserva…',
          ),
          page(
            '/account',
            () => import('./pages/AccountPage.tsx'),
            { title: 'Tu cuenta', description: 'Administrá tu perfil y tu contraseña.' },
            'Cargando tu cuenta…',
          ),
          page(
            '/contact',
            () => import('./pages/ContactPage.tsx'),
            {
              title: 'Contacto',
              description: 'Escribinos una consulta, un reclamo o una sugerencia.',
            },
            'Cargando el formulario…',
          ),
          page('/login', () => import('./pages/LoginPage.tsx'), {
            title: 'Iniciar sesión',
            description: 'Iniciá sesión para reservar asientos y gestionar tus reservas.',
          }),
          page('/register', () => import('./pages/RegisterPage.tsx'), {
            title: 'Crear cuenta',
            description: 'Creá una cuenta de Cine para reservar asientos.',
          }),
          page('/privacidad', () => import('./pages/PrivacyPage.tsx'), {
            title: 'Política de privacidad',
            description:
              'Qué datos usa Cine, para qué, dónde se guardan y cómo ejercer tus derechos.',
          }),

          page(
            '/admin/movies',
            () => import('./components/admin/AdminMovies.tsx'),
            {
              title: 'Películas · Admin',
              description: 'Administrá el catálogo de películas.',
              wide: true,
            },
            'Cargando las películas…',
          ),
          page(
            '/admin/rooms',
            () => import('./components/admin/AdminRooms.tsx'),
            { title: 'Salas · Admin', description: 'Administrá las salas.', wide: true },
            'Cargando las salas…',
          ),
          page(
            '/admin/rooms/:id/seats',
            () => import('./components/admin/AdminRoomSeats.tsx'),
            {
              title: 'Distribución de asientos · Admin',
              description: 'Armá la grilla de asientos de una sala.',
              wide: true,
            },
            'Cargando la distribución…',
          ),
          page(
            '/admin/screenings',
            () => import('./components/admin/AdminScreenings.tsx'),
            { title: 'Funciones · Admin', description: 'Programá funciones.', wide: true },
            'Cargando las funciones…',
          ),
          page(
            '/admin/inventory',
            () => import('./components/admin/AdminInventory.tsx'),
            {
              title: 'Confitería · Admin',
              description: 'Administrá el catálogo de confitería.',
              wide: true,
            },
            'Cargando el inventario…',
          ),
          page(
            '/admin/reservations',
            () => import('./components/admin/AdminReservations.tsx'),
            { title: 'Reservas · Admin', description: 'Todas las reservas.', wide: true },
            'Cargando las reservas…',
          ),
          page(
            '/admin/users',
            () => import('./components/admin/AdminUsers.tsx'),
            { title: 'Usuarios · Admin', description: 'Cuentas registradas.', wide: true },
            'Cargando los usuarios…',
          ),
          page(
            '/admin/contact',
            () => import('./components/admin/AdminContactMessages.tsx'),
            {
              title: 'Mensajes · Admin',
              description: 'Mensajes de contacto de los clientes.',
              wide: true,
            },
            'Cargando los mensajes…',
          ),

          // Los segmentos fijos ganan a los dinámicos: `/movies/detail` no es `/movies/:id`.
          legacy('/movies/detail'),
          legacy('/screenings/seats'),
          legacy('/checkout'),
          legacy('/reservations/detail'),
          legacy('/admin/rooms/seats'),

          {
            path: '*',
            Component: NotFound,
            handle: {
              title: 'Página no encontrada',
              description: 'La página que buscás no existe.',
            },
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);

registerNavigator((to, options) => router.navigate(to, options));

function loadAllPages(): void {
  // Un fallo acá no importa: la página se vuelve a pedir (y reintenta) al navegar a ella.
  for (const load of pageLoaders) void load().catch(() => {});
}

/**
 * Descarga en segundo plano el resto de las páginas cuando el navegador queda ocioso, para que
 * la primera visita a cada una no espere la red (el equivalente al prefetch de Astro).
 */
export function preloadPages(): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadAllPages, { timeout: 5000 });
  else setTimeout(loadAllPages, 2000);
}
