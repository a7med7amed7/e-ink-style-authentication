import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, type RouteObject } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser, SignupInput } from '@easygen/auth-contract';
import type { AuthApi } from '../src/api/auth-api.js';
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
});
