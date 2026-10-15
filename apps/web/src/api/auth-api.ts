import {
  ApiErrorSchema, PublicUserSchema,
  type ApiError, type PublicUser, type SigninInput, type SignupInput
} from '@easygen/auth-contract';

export type AuthApiErrorKind = 'unauthenticated' | 'rejected' | 'http' | 'malformed' | 'network' | 'unexpected';

export class AuthApiError extends Error {
  readonly status: number | undefined;
  readonly apiError: ApiError | undefined;

  constructor(readonly kind: AuthApiErrorKind, message: string, options: { status?: number; apiError?: ApiError } = {}) {
    super(message);
    this.name = 'AuthApiError';
    this.status = options.status;
    this.apiError = options.apiError;
  }
}

export interface AuthApi {
  signup(input: SignupInput): Promise<PublicUser>;
  signin(input: SigninInput): Promise<PublicUser>;
  me(): Promise<PublicUser>;
  logout(): Promise<void>;
}

export class FetchAuthApi implements AuthApi {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  signup(input: SignupInput): Promise<PublicUser> { return this.userRequest('/api/auth/signup', 'POST', 201, input); }
  signin(input: SigninInput): Promise<PublicUser> { return this.userRequest('/api/auth/signin', 'POST', 200, input, 'signin'); }
  me(): Promise<PublicUser> { return this.userRequest('/api/auth/me', 'GET', 200); }

  async logout(): Promise<void> {
    const response = await this.send('/api/auth/logout', 'POST');
    if (response.status === 204) return;
    if (!response.ok) return this.throwHttpError(response, 'logout');
    throw new AuthApiError('unexpected', 'Unexpected logout response.', { status: response.status });
  }

  private async userRequest(url: string, method: 'GET' | 'POST', expectedStatus: number,
    body?: SignupInput | SigninInput, operation?: 'signin'): Promise<PublicUser> {
    const response = await this.send(url, method, body);
    if (response.status !== expectedStatus) {
      if (!response.ok) return this.throwHttpError(response, operation);
      throw new AuthApiError('unexpected', 'Unexpected authentication response.', { status: response.status });
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new AuthApiError('malformed', 'The authentication response was invalid.', { status: response.status }); }
    const value = typeof payload === 'object' && payload !== null && 'user' in payload ? payload.user : undefined;
    const parsed = PublicUserSchema.safeParse(value);
    if (!parsed.success) throw new AuthApiError('malformed', 'The authentication response was invalid.', { status: response.status });
    return parsed.data;
  }

  private async send(url: string, method: 'GET' | 'POST', body?: SignupInput | SigninInput): Promise<Response> {
    const headers = new Headers({ accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' });
    if (body !== undefined) headers.set('content-type', 'application/json');
    try {
      return await this.fetcher(url, {
        method, credentials: 'same-origin', cache: 'no-store', headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch { throw new AuthApiError('network', 'The authentication request could not be completed.'); }
  }

  private async throwHttpError(response: Response, operation?: 'signin' | 'logout'): Promise<never> {
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new AuthApiError('malformed', 'The authentication error response was invalid.', { status: response.status }); }
    const parsed = ApiErrorSchema.safeParse(payload);
    if (!parsed.success) throw new AuthApiError('malformed', 'The authentication error response was invalid.', { status: response.status });
    const apiError = parsed.data;
    const kind: AuthApiErrorKind = response.status === 401 && apiError.error.code === 'UNAUTHENTICATED'
      ? 'unauthenticated'
      : response.status === 401 && operation === 'signin' && apiError.error.code === 'INVALID_CREDENTIALS'
        ? 'rejected' : 'http';
    throw new AuthApiError(kind, apiError.error.message, { status: response.status, apiError });
  }
}
