import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthApi } from '../src/api/auth-api.js';
import { AuthApiError } from '../src/api/auth-api.js';
import type { AuthSnapshot } from '../src/auth/auth-controller.js';
import { AuthController } from '../src/auth/auth-controller.js';
import { AuthStatus } from '../src/components/auth-status.js';

const user = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
};

function makeApi() {
  const calls = {
    signup: vi.fn<AuthApi['signup']>(),
    signin: vi.fn<AuthApi['signin']>(),
    me: vi.fn<AuthApi['me']>(),
    logout: vi.fn<AuthApi['logout']>()
  };
  return { api: { ...calls } satisfies AuthApi, calls };
}

function anonymous(): AuthApiError {
  return new AuthApiError('unauthenticated', 'Authentication is required.', { status: 401 });
}

function withSnapshot(overrides: Partial<AuthSnapshot>): AuthSnapshot {
  const { api } = makeApi();
  return { ...new AuthController(api).getSnapshot(), ...overrides };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

afterEach(() => { cleanup(); });

describe('auth-status:', () => {
  it('announces that signout is queued while the current signin remains unsettled', () => {
    const snapshot = withSnapshot({
      status: 'authenticating', pendingOperation: 'signin', queuedLogout: true, slow: true
    });

    render(<AuthStatus snapshot={snapshot} onCheckSession={async () => {}} />);

    expect(screen.getByRole('status').textContent).toMatch(/still verifying sign-in/i);
    expect(screen.getByRole('status').textContent).toMatch(/sign-out is queued/i);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /check session/i })).toBeNull();
  });

  it('announces a slow pending signin without offering a retry or implying failure', () => {
    const snapshot = withSnapshot({ status: 'authenticating', pendingOperation: 'signin', slow: true });

    render(<AuthStatus snapshot={snapshot} onCheckSession={async () => {}} />);

    expect(screen.getByRole('status').textContent).toMatch(/still verifying/i);
    expect(screen.getByRole('status').textContent).toMatch(/sign-in/i);
    expect(screen.queryByRole('button', { name: /check session/i })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the current signin while an older session check is still pending', async () => {
    const userEvents = userEvent.setup();
    const oldCheck = deferred<undefined>();
    const view = render(<AuthStatus
      snapshot={withSnapshot({ status: 'unknown', generation: 0 })}
      onCheckSession={() => oldCheck.promise}
    />);

    await userEvents.click(screen.getByRole('button', { name: /check session/i }));
    expect(screen.getByRole('status').textContent).toMatch(/checking your session/i);

    view.rerender(<AuthStatus
      snapshot={withSnapshot({ status: 'authenticating', generation: 1, pendingOperation: 'signin' })}
      onCheckSession={() => oldCheck.promise}
    />);

    expect(screen.getByRole('status').textContent).toMatch(/sign-in is in progress/i);
    expect(screen.getByRole('status').textContent).not.toMatch(/checking your session/i);
  });

  it('does not let an older check completion clear a newer check indicator', async () => {
    const userEvents = userEvent.setup();
    const oldCheck = deferred<undefined>();
    const newCheck = deferred<undefined>();
    const checkSession = vi.fn()
      .mockReturnValueOnce(oldCheck.promise)
      .mockReturnValueOnce(newCheck.promise);
    const view = render(<AuthStatus
      snapshot={withSnapshot({ status: 'unknown', generation: 0 })}
      onCheckSession={checkSession}
    />);

    await userEvents.click(screen.getByRole('button', { name: /check session/i }));
    view.rerender(<AuthStatus
      snapshot={withSnapshot({ status: 'unknown', generation: 1, serverOutcomeUncertain: true })}
      onCheckSession={checkSession}
    />);
    const retryButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Check session' });
    expect(retryButton.disabled).toBe(false);
    await userEvents.click(retryButton);

    await act(async () => {
      oldCheck.resolve(undefined);
      await oldCheck.promise;
    });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /checking session/i }).disabled).toBe(true);
    expect(checkSession).toHaveBeenCalledTimes(2);
  });

  it('offers a GET-only session check while keeping an unacknowledged logout distinct from confirmed signout', async () => {
    const userEvents = userEvent.setup();
    const { api, calls } = makeApi();
    calls.logout.mockRejectedValue(new AuthApiError('http', 'The store is unavailable.', { status: 503 }));
    calls.me.mockRejectedValue(anonymous());
    const controller = new AuthController(api);

    await expect(controller.logout()).resolves.toMatchObject({ outcome: 'uncertain' });
    const checkSession = vi.fn(() => controller.revalidate('retry'));
    render(<AuthStatus snapshot={controller.getSnapshot()} onCheckSession={checkSession} />);

    expect(screen.getByRole('status').textContent).toMatch(/couldn't confirm sign-out/i);
    expect(screen.getByRole('status').textContent).toMatch(/no session is currently observed/i);
    expect(screen.getByRole('status').textContent).toMatch(/may still complete/i);
    expect(screen.getByRole('status').textContent).not.toMatch(/check your session before trying again/i);
    expect(screen.queryByText(/signed out successfully|sign-out confirmed|logout confirmed/i)).toBeNull();
    expect(controller.getSnapshot().logoutDestructionReceipt).toBeNull();

    await userEvents.click(screen.getByRole('button', { name: /check session/i }));

    expect(checkSession).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(2);
    expect(calls.signup).not.toHaveBeenCalled();
    expect(calls.signin).not.toHaveBeenCalled();
    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      serverOutcomeUncertain: true,
      serverObservation: 'anonymous',
      logoutDestructionReceipt: null
    });
  });

  it('retains earlier request uncertainty after a later check observes the signed-in user', async () => {
    const userEvents = userEvent.setup();
    const { api, calls } = makeApi();
    calls.signup.mockRejectedValue(new AuthApiError('network', 'The request could not be completed.'));
    calls.me.mockRejectedValueOnce(anonymous()).mockResolvedValueOnce(user);
    const controller = new AuthController(api);
    await controller.signup({ name: user.name, email: user.email, password: 'N0tARealPassword!' });

    const checkSession = vi.fn(() => controller.revalidate('retry'));
    const view = render(<AuthStatus snapshot={controller.getSnapshot()} onCheckSession={checkSession} />);
    expect(screen.getByRole('status').textContent).toMatch(/earlier request may still complete/i);

    await userEvents.click(screen.getByRole('button', { name: /check session/i }));
    await waitFor(() => { expect(calls.me).toHaveBeenCalledTimes(2); });
    view.rerender(<AuthStatus snapshot={controller.getSnapshot()} onCheckSession={checkSession} />);

    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticated',
      serverObservation: 'authenticated',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain'
    });
    expect(screen.getByRole('status').textContent).toMatch(/session verified/i);
    expect(screen.getByRole('status').textContent).toMatch(/earlier request may still complete/i);
  });
});
