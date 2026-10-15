import { describe, expect, it, vi } from 'vitest';
import type { PublicUser, SignupInput } from '@easygen/auth-contract';
import { AuthApiError, type AuthApi } from '../src/api/auth-api.js';
import { AuthController } from '../src/auth/auth-controller.js';
import { deferred } from './support/deferred.js';

const user: PublicUser = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
};

const otherUser: PublicUser = {
  id: '1123456789abcdef01234567',
  email: 'other@example.test',
  name: 'Other User'
};

const signupInput: SignupInput = {
  email: 'ada@example.test',
  name: 'Ada Example',
  password: 'N0tARealPassword!'
};

function makeApi() {
  const calls = {
    signup: vi.fn<AuthApi['signup']>(),
    signin: vi.fn<AuthApi['signin']>(),
    me: vi.fn<AuthApi['me']>(),
    logout: vi.fn<AuthApi['logout']>()
  };
  const api: AuthApi = { ...calls };
  return { api, calls };
}

function apiFailure(kind: 'unauthenticated' | 'network' | 'malformed' | 'rejected'): AuthApiError {
  return kind === 'unauthenticated'
    ? new AuthApiError(kind, kind, { status: 401 })
    : new AuthApiError(kind, kind);
}

describe('signup-state:', () => {
  it('signup-state: bootstrap starts unknown and accepts a verified identity', async () => {
    const { api, calls } = makeApi();
    const me = deferred<PublicUser>();
    calls.me.mockReturnValue(me.promise);
    const controller = new AuthController(api);

    const initial = controller.getSnapshot();
    expect(initial).toBe(controller.getSnapshot());
    expect(initial).toMatchObject({
      status: 'unknown',
      generation: 0,
      verifiedGeneration: null,
      latestReadId: 0,
      routeTrusted: false
    });
    expect(calls.me).not.toHaveBeenCalled();

    const checking = controller.revalidate('bootstrap');
    expect(calls.me).toHaveBeenCalledTimes(1);
    me.resolve(user);
    await checking;

    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user,
      verifiedGeneration: controller.getSnapshot().generation,
      routeTrusted: true,
      serverObservation: 'authenticated'
    });
  });

  it('signup-state: bootstrap 401 records anonymity', async () => {
    const { api, calls } = makeApi();
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await controller.revalidate('bootstrap');

    expect(controller.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      verifiedGeneration: null,
      routeTrusted: true,
      serverObservation: 'anonymous'
    });
  });

  it('signup-state: duplicate submission is blocked synchronously and matching identity confirms signup', async () => {
    const { api, calls } = makeApi();
    const post = deferred<PublicUser>();
    calls.signup.mockReturnValue(post.promise);
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);

    const first = controller.signup(signupInput);
    const second = await controller.signup(signupInput);

    expect(calls.signup).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticating',
      pendingOperation: 'signup'
    });
    expect(second).toEqual({ outcome: 'busy' });

    post.resolve(user);
    await expect(first).resolves.toMatchObject({ outcome: 'confirmed' });
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain(signupInput.password);
  });

  it('signup-state: does not confirm signup when identity reconciliation returns another account', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockResolvedValue(user);
    calls.me.mockResolvedValue(otherUser);
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toMatchObject({
      outcome: 'verification-failed'
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      serverObservation: 'authenticated'
    });
  });

  it('signup-state: failed reconciliation after a successful signup stays unknown', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockResolvedValue(user);
    calls.me.mockRejectedValue(apiFailure('malformed'));
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toMatchObject({
      outcome: 'verification-failed'
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      serverObservation: 'unknown'
    });
  });

  it('signup-state: rejected transport reconciles a matching identity without claiming POST success', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockRejectedValue(apiFailure('network'));
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toEqual({
      outcome: 'uncertain',
      message: 'Session verified'
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user,
      serverOutcomeUncertain: true
    });
  });

  it('signup-state: rejected transport plus an anonymous observation remains unknown', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockRejectedValue(apiFailure('network'));
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toMatchObject({
      outcome: 'uncertain'
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true
    });
  });

  it.each(['success', 'unauthenticated', 'failure'] as const)(
    'signup-state: ignores a stale %s identity-read completion after signup intent',
    async (completion) => {
      const { api, calls } = makeApi();
      const staleRead = deferred<PublicUser>();
      const post = deferred<PublicUser>();
      calls.me.mockImplementationOnce(() => staleRead.promise).mockResolvedValue(user);
      calls.signup.mockReturnValue(post.promise);
      const controller = new AuthController(api);
      const oldRead = controller.revalidate('bootstrap');
      const signup = controller.signup(signupInput);

      if (completion === 'success') staleRead.resolve(otherUser);
      else staleRead.reject(apiFailure(completion === 'unauthenticated' ? 'unauthenticated' : 'malformed'));
      await oldRead;
      expect(controller.getSnapshot()).toMatchObject({
        status: 'authenticating',
        pendingOperation: 'signup',
        user: undefined
      });

      post.resolve(user);
      await expect(signup).resolves.toMatchObject({ outcome: 'confirmed' });
      expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    }
  );

  it('signup-state: successful POST followed by anonymous identity stays unknown', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockResolvedValue(user);
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toMatchObject({
      outcome: 'verification-failed'
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      serverObservation: 'anonymous',
      lastOperationOutcome: 'verification-failed'
    });
  });

  it('signup-state: publishes copied and frozen field-error arrays', async () => {
    const { api, calls } = makeApi();
    const fields = { email: ['Enter a valid email address.'] };
    calls.signup.mockRejectedValue(new AuthApiError('http', 'Check the submitted fields.', {
      status: 400,
      apiError: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the submitted fields.',
          requestId: 'req-1',
          fields
        }
      }
    }));
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await controller.signup(signupInput);

    const snapshot = controller.getSnapshot();
    const publishedEmailErrors = snapshot.submissionErrors.email;
    expect(Object.isFrozen(snapshot.submissionErrors)).toBe(true);
    expect(Object.isFrozen(publishedEmailErrors)).toBe(true);
    expect(publishedEmailErrors).toEqual(['Enter a valid email address.']);

    fields.email.push('Changed after publication.');
    expect(snapshot.submissionErrors.email).toEqual(['Enter a valid email address.']);
  });
});
