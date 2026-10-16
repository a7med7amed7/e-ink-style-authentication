import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@easygen/auth-contract';
import type { AuthApi } from '../src/api/auth-api.js';
import { AuthController } from '../src/auth/auth-controller.js';
import { AuthProvider, useAuth } from '../src/auth/auth-context.js';
import { deferred } from './support/deferred.js';

const user: PublicUser = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
};

function Probe(): React.JSX.Element {
  const { snapshot } = useAuth();
  return <output data-testid="auth-state">{snapshot.status}</output>;
}

describe('auth-context:', () => {
  it('observes the stable controller under StrictMode without dispatching POSTs from effects', async () => {
    const identity = deferred<PublicUser>();
    const signup = vi.fn<AuthApi['signup']>();
    const signin = vi.fn<AuthApi['signin']>();
    const me = vi.fn<AuthApi['me']>(() => identity.promise);
    const logout = vi.fn<AuthApi['logout']>();
    const api: AuthApi = {
      signup,
      signin,
      me,
      logout
    };
    const controller = new AuthController(api);

    render(<StrictMode><AuthProvider controller={controller}><Probe /></AuthProvider></StrictMode>);
    expect(screen.getByTestId('auth-state').textContent).toBe('unknown');
    expect(me).toHaveBeenCalled();
    expect(signup).not.toHaveBeenCalled();
    expect(signin).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();

    await act(async () => {
      identity.resolve(user);
      await identity.promise;
    });
    expect(await screen.findByText('authenticated')).toBeTruthy();
    expect(signup).not.toHaveBeenCalled();
    expect(signin).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('revalidates focus and removes the listener when the provider unmounts', async () => {
    const focusRead = deferred<PublicUser>();
    const me = vi.fn<AuthApi['me']>()
      .mockResolvedValueOnce(user)
      .mockReturnValueOnce(focusRead.promise);
    const signup = vi.fn<AuthApi['signup']>();
    const signin = vi.fn<AuthApi['signin']>();
    const logout = vi.fn<AuthApi['logout']>();
    const controller = new AuthController({ signup, signin, me, logout });

    const view = render(<AuthProvider controller={controller}><Probe /></AuthProvider>);
    expect(await screen.findByText('authenticated')).toBeTruthy();
    expect(me).toHaveBeenCalledTimes(1);

    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(me).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().routeTrusted).toBe(false);

    view.unmount();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(me).toHaveBeenCalledTimes(2);
    expect(signup).not.toHaveBeenCalled();
    expect(signin).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();

    await act(async () => {
      focusRead.resolve(user);
      await focusRead.promise;
    });
  });
});
