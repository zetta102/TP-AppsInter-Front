import { createContext, use, useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  clearSession,
  getAuthState,
  initAuth,
  login as storeLogin,
  logout as storeLogout,
  register as storeRegister,
  setUser as storeSetUser,
  subscribeAuth,
  type AuthState,
} from './auth-store.ts';
import type { LoginRequest, RegisterRequest, UserResponse } from './types.ts';
import { Role } from './enums.ts';

/**
 * React 19 bindings over the framework-free auth store.
 *
 * Islands hydrate independently, so there is no single React root to wrap.
 * `useAuth()` therefore reads the store directly through
 * `useSyncExternalStore`, and the context exists only so a subtree (or a test)
 * can override the value.
 */

export interface AuthContextValue extends AuthState {
  readonly isAuthenticated: boolean;
  readonly isAdmin: boolean;
  readonly login: (credentials: LoginRequest) => Promise<UserResponse>;
  readonly register: (payload: RegisterRequest) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly clear: () => void;
  /** Applies a freshly updated profile without a round trip through `/me`. */
  readonly setUser: (user: UserResponse) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const serverSnapshot: AuthState = { tokens: null, user: null, ready: false };

/** Subscribes to the store and kicks off session restoration once. */
export function useAuthSnapshot(): AuthState {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthState, () => serverSnapshot);

  useEffect(() => {
    void initAuth();
  }, []);

  return snapshot;
}

function useStoreBackedValue(): AuthContextValue {
  const snapshot = useAuthSnapshot();

  const login = useCallback((credentials: LoginRequest) => storeLogin(credentials), []);
  const register = useCallback((payload: RegisterRequest) => storeRegister(payload), []);
  const logout = useCallback(() => storeLogout(), []);
  const clear = useCallback(() => clearSession(), []);
  const setUser = useCallback((user: UserResponse) => storeSetUser(user), []);

  return {
    ...snapshot,
    isAuthenticated: snapshot.tokens !== null,
    isAdmin: snapshot.user?.role === Role.ADMIN,
    login,
    register,
    logout,
    clear,
    setUser,
  };
}

/** Optional provider. React 19 renders context directly — no `.Provider`. */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const value = useStoreBackedValue();
  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Reads the injected context when present, otherwise the global store. */
export function useAuth(): AuthContextValue {
  const injected = use(AuthContext);
  const fromStore = useStoreBackedValue();
  return injected ?? fromStore;
}
