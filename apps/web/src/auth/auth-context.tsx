import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { AuthController, AuthSnapshot } from './auth-controller.js';

export interface AuthContextValue {
  readonly controller: AuthController;
  readonly snapshot: AuthSnapshot;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ controller, children }: { controller: AuthController; children: ReactNode }): React.JSX.Element {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => { void controller.revalidate('bootstrap'); }, [controller]);
  const value = useMemo(() => ({ controller, snapshot }), [controller, snapshot]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
