import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-context.js';

export interface ProtectedRouteProps {
  readonly children?: ReactNode;
  readonly fallback?: ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps): React.JSX.Element {
  const { snapshot } = useAuth();
  const verified = snapshot.status === 'authenticated'
    && snapshot.user !== undefined
    && snapshot.verifiedGeneration === snapshot.generation
    && snapshot.routeTrusted;
  if (verified) return <>{children ?? <Outlet />}</>;
  if (snapshot.status === 'unauthenticated' && snapshot.routeTrusted) {
    return <Navigate to="/signin" replace />;
  }
  return <>{fallback ?? <p role="status">Checking your session…</p>}</>;
}
