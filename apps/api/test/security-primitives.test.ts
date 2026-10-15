import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { test } from "node:test";
import { createOriginMiddleware } from "../src/security/origin.middleware.js";

const APP_ORIGIN = "http://localhost:5173";
const REQUEST_ID = "8a1b2345-6789-4abc-8def-0123456789ab";

function createApp(): express.Express {
  const app = express();
  app.use((request, _response, next) => {
    Object.assign(request, { requestId: REQUEST_ID });
    next();
  });
  app.use("/api/auth", createOriginMiddleware(APP_ORIGIN));
  app.post("/api/auth/signup", (_request, response) => response.status(204).end());
  app.post("/api/auth/signin", (_request, response) => response.status(204).end());
  app.post("/api/auth/logout", (_request, response) => response.status(204).end());
  app.get("/api/auth/me", (_request, response) => response.status(204).end());
  return app;
}

function validPost(path: string) {
  return request(createApp())
    .post(path)
    .set("Origin", APP_ORIGIN)
    .set("X-Requested-With", "XMLHttpRequest");
}

function assertApiError(
  response: { status: number; headers: Record<string, string | string[] | undefined>; body: unknown },
  status: number,
  code: string,
): void {
  assert.equal(response.status, status);
  assert.equal(response.headers["cache-control"], "no-store");
  const body = response.body as {
    error: { code?: unknown; requestId?: unknown };
  };
  assert.equal(body.error.code, code);
  assert.equal(body.error.requestId, REQUEST_ID);
  assert.equal(response.headers["x-request-id"], REQUEST_ID);
}

void test("origin: exact Origin and UTF-8 JSON charset are accepted for signup", async () => {
  const response = await validPost("/api/auth/signup")
    .set("Content-Type", "application/json; charset=utf-8")
    .send({ email: "person@example.com", name: "Person", password: "Valid123!" });

  assert.equal(response.status, 204);
});

void test("origin: exact Origin accepts JSON without a charset parameter", async () => {
  const response = await validPost("/api/auth/signin")
    .set("Content-Type", "application/json")
    .send({ email: "person@example.com", password: "Valid123!" });

  assert.equal(response.status, 204);
});

void test("origin: null, untrusted, malformed, and list Origins reject despite trusted Referer", async () => {
  const app = createApp();
  const origins = [
    "null",
    "http://localhost:5174",
    "not an origin",
    `${APP_ORIGIN}, https://evil.example`,
  ];

  for (const origin of origins) {
    const response = await request(app)
      .post("/api/auth/signup")
      .set("Origin", origin)
      .set("Referer", `${APP_ORIGIN}/signup`)
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ email: "person@example.com", name: "Person", password: "Valid123!" });

    assertApiError(response, 403, "UNTRUSTED_ORIGIN");
  }
});

void test("origin: trusted Referer is used only when Origin is absent", async () => {
  const app = createApp();
  const accepted = await request(app)
    .post("/api/auth/signup")
    .set("Referer", `${APP_ORIGIN}/signup?source=form`)
    .set("X-Requested-With", "XMLHttpRequest")
    .send({ email: "person@example.com", name: "Person", password: "Valid123!" });

  assert.equal(accepted.status, 204);

  for (const referer of [undefined, "null", "not a URL", "http://evil.example/signup"]) {
    let pending = request(app)
      .post("/api/auth/signup")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ email: "person@example.com", name: "Person", password: "Valid123!" });
    if (referer !== undefined) pending = pending.set("Referer", referer);

    assertApiError(await pending, 403, "UNTRUSTED_ORIGIN");
  }
});

void test("origin: requires the exact XMLHttpRequest header value", async () => {
  const app = createApp();
  const missing = await request(app)
    .post("/api/auth/logout")
    .set("Origin", APP_ORIGIN);
  assertApiError(missing, 403, "CSRF_REJECTED");

  const wrong = await request(app)
    .post("/api/auth/logout")
    .set("Origin", APP_ORIGIN)
    .set("X-Requested-With", "xmlhttprequest");
  assertApiError(wrong, 403, "CSRF_REJECTED");
});

void test("origin: bodyless logout requires Origin and AJAX header but no JSON media type", async () => {
  const response = await request(createApp())
    .post("/api/auth/logout")
    .set("Origin", APP_ORIGIN)
    .set("X-Requested-With", "XMLHttpRequest");

  assert.equal(response.status, 204);
});

void test("origin: rejects unsupported media type on JSON body endpoints as validation error", async () => {
  const response = await request(createApp())
    .post("/api/auth/signup")
    .set("Origin", APP_ORIGIN)
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", "text/plain")
    .send("email=person%40example.com");

  assertApiError(response, 400, "VALIDATION_ERROR");
});

void test("origin: leaves safe GET identity requests outside the POST policy", async () => {
  const response = await request(createApp()).get("/api/auth/me");

  assert.equal(response.status, 204);
});
