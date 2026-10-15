import { describe, expect, it, vi } from 'vitest';
import type { ApiError, PublicUser, SigninInput, SignupInput } from '@easygen/auth-contract';
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

const signinInput: SigninInput = {
  email: 'ada@example.test',
  password: 'short'
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

function signinFailure(
  kind: 'rejected' | 'http',
  status: number,
  code: string,
  message: string,
  fields?: ApiError['error']['fields']
): AuthApiError {
  const apiError: ApiError = {
    error: {
      code,
      message,
      requestId: `signin-${String(status)}`,
      ...(fields === undefined ? {} : { fields })
    }
  };
  return new AuthApiError(kind, message, { status, apiError });
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

describe('signin-state:', () => {
  it('signin-state: explicit 401 uses generic credential feedback after anonymous confirmation', async () => {
    const { api, calls } = makeApi();
    calls.signin.mockRejectedValue(signinFailure(
      'rejected', 401, 'INVALID_CREDENTIALS', 'The email address does not exist.'
    ));
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await expect(controller.signin(signinInput)).resolves.toEqual({
      outcome: 'rejected',
      message: 'Invalid email or password.'
    });

    expect(calls.signin).toHaveBeenCalledWith(signinInput);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      routeTrusted: true,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: false,
      message: 'Invalid email or password.'
    });
  });

  it('signin-state: validation and service failures remain distinct from invalid credentials', async () => {
    const validation = makeApi();
    validation.calls.signin.mockRejectedValue(signinFailure(
      'http', 400, 'VALIDATION_ERROR', 'The request is invalid.',
      { email: ['Enter a valid email address.'] }
    ));
    validation.calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const validationController = new AuthController(validation.api);

    await expect(validationController.signin(signinInput)).resolves.toMatchObject({
      outcome: 'rejected',
      message: 'The request is invalid.'
    });
    expect(validationController.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      submissionErrors: { email: ['Enter a valid email address.'] },
      serverOutcomeUncertain: false
    });

    const unavailable = makeApi();
    unavailable.calls.signin.mockRejectedValue(signinFailure(
      'http', 503, 'SERVICE_UNAVAILABLE', 'Service is temporarily unavailable.'
    ));
    unavailable.calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const unavailableController = new AuthController(unavailable.api);

    await expect(unavailableController.signin(signinInput)).resolves.toEqual({
      outcome: 'uncertain',
      message: "We couldn't confirm sign-in. Check session again."
    });
    expect(unavailable.calls.signin).toHaveBeenCalledTimes(1);
    expect(unavailableController.getSnapshot()).toMatchObject({
      status: 'unknown',
      routeTrusted: false,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true
    });
  });

  it('signin-state: confirms only the intended user and does not apply signup password composition', async () => {
    const matched = makeApi();
    matched.calls.signin.mockResolvedValue(user);
    matched.calls.me.mockResolvedValue(user);
    const matchedController = new AuthController(matched.api);

    await expect(matchedController.signin(signinInput)).resolves.toEqual({ outcome: 'confirmed' });
    expect(matched.calls.signin).toHaveBeenCalledWith(signinInput);
    expect(matchedController.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user,
      routeTrusted: true,
      lastOperationOutcome: 'confirmed'
    });

    const mismatched = makeApi();
    mismatched.calls.signin.mockResolvedValue(user);
    mismatched.calls.me.mockResolvedValue({ ...user, id: otherUser.id });
    const mismatchedController = new AuthController(mismatched.api);

    await expect(mismatchedController.signin(signinInput)).resolves.toMatchObject({
      outcome: 'verification-failed'
    });
    expect(mismatchedController.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      routeTrusted: false,
      serverObservation: 'authenticated'
    });
  });

  it('signin-state: a later identity recheck confirms observation without erasing uncertainty', async () => {
    const { api, calls } = makeApi();
    calls.signin.mockRejectedValue(apiFailure('network'));
    calls.me.mockRejectedValueOnce(apiFailure('unauthenticated')).mockResolvedValueOnce(user);
    const controller = new AuthController(api);

    await expect(controller.signin(signinInput)).resolves.toMatchObject({ outcome: 'uncertain' });
    await controller.revalidate('retry');

    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user,
      routeTrusted: true,
      serverObservation: 'authenticated',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain',
      message: "We couldn't confirm sign-in. Check session again."
    });
  });

  it('signin-state: clears stale identity immediately and shares the synchronous mutation lock', async () => {
    const { api, calls } = makeApi();
    const staleRead = deferred<PublicUser>();
    const post = deferred<PublicUser>();
    calls.me.mockResolvedValueOnce(user).mockImplementationOnce(() => staleRead.promise).mockResolvedValue(user);
    calls.signin.mockReturnValue(post.promise);
    const controller = new AuthController(api);

    await controller.revalidate('bootstrap');
    const oldRead = controller.revalidate('retry');
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user, routeTrusted: false });
    const signin = controller.signin(signinInput);
    await expect(controller.signin(signinInput)).resolves.toEqual({ outcome: 'busy' });
    await expect(controller.signup(signupInput)).resolves.toEqual({ outcome: 'busy' });
    staleRead.resolve(otherUser);
    await oldRead;

    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(calls.signup).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticating',
      user: undefined,
      verifiedGeneration: null,
      routeTrusted: false,
      pendingOperation: 'signin'
    });

    post.resolve(user);
    await expect(signin).resolves.toEqual({ outcome: 'confirmed' });
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user });
  });
});

describe('logout-state:', () => {
  it('logout-state: confirms destruction only after acknowledged logout and anonymous identity', async () => {
    const { api, calls } = makeApi();
    const acknowledgment = deferred<undefined>();
    calls.logout.mockReturnValue(acknowledgment.promise);
    calls.me.mockResolvedValueOnce(user).mockRejectedValueOnce(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await controller.revalidate('bootstrap');
    const logout = controller.logout();
    const operationId = controller.getSnapshot().generation;

    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      routeTrusted: false,
      pendingOperation: 'logout',
      logoutDestructionReceipt: null
    });

    acknowledgment.resolve(undefined);
    await expect(logout).resolves.toEqual({ outcome: 'confirmed' });

    expect(calls.me).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      routeTrusted: true,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: false,
      lastOperationOutcome: 'confirmed',
      logoutDestructionReceipt: { operationId }
    });
  });

  it.each([
    ['network rejection', apiFailure('network')],
    ['service unavailable', new AuthApiError('http', 'unavailable', { status: 503 })]
  ] as const)('logout-state: %s plus anonymous identity stays unconfirmed', async (_label, error) => {
    const { api, calls } = makeApi();
    calls.logout.mockRejectedValue(error);
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await expect(controller.logout()).resolves.toMatchObject({ outcome: 'uncertain' });

    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      routeTrusted: false,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain',
      logoutDestructionReceipt: null
    });
  });

  it.each(['authenticated', 'unknown'] as const)(
    'logout-state: a failed request with %s identity remains unknown and hidden',
    async (observation) => {
      const { api, calls } = makeApi();
      calls.logout.mockRejectedValue(new AuthApiError('http', 'unavailable', { status: 503 }));
      if (observation === 'authenticated') calls.me.mockResolvedValue(user);
      else calls.me.mockRejectedValue(apiFailure('malformed'));
      const controller = new AuthController(api);

      await expect(controller.logout()).resolves.toMatchObject({ outcome: 'uncertain' });

      expect(controller.getSnapshot()).toMatchObject({
        status: 'unknown',
        user: undefined,
        routeTrusted: false,
        serverObservation: observation,
        serverOutcomeUncertain: true,
        logoutDestructionReceipt: null
      });
    }
  );

  it('logout-state: 401 followed by anonymous identity reports already anonymous without a receipt', async () => {
    const { api, calls } = makeApi();
    calls.logout.mockRejectedValue(apiFailure('unauthenticated'));
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await expect(controller.logout()).resolves.toEqual({ outcome: 'already-anonymous' });

    expect(controller.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      routeTrusted: true,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: false,
      lastOperationOutcome: 'already-anonymous',
      logoutDestructionReceipt: null
    });
  });

  it.each(['authenticated', 'failed'] as const)(
    'logout-state: acknowledged destruction followed by %s identity stays unknown',
    async (observation) => {
      const { api, calls } = makeApi();
      calls.logout.mockResolvedValue(undefined);
      if (observation === 'authenticated') calls.me.mockResolvedValue(user);
      else calls.me.mockRejectedValue(apiFailure('malformed'));
      const controller = new AuthController(api);

      await expect(controller.logout()).resolves.toMatchObject({ outcome: 'verification-failed' });

      expect(controller.getSnapshot()).toMatchObject({
        status: 'unknown',
        user: undefined,
        routeTrusted: false,
        serverObservation: observation === 'authenticated' ? 'authenticated' : 'unknown',
        serverOutcomeUncertain: false,
        logoutDestructionReceipt: null
      });
    }
  );

  it('logout-state: a later anonymous recheck does not backfill a destruction receipt', async () => {
    const { api, calls } = makeApi();
    calls.logout.mockRejectedValue(apiFailure('network'));
    calls.me.mockRejectedValue(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await expect(controller.logout()).resolves.toMatchObject({ outcome: 'uncertain' });
    await controller.revalidate('retry');

    expect(controller.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      routeTrusted: true,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain',
      logoutDestructionReceipt: null
    });
  });

  it('logout-state: shares the synchronous mutation lock and ignores stale reads', async () => {
    const { api, calls } = makeApi();
    const staleRead = deferred<PublicUser>();
    const acknowledgment = deferred<undefined>();
    calls.logout.mockReturnValue(acknowledgment.promise);
    calls.me.mockResolvedValueOnce(user).mockImplementationOnce(() => staleRead.promise)
      .mockRejectedValueOnce(apiFailure('unauthenticated'));
    const controller = new AuthController(api);

    await controller.revalidate('bootstrap');
    const oldRead = controller.revalidate('retry');
    const logout = controller.logout();

    await expect(controller.signup(signupInput)).resolves.toEqual({ outcome: 'busy' });
    await expect(controller.signin(signinInput)).resolves.toEqual({ outcome: 'busy' });
    staleRead.resolve(otherUser);
    await oldRead;
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      pendingOperation: 'logout',
      routeTrusted: false
    });

    acknowledgment.resolve(undefined);
    await expect(logout).resolves.toEqual({ outcome: 'confirmed' });
    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(calls.signup).not.toHaveBeenCalled();
    expect(calls.signin).not.toHaveBeenCalled();
  });
});
