import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-context.js';

export interface ProtectedRouteProps {
  readonly children?: ReactNode;
  readonly fallback?: ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps): React.JSX.Element {
  const { controller, snapshot } = useAuth();
  const verified = snapshot.status === 'authenticated'
    && snapshot.user !== undefined
    && snapshot.verifiedGeneration === snapshot.generation
    && snapshot.routeTrusted;
  if (verified) return <>{children ?? <Outlet />}</>;
  if (snapshot.status === 'unauthenticated' && snapshot.routeTrusted) {
    return <Navigate to="/signin" replace />;
  }
  const pendingText = snapshot.pendingOperation === 'logout' ? 'Signing out…' : 'Checking your session…';
  const canRecheck = snapshot.status === 'unknown' && snapshot.pendingOperation === null
    && snapshot.message !== undefined;
  return <>{fallback ?? <section>
    <p role="status">{pendingText}</p>
    {snapshot.message === undefined ? null : <p role="alert">{snapshot.message}</p>}
    {canRecheck ? <button type="button" onClick={() => { void controller.revalidate('retry'); }}>Check session</button> : null}
  </section>}</>;
}
