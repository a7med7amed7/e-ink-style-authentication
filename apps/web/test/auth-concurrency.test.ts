import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser, SigninInput } from '@easygen/auth-contract';
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

const signinInput: SigninInput = { email: 'ada@example.test', password: 'short' };

function makeApi() {
  const calls = {
    signup: vi.fn<AuthApi['signup']>(),
    signin: vi.fn<AuthApi['signin']>(),
    me: vi.fn<AuthApi['me']>(),
    logout: vi.fn<AuthApi['logout']>()
  };
  return { api: calls satisfies AuthApi, calls };
}

function unauthorized(): AuthApiError {
  return new AuthApiError('unauthenticated', 'Unauthorized', { status: 401 });
}

async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

afterEach(() => { vi.useRealTimers(); });

describe('ordering:', () => {
  it.each(['success', 'unauthenticated', 'error'] as const)(
    'ignores a stale %s read completion without clearing the newer mutation',
    async (completion) => {
      const { api, calls } = makeApi();
      const staleRead = deferred<PublicUser>();
      const post = deferred<PublicUser>();
      calls.me.mockImplementationOnce(() => staleRead.promise).mockResolvedValue(user);
      calls.signin.mockReturnValue(post.promise);
      const controller = new AuthController(api);

      const read = controller.revalidate('bootstrap');
      const signin = controller.signin(signinInput);
      if (completion === 'success') staleRead.resolve(otherUser);
      else staleRead.reject(completion === 'unauthenticated' ? unauthorized() : new Error('read failed'));
      await read;

      expect(controller.getSnapshot()).toMatchObject({
        status: 'authenticating', pendingOperation: 'signin', user: undefined, routeTrusted: false
      });

      post.resolve(user);
      await expect(signin).resolves.toMatchObject({ outcome: 'confirmed' });
      expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    }
  );

  it('blocks a second credential POST synchronously before a rerender', async () => {
    const { api, calls } = makeApi();
    const post = deferred<PublicUser>();
    calls.signin.mockReturnValue(post.promise);
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);

    const first = controller.signin(signinInput);
    const second = await controller.signin(signinInput);

    expect(second).toEqual({ outcome: 'busy' });
    expect(calls.signin).toHaveBeenCalledTimes(1);

    post.resolve(user);
    await expect(first).resolves.toMatchObject({ outcome: 'confirmed' });
  });

  it('queues one coalesced logout until a pending sign-in body settles and skips superseded reconciliation', async () => {
    const { api, calls } = makeApi();
    const postBody = deferred<PublicUser>();
    const logoutBody = deferred<undefined>();
    let bodySettled = false;
    calls.signin.mockImplementation(() => postBody.promise.then((result) => {
      bodySettled = true;
      return result;
    }));
    calls.logout.mockImplementation(() => {
      expect(bodySettled).toBe(true);
      return logoutBody.promise;
    });
    calls.me.mockRejectedValue(unauthorized());
    const controller = new AuthController(api);

    const signin = controller.signin(signinInput);
    const firstLogout = controller.logout();
    const secondLogout = controller.logout();

    try {
      expect(controller.getSnapshot()).toMatchObject({ queuedLogout: true, pendingOperation: 'signin' });
      expect(calls.logout).not.toHaveBeenCalled();
      expect(await controller.signin(signinInput)).toEqual({ outcome: 'busy' });

      postBody.resolve(user);
      await flushMicrotasks();
      expect(calls.logout).toHaveBeenCalledTimes(1);
      expect(calls.me).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({ pendingOperation: 'logout' });

      logoutBody.resolve(undefined);
      await Promise.all([signin, firstLogout, secondLogout]);
      expect(calls.logout).toHaveBeenCalledTimes(1);
      expect(calls.me).toHaveBeenCalledTimes(1);
      expect(controller.getSnapshot()).toMatchObject({
        status: 'unauthenticated', pendingOperation: null, queuedLogout: false
      });
    } finally {
      postBody.resolve(user);
      logoutBody.resolve(undefined);
      await Promise.allSettled([signin, firstLogout, secondLogout]);
    }
  });

  it.each([
    {
      label: 'network rejection',
      error: () => new AuthApiError('network', 'The request could not be completed.'),
      uncertain: true
    },
    {
      label: 'explicit credential rejection',
      error: () => new AuthApiError('rejected', 'Invalid email or password.', { status: 401 }),
      uncertain: false
    }
  ])('latches only an uncertain $label before a queued logout supersedes signin', async (scenario) => {
    const { api, calls } = makeApi();
    const postBody = deferred<PublicUser>();
    const logoutBody = deferred<undefined>();
    calls.signin.mockReturnValue(postBody.promise);
    calls.logout.mockReturnValue(logoutBody.promise);
    calls.me.mockRejectedValue(unauthorized());
    const controller = new AuthController(api);
    const signin = controller.signin(signinInput);
    const logout = controller.logout();

    try {
      expect(controller.getSnapshot()).toMatchObject({ queuedLogout: true, pendingOperation: 'signin' });
      postBody.reject(scenario.error());
      await flushMicrotasks();

      expect(calls.signin).toHaveBeenCalledTimes(1);
      expect(calls.logout).toHaveBeenCalledTimes(1);
      expect(calls.me).not.toHaveBeenCalled();
      await expect(signin).resolves.toEqual({ outcome: 'uncertain' });
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'logout',
        queuedLogout: false,
        serverOutcomeUncertain: scenario.uncertain,
        lastOperationOutcome: null,
        logoutDestructionReceipt: null
      });

      logoutBody.resolve(undefined);
      await expect(logout).resolves.toEqual({ outcome: 'confirmed' });
      expect(calls.signin).toHaveBeenCalledTimes(1);
      expect(calls.logout).toHaveBeenCalledTimes(1);
      expect(calls.me).toHaveBeenCalledTimes(1);
      expect(controller.getSnapshot()).toMatchObject({
        status: 'unauthenticated',
        lastOperationOutcome: 'confirmed',
        serverOutcomeUncertain: scenario.uncertain,
        logoutDestructionReceipt: { operationId: 2 }
      });
    } finally {
      postBody.reject(scenario.error());
      logoutBody.resolve(undefined);
      await Promise.allSettled([signin, logout]);
    }
  });

  it('latches a rejected signin before queued logout supersedes its in-flight reconciliation', async () => {
    const { api, calls } = makeApi();
    const staleRead = deferred<PublicUser>();
    const logoutBody = deferred<undefined>();
    calls.signin.mockRejectedValue(new AuthApiError('network', 'The request could not be completed.'));
    calls.logout.mockReturnValue(logoutBody.promise);
    calls.me.mockReturnValueOnce(staleRead.promise).mockRejectedValueOnce(unauthorized());
    const controller = new AuthController(api);
    const signin = controller.signin(signinInput);
    let logout: ReturnType<AuthController['logout']> | undefined;
    try {
      await flushMicrotasks();
      expect(calls.me).toHaveBeenCalledTimes(1);
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'signin',
        serverOutcomeUncertain: true
      });

      logout = controller.logout();
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'logout',
        queuedLogout: false,
        serverOutcomeUncertain: true
      });
      expect(calls.logout).toHaveBeenCalledTimes(1);
      staleRead.resolve(user);
      await expect(signin).resolves.toEqual({ outcome: 'uncertain' });

      logoutBody.resolve(undefined);
      await expect(logout).resolves.toEqual({ outcome: 'confirmed' });
      expect(calls.signin).toHaveBeenCalledTimes(1);
      expect(calls.logout).toHaveBeenCalledTimes(1);
      expect(calls.me).toHaveBeenCalledTimes(2);
      expect(controller.getSnapshot()).toMatchObject({
        status: 'unauthenticated',
        lastOperationOutcome: 'confirmed',
        serverOutcomeUncertain: true,
        logoutDestructionReceipt: { operationId: 2 }
      });
    } finally {
      staleRead.resolve(user);
      logoutBody.resolve(undefined);
      const operations: Promise<unknown>[] = [signin];
      if (logout !== undefined) operations.push(logout);
      await Promise.allSettled(operations);
    }
  });

  it('threshold: keeps the same POST pending and announces slow only at five seconds', async () => {
    vi.useFakeTimers();
    const { api, calls } = makeApi();
    const postBody = deferred<PublicUser>();
    calls.signin.mockReturnValue(postBody.promise);
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);
    let settled = false;

    const signin = controller.signin(signinInput).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(controller.getSnapshot()).toMatchObject({ pendingOperation: 'signin', slow: false });
    await vi.advanceTimersByTimeAsync(1);

    try {
      expect(controller.getSnapshot()).toMatchObject({ pendingOperation: 'signin', slow: true });
      expect(settled).toBe(false);
      expect(calls.signin).toHaveBeenCalledTimes(1);
      expect(calls.me).not.toHaveBeenCalled();
    } finally {
      postBody.resolve(user);
      await signin;
    }
  });

  it('threshold: keeps slow feedback while a queued logout waits on the tracked POST', async () => {
    vi.useFakeTimers();
    const { api, calls } = makeApi();
    const postBody = deferred<PublicUser>();
    const logoutBody = deferred<undefined>();
    calls.signin.mockReturnValue(postBody.promise);
    calls.logout.mockReturnValue(logoutBody.promise);
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);
    const signin = controller.signin(signinInput);
    const logout = controller.logout();

    try {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'signin', queuedLogout: true, slow: true
      });
      expect(calls.signin).toHaveBeenCalledTimes(1);
      expect(calls.logout).not.toHaveBeenCalled();

      postBody.resolve(user);
      await flushMicrotasks();
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'logout', queuedLogout: false, slow: false
      });
      expect(calls.logout).toHaveBeenCalledTimes(1);
    } finally {
      postBody.resolve(user);
      logoutBody.resolve(undefined);
      await Promise.allSettled([signin, logout]);
    }
  });

  it('threshold: resets slow state and guards the queued logout timer after slot transition', async () => {
    vi.useFakeTimers();
    const { api, calls } = makeApi();
    const postBody = deferred<PublicUser>();
    const logoutBody = deferred<undefined>();
    calls.signin.mockReturnValue(postBody.promise);
    calls.logout.mockReturnValue(logoutBody.promise);
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);
    const signin = controller.signin(signinInput);
    const logout = controller.logout();

    try {
      await vi.advanceTimersByTimeAsync(4_999);
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'signin', queuedLogout: true, slow: false
      });
      postBody.resolve(user);
      await flushMicrotasks();
      await expect(signin).resolves.toMatchObject({ outcome: 'uncertain' });
      expect(calls.logout).toHaveBeenCalledTimes(1);
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'logout', queuedLogout: false, slow: false
      });

      await vi.advanceTimersByTimeAsync(1);
      expect(controller.getSnapshot().slow).toBe(false);
      await vi.advanceTimersByTimeAsync(4_998);
      expect(controller.getSnapshot().slow).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(controller.getSnapshot()).toMatchObject({
        pendingOperation: 'logout', queuedLogout: false, slow: true
      });
      expect(calls.signin).toHaveBeenCalledTimes(1);
    } finally {
      postBody.resolve(user);
      logoutBody.resolve(undefined);
      await Promise.allSettled([signin, logout]);
    }
  });

  it('coalesces focus requested during a pending POST into the later reconciliation read', async () => {
    const { api, calls } = makeApi();
    const postBody = deferred<PublicUser>();
    calls.signin.mockReturnValue(postBody.promise);
    calls.me.mockResolvedValue(user);
    const controller = new AuthController(api);

    const signin = controller.signin(signinInput);
    const readBeforeFocus = controller.getSnapshot().latestReadId;
    const focus = controller.revalidate('focus');

    expect(controller.getSnapshot().latestReadId).toBeGreaterThan(readBeforeFocus);
    expect(calls.me).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      pendingOperation: 'signin',
      status: 'authenticating',
      routeTrusted: false
    });

    postBody.resolve(user);
    await Promise.all([signin, focus]);

    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user, routeTrusted: true });
  });

  it('rechecks after focus invalidates an already-running reconciliation read', async () => {
    const { api, calls } = makeApi();
    const oldRead = deferred<PublicUser>();
    const freshRead = deferred<PublicUser>();
    calls.signin.mockResolvedValue(user);
    calls.me.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(freshRead.promise);
    const controller = new AuthController(api);

    const signin = controller.signin(signinInput);
    await flushMicrotasks();
    expect(calls.me).toHaveBeenCalledTimes(1);
    const readBeforeFocus = controller.getSnapshot().latestReadId;

    const focus = controller.revalidate('focus');
    expect(controller.getSnapshot().latestReadId).toBeGreaterThan(readBeforeFocus);
    expect(controller.getSnapshot()).toMatchObject({
      pendingOperation: 'signin',
      status: 'authenticating',
      user: undefined,
      routeTrusted: false
    });

    oldRead.resolve(otherUser);
    await flushMicrotasks();

    expect(calls.me).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      pendingOperation: 'signin',
      status: 'authenticating',
      user: undefined,
      routeTrusted: false
    });

    freshRead.resolve(user);
    await Promise.all([signin, focus]);

    expect(calls.signin).toHaveBeenCalledTimes(1);
    expect(calls.me).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', user, routeTrusted: true });
  });
});
