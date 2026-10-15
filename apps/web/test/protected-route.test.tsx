import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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

function controllerWith(state: AuthSnapshot): AuthController {
  return {
    getSnapshot: () => state,
    subscribe: () => { return () => {}; },
    revalidate: vi.fn(async () => {})
  } as unknown as AuthController;
}

function renderProtected(state: AuthSnapshot, children: ReactNode = <p>Private account data</p>) {
  return render(
    <AuthProvider controller={controllerWith(state)}>
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
});
