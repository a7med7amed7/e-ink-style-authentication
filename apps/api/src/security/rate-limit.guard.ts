import { Inject, Injectable, Optional, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import { ApiHttpError } from "../common/api-error.filter.js";

export const RATE_LIMIT_POLICIES = Symbol("RATE_LIMIT_POLICIES");
export interface RateLimitPolicy { readonly limit: number; readonly ttl: number; readonly blockDuration?: number }
type RequestShape = { readonly ip?: string; readonly method?: string; readonly originalUrl?: string; readonly url?: string; readonly path?: string; readonly baseUrl?: string; readonly route?: { readonly path?: string } };
type ResolvedPolicy = { readonly limit: number; readonly ttl: number; readonly blockDuration: number };
type RetryResponse = { setHeader?: (name: string, value: string) => unknown; header?: (name: string, value: string | number) => unknown };

const defaultPolicy = Object.freeze({ limit: 120, ttl: 60_000, blockDuration: 60_000 });
export const DEFAULT_RATE_LIMIT_POLICIES: Readonly<Record<string, ResolvedPolicy>> = Object.freeze({
  "POST /api/auth/signup": Object.freeze({ limit: 5, ttl: 900_000, blockDuration: 900_000 }),
  "POST /api/auth/signin": Object.freeze({ limit: 10, ttl: 60_000, blockDuration: 60_000 }),
  "GET /api/auth/me": Object.freeze({ limit: 120, ttl: 60_000, blockDuration: 60_000 }),
  "POST /api/auth/logout": Object.freeze({ limit: 30, ttl: 60_000, blockDuration: 60_000 }),
});

export function resolveRateLimitPolicy(
  method: string,
  path: string,
  overrides: Readonly<Record<string, RateLimitPolicy>> = {},
): ResolvedPolicy {
  const pathname = path.split("?", 1)[0]?.replace(/\/+$/, "") || "/";
  const key = `${method.toUpperCase()} ${pathname}`;
  const policy = overrides[key] ?? DEFAULT_RATE_LIMIT_POLICIES[key] ?? defaultPolicy;
  return { limit: policy.limit, ttl: policy.ttl, blockDuration: policy.blockDuration ?? policy.ttl };
}

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Optional() @Inject(RATE_LIMIT_POLICIES) private readonly policies: Readonly<Record<string, RateLimitPolicy>> = {},
  ) {
    super(options, storage, reflector);
  }

  protected override handleRequest(request: ThrottlerRequest): Promise<boolean> {
    const route = request.context.switchToHttp().getRequest<RequestShape>();
    const path = route.originalUrl ?? route.url ?? `${route.baseUrl ?? ""}${route.route?.path ?? route.path ?? "/"}`;
    const policy = resolveRateLimitPolicy(route.method ?? "GET", path, this.policies);
    return super.handleRequest({ ...request, ...policy });
  }

  protected override throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const retryAfterSeconds = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    const response = context.switchToHttp().getResponse<RetryResponse>();
    if (typeof response.setHeader === "function") response.setHeader("Retry-After", String(retryAfterSeconds));
    else response.header?.("Retry-After", retryAfterSeconds);
    return Promise.reject(new ApiHttpError("RATE_LIMITED", { retryAfterSeconds }));
  }
}
