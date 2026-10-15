import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ApiErrorSchema } from "@easygen/auth-contract";
import {
  ApiHttpError,
  writeApiError,
  type ApiErrorCode,
} from "../src/common/api-error.filter.js";
import { AuthCapacityExceededError } from "../src/security/hash-work.js";
import { SessionStoreUnavailableError } from "../src/session/store.js";

class TestResponse {
  readonly headers = new Map<string, string>();
  statusCode = 0;
  body: unknown;

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
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

function capture(
  exception: unknown,
  request: { readonly requestId?: unknown; readonly headers?: Record<string, unknown> } = {},
): TestResponse {
  const response = new TestResponse();
  writeApiError(request, response, exception);
  return response;
}

function errorBody(response: TestResponse): {
  error: { code: unknown; message: unknown; requestId: unknown; fields?: unknown };
} {
  assert.ok(response.body && typeof response.body === "object");
  return response.body as {
    error: { code: unknown; message: unknown; requestId: unknown; fields?: unknown };
  };
}

void test("api-error: maps required API codes to the contract statuses and valid envelope", () => {
  const cases: ReadonlyArray<readonly [ApiErrorCode, number]> = [
    ["VALIDATION_ERROR", 400],
    ["INVALID_CREDENTIALS", 401],
    ["UNAUTHENTICATED", 401],
    ["UNTRUSTED_ORIGIN", 403],
    ["CSRF_REJECTED", 403],
    ["EMAIL_ALREADY_REGISTERED", 409],
    ["RATE_LIMITED", 429],
    ["SESSION_STORE_UNAVAILABLE", 503],
    ["AUTH_CAPACITY_EXCEEDED", 503],
    ["SERVICE_UNAVAILABLE", 503],
    ["NOT_FOUND", 404],
  ];

  for (const [code, status] of cases) {
    const response = capture(new ApiHttpError(code), { requestId: randomUUID() });
    const body = errorBody(response);

    assert.equal(response.statusCode, status, code);
    assert.equal(response.headers.get("cache-control"), "no-store", code);
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
    assert.equal(typeof body.error.requestId, "string");
    assert.equal(ApiErrorSchema.safeParse(response.body).success, true, code);
  }
});

void test("api-error: sanitizes validation fields and suppresses them for other codes", () => {
  const response = capture(
    new ApiHttpError("VALIDATION_ERROR", {
      fields: {
        email: ["customer@example.com must not be reflected"],
        password: ["hash=super-secret"],
        unknown: ["mongodb://private/db"],
      },
    }),
    { requestId: randomUUID() },
  );
  const validationBody = errorBody(response);

  assert.deepEqual(validationBody.error.fields, {
    email: ["Enter a valid email address."],
    password: ["Enter a valid password."],
  });
  assert.equal(ApiErrorSchema.safeParse(response.body).success, true);
  assert.equal(JSON.stringify(response.body).includes("customer@example.com"), false);
  assert.equal(JSON.stringify(response.body).includes("super-secret"), false);
  assert.equal(JSON.stringify(response.body).includes("mongodb://"), false);

  const nonValidation = errorBody(
    capture(new ApiHttpError("INVALID_CREDENTIALS", { fields: { email: ["unsafe"] } }), {
      requestId: randomUUID(),
    }),
  );
  assert.equal("fields" in nonValidation.error, false);
});

void test("api-error: normalizes oversized and unsupported-media parser errors to contract 400", () => {
  for (const statusCode of [413, 415]) {
    const response = capture({ statusCode, message: "private parser details" }, { requestId: randomUUID() });
    assert.equal(response.statusCode, 400);
    assert.equal(errorBody(response).error.code, "VALIDATION_ERROR");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(JSON.stringify(response.body).includes("private parser details"), false);
  }
});

void test("api-error: reuses only a valid server request ID and ignores inbound request ID headers", () => {
  const requestId = randomUUID();
  const response = capture(new ApiHttpError("UNAUTHENTICATED"), {
    requestId,
    headers: { "x-request-id": "attacker-controlled-value\r\n" },
  });

  assert.equal(errorBody(response).error.requestId, requestId);
  assert.equal(response.headers.get("x-request-id"), requestId);

  const missingIdResponse = capture(new ApiHttpError("UNAUTHENTICATED"), {
    headers: { "x-request-id": "reflect-this" },
  });
  const generatedId = errorBody(missingIdResponse).error.requestId;
  assert.equal(typeof generatedId, "string");
  assert.match(generatedId as string, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(generatedId, "reflect-this");
  assert.equal(missingIdResponse.headers.get("x-request-id"), generatedId);
});

void test("api-error: maps existing typed store and capacity errors with safe retry headers", () => {
  const sessionStore = capture(new SessionStoreUnavailableError(), { requestId: randomUUID() });
  assert.equal(sessionStore.statusCode, 503);
  assert.equal(errorBody(sessionStore).error.code, "SESSION_STORE_UNAVAILABLE");
  assert.equal(sessionStore.headers.get("cache-control"), "no-store");

  const capacity = capture(new AuthCapacityExceededError("saturated"), { requestId: randomUUID() });
  assert.equal(capacity.statusCode, 503);
  assert.equal(errorBody(capacity).error.code, "AUTH_CAPACITY_EXCEEDED");
  assert.equal(capacity.headers.get("retry-after"), "1");

  const rateLimited = capture(new ApiHttpError("RATE_LIMITED", { retryAfterSeconds: 7 }), {
    requestId: randomUUID(),
  });
  assert.equal(rateLimited.statusCode, 429);
  assert.equal(rateLimited.headers.get("retry-after"), "7");
});

void test("api-error: returns a no-store sanitized 500 for unexpected errors", () => {
  const failure = new Error(
    "password=value-secret hash=encoded-secret cookie=session-secret mongodb://db.internal/app",
  );
  failure.stack = "STACK_SECRET";
  const requestId = randomUUID();
  const response = capture(failure, { requestId });
  const serialized = JSON.stringify(response.body);

  assert.equal(response.statusCode, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(response.body, {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId,
    },
  });
  for (const secret of ["value-secret", "encoded-secret", "session-secret", "db.internal", "STACK_SECRET"]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(ApiErrorSchema.safeParse(response.body).success, true);
});
