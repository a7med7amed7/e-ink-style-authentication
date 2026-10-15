import { describe, expect, it, vi } from 'vitest';
import { AuthApiError, FetchAuthApi } from '../src/api/auth-api.js';

const user = {
  id: '0123456789abcdef01234567',
  email: 'ada@example.test',
  name: 'Ada Example'
};

const signupInput = {
  email: 'ada@example.test',
  name: 'Ada Example',
  password: 'N0tARealPassword!'
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

describe('auth-api:', () => {
  it('calls the default fetch implementation with its global receiver', async () => {
    const nativeFetch = vi.fn(function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      expect(this).toBe(globalThis);
      expect(input).toBe('/api/auth/me');
      expect(init?.method).toBe('GET');
      return Promise.resolve(jsonResponse(200, { user }));
    });
    vi.stubGlobal('fetch', nativeFetch);

    try {
      const api = new FetchAuthApi();
      await expect(api.me()).resolves.toEqual(user);
      expect(nativeFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses relative same-origin signup requests with JSON and AJAX headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { user }));
    const api = new FetchAuthApi(fetcher);

    await expect(api.signup(signupInput)).resolves.toEqual(user);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const firstCall = fetcher.mock.calls[0];
    if (firstCall === undefined) throw new Error('Expected signup fetch call');
    const [url, init] = firstCall;
    expect(url).toBe('/api/auth/signup');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init?.headers).get('x-requested-with')).toBe('XMLHttpRequest');
    expect(init?.body).toBe(JSON.stringify(signupInput));
  });

  it('uses a same-origin GET for identity and validates the public user response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { user }));
    const api = new FetchAuthApi(fetcher);

    await expect(api.me()).resolves.toEqual(user);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/auth/me');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'same-origin'
    });
  });

  it('keeps network, malformed success, and explicit unauthenticated responses distinct', async () => {
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    const offlineApi = new FetchAuthApi(offline);
    await expect(offlineApi.signup(signupInput)).rejects.toMatchObject({ kind: 'network' });
    expect(offline).toHaveBeenCalledTimes(1);

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, {
      user: { ...user, id: 'not-an-object-id' }
    }));
    const malformedApi = new FetchAuthApi(malformed);
    await expect(malformedApi.me()).rejects.toMatchObject({ kind: 'malformed' });

    const anonymous = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401, {
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required.',
        requestId: 'req-1'
      }
    }));
    const anonymousApi = new FetchAuthApi(anonymous);
    await expect(anonymousApi.me()).rejects.toMatchObject({
      kind: 'unauthenticated',
      status: 401
    });
  });

  it('does not retry POST mutations and preserves safe validated field errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Check the submitted fields.',
        requestId: 'req-2',
        fields: { email: ['Enter a valid email address.'] }
      }
    }));
    const api = new FetchAuthApi(fetcher);

    let caught: unknown;
    try {
      await api.signup(signupInput);
    } catch (error) {
      caught = error;
    }

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(caught).toBeInstanceOf(AuthApiError);
    expect(caught).toMatchObject({
      kind: 'http',
      status: 400,
      apiError: {
        error: {
          code: 'VALIDATION_ERROR',
          fields: { email: ['Enter a valid email address.'] }
        }
      }
    });
  });

  it('accepts an empty logout response without parsing a body', async () => {
    const response = new Response(null, { status: 204 });
    const parseBody = vi.spyOn(response, 'json');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const api = new FetchAuthApi(fetcher);

    await expect(api.logout()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/auth/logout');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-requested-with'))
      .toBe('XMLHttpRequest');
    expect(parseBody).not.toHaveBeenCalled();
  });
});
