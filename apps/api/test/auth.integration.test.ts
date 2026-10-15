import assert from "node:assert/strict";
import { ApiErrorSchema, PublicUserSchema } from "@easygen/auth-contract";
import { getModelToken } from "@nestjs/mongoose";
import { MongoNetworkError, ObjectId } from "mongodb";
import type { Model } from "mongoose";
import supertest, { type Agent, type Response as SupertestResponse } from "supertest";
import { test, type TestContext } from "node:test";
import type { ApiError, PublicUser } from "@easygen/auth-contract";
import { createRealMongoFixture, type MongoFixture } from "./support/fixture.js";
import { USER_MODEL_NAME, type UserRecord } from "../src/auth/user.schema.js";
import { sessionCookieConfiguration } from "../src/session/cookie.js";

const signupBody = { email: "ada@example.com", name: "Ada Lovelace", password: "Abcdef1!" };
const policies = {
  "POST /api/auth/signup": { limit: 100, ttl: 900_000 },
  "POST /api/auth/signin": { limit: 100, ttl: 60_000 },
  "GET /api/auth/me": { limit: 100, ttl: 60_000 },
};

interface StoredAuth {
  readonly userId: string;
  readonly lastActivityAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseObject(response: SupertestResponse): Record<string, unknown> {
  const parsed: unknown = JSON.parse(response.text);
  if (!isRecord(parsed)) throw new Error("Expected an object response body");
  return parsed;
}

function responseUser(response: SupertestResponse): PublicUser {
  return PublicUserSchema.parse(responseObject(response)["user"]);
}

function responseError(response: SupertestResponse): ApiError["error"] {
  return ApiErrorSchema.parse(responseObject(response)).error;
}

function cookieHeaders(response: SupertestResponse): string[] {
  const header: unknown = response.headers["set-cookie"];
  if (typeof header === "string") return [header];
  if (!Array.isArray(header)) return [];
  return header.filter((value): value is string => typeof value === "string");
}

function storedAuth(serialized: unknown): StoredAuth {
  if (typeof serialized !== "string") throw new Error("Expected a serialized session");
  const session: unknown = JSON.parse(serialized);
  if (!isRecord(session) || !isRecord(session["auth"])) throw new Error("Expected authenticated session metadata");
  const auth = session["auth"];
  if (typeof auth["userId"] !== "string" || typeof auth["lastActivityAt"] !== "number") {
    throw new Error("Expected valid session identity and activity timestamp");
  }
  return { userId: auth["userId"], lastActivityAt: auth["lastActivityAt"] };
}

function fixtureFor(context: TestContext): Promise<MongoFixture> {
  const fixture = createRealMongoFixture({ routePolicies: policies });
  context.after(async () => (await fixture).teardown());
  return fixture;
}

function postJson(
  fixture: MongoFixture,
  client: Agent,
  path: string,
  body: Record<string, unknown>,
) {
  return client
    .post(path)
    .set("Origin", fixture.config.appOrigin)
    .set("X-Requested-With", "XMLHttpRequest")
    .send(body);
}

function failFirstStoreSet(fixture: MongoFixture): () => number {
  type StoreSet = MongoFixture["store"]["set"];
  type SessionData = Parameters<StoreSet>[1];
  type Callback = NonNullable<Parameters<StoreSet>[2]>;
  const originalSet = fixture.store.set.bind(fixture.store);
  let calls = 0;
  let fail = true;
  Object.defineProperty(fixture.store, "set", {
    configurable: true,
    value: (sid: string, session: SessionData, callback?: Callback): void => {
      calls += 1;
      if (fail) {
        fail = false;
        callback?.(new MongoNetworkError("injected store outage"));
        return;
      }
      originalSet(sid, session, callback);
    },
  });
  return () => calls;
}

void test("signup: canonical account stores the NFC password hash and returns only the public identity", async (context) => {
  const fixture = await fixtureFor(context);
  const rawPassword = "Abcde\u0301f1!";
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", {
    email: "  Ada.Lovelace+tag@GMail.com  ",
    name: "  Ada  Lovelace  ",
    password: rawPassword,
  });

  assert.equal(signup.status, 201, signup.text);
  assert.deepEqual(Object.keys(responseObject(signup)).sort(), ["user"]);
  const signupUser = responseUser(signup);
  assert.deepEqual(signupUser, {
    id: signupUser.id,
    email: "ada.lovelace+tag@gmail.com",
    name: "Ada  Lovelace",
  });
  assert.match(signupUser.id, /^[0-9a-f]{24}$/);
  assert.equal(signup.headers["cache-control"], "no-store");
  assert.ok(signup.headers["set-cookie"]);

  const saved = await fixture.database.collection("users").findOne({ email: "ada.lovelace+tag@gmail.com" });
  assert.ok(saved);
  assert.match(String(saved["passwordHash"]), /^\$argon2id\$v=19\$m=19456,(?:t=2,p=1|p=1,t=2)\$/);
  assert.notEqual(saved["passwordHash"], "Abcdéf1!");

});

void test("signin: a canonically equivalent NFC password authenticates the same account", async (context) => {
  const fixture = await fixtureFor(context);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", {
    email: "ada.lovelace+tag@gmail.com",
    name: "Ada Lovelace",
    password: "Abcde\u0301f1!",
  });
  assert.equal(signup.status, 201, signup.text);
  const cookieName = sessionCookieConfiguration(fixture.config.nodeEnv).name;
  const signupCookies = cookieHeaders(signup);
  const oldCookie = signupCookies.find((cookie: string) => cookie.startsWith(`${cookieName}=`));
  assert.ok(oldCookie);

  const signin = await postJson(fixture, fixture.agent, "/api/auth/signin", {
    email: "ada.lovelace+tag@gmail.com",
    password: "Abcdéf1!",
  });
  assert.equal(signin.status, 200, signin.text);
  assert.deepEqual(responseUser(signin), responseUser(signup));
  const signinCookies = cookieHeaders(signin);
  const newCookie = signinCookies.find((cookie: string) => cookie.startsWith(`${cookieName}=`));
  assert.ok(newCookie);
  assert.notEqual(newCookie, oldCookie, "signin must regenerate the session id");
  assert.equal(await fixture.database.collection("sessions").countDocuments(), 1);
  const identity = await fixture.agent.get("/api/auth/me").set("Origin", fixture.config.appOrigin);
  assert.equal(identity.status, 200, identity.text);
  assert.deepEqual(responseUser(identity), responseUser(signin));
});

void test("signin: unknown email and wrong password use the same generic error", async (context) => {
  const fixture = await fixtureFor(context);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", signupBody);
  assert.equal(signup.status, 201, signup.text);

  const wrongPassword = await postJson(fixture, supertest(fixture.app.getHttpServer()), "/api/auth/signin", {
    email: signupBody.email,
    password: "Wrongpass1!",
  });
  const unknownEmail = await postJson(fixture, supertest(fixture.app.getHttpServer()), "/api/auth/signin", {
    email: "missing@example.com",
    password: "Wrongpass1!",
  });
  for (const response of [wrongPassword, unknownEmail]) {
    assert.equal(response.status, 401, response.text);
    assert.equal(responseError(response).code, "INVALID_CREDENTIALS");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.doesNotMatch(response.text, /missing@example|Wrongpass1!|\$argon2|mongodb:\/\/|stack/i);
  }
  assert.equal(responseError(wrongPassword).message, responseError(unknownEmail).message);
  assert.notEqual(responseError(wrongPassword).requestId, responseError(unknownEmail).requestId);
});

void test("signup: invalid requests return safe validation errors without persistence", async (context) => {
  const fixture = await fixtureFor(context);
  const invalidBodies: Record<string, unknown>[] = [
    { ...signupBody, unknown: true },
    { ...signupBody, email: "not-an-email" },
    { ...signupBody, password: "x" },
    { ...signupBody, name: 7 },
  ];

  for (const body of invalidBodies) {
    const response = await postJson(fixture, supertest(fixture.app.getHttpServer()), "/api/auth/signup", body);
    assert.equal(response.status, 400, response.text);
    assert.equal(responseError(response).code, "VALIDATION_ERROR");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.doesNotMatch(response.text, /Abcdef1!|passwordHash|stack|mongodb:\/\//i);
  }
  assert.equal(await fixture.database.collection("users").countDocuments(), 0);
});

void test("signup: unique index permits one of four concurrent normalized-email requests", async (context) => {
  const fixture = await fixtureFor(context);
  const emails = ["race@example.com", " RACE@example.com ", "Race@Example.com", "race@EXAMPLE.COM"];
  const responses = await Promise.all(emails.map((email) => postJson(
    fixture,
    supertest(fixture.app.getHttpServer()),
    "/api/auth/signup",
    { ...signupBody, email },
  )));

  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409, 409, 409]);
  assert.equal(responses.filter(({ status }) => status === 201).length, 1);
  assert.ok(responses.filter(({ status }) => status === 409).every((response) => responseError(response).code === "EMAIL_ALREADY_REGISTERED"));
  assert.equal(await fixture.database.collection("users").countDocuments({ email: "race@example.com" }), 1);
});

void test("signup: protected identity returns only the user bound to the persisted session", async (context) => {
  const fixture = await fixtureFor(context);
  const anonymous = await supertest(fixture.app.getHttpServer())
    .get("/api/auth/me")
    .set("Origin", fixture.config.appOrigin);
  assert.equal(anonymous.status, 401, anonymous.text);
  assert.equal(responseError(anonymous).code, "UNAUTHENTICATED");
  assert.equal(anonymous.headers["cache-control"], "no-store");

  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", signupBody);
  assert.equal(signup.status, 201, signup.text);
  const identity = await fixture.agent
    .get("/api/auth/me")
    .set("Origin", fixture.config.appOrigin);
  assert.equal(identity.status, 200, identity.text);
  assert.deepEqual(responseUser(identity), responseUser(signup));
  assert.equal(identity.headers["cache-control"], "no-store");
  assert.doesNotMatch(identity.text, /passwordHash|password|session/i);

  const sessionBeforeRemoval = await fixture.database.collection("sessions").findOne();
  assert.ok(sessionBeforeRemoval);
  const authBeforeRemoval = storedAuth(sessionBeforeRemoval["session"]);
  await fixture.database.collection("users").deleteOne({ _id: new ObjectId(authBeforeRemoval.userId) });

  const staleIdentity = await fixture.agent
    .get("/api/auth/me")
    .set("Origin", fixture.config.appOrigin);
  assert.equal(staleIdentity.status, 401, staleIdentity.text);
  assert.equal(responseError(staleIdentity).code, "UNAUTHENTICATED");
  assert.equal(staleIdentity.headers["cache-control"], "no-store");
  const cookieName = sessionCookieConfiguration(fixture.config.nodeEnv).name;
  const clearedCookies = cookieHeaders(staleIdentity);
  assert.ok(clearedCookies.some((cookie: string) => cookie.startsWith(`${cookieName}=`) && /Expires=Thu, 01 Jan 1970/i.test(cookie)));
  const sessionAfterRemoval = await fixture.database.collection("sessions").findOne();
  assert.ok(sessionAfterRemoval, "the request must detach rather than persist its missing account session");
  const authAfterRemoval = storedAuth(sessionAfterRemoval["session"]);
  assert.deepEqual(authAfterRemoval, authBeforeRemoval, "rejected identity must not renew or persist session activity");
});

void test("me: recognized user lookup outages return safe service unavailable errors", async (context) => {
  const fixture = await fixtureFor(context);
  const signup = await postJson(fixture, fixture.agent, "/api/auth/signup", signupBody);
  assert.equal(signup.status, 201, signup.text);
  const users = fixture.app.get<Model<UserRecord>>(getModelToken(USER_MODEL_NAME));
  const originalFindById = Object.getOwnPropertyDescriptor(users, "findById");
  Object.defineProperty(users, "findById", {
    configurable: true,
    value: () => ({ exec: () => Promise.reject(new MongoNetworkError("injected account lookup outage")) }),
  });

  try {
    const response = await fixture.agent
      .get("/api/auth/me")
      .set("Origin", fixture.config.appOrigin);
    assert.equal(response.status, 503, response.text);
    assert.equal(responseError(response).code, "SERVICE_UNAVAILABLE");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.doesNotMatch(response.text, /injected|mongodb:|stack/i);
  } finally {
    if (originalFindById) Object.defineProperty(users, "findById", originalFindById);
    else Reflect.deleteProperty(users, "findById");
  }
});

void test("signup: recovery uses normal signin after a failed save leaves the account", async (context) => {
  const fixture = await fixtureFor(context);
  const storeSetCalls = failFirstStoreSet(fixture);
  const failed = await postJson(fixture, fixture.agent, "/api/auth/signup", {
    email: "recover@example.com",
    name: "Ada Lovelace",
    password: "Abcde\u0301f1!",
  });

  assert.equal(failed.status, 503, failed.text);
  assert.equal(responseError(failed).code, "SESSION_STORE_UNAVAILABLE");
  const cookieName = "easygen.sid";
  const failedSetCookie = failed.headers["set-cookie"];
  const failedCookieHeaders = Array.isArray(failedSetCookie) ? failedSetCookie : [];
  assert.ok(failedCookieHeaders.every((cookie: string) => !cookie.startsWith(`${cookieName}=s%3A`)));
  assert.equal(await fixture.database.collection("users").countDocuments({ email: "recover@example.com" }), 1);
  assert.equal(storeSetCalls(), 1);

  const recovered = await postJson(fixture, supertest(fixture.app.getHttpServer()), "/api/auth/signin", {
    email: "recover@example.com",
    password: "Abcdéf1!",
  });
  assert.equal(recovered.status, 200, recovered.text);
  assert.equal(responseUser(recovered).email, "recover@example.com");
});
