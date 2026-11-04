/**
 * Navegación del lado del cliente para el código que vive fuera de los componentes.
 *
 * `auth-store.ts` necesita mandar a `/login` cuando la sesión se cae, pero importar el router
 * desde `src/lib` armaría un ciclo (el router importa las páginas, y estas el store). El router
 * se registra acá al arrancar (`src/router.tsx`); hasta entonces, y en las pruebas de Node, se
 * recurre a una navegación completa del navegador.
 */

export interface NavigateOptions {
  /** Reemplaza la entrada actual del historial en lugar de agregar una. */
  readonly replace?: boolean;
}

export type Navigator = (to: string, options?: NavigateOptions) => Promise<void>;

let navigator: Navigator | null = null;

export function registerNavigator(next: Navigator): void {
  navigator = next;
}

export function navigate(to: string, options: NavigateOptions = {}): Promise<void> {
  if (navigator) return navigator(to, options);
  if (typeof window !== 'undefined') {
    if (options.replace) window.location.replace(to);
    else window.location.assign(to);
  }
  return Promise.resolve();
}
