import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@easygen/auth-contract';
import type { AuthSnapshot, AuthController } from '../src/auth/auth-controller.js';
import { AuthProvider } from '../src/auth/auth-context.js';
import { ProtectedRoute } from '../src/auth/protected-route.js';

const user: PublicUser = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
};

function snapshot(overrides: Partial<AuthSnapshot> = {}): AuthSnapshot {
  return {
    status: 'unknown', generation: 0, verifiedGeneration: null,
    latestReadId: 0, routeTrusted: false, pendingOperation: null, queuedLogout: false,
    slow: false, submissionErrors: {}, lastOperationOutcome: null,
    serverObservation: 'unknown', serverOutcomeUncertain: false, logoutDestructionReceipt: null,
    ...overrides
  };
}

function controllerWith(state: AuthSnapshot, revalidate = vi.fn(async () => {})): AuthController {
  return {
    getSnapshot: () => state,
    subscribe: () => { return () => {}; },
    revalidate
  } as unknown as AuthController;
}

function renderProtected(
  state: AuthSnapshot,
  children: ReactNode = <p>Private account data</p>,
  controller = controllerWith(state)
) {
  return render(
    <AuthProvider controller={controller}>
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<ProtectedRoute>{children}</ProtectedRoute>} />
          <Route path="/signin" element={<p>Sign in destination</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('protected-route:', () => {
  afterEach(() => { cleanup(); });

  it.each([
    ['unknown', snapshot()],
    ['authenticating', snapshot({ status: 'authenticating', generation: 1 })],
    ['stale generation', snapshot({ status: 'authenticated', user, generation: 2, verifiedGeneration: 1, routeTrusted: true })],
    ['untrusted route', snapshot({ status: 'authenticated', user, generation: 2, verifiedGeneration: 2, routeTrusted: false })]
  ])('hides protected content for %s identity', (_label, state) => {
    renderProtected(state);
    expect(screen.queryByText('Private account data')).toBeNull();
  });

  it('renders children only for an authenticated, current, trusted snapshot', () => {
    renderProtected(snapshot({
      status: 'authenticated', user, generation: 4, verifiedGeneration: 4, routeTrusted: true
    }));
    expect(screen.getByText('Private account data')).toBeTruthy();
  });

  it('redirects an observed anonymous snapshot to the signin destination', () => {
    renderProtected(snapshot({ status: 'unauthenticated', routeTrusted: true }));
    expect(screen.getByText('Sign in destination')).toBeTruthy();
    expect(screen.queryByText('Private account data')).toBeNull();
  });

  it('keeps protected content hidden and announces a pending logout', () => {
    renderProtected(snapshot({ status: 'unknown', generation: 2, pendingOperation: 'logout' }));
    expect(screen.getByRole('status').textContent).toMatch(/signing out/i);
    expect(screen.queryByText('Private account data')).toBeNull();
  });

  it('shows safe uncertain logout feedback and offers a session recheck without confirming destruction', async () => {
    const userAction = userEvent.setup();
    const state = snapshot({
      status: 'unknown', generation: 2, pendingOperation: null,
      message: "We couldn't confirm sign-out. Check your session again.",
      lastOperationOutcome: 'uncertain', serverObservation: 'anonymous', serverOutcomeUncertain: true
    });
    const revalidate = vi.fn(async () => {});
    renderProtected(state, <p>Private account data</p>, controllerWith(state, revalidate));

    expect(screen.getByRole('alert').textContent).toBe(state.message);
    expect(screen.getByRole('button', { name: 'Check session' })).toBeTruthy();
    expect(screen.queryByText('Private account data')).toBeNull();

    revalidate.mockClear();
    await userAction.click(screen.getByRole('button', { name: 'Check session' }));
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledWith('retry');
    expect(state.logoutDestructionReceipt).toBeNull();
    expect(screen.queryByText('Private account data')).toBeNull();
  });
});
