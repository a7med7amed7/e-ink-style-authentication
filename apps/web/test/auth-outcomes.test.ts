import { describe, expect, it, vi } from 'vitest';
import type { ApiError, PublicUser, SigninInput, SignupInput } from '@easygen/auth-contract';
import { AuthApiError, type AuthApi } from '../src/api/auth-api.js';
import { AuthController } from '../src/auth/auth-controller.js';

const user: PublicUser = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
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
  return { api: { ...calls } satisfies AuthApi, calls };
}

function anonymous(): AuthApiError {
  return new AuthApiError('unauthenticated', 'Authentication is required.', { status: 401 });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  kind: AuthApiError['kind'] = 'http'
): AuthApiError {
  const apiError: ApiError = {
    error: { code, message, requestId: `outcome-${String(status)}` }
  };
  return new AuthApiError(kind, message, { status, apiError });
}

type FailureCase = {
  readonly label: string;
  readonly operation: 'signup' | 'signin';
  readonly error: () => unknown;
  readonly expectedOutcome: 'rejected' | 'uncertain';
  readonly expectedStatus: 'unauthenticated' | 'unknown';
  readonly expectedUncertainty: boolean;
  readonly expectedMessage: string;
};

const failureCases: readonly FailureCase[] = [
  {
    label: 'typed signin 401 is explicit generic credential rejection',
    operation: 'signin',
    error: () => errorResponse(401, 'INVALID_CREDENTIALS', 'The account does not exist.', 'rejected'),
    expectedOutcome: 'rejected',
    expectedStatus: 'unauthenticated',
    expectedUncertainty: false,
    expectedMessage: 'Invalid email or password.'
  },
  {
    label: 'typed validation 400 remains a field rejection',
    operation: 'signin',
    error: () => errorResponse(400, 'VALIDATION_ERROR', 'The request is invalid.'),
    expectedOutcome: 'rejected',
    expectedStatus: 'unauthenticated',
    expectedUncertainty: false,
    expectedMessage: 'The request is invalid.'
  },
  {
    label: 'typed duplicate 409 remains a signup conflict',
    operation: 'signup',
    error: () => errorResponse(409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.'),
    expectedOutcome: 'rejected',
    expectedStatus: 'unauthenticated',
    expectedUncertainty: false,
    expectedMessage: 'This email is already registered.'
  },
  {
    label: 'typed service 503 stays uncertain despite anonymous observation',
    operation: 'signin',
    error: () => errorResponse(503, 'SERVICE_UNAVAILABLE', 'Service is temporarily unavailable.'),
    expectedOutcome: 'uncertain',
    expectedStatus: 'unknown',
    expectedUncertainty: true,
    expectedMessage: "We couldn't confirm sign-in. Check session again."
  },
  {
    label: 'malformed POST response stays uncertain despite anonymous observation',
    operation: 'signin',
    error: () => new AuthApiError('malformed', 'The response could not be read.'),
    expectedOutcome: 'uncertain',
    expectedStatus: 'unknown',
    expectedUncertainty: true,
    expectedMessage: "We couldn't confirm sign-in. Check session again."
  },
  {
    label: 'transport rejection stays uncertain despite anonymous observation',
    operation: 'signin',
    error: () => new AuthApiError('network', 'The request could not be completed.'),
    expectedOutcome: 'uncertain',
    expectedStatus: 'unknown',
    expectedUncertainty: true,
    expectedMessage: "We couldn't confirm sign-in. Check session again."
  }
];

describe('outcome:', () => {
  it.each(failureCases)('$label', async (scenario) => {
    const { api, calls } = makeApi();
    if (scenario.operation === 'signup') calls.signup.mockRejectedValue(scenario.error());
    else calls.signin.mockRejectedValue(scenario.error());
    calls.me.mockRejectedValue(anonymous());
    const controller = new AuthController(api);

    const result = scenario.operation === 'signup'
      ? await controller.signup(signupInput)
      : await controller.signin(signinInput);

    expect(result).toMatchObject({ outcome: scenario.expectedOutcome, message: scenario.expectedMessage });
    expect(calls.signup).toHaveBeenCalledTimes(scenario.operation === 'signup' ? 1 : 0);
    expect(calls.signin).toHaveBeenCalledTimes(scenario.operation === 'signin' ? 1 : 0);
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: scenario.expectedStatus,
      user: undefined,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: scenario.expectedUncertainty,
      message: scenario.expectedMessage,
      lastOperationOutcome: scenario.expectedOutcome
    });
  });

  it.each([
    ['same email with a different ID', { ...user, id: '89abcdef0123456789abcdef' }],
    ['same ID with a different email', { ...user, email: 'other@example.test' }]
  ] as const)('outcome: a wrong account is never confirmed (%s)', async (_label, observedUser) => {
    const { api, calls } = makeApi();
    calls.signin.mockResolvedValue(user);
    calls.me.mockResolvedValue(observedUser);
    const controller = new AuthController(api);

    await expect(controller.signin(signinInput)).resolves.toMatchObject({ outcome: 'verification-failed' });
    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      user: undefined,
      routeTrusted: false,
      serverObservation: 'authenticated',
      serverOutcomeUncertain: false
    });
  });

  it('outcome: rejected signin with the intended identity is observed, not claimed as POST success', async () => {
    const { api, calls } = makeApi();
    calls.signin.mockRejectedValue(new AuthApiError('network', 'The request could not be completed.'));
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);

    await expect(controller.signin(signinInput)).resolves.toEqual({
      outcome: 'uncertain',
      message: 'Session verified'
    });
    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user,
      serverObservation: 'authenticated',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain'
    });
  });

  it('outcome: later anonymous recheck observes state but preserves rejected-operation uncertainty', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockRejectedValue(new AuthApiError('network', 'The request could not be completed.'));
    calls.me.mockRejectedValueOnce(anonymous()).mockRejectedValueOnce(anonymous());
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toMatchObject({ outcome: 'uncertain' });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true,
      message: "We couldn't confirm sign-up. Check session again."
    });

    await controller.revalidate('retry');

    expect(calls.signup).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unauthenticated',
      routeTrusted: true,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain',
      message: "We couldn't confirm sign-up. Check session again."
    });
  });

  it('outcome: a later confirmed signin does not clear an earlier rejected signup uncertainty', async () => {
    const { api, calls } = makeApi();
    calls.signup.mockRejectedValue(new AuthApiError('network', 'The request could not be completed.'));
    calls.me.mockRejectedValueOnce(anonymous()).mockResolvedValueOnce(user);
    const controller = new AuthController(api);

    await expect(controller.signup(signupInput)).resolves.toMatchObject({ outcome: 'uncertain' });
    expect(controller.getSnapshot()).toMatchObject({ serverOutcomeUncertain: true });

    calls.signin.mockResolvedValue(user);
    await expect(controller.signin(signinInput)).resolves.toMatchObject({ outcome: 'confirmed' });

    expect(calls.signup).toHaveBeenCalledTimes(1);
    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user,
      lastOperationOutcome: 'confirmed',
      serverObservation: 'authenticated',
      serverOutcomeUncertain: true
    });
  });

  it('outcome: failed logout plus anonymous observation never creates a destruction receipt', async () => {
    const { api, calls } = makeApi();
    calls.logout.mockRejectedValue(errorResponse(503, 'SESSION_STORE_UNAVAILABLE', 'Store is unavailable.'));
    calls.me.mockRejectedValue(anonymous());
    const controller = new AuthController(api);

    await expect(controller.logout()).resolves.toMatchObject({ outcome: 'uncertain' });

    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'unknown',
      routeTrusted: false,
      serverObservation: 'anonymous',
      serverOutcomeUncertain: true,
      lastOperationOutcome: 'uncertain',
      logoutDestructionReceipt: null
    });
  });
});
