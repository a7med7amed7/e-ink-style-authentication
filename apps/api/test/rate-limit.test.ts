import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { Reflector } from "@nestjs/core";
import type { ThrottlerModuleOptions, ThrottlerStorage } from "@nestjs/throttler";
import {
  ApiHttpError,
  writeApiError,
  type ApiErrorRequest,
  type ApiErrorResponse,
} from "../src/common/api-error.filter.js";
import {
  RateLimitGuard,
  resolveRateLimitPolicy,
  type RateLimitPolicy,
} from "../src/security/rate-limit.guard.js";

interface RequestShape extends ApiErrorRequest {
  readonly ip: string;
  readonly method: string;
  readonly originalUrl: string;
  readonly headers: Record<string, string>;
}

class TestResponse implements ApiErrorResponse {
  readonly headers = new Map<string, string>();
  statusCode = 0;
  body: unknown;

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  header(name: string, value: string | number): this {
    return this.setHeader(name, String(value));
  }

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }
}

interface IncrementCall {
  readonly key: string;
  readonly ttl: number;
  readonly limit: number;
  readonly blockDuration: number;
  readonly name: string;
}

type StorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

class RecordingStorage implements ThrottlerStorage {
  readonly calls: IncrementCall[] = [];
  blocked = false;
  retryAfterSeconds = 0;

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ): Promise<StorageRecord> {
    this.calls.push({ key, ttl, limit, blockDuration, name });
    return Promise.resolve({
      totalHits: this.blocked ? limit + 1 : 1,
      timeToExpire: Math.ceil(ttl / 1_000),
      isBlocked: this.blocked,
      timeToBlockExpire: this.blocked ? this.retryAfterSeconds : 0,
    });
  }
}

class AuthControllerProbe {
  signup(): void {}
}

const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [{ name: "default", limit: 999, ttl: 1_000 }],
  generateKey: (_context, tracker) => tracker,
};

function makeContext(request: RequestShape, response: TestResponse): ExecutionContextHost {
  const controller = new AuthControllerProbe();
  return new ExecutionContextHost(
    [request, response],
    AuthControllerProbe,
    controller.signup.bind(controller),
  );
}

async function createGuard(
  storage: RecordingStorage,
  routePolicies: Readonly<Record<string, RateLimitPolicy>> = {},
): Promise<RateLimitGuard> {
  const guard = new RateLimitGuard(throttlerOptions, storage, new Reflector(), routePolicies);
  await guard.onModuleInit();
  return guard;
}

void test("rate-limit: defines the exact per-IP auth route limits and millisecond windows", () => {
  const cases: ReadonlyArray<readonly [string, string, RateLimitPolicy]> = [
    ["POST", "/api/auth/signup", { limit: 5, ttl: 900_000, blockDuration: 900_000 }],
    ["POST", "/api/auth/signin", { limit: 10, ttl: 60_000, blockDuration: 60_000 }],
    ["GET", "/api/auth/me", { limit: 120, ttl: 60_000, blockDuration: 60_000 }],
    ["POST", "/api/auth/logout", { limit: 30, ttl: 60_000, blockDuration: 60_000 }],
  ];

  for (const [method, path, expected] of cases) {
    assert.deepEqual(resolveRateLimitPolicy(method, `${path}?next=/ignored`), expected);
  }
  assert.deepEqual(resolveRateLimitPolicy("GET", "/api/unmatched"), {
    limit: 120,
    ttl: 60_000,
    blockDuration: 60_000,
  });
  assert.deepEqual(
    resolveRateLimitPolicy("POST", "/api/auth/signup", {
      "POST /api/auth/signup": { limit: 2, ttl: 3_000, blockDuration: 6_000 },
    }),
    { limit: 2, ttl: 3_000, blockDuration: 6_000 },
  );
});

void test("rate-limit: uses Express req.ip and injected per-app storage for route tracking", async () => {
  const firstStorage = new RecordingStorage();
  const secondStorage = new RecordingStorage();
  const request: RequestShape = {
    ip: "203.0.113.17",
    method: "POST",
    originalUrl: "/api/auth/signup?from=test",
    headers: { "x-forwarded-for": "198.51.100.8" },
    requestId: "d5c6e9e0-dbbc-4e71-a3da-cd1c430ace12",
  };
  const firstResponse = new TestResponse();
  const secondResponse = new TestResponse();
  const firstGuard = await createGuard(firstStorage);
  const secondGuard = await createGuard(secondStorage);

  assert.equal(await firstGuard.canActivate(makeContext(request, firstResponse)), true);
  assert.equal(await secondGuard.canActivate(makeContext(request, secondResponse)), true);
  assert.deepEqual(firstStorage.calls[0], {
    key: "203.0.113.17",
    ttl: 900_000,
    limit: 5,
    blockDuration: 900_000,
    name: "default",
  });
  assert.equal(secondStorage.calls.length, 1);
  assert.notEqual(firstStorage, secondStorage);
});

void test("rate-limit: returns the standard 429 envelope with Retry-After in seconds", async () => {
  const storage = new RecordingStorage();
  storage.blocked = true;
  storage.retryAfterSeconds = 8;
  const request: RequestShape = {
    ip: "203.0.113.44",
    method: "POST",
    originalUrl: "/api/auth/signin",
    headers: {},
    requestId: "c602ee53-e78c-4c51-8c9f-902212199908",
  };
  const response = new TestResponse();
  const guard = await createGuard(storage);
  let thrown: unknown;

  try {
    await guard.canActivate(makeContext(request, response));
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof ApiHttpError);
  assert.equal(thrown.code, "RATE_LIMITED");
  assert.equal(thrown.getStatus(), 429);
  assert.equal(response.headers.get("retry-after"), "8");
  writeApiError(request, response, thrown);
  assert.equal(response.statusCode, 429);
  assert.deepEqual(response.body, {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
      requestId: request.requestId,
    },
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), "8");
});
