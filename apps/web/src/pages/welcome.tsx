import { useAuth } from '../auth/auth-context.js';

export function WelcomePage(): React.JSX.Element {
  const { controller, snapshot } = useAuth();
  const logoutPending = snapshot.pendingOperation === 'logout';
  return <main>
    <h1>Welcome to the application.</h1>
    <button type="button" disabled={logoutPending} onClick={() => { void controller.logout(); }}>
      {logoutPending ? 'Signing out…' : 'Sign out'}
    </button>
  </main>;
}
