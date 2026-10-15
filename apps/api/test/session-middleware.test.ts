import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import express from "express";
import session, { type SessionOptions, type SessionData } from "express-session";
import type { MongoStore } from "connect-mongo";
import { MongoNetworkError } from "mongodb";
import supertest from "supertest";
import { test } from "node:test";
import { parseConfig } from "../src/config.js";
import { SessionStoreAdapter } from "../src/session/store.js";
import { SessionPolicy } from "../src/session/policy.js";
import { createOriginMiddleware } from "../src/security/origin.middleware.js";
import {
  createSessionMiddleware,
  createSessionOptions,
} from "../src/session/session.middleware.js";

const REQUEST_ID = "8a1b2345-6789-4abc-8def-0123456789ab";
const APP_ORIGIN = "http://127.0.0.1:5173";
const SESSION_SECRET = Buffer.from("test-only session key with at least 32 bytes").toString("base64");

const config = parseConfig({
  NODE_ENV: "test",
  APP_ORIGIN,
  MONGODB_URI: "mongodb://127.0.0.1:27017/easygen",
  SESSION_SECRET,
});

type StoreCallback = (error: unknown, value?: SessionData | null) => void;

class FakeMongoStore extends EventEmitter {
  readonly values = new Map<string, SessionData>();
  getCalls = 0;
  setCalls = 0;
  destroyCalls = 0;
  getError: unknown = null;

  get(sid: string, callback: StoreCallback): void {
    this.getCalls += 1;
    const value = this.values.get(sid);
    callback(this.getError, value ? JSON.parse(JSON.stringify(value)) as SessionData : null);
  }

  set(sid: string, value: SessionData, callback: (error?: unknown) => void = () => {}): void {
    this.setCalls += 1;
    this.values.set(sid, JSON.parse(JSON.stringify(value)) as SessionData);
    callback(null);
  }

  destroy(sid: string, callback: (error?: unknown) => void = () => {}): void {
    this.destroyCalls += 1;
    this.values.delete(sid);
    callback(null);
  }
}

interface Harness {
  readonly app: express.Express;
  readonly agent: ReturnType<typeof supertest.agent>;
  readonly mongoStore: FakeMongoStore;
  readonly now: () => number;
  setNow(timestamp: number): void;
  readonly routeCalls: { inspect: number; rejected: number };
}

interface InspectionBody {
  readonly hasSession: boolean;
  readonly hasAuth: boolean;
  readonly expiresAt: number | null;
  readonly hasOwnTouch: boolean;
  readonly touchEnumerable: boolean | null;
}

interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly requestId?: string;
  };
}

function inspectionBody(body: unknown): InspectionBody {
  return body as InspectionBody;
}

function apiErrorBody(body: unknown): ApiErrorBody {
  return body as ApiErrorBody;
}

function createHarness(): Harness {
  const mongoStore = new FakeMongoStore();
  const adapter = new SessionStoreAdapter(mongoStore as unknown as MongoStore);
  let timestamp = Date.now();
  const now = (): number => timestamp;
  const policy = new SessionPolicy(now);
  const app = express();
  const routeCalls = { inspect: 0, rejected: 0 };

  app.use((request, _response, next) => {
    Object.assign(request, { requestId: REQUEST_ID });
    next();
  });
  app.use(createOriginMiddleware(config.appOrigin));
  app.use(createSessionMiddleware({ config, store: adapter, policy }));
  app.post("/seed", (request, response) => {
    request.session.auth = {
      userId: "64d5a21d6a1c9f0c2a1b0001",
      authenticatedAt: timestamp,
      lastActivityAt: timestamp,
    };
    response.status(204).end();
  });
  app.get("/inspect", (request, response) => {
    routeCalls.inspect += 1;
    const current = (request as unknown as {
      session?: session.Session & Partial<session.SessionData>;
    }).session;
    const ownTouch = current ? Object.getOwnPropertyDescriptor(current, "touch") : undefined;
    const cookie = current
      ? JSON.parse(JSON.stringify(current.cookie)) as { expires?: string | null }
      : undefined;
    response.json({
      hasSession: current !== undefined,
      hasAuth: current?.auth !== undefined,
      expiresAt: cookie?.expires ? Date.parse(cookie.expires) : null,
      hasOwnTouch: ownTouch !== undefined,
      touchEnumerable: ownTouch?.enumerable ?? null,
    });
  });
  app.post("/mutate", (_request, response) => {
    routeCalls.rejected += 1;
    response.status(204).end();
  });

  return {
    app,
    agent: supertest.agent(app),
    mongoStore,
    now,
    setNow: (nextTimestamp) => { timestamp = nextTimestamp; },
    routeCalls,
  };
}

function postHeaders(request: ReturnType<ReturnType<typeof supertest.agent>["post"]>) {
  return request.set("Origin", APP_ORIGIN).set("X-Requested-With", "XMLHttpRequest");
}

void test("session-middleware: configures the required signed Mongo session policy", () => {
  const store = new SessionStoreAdapter(new FakeMongoStore() as unknown as MongoStore);
  const options: SessionOptions = createSessionOptions(config, store);

  assert.equal(options.name, "easygen.sid");
  assert.equal(options.secret, config.sessionSecret);
  assert.equal(options.store, store);
  assert.equal(options.resave, false);
  assert.equal(options.saveUninitialized, false);
  assert.equal(options.rolling, true);
  assert.equal(options.unset, "keep");
  assert.deepEqual(options.cookie, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    path: "/",
    maxAge: 1_800_000,
  });
  assert.equal("proxy" in options, false);
});

void test("session-middleware: anonymous reads do not persist or set a cookie", async () => {
  const harness = createHarness();
  const response = await harness.agent.get("/inspect");

  assert.equal(response.status, 200);
  const body = inspectionBody(response.body);
  assert.equal(body.hasSession, true);
  assert.equal(body.hasAuth, false);
  assert.equal(typeof body.expiresAt, "number");
  assert.equal(body.hasOwnTouch, true);
  assert.equal(body.touchEnumerable, false);
  assert.equal(harness.mongoStore.getCalls, 0);
  assert.equal(harness.mongoStore.setCalls, 0);
  assert.equal(response.headers["set-cookie"], undefined);
});

void test("session-middleware: pins loaded auth expiry without renewing or persisting", async () => {
  const harness = createHarness();
  const initialTime = harness.now();
  const seeded = await postHeaders(harness.agent.post("/seed")).expect(204);
  assert.equal(harness.mongoStore.setCalls, 1);
  assert.ok(seeded.headers["set-cookie"]);

  harness.setNow(initialTime + 5 * 60_000);
  const response = await harness.agent.get("/inspect").expect(200);
  assert.deepEqual(inspectionBody(response.body), {
    hasSession: true,
    hasAuth: true,
    expiresAt: initialTime + 30 * 60_000,
    hasOwnTouch: true,
    touchEnumerable: false,
  });
  assert.equal(harness.mongoStore.getCalls, 1);
  assert.equal(harness.mongoStore.setCalls, 1);
});

void test("session-middleware: expired auth detaches the request and clears the cookie", async () => {
  const harness = createHarness();
  const initialTime = harness.now();
  await postHeaders(harness.agent.post("/seed")).expect(204);
  harness.setNow(initialTime + 30 * 60_000);

  const response = await harness.agent.get("/inspect").expect(200);
  assert.deepEqual(inspectionBody(response.body), {
    hasSession: false,
    hasAuth: false,
    expiresAt: null,
    hasOwnTouch: false,
    touchEnumerable: null,
  });
  assert.match(response.headers["set-cookie"]?.[0] ?? "", /^easygen\.sid=;/);
  assert.equal(harness.mongoStore.setCalls, 1);
  assert.equal(harness.mongoStore.destroyCalls, 0);
});

void test("session-middleware: origin rejection precedes session reads and writes", async () => {
  const harness = createHarness();
  await postHeaders(harness.agent.post("/seed")).expect(204);
  const readsBeforeReject = harness.mongoStore.getCalls;
  const writesBeforeReject = harness.mongoStore.setCalls;

  const response = await harness.agent
    .post("/mutate")
    .set("Origin", "https://attacker.example")
    .set("X-Requested-With", "XMLHttpRequest")
    .expect(403);

  assert.equal(apiErrorBody(response.body).error.code, "UNTRUSTED_ORIGIN");
  assert.equal(harness.mongoStore.getCalls, readsBeforeReject);
  assert.equal(harness.mongoStore.setCalls, writesBeforeReject);
  assert.equal(harness.routeCalls.rejected, 0);
});

void test("session-middleware: maps raw Mongo read outages before the route with no-store", async () => {
  const harness = createHarness();
  await postHeaders(harness.agent.post("/seed")).expect(204);
  harness.mongoStore.getError = new MongoNetworkError("private host and credentials");

  const response = await harness.agent.get("/inspect").expect(503);

  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-request-id"], REQUEST_ID);
  const error = apiErrorBody(response.body).error;
  assert.equal(error.code, "SESSION_STORE_UNAVAILABLE");
  assert.equal(error.requestId, REQUEST_ID);
  assert.equal(harness.routeCalls.inspect, 0);
  assert.equal(harness.mongoStore.setCalls, 1);
});
