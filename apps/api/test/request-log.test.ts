import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import express, { type Request } from "express";
import supertest from "supertest";
import { test } from "node:test";
import {
  createRequestCompletionLogger,
  type RequestCompletionLog,
} from "../src/common/request-log.js";

function loggingApp(): { readonly app: express.Express; readonly records: RequestCompletionLog[] } {
  const app = express();
  const records: RequestCompletionLog[] = [];
  let timestamp = 1_000;

  app.use((request: Request, _response, next) => {
    Object.assign(request, { requestId: randomUUID() });
    next();
  });
  app.use(express.json());
  app.use(createRequestCompletionLogger({
    now: () => {
      timestamp += 25;
      return timestamp;
    },
    write: (record) => {
      records.push(record);
    },
  }));

  return { app, records };
}

void test("request-log: writes only generated ID, method, route template, status, and elapsed time", async () => {
  const { app, records } = loggingApp();
  app.post("/api/auth/users/:userId", (_request, response) => response.status(201).send("created"));

  const response = await supertest(app)
    .post("/api/auth/users/raw-user-secret?token=raw-query-secret")
    .set("Cookie", "sid=raw-cookie-secret")
    .set("Authorization", "Bearer raw-authorization-secret")
    .send({
      email: "raw-email-secret@example.test",
      password: "raw-password-secret",
      hash: "raw-hash-secret",
    });

  assert.equal(response.status, 201);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record);
  assert.deepEqual(Object.keys(record).sort(), ["elapsedMs", "method", "requestId", "route", "status"]);
  assert.match(record.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(record, {
    requestId: record.requestId,
    method: "POST",
    route: "/api/auth/users/:userId",
    status: 201,
    elapsedMs: 25,
  });

  const serialized = JSON.stringify(record);
  for (const secret of [
    "raw-user-secret",
    "raw-query-secret",
    "raw-cookie-secret",
    "raw-authorization-secret",
    "raw-email-secret@example.test",
    "raw-password-secret",
    "raw-hash-secret",
  ]) {
    assert.equal(serialized.includes(secret), false, `request log included ${secret}`);
  }
});

void test("request-log: unmatched and failed routes do not expose raw URI or error stack", async () => {
  const { app, records } = loggingApp();
  app.get("/api/auth/failure", (_request, _response, next) => {
    next(new Error("private-stack-secret"));
  });
  const safeErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    response.status(500).json({ error: "safe failure" });
  };
  app.use(safeErrorHandler);

  const unmatched = await supertest(app)
    .get("/api/auth/unknown-user-secret?token=unknown-query-secret");
  assert.equal(unmatched.status, 404);

  const failed = await supertest(app).get("/api/auth/failure?token=failed-query-secret");
  assert.equal(failed.status, 500);
  assert.deepEqual(records.map(({ route, status }) => ({ route, status })), [
    { route: "unmatched", status: 404 },
    { route: "/api/auth/failure", status: 500 },
  ]);

  const serialized = JSON.stringify(records);
  for (const secret of [
    "unknown-user-secret",
    "unknown-query-secret",
    "failed-query-secret",
    "private-stack-secret",
    "stack",
  ]) {
    assert.equal(serialized.includes(secret), false, `request log included ${secret}`);
  }
});
