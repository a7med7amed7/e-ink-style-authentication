import assert from "node:assert/strict";
import { ApiErrorSchema } from "@easygen/auth-contract";
import supertest, { type Response as SupertestResponse } from "supertest";
import { test, type TestContext } from "node:test";
import { PASSWORD_SERVICE } from "../src/app.module.js";
import { PasswordService } from "../src/security/password.service.js";
import { createRealMongoFixture, type MongoFixture } from "./support/fixture.js";

const signupBody = { email: "security@example.com", name: "Security User", password: "Valid123!" };
const signinBody = { email: signupBody.email, password: signupBody.password };
const jsonRoutes = ["/api/auth/signup", "/api/auth/signin"] as const;
const postRoutes = [...jsonRoutes, "/api/auth/logout"] as const;

function fixtureFor(context: TestContext): Promise<MongoFixture> {
  const fixture = createRealMongoFixture();
  context.after(async () => (await fixture).teardown());
  return fixture;
}

function post(fixture: MongoFixture, path: string) {
  return supertest(fixture.app.getHttpServer()).post(path);
}

function bodyFor(path: typeof postRoutes[number]): Record<string, string> | undefined {
  if (path === "/api/auth/signup") return signupBody;
  if (path === "/api/auth/signin") return signinBody;
  return undefined;
}

function assertApiError(response: SupertestResponse, status: number, code: string): void {
  assert.equal(response.status, status, response.text);
  const error = ApiErrorSchema.parse(response.body).error;
  assert.equal(error.code, code);
  assert.match(error.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(response.headers["x-request-id"], error.requestId);
  assert.equal(response.headers["cache-control"], "no-store");
}

function sendOptionalJson(
  request: ReturnType<typeof post>,
  path: typeof postRoutes[number],
  body = bodyFor(path),
): ReturnType<typeof post> {
  if (body === undefined) return request;
  return request
    .set("Content-Type", "application/json; charset=utf-8")
    .send(body);
}

interface PasswordWorkCounts {
  hash: number;
  verify: number;
  verifyDummy: number;
}

function countPasswordWork(fixture: MongoFixture): PasswordWorkCounts {
  const service = fixture.app.get<PasswordService>(PASSWORD_SERVICE);
  const calls: PasswordWorkCounts = { hash: 0, verify: 0, verifyDummy: 0 };
  const hash = service.hash.bind(service);
  const verify = service.verify.bind(service);
  const verifyDummy = service.verifyDummy.bind(service);

  Object.defineProperties(service, {
    hash: {
      configurable: true,
      value: (password: string): Promise<string> => {
        calls.hash += 1;
        return hash(password);
      },
    },
    verify: {
      configurable: true,
      value: (encoded: string, password: string): Promise<boolean> => {
        calls.verify += 1;
        return verify(encoded, password);
      },
    },
    verifyDummy: {
      configurable: true,
      value: (password: string): Promise<boolean> => {
        calls.verifyDummy += 1;
        return verifyDummy(password);
      },
    },
  });

  return calls;
}

function validJsonPost(
  fixture: MongoFixture,
  path: string,
  body: Record<string, string>,
) {
  return post(fixture, path)
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json")
    .send(body);
}

function assertRateLimited(response: SupertestResponse): void {
  assertApiError(response, 429, "RATE_LIMITED");
  const retryAfter = response.headers["retry-after"];
  if (typeof retryAfter !== "string") throw new Error("Retry-After must be a string header");
  assert.match(retryAfter, /^[1-9][0-9]*$/, "Retry-After must be a positive number of seconds");
}

void test("csrf: rejects missing, null, malformed, untrusted, and list Origins on every POST route", async (context) => {
  const fixture = await fixtureFor(context);
  const maliciousOrigins = [
    "null",
    "https://evil.example",
    "not an origin",
    `${fixture.config.appOrigin}, https://evil.example`,
  ];

  for (const path of postRoutes) {
    const body = bodyFor(path);
    const absent = post(fixture, path)
      .set("X-Requested-With", "XMLHttpRequest");
    assertApiError(await sendOptionalJson(absent, path, body), 403, "UNTRUSTED_ORIGIN");

    for (const origin of maliciousOrigins) {
      let pending = post(fixture, path)
        .set("Origin", origin)
        .set("Referer", `${fixture.config.appOrigin}/form`)
        .set("X-Requested-With", "XMLHttpRequest");
      pending = sendOptionalJson(pending, path, body);
      assertApiError(await pending, 403, "UNTRUSTED_ORIGIN");
    }
  }
  assert.equal(await fixture.database.collection("users").countDocuments(), 0);
});

void test("csrf: uses a trusted Referer only when Origin is absent", async (context) => {
  const fixture = await fixtureFor(context);
  const invalidReferers = ["null", "not a URL", "https://evil.example/form"];

  for (const referer of [undefined, ...invalidReferers]) {
    let pending = post(fixture, "/api/auth/signup")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Content-Type", "application/json; charset=utf-8");
    if (referer !== undefined) pending = pending.set("Referer", referer);
    assertApiError(await pending.send(signupBody), 403, "UNTRUSTED_ORIGIN");
  }

  const referer = `${fixture.config.appOrigin}/signup?source=form`;
  const signup = await post(fixture, "/api/auth/signup")
    .set("Referer", referer)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json; charset=utf-8")
    .send(signupBody);
  assert.equal(signup.status, 201, signup.text);

  const signin = await post(fixture, "/api/auth/signin")
    .set("Referer", `${fixture.config.appOrigin}/signin`)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json; charset=utf-8")
    .send(signinBody);
  assert.equal(signin.status, 200, signin.text);

  const rejectedOverride = await post(fixture, "/api/auth/signin")
    .set("Origin", "https://evil.example")
    .set("Referer", referer)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json; charset=utf-8")
    .send(signinBody);
  assertApiError(rejectedOverride, 403, "UNTRUSTED_ORIGIN");
  assert.equal(await fixture.database.collection("users").countDocuments(), 1);
});

void test("csrf: requires the exact AJAX header on all POST routes", async (context) => {
  const fixture = await fixtureFor(context);

  for (const path of postRoutes) {
    for (const requestedWith of [undefined, "xmlhttprequest", "fetch"]) {
      let pending = post(fixture, path).set("Origin", fixture.config.appOrigin);
      if (requestedWith !== undefined) pending = pending.set("X-Requested-With", requestedWith);
      pending = sendOptionalJson(pending, path);
      assertApiError(await pending, 403, "CSRF_REJECTED");
    }
  }
  assert.equal(await fixture.database.collection("users").countDocuments(), 0);
});

void test("csrf: accepts JSON charset, keeps logout bodyless, and rejects invalid or oversized JSON", async (context) => {
  const fixture = await fixtureFor(context);

  for (const path of jsonRoutes) {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded"]) {
      const response = await post(fixture, path)
        .set("Origin", fixture.config.appOrigin)
        .set("X-Requested-With", "XMLHttpRequest")
        .set("Content-Type", contentType)
        .send("ignored payload");
      assertApiError(response, 400, "VALIDATION_ERROR");
    }
  }

  const malformed = await post(fixture, "/api/auth/signup")
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json; charset=utf-8")
    .send('{"email":');
  assertApiError(malformed, 400, "VALIDATION_ERROR");

  const oversized = await post(fixture, "/api/auth/signup")
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json; charset=utf-8")
    .send(JSON.stringify({ ...signupBody, name: "x".repeat(17_000) }));
  assertApiError(oversized, 400, "VALIDATION_ERROR");

  const acceptedSignup = await fixture.agent
    .post("/api/auth/signup")
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "application/json; charset=utf-8")
    .send(signupBody);
  assert.equal(acceptedSignup.status, 201, acceptedSignup.text);

  const bodylessLogout = await fixture.agent
    .post("/api/auth/logout")
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest");
  assert.equal(bodylessLogout.status, 204, bodylessLogout.text);
  assert.equal(bodylessLogout.text, "");
  assert.equal(await fixture.database.collection("users").countDocuments(), 1);
});

void test("request-log: the Nest app emits the generated ID and route pattern without the raw URI", async (context) => {
  const fixture = await fixtureFor(context);
  const lines: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...values: unknown[]) => {
    lines.push(values);
  };

  let response: SupertestResponse;
  try {
    response = await supertest(fixture.app.getHttpServer())
      .get("/api/auth/me?token=raw-integration-query-secret")
      .set("Authorization", "Bearer raw-integration-authorization-secret");
  } finally {
    console.info = originalInfo;
  }

  assertApiError(response, 401, "UNAUTHENTICATED");
  assert.equal(lines.length, 1);
  const [line] = lines[0] ?? [];
  assert.equal(typeof line, "string");
  if (typeof line !== "string") throw new Error("Expected one serialized request log line");
  const record = JSON.parse(line) as Record<string, unknown>;
  assert.deepEqual(Object.keys(record).sort(), ["elapsedMs", "method", "requestId", "route", "status"]);
  assert.equal(record["requestId"], response.headers["x-request-id"]);
  assert.equal(record["method"], "GET");
  assert.equal(record["route"], "/api/auth/me");
  assert.equal(record["status"], 401);
  assert.equal(typeof record["elapsedMs"], "number");
  assert.ok((record["elapsedMs"] as number) >= 0);
  assert.doesNotMatch(line, /raw-integration-query-secret|raw-integration-authorization-secret|\?token=/);
});

void test("throttle: enforces the four per-route limits without password work or fixture leakage", async (context) => {
  const fixture = await fixtureFor(context);
  const passwordCalls = countPasswordWork(fixture);

  for (let index = 1; index <= 5; index += 1) {
    const response = await validJsonPost(fixture, "/api/auth/signup", {
      email: `limit${String(index)}@example.test`,
      name: `Limit User ${String(index)}`,
      password: "Valid123!",
    });
    assert.equal(response.status, 201, response.text);
  }
  assert.equal(passwordCalls.hash, 5);
  const beforeRejectedSignup = { ...passwordCalls };
  const sixthSignup = await validJsonPost(fixture, "/api/auth/signup", {
    email: "limit6@example.test",
    name: "Limit User 6",
    password: "Valid123!",
  });
  assertRateLimited(sixthSignup);
  assert.deepEqual(passwordCalls, beforeRejectedSignup, "the sixth signup must be rejected before password hashing or verification");
  assert.equal(await fixture.database.collection("users").countDocuments(), 5);

  for (let index = 1; index <= 10; index += 1) {
    const response = await validJsonPost(fixture, "/api/auth/signin", {
      email: `missing${String(index)}@example.test`,
      password: "Valid123!",
    });
    assertApiError(response, 401, "INVALID_CREDENTIALS");
  }
  assert.equal(passwordCalls.verifyDummy, 10, "the ten allowed unknown-account attempts use dummy verification");
  const beforeRejectedSignin = { ...passwordCalls };
  const eleventhSignin = await validJsonPost(fixture, "/api/auth/signin", {
    email: "missing11@example.test",
    password: "Valid123!",
  });
  assertRateLimited(eleventhSignin);
  assert.deepEqual(passwordCalls, beforeRejectedSignin, "the eleventh signin must be rejected before password verification");

  const anonymous = supertest(fixture.app.getHttpServer());
  for (let index = 1; index <= 120; index += 1) {
    const response = await anonymous
      .get("/api/auth/me")
      .set("Origin", fixture.config.appOrigin);
    assertApiError(response, 401, "UNAUTHENTICATED");
  }
  const oneHundredTwentyFirstIdentity = await anonymous
    .get("/API/AUTH/ME/?source=case")
    .set("Origin", fixture.config.appOrigin);
  assertRateLimited(oneHundredTwentyFirstIdentity);

  for (let index = 1; index <= 30; index += 1) {
    const response = await post(fixture, "/api/auth/logout")
      .set("Origin", fixture.config.appOrigin)
      .set("X-Requested-With", "XMLHttpRequest");
    assertApiError(response, 401, "UNAUTHENTICATED");
  }
  const thirtyFirstLogout = await post(fixture, "/api/auth/logout")
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest");
  assertRateLimited(thirtyFirstLogout);
  assert.deepEqual(passwordCalls, beforeRejectedSignin, "identity and logout requests do not perform password work");

  const isolatedFixture = await fixtureFor(context);
  assert.notEqual(isolatedFixture.databaseName, fixture.databaseName);
  const independentSignup = await validJsonPost(isolatedFixture, "/api/auth/signup", {
    email: "limit1@example.test",
    name: "Independent Fixture",
    password: "Valid123!",
  });
  assert.equal(independentSignup.status, 201, independentSignup.text);
  assert.equal(await isolatedFixture.database.collection("users").countDocuments(), 1);
  assert.equal(await fixture.database.collection("users").countDocuments(), 5);
});

void test("throttle: case variants and URL suffixes keep the matched auth route policy", async (context) => {
  const fixture = await fixtureFor(context);
  const passwordCalls = countPasswordWork(fixture);

  for (let index = 1; index <= 5; index += 1) {
    const response = await validJsonPost(fixture, "/api/auth/signup", {
      email: `case${String(index)}@example.test`,
      name: `Case User ${String(index)}`,
      password: "Valid123!",
    });
    assert.equal(response.status, 201, response.text);
  }
  const sixthSignup = await validJsonPost(fixture, "/API/AUTH/SIGNUP/?source=case", {
    email: "case6@example.test",
    name: "Case User 6",
    password: "Valid123!",
  });
  const signupHashes = passwordCalls.hash;
  const signupUsers = await fixture.database.collection("users").countDocuments();

  for (let index = 1; index <= 10; index += 1) {
    const response = await validJsonPost(fixture, "/api/auth/signin", {
      email: `missing${String(index)}@example.test`,
      password: "Valid123!",
    });
    assertApiError(response, 401, "INVALID_CREDENTIALS");
  }
  const eleventhSignin = await validJsonPost(fixture, "/API/AUTH/SIGNIN?source=case", {
    email: "missing11@example.test",
    password: "Valid123!",
  });
  const signinDummyVerifications = passwordCalls.verifyDummy;

  for (let index = 1; index <= 30; index += 1) {
    const response = await post(fixture, "/api/auth/logout")
      .set("Origin", fixture.config.appOrigin)
      .set("X-Requested-With", "XMLHttpRequest");
    assertApiError(response, 401, "UNAUTHENTICATED");
  }
  const thirtyFirstLogout = await post(fixture, "/API/AUTH/LOGOUT/?source=case")
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest");
  const outcomes = {
    signupStatus: sixthSignup.status,
    signupHashes,
    signupUsers,
    signinStatus: eleventhSignin.status,
    signinDummyVerifications,
    logoutStatus: thirtyFirstLogout.status,
  };
  assert.deepEqual(outcomes, {
    signupStatus: 429,
    signupHashes: 5,
    signupUsers: 5,
    signinStatus: 429,
    signinDummyVerifications: 10,
    logoutStatus: 429,
  });

  assertRateLimited(sixthSignup);
  assertRateLimited(eleventhSignin);
  assertRateLimited(thirtyFirstLogout);
});
