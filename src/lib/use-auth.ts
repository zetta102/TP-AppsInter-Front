import { useEffect, useSyncExternalStore } from 'react';
import {
  clearSession,
  getAuthState,
  initAuth,
  login,
  logout,
  register,
  setUser,
  subscribeAuth,
  type AuthState,
} from './auth-store.ts';
import type { LoginRequest, RegisterRequest, User } from './types.ts';
import { Role } from './enums.ts';

/**
 * Bindings de React 19 sobre el store de autenticación (que no depende de ningún framework).
 *
 * Las islas se hidratan por separado, así que no existe una raíz de React común que envolver
 * con un provider: `useAuth()` lee el store directamente con `useSyncExternalStore`.
 */

export interface AuthContextValue extends AuthState {
  readonly isAuthenticated: boolean;
  /** Sale de `GET /api/users/me`, nunca de decodificar el JWT. */
  readonly isAdmin: boolean;
  readonly login: (credentials: LoginRequest) => Promise<User>;
  readonly register: (payload: RegisterRequest) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly clear: () => void;
  /** Aplica un perfil recién actualizado sin volver a pedir `/me`. */
  readonly setUser: (user: User) => void;
}

const serverSnapshot: AuthState = { tokens: null, user: null, ready: false };

/** Acciones del store: funciones de módulo, con identidad estable sin necesidad de memoizar. */
const actions = { login, register, logout, clear: clearSession, setUser } as const;

/** Se suscribe al store y dispara la restauración de la sesión una sola vez. */
export function useAuth(): AuthContextValue {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthState, () => serverSnapshot);

  useEffect(() => {
    void initAuth();
  }, []);

  return {
    ...snapshot,
    isAuthenticated: snapshot.tokens !== null,
    isAdmin: snapshot.user?.role === Role.ADMIN,
    ...actions,
  };
}
