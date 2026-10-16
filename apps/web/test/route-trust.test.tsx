import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, type RouteObject } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser, SignupInput } from '@easygen/auth-contract';
import { AuthApiError, type AuthApi } from '../src/api/auth-api.js';
import { AuthController } from '../src/auth/auth-controller.js';
import { AuthProvider } from '../src/auth/auth-context.js';
import { ProtectedRoute } from '../src/auth/protected-route.js';
import { deferred } from './support/deferred.js';

const user: PublicUser = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
};

function apiWith(overrides: Partial<AuthApi> = {}) {
  const signup = overrides.signup ?? vi.fn<AuthApi['signup']>();
  const signin = overrides.signin ?? vi.fn<AuthApi['signin']>();
  const me = overrides.me ?? vi.fn<AuthApi['me']>().mockResolvedValue(user);
  const logout = overrides.logout ?? vi.fn<AuthApi['logout']>();
  return { api: { signup, signin, me, logout }, signup, signin, me, logout };
}

function ProtectedProbe(): React.JSX.Element {
  return <p>Private account data</p>;
}

function ProtectedApp({ controller }: { controller: AuthController }): React.JSX.Element {
  return <AuthProvider controller={controller}>
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<ProtectedRoute><ProtectedProbe /></ProtectedRoute>} />
        <Route path="/signin" element={<p>Sign in destination</p>} />
      </Routes>
    </MemoryRouter>
  </AuthProvider>;
}

describe('route-trust:', () => {
  afterEach(() => { cleanup(); });

  it('invalidates current protected rendering synchronously when the tab regains focus', async () => {
    const focusRead = deferred<PublicUser>();
    const { api, me } = apiWith({
      me: vi.fn<AuthApi['me']>()
        .mockResolvedValueOnce(user)
        .mockReturnValueOnce(focusRead.promise)
    });
    const controller = new AuthController(api);
    render(<ProtectedApp controller={controller} />);
    expect(await screen.findByText('Private account data')).toBeTruthy();

    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(screen.queryByText('Private account data')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/checking your session/i);
    expect(me).toHaveBeenCalledTimes(2);

    await act(async () => {
      focusRead.resolve(user);
      await focusRead.promise;
    });
    expect(await screen.findByText('Private account data')).toBeTruthy();
  });

  it('invalidates trusted identity before a relevant navigation can render a protected route', async () => {
    const routerModule = await import('../src/router.js') as unknown as {
      createAppRoutes?: (controller: AuthController) => RouteObject[];
    };
    expect(routerModule.createAppRoutes).toBeDefined();
    if (routerModule.createAppRoutes === undefined) return;
    const navigationRead = deferred<PublicUser>();
    const { api, me } = apiWith({
      me: vi.fn<AuthApi['me']>()
        .mockResolvedValueOnce(user)
        .mockReturnValueOnce(navigationRead.promise)
    });
    const controller = new AuthController(api);
    const router = createMemoryRouter(routerModule.createAppRoutes(controller), { initialEntries: ['/signup'] });
    render(<AuthProvider controller={controller}><RouterProvider router={router} /></AuthProvider>);
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();
    await waitFor(() => { expect(me).toHaveBeenCalledTimes(1); });

    let navigationPromise!: Promise<void>;
    await act(async () => {
      navigationPromise = router.navigate('/app');
      await Promise.resolve();
    });

    expect(me).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Welcome to the application.' })).toBeNull();

    await act(async () => {
      navigationRead.resolve(user);
      await navigationPromise;
    });
    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
  });

  it('coalesces a focus recheck with signup’s post-operation identity read', async () => {
    const signupResponse = deferred<PublicUser>();
    const reconciliation = deferred<PublicUser>();
    const { api, me, signup } = apiWith({
      signup: vi.fn<AuthApi['signup']>(() => signupResponse.promise),
      me: vi.fn<AuthApi['me']>()
        .mockResolvedValueOnce(user)
        .mockReturnValueOnce(reconciliation.promise)
    });
    const controller = new AuthController(api);
    const revalidate = vi.spyOn(controller, 'revalidate');
    render(<ProtectedApp controller={controller} />);
    expect(await screen.findByText('Private account data')).toBeTruthy();
    revalidate.mockClear();

    const signupInput: SignupInput = {
      name: 'Ada Example', email: 'ada@example.test', password: 'correct-horse-42!'
    };
    let signupOperation!: Promise<unknown>;
    act(() => { signupOperation = controller.signup(signupInput); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(me).toHaveBeenCalledTimes(1);
    expect(signup).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledWith('focus');

    await act(async () => {
      signupResponse.resolve(user);
      await Promise.resolve();
    });
    expect(me).toHaveBeenCalledTimes(2);

    await act(async () => {
      reconciliation.resolve(user);
      await signupOperation;
    });
    await act(async () => { await Promise.resolve(); });
    expect(me).toHaveBeenCalledTimes(2);
    expect(signup).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Private account data')).toBeTruthy();
  });

  it('keeps StrictMode bootstrap and focus effects read-only', async () => {
    const me = vi.fn<AuthApi['me']>().mockResolvedValue(user);
    const { api, signup, signin, logout } = apiWith({ me });
    const controller = new AuthController(api);
    render(<StrictMode><ProtectedApp controller={controller} /></StrictMode>);
    expect(await screen.findByText('Private account data')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(signup).not.toHaveBeenCalled();
    expect(signin).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('offers a session recheck after a failed bootstrap and renders recovered identity', async () => {
    const userAction = userEvent.setup();
    const { api, me, signup, signin, logout } = apiWith({
      me: vi.fn<AuthApi['me']>()
        .mockRejectedValueOnce(new AuthApiError('http', 'Service unavailable.', { status: 503 }))
        .mockResolvedValue(user)
    });
    const controller = new AuthController(api);
    render(<ProtectedApp controller={controller} />);

    const retry = await screen.findByRole('button', { name: 'Check session' });
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't verify your session/i);
    expect(screen.queryByText('Private account data')).toBeNull();

    await userAction.click(retry);
    expect(await screen.findByText('Private account data')).toBeTruthy();
    expect(me).toHaveBeenCalledTimes(2);
    expect(signup).not.toHaveBeenCalled();
    expect(signin).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('lets a session recheck after bootstrap failure confirm anonymity', async () => {
    const userAction = userEvent.setup();
    const { api, me } = apiWith({
      me: vi.fn<AuthApi['me']>()
        .mockRejectedValueOnce(new AuthApiError('network', 'The read failed.'))
        .mockRejectedValueOnce(new AuthApiError('unauthenticated', 'Session absent.', { status: 401 }))
    });
    render(<ProtectedApp controller={new AuthController(api)} />);

    await userAction.click(await screen.findByRole('button', { name: 'Check session' }));
    expect(await screen.findByText('Sign in destination')).toBeTruthy();
    expect(screen.queryByText('Private account data')).toBeNull();
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale failed bootstrap read after a newer identity check succeeds', async () => {
    const staleRead = deferred<PublicUser>();
    const currentRead = deferred<PublicUser>();
    const { api, me } = apiWith({
      me: vi.fn<AuthApi['me']>()
        .mockReturnValueOnce(staleRead.promise)
        .mockReturnValueOnce(currentRead.promise)
    });
    render(<ProtectedApp controller={new AuthController(api)} />);
    await waitFor(() => { expect(me).toHaveBeenCalledTimes(1); });

    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => { expect(me).toHaveBeenCalledTimes(2); });
    await act(async () => {
      currentRead.resolve(user);
      await currentRead.promise;
    });
    expect(await screen.findByText('Private account data')).toBeTruthy();

    await act(async () => {
      staleRead.reject(new AuthApiError('http', 'Stale service failure.', { status: 503 }));
      await staleRead.promise.catch(() => undefined);
    });
    expect(screen.getByText('Private account data')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check session' })).toBeNull();
  });

  it('preserves uncertain operation feedback when a later session check also fails', async () => {
    const { api, me, signup } = apiWith({
      signup: vi.fn<AuthApi['signup']>().mockRejectedValue(new AuthApiError('network', 'Request failed.')),
      me: vi.fn<AuthApi['me']>().mockRejectedValue(new AuthApiError('network', 'Session check failed.'))
    });
    const controller = new AuthController(api);
    const input: SignupInput = { name: user.name, email: user.email, password: 'correct-horse-42!' };

    await expect(controller.signup(input)).resolves.toMatchObject({ outcome: 'uncertain' });
    const operationMessage = controller.getSnapshot().message;
    expect(operationMessage).toBe("We couldn't confirm sign-up. Check session again.");

    await controller.revalidate('retry');

    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown', routeTrusted: false, serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain', message: operationMessage
    });
    expect(signup).toHaveBeenCalledTimes(1);
    expect(me).toHaveBeenCalledTimes(2);
  });
});
