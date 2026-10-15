import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { ApiErrorSchema } from "@easygen/auth-contract";
import { MongoNetworkError } from "mongodb";
import type { SessionData } from "express-session";
import type { ApiError } from "@easygen/auth-contract";
import supertest, { type Agent, type Response as SupertestResponse } from "supertest";
import { test, type TestContext } from "node:test";
import { createControlledClock, createRealMongoFixture, type ControlledClock, type MongoFixture } from "./support/fixture.js";
import { sessionCookieConfiguration } from "../src/session/cookie.js";
import { SESSION_ABSOLUTE_TIMEOUT_MS, SESSION_IDLE_TIMEOUT_MS } from "../src/session/policy.js";

const credentials = { email: "session@example.com", name: "Ada Lovelace", password: "Abcdef1!" };
const policies = {
  "POST /api/auth/signup": { limit: 100, ttl: 900_000 },
  "POST /api/auth/signin": { limit: 100, ttl: 60_000 },
};

function fixtureFor(context: TestContext, clock?: ControlledClock): Promise<MongoFixture> {
  const fixture = createRealMongoFixture({ routePolicies: policies, ...(clock ? { clock } : {}) });
  context.after(async () => (await fixture).teardown());
  return fixture;
}

interface StoredAuthSession {
  readonly auth?: { readonly userId: string; readonly authenticatedAt: number; readonly lastActivityAt: number };
  readonly cookie?: { readonly expires?: string };
}

async function readStoredSession(fixture: MongoFixture): Promise<StoredAuthSession> {
  const record = await fixture.database.collection("sessions").findOne();
  assert.ok(record, "the authenticated session must be stored in MongoDB");
  const serialized: unknown = record["session"];
  assert.equal(typeof serialized, "string");
  const parsed: unknown = JSON.parse(String(serialized));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected an object session");
  }
  const stored = parsed as Record<string, unknown>;
  const auth = stored["auth"];
  const cookie = stored["cookie"];
  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) {
    throw new Error("Expected authenticated session metadata");
  }
  const authRecord = auth as Record<string, unknown>;
  if (
    typeof authRecord["userId"] !== "string" ||
    typeof authRecord["authenticatedAt"] !== "number" ||
    typeof authRecord["lastActivityAt"] !== "number"
  ) {
    throw new Error("Expected valid session identity and timestamps");
  }
  const cookieRecord = typeof cookie === "object" && cookie !== null && !Array.isArray(cookie)
    ? cookie as Record<string, unknown>
    : undefined;
  const expires = cookieRecord?.["expires"];
  return {
    auth: {
      userId: authRecord["userId"],
      authenticatedAt: authRecord["authenticatedAt"],
      lastActivityAt: authRecord["lastActivityAt"],
    },
    ...(typeof expires === "string" ? { cookie: { expires } } : {}),
  };
}

function postJson(fixture: MongoFixture, client: Agent, path: string, body: Record<string, unknown>) {
  return client
    .post(path)
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest")
    .send(body);
}

function sessionCookie(response: SupertestResponse, fixture: MongoFixture): string {
  const headers = cookieHeaders(response);
  const cookieName = sessionCookieConfiguration(fixture.config.nodeEnv).name;
  const cookie = headers.find((header) => header.startsWith(`${cookieName}=`));
  assert.ok(cookie, "the configured session cookie must be present");
  return cookie.split(";", 1)[0] ?? "";
}

function sessionCookieExpiry(response: SupertestResponse, fixture: MongoFixture): number {
  const cookieName = sessionCookieConfiguration(fixture.config.nodeEnv).name;
  const cookie = cookieHeaders(response).find((header) => header.startsWith(`${cookieName}=`));
  assert.ok(cookie, "renewal must return the bounded session cookie");
  const expires = /;\s*Expires=([^;]+)/i.exec(cookie)?.[1];
  assert.ok(expires, "session cookie must carry an explicit deadline");
  return new Date(expires).getTime();
}

function cookieHeaders(response: SupertestResponse): string[] {
  const header: unknown = response.headers["set-cookie"];
  if (typeof header === "string") return [header];
  if (!Array.isArray(header)) return [];
  return header.filter((value): value is string => typeof value === "string");
}

function responseError(response: SupertestResponse): ApiError["error"] {
  const parsed: unknown = JSON.parse(response.text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected an object error response");
  }
  return ApiErrorSchema.parse(parsed).error;
}

function signedCookie(fixture: MongoFixture, sessionId: string): string {
  const cookieName = sessionCookieConfiguration(fixture.config.nodeEnv).name;
  const signature = createHmac("sha256", fixture.config.sessionSecret)
    .update(sessionId)
    .digest("base64")
    .replace(/=+$/, "");
  return `${cookieName}=${encodeURIComponent(`s:${sessionId}.${signature}`)}`;
}

async function seedAnonymousSession(fixture: MongoFixture, sessionId: string): Promise<void> {
  const expires = new Date(fixture.clock.now() + 30 * 60 * 1_000);
  const session: SessionData = {
    cookie: {
      originalMaxAge: 30 * 60 * 1_000,
      expires,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "strict",
    },
  };
  await new Promise<void>((resolve, reject) => {
    fixture.store.set(sessionId, session, (error) => {
      if (error) reject(error instanceof Error ? error : new Error("Anonymous session write failed"));
      else resolve();
    });
  });
}

function delayFirstStoreWrite(fixture: MongoFixture): {
  readonly started: Promise<void>;
  readonly persisted: Promise<void>;
  readonly release: () => void;
  readonly calls: () => number;
} {
  type StoreSet = MongoFixture["store"]["set"];
  type SessionData = Parameters<StoreSet>[1];
  type Callback = NonNullable<Parameters<StoreSet>[2]>;
  const originalSet = fixture.store.set.bind(fixture.store);
  let notifyStarted!: () => void;
  let notifyPersisted!: () => void;
  let releaseCallback: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const persisted = new Promise<void>((resolve) => { notifyPersisted = resolve; });
  let writes = 0;

  Object.defineProperty(fixture.store, "set", {
    configurable: true,
    value: (sid: string, session: SessionData, callback?: Callback): void => {
      writes += 1;
      if (writes !== 1) {
        originalSet(sid, session, callback);
        return;
      }
      notifyStarted();
      originalSet(sid, session, (error) => {
        notifyPersisted();
        releaseCallback = () => callback?.(error);
      });
    },
  });

  return {
    started,
    persisted,
    release: () => {
      assert.ok(releaseCallback, "MongoStore must finish the delayed write before release");
      releaseCallback();
    },
    calls: () => writes,
  };
}

function failFirstStoreWrite(fixture: MongoFixture): () => number {
  type StoreSet = MongoFixture["store"]["set"];
  type SessionData = Parameters<StoreSet>[1];
  type Callback = NonNullable<Parameters<StoreSet>[2]>;
  const originalSet = fixture.store.set.bind(fixture.store);
  let writes = 0;
  let fail = true;

  Object.defineProperty(fixture.store, "set", {
    configurable: true,
    value: (sid: string, session: SessionData, callback?: Callback): void => {
      writes += 1;
      if (fail) {
        fail = false;
        callback?.(new MongoNetworkError("injected session-store outage"));
        return;
      }
      originalSet(sid, session, callback);
    },
  });
  return () => writes;
}

void test("establish: waits for the acknowledged save, rotates the session, and avoids response-end writes", async (context) => {
  const fixture = await fixtureFor(context);
  const oldSessionId = randomBytes(18).toString("base64url");
  await seedAnonymousSession(fixture, oldSessionId);
  const oldCookie = signedCookie(fixture, oldSessionId);
  const store = delayFirstStoreWrite(fixture);
  let responseSettled = false;
  const signupPromise = postJson(
    fixture,
    supertest(fixture.app.getHttpServer()),
    "/api/auth/signup",
    credentials,
  ).set("Cookie", oldCookie).then((response) => {
    responseSettled = true;
    return response;
  });

  const writeStarted = await Promise.race([
    store.started.then(() => true),
    signupPromise.then(() => false),
  ]);
  assert.equal(writeStarted, true, "signup must establish a session before replying");
  await store.persisted;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(responseSettled, false, "success must wait for the MongoStore save callback");
  store.release();

  const signup = await signupPromise;
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  const newCookie = sessionCookie(signup, fixture);
  assert.notEqual(newCookie, oldCookie, "authentication must regenerate an existing anonymous session id");
  assert.equal(store.calls(), 1, "response completion must not delegate a second MongoStore write");
  assert.equal(await fixture.database.collection("sessions").countDocuments(), 1, "regeneration must remove the old session");
});

void test("establish: detaches a failed save without an authenticated cookie or response-end retry", async (context) => {
  const fixture = await fixtureFor(context);
  const storeWrites = failFirstStoreWrite(fixture);
  const response = await postJson(fixture, fixture.agent, "/api/auth/signup", credentials);

  assert.equal(response.status, 503, response.text);
  assert.equal(responseError(response).code, "SESSION_STORE_UNAVAILABLE");
  assert.equal(response.headers["cache-control"], "no-store");
  const cookieName = sessionCookieConfiguration(fixture.config.nodeEnv).name;
  const setCookie = cookieHeaders(response);
  assert.ok(setCookie.every((cookie: string) => !cookie.startsWith(`${cookieName}=s%3A`)));
  assert.equal(await fixture.database.collection("users").countDocuments({ email: credentials.email }), 1);
  assert.equal(storeWrites(), 1, "detachment must prevent an automatic response-end store write");
  assert.equal(await fixture.database.collection("sessions").countDocuments(), 0);
});

void test("establish: renewal persists activity without moving the absolute authentication deadline", async (context) => {
  const clock = createControlledClock(1_800_000_000_000);
  const fixture = await fixtureFor(context, clock);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", credentials);
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  const before = await readStoredSession(fixture);
  assert.ok(before.auth && before.cookie?.expires);

  clock.advance(60_000);
  const response = await fixture.agent.get("/api/auth/me").set("Origin", fixture.config.appOrigin);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body, signup.body);
  assert.equal(response.headers["cache-control"], "no-store");
  const after = await readStoredSession(fixture);
  assert.ok(after.auth && after.cookie?.expires);
  assert.equal(after.auth.authenticatedAt, before.auth.authenticatedAt);
  assert.equal(after.auth.lastActivityAt, clock.now());
  assert.equal(
    new Date(after.cookie.expires).getTime(),
    Math.min(clock.now() + SESSION_IDLE_TIMEOUT_MS, after.auth.authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS),
  );
});

void test("establish: renewal denies a request whose save crosses the absolute deadline", async (context) => {
  const clock = createControlledClock(1_800_000_000_000);
  const fixture = await fixtureFor(context, clock);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", credentials);
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  const stored = await readStoredSession(fixture);
  assert.ok(stored.auth);
  const deadline = stored.auth.authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
  clock.set(deadline - 1);

  type StoreSet = MongoFixture["store"]["set"];
  type SessionData = Parameters<StoreSet>[1];
  type Callback = NonNullable<Parameters<StoreSet>[2]>;
  const originalSet = fixture.store.set.bind(fixture.store);
  Object.defineProperty(fixture.store, "set", {
    configurable: true,
    value: (sid: string, session: SessionData, callback?: Callback): void => {
      originalSet(sid, session, (error) => {
        if (!error) clock.set(deadline + 1);
        callback?.(error);
      });
    },
  });

  const response = await fixture.agent.get("/api/auth/me").set("Origin", fixture.config.appOrigin);
  assert.equal(response.status, 401, response.text);
  assert.equal(responseError(response).code, "UNAUTHENTICATED");
  assert.equal(response.headers["cache-control"], "no-store");
});

void test("expiration: idle deadline equality rejects a captured cookie while retaining the session record", async (context) => {
  const clock = createControlledClock(Date.now());
  const fixture = await fixtureFor(context, clock);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", credentials);
  assert.equal(signup.status, 201, signup.text);
  const cookie = sessionCookie(signup, fixture);
  const before = await readStoredSession(fixture);
  assert.ok(before.auth && before.cookie?.expires);
  const idleDeadline = before.auth.lastActivityAt + SESSION_IDLE_TIMEOUT_MS;
  clock.set(idleDeadline);

  const response = await supertest(fixture.app.getHttpServer())
    .get("/api/auth/me")
    .set("Origin", fixture.config.appOrigin)
    .set("Cookie", cookie);

  assert.equal(response.status, 401, response.text);
  assert.equal(responseError(response).code, "UNAUTHENTICATED");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(await fixture.database.collection("sessions").countDocuments(), 1, "Mongo TTL cleanup must not decide authorization");
  const after = await readStoredSession(fixture);
  assert.deepEqual(after.auth, before.auth, "idle rejection must not renew session activity");
  assert.equal(after.cookie?.expires, before.cookie.expires);
});

void test("expiration: rolling activity is bounded by the absolute deadline and equality rejects the retained record", async (context) => {
  const clock = createControlledClock(Date.now());
  const fixture = await fixtureFor(context, clock);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", credentials);
  assert.equal(signup.status, 201, signup.text);
  let cookie = sessionCookie(signup, fixture);
  const initial = await readStoredSession(fixture);
  assert.ok(initial.auth);
  const absoluteDeadline = initial.auth.authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
  const client = supertest(fixture.app.getHttpServer());

  for (let renewal = 1; renewal <= 15; renewal += 1) {
    clock.set(initial.auth.authenticatedAt + renewal * (SESSION_IDLE_TIMEOUT_MS - 1_000));
    const response = await client
      .get("/api/auth/me")
      .set("Origin", fixture.config.appOrigin)
      .set("Cookie", cookie);
    assert.equal(response.status, 200, response.text);
    cookie = sessionCookie(response, fixture);
    assert.equal(cookie, sessionCookie(signup, fixture), "ordinary activity must not rotate the session id");
  }

  clock.set(absoluteDeadline - 60_000);
  const lastActive = await client
    .get("/api/auth/me")
    .set("Origin", fixture.config.appOrigin)
    .set("Cookie", cookie);
  assert.equal(lastActive.status, 200, lastActive.text);
  const cookieExpiry = sessionCookieExpiry(lastActive, fixture);
  assert.ok(
    cookieExpiry <= absoluteDeadline && cookieExpiry > absoluteDeadline - 1_000,
    "HTTP cookie expiry must stop at the absolute deadline (with its one-second date precision)",
  );
  cookie = sessionCookie(lastActive, fixture);
  const beforeAbsoluteExpiry = await readStoredSession(fixture);
  assert.ok(beforeAbsoluteExpiry.auth && beforeAbsoluteExpiry.cookie?.expires);
  assert.equal(beforeAbsoluteExpiry.auth.authenticatedAt, initial.auth.authenticatedAt);
  assert.equal(beforeAbsoluteExpiry.auth.lastActivityAt, absoluteDeadline - 60_000);

  clock.set(absoluteDeadline);
  const expired = await client
    .get("/api/auth/me")
    .set("Origin", fixture.config.appOrigin)
    .set("Cookie", cookie);
  assert.equal(expired.status, 401, expired.text);
  assert.equal(responseError(expired).code, "UNAUTHENTICATED");
  assert.equal(await fixture.database.collection("sessions").countDocuments(), 1, "the retained Mongo record must remain unauthorized");
  const afterAbsoluteExpiry = await readStoredSession(fixture);
  assert.deepEqual(afterAbsoluteExpiry.auth, beforeAbsoluteExpiry.auth, "absolute rejection must not renew session metadata");
  assert.equal(afterAbsoluteExpiry.cookie?.expires, beforeAbsoluteExpiry.cookie.expires);
});
