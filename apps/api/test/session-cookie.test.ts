import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionPolicy, type SessionAuthMetadata } from "../src/session/policy.js";
import {
  clearSessionCookieOptions,
  installPinnedTouch,
  pinSessionCookie,
  sessionCookieConfiguration,
} from "../src/session/cookie.js";

const IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1_000;

interface TestSession {
  cookie: {
    expires: Date | null;
    originalMaxAge: number;
  };
  touch(): this;
}

function createSession(): TestSession {
  const prototype = {
    touch(this: TestSession) {
      this.cookie.expires = new Date(9_999_999_999_999);
      return this;
    },
  };
  return Object.assign(Object.create(prototype) as TestSession, {
    cookie: {
      expires: new Date(1_000_000),
      originalMaxAge: IDLE_TIMEOUT_MS,
    },
  });
}

function authMetadata(
  overrides: Partial<SessionAuthMetadata> = {},
): SessionAuthMetadata {
  return {
    userId: "64d5a21d6a1c9f0c2a1b0001",
    authenticatedAt: 1_000_000,
    lastActivityAt: 1_000_000,
    ...overrides,
  };
}

void test("session-cookie: production uses a Secure __Host cookie with required flags", () => {
  const configuration = sessionCookieConfiguration("production");

  assert.equal(configuration.name, "__Host-easygen.sid");
  assert.deepEqual(configuration.cookie, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: IDLE_TIMEOUT_MS,
  });
  assert.equal("domain" in configuration.cookie, false);
});

void test("session-cookie: development and test use the separate HTTP cookie name", () => {
  for (const nodeEnv of ["development", "test"] as const) {
    const configuration = sessionCookieConfiguration(nodeEnv);

    assert.equal(configuration.name, "easygen.sid");
    assert.equal(configuration.cookie.httpOnly, true);
    assert.equal(configuration.cookie.secure, false);
    assert.equal(configuration.cookie.sameSite, "strict");
    assert.equal(configuration.cookie.path, "/");
    assert.equal(configuration.cookie.maxAge, IDLE_TIMEOUT_MS);
    assert.equal("domain" in configuration.cookie, false);
  }
});

void test("session-cookie: pinning uses the earlier idle or absolute deadline", () => {
  const now = 1_000_000;
  const auth = authMetadata({
    authenticatedAt: now,
    lastActivityAt: now + (7 * 60 + 50) * 60 * 1_000,
  });
  const policy = new SessionPolicy(() => now + (7 * 60 + 50) * 60 * 1_000);
  const deadlines = policy.deadlines(auth);
  assert.ok(deadlines);

  const session = createSession();
  const expires = pinSessionCookie(session, deadlines.deadline);
  const pinnedExpires = session.cookie.expires;
  assert.ok(pinnedExpires);

  assert.equal(expires.getTime(), auth.authenticatedAt + ABSOLUTE_TIMEOUT_MS);
  assert.equal(pinnedExpires.getTime(), deadlines.deadline);
  assert.ok(pinnedExpires.getTime() <= deadlines.absoluteDeadline);
});

void test("session-cookie: clear options preserve matching flags and omit lifetime", () => {
  const development = clearSessionCookieOptions("development");
  const production = clearSessionCookieOptions("production");

  assert.deepEqual(development, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    path: "/",
  });
  assert.deepEqual(production, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
  });
  for (const options of [development, production]) {
    assert.equal("maxAge" in options, false);
    assert.equal("expires" in options, false);
    assert.equal("domain" in options, false);
  }
});

void test("session-cookie: pinned touch is nonenumerable and leaves the expiry unchanged", () => {
  const session = createSession();
  const expiration = session.cookie.expires?.getTime();
  const pinned = installPinnedTouch(session);

  assert.equal(pinned, session);
  assert.equal(Object.prototype.hasOwnProperty.call(session, "touch"), true);
  assert.equal(Object.getOwnPropertyDescriptor(session, "touch")?.enumerable, false);
  assert.equal(session.touch(), session);
  assert.equal(session.cookie.expires?.getTime(), expiration);
  assert.equal(JSON.stringify(session).includes("touch"), false);
});

void test("session-cookie: pinning clones Date inputs and rejects invalid dates", () => {
  const session = createSession();
  const deadline = new Date(5_000_000);

  pinSessionCookie(session, deadline);
  deadline.setTime(0);
  assert.equal(session.cookie.expires?.getTime(), 5_000_000);
  assert.throws(() => pinSessionCookie(session, Number.NaN), RangeError);
});

void test("session-cookie: pinning accepts Express expiry with an explicit undefined value", () => {
  const session: { cookie: { expires?: Date | null | undefined } } = {
    cookie: { expires: undefined },
  };

  const expires = pinSessionCookie(session, 6_000_000);

  assert.equal(expires.getTime(), 6_000_000);
  assert.equal(session.cookie.expires?.getTime(), 6_000_000);
});
