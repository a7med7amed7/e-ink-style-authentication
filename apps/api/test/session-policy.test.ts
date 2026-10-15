import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionPolicy, type SessionAuthMetadata } from "../src/session/policy.js";

const IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1_000;
const VALID_USER_ID = "64d5a21d6a1c9f0c2a1b0001";

function sessionMetadata(
  overrides: Partial<SessionAuthMetadata> = {},
): SessionAuthMetadata {
  return {
    userId: VALID_USER_ID,
    authenticatedAt: 1_000_000,
    lastActivityAt: 1_000_000,
    ...overrides,
  };
}

void test("session-policy: deadlines use idle and absolute bounds from authentication metadata", () => {
  const now = 1_000_001;
  const policy = new SessionPolicy(() => now);
  const auth = sessionMetadata();

  assert.deepEqual(policy.deadlines(auth), {
    idleDeadline: auth.lastActivityAt + IDLE_TIMEOUT_MS,
    absoluteDeadline: auth.authenticatedAt + ABSOLUTE_TIMEOUT_MS,
    deadline: auth.lastActivityAt + IDLE_TIMEOUT_MS,
  });
  assert.equal(policy.isActive(auth), true);
});

void test("session-policy: equality at either deadline is expired", () => {
  const idleExpiry = sessionMetadata({
    authenticatedAt: 1_000_000,
    lastActivityAt: 1_000_000,
  });
  const idlePolicy = new SessionPolicy(
    () => idleExpiry.lastActivityAt + IDLE_TIMEOUT_MS,
  );
  assert.equal(idlePolicy.isActive(idleExpiry), false);

  const absoluteExpiry = sessionMetadata({
    authenticatedAt: 1_000_000,
    lastActivityAt: 1_000_000 + 7 * 60 * 60 * 1_000,
  });
  const absolutePolicy = new SessionPolicy(
    () => absoluteExpiry.authenticatedAt + ABSOLUTE_TIMEOUT_MS,
  );
  assert.equal(absolutePolicy.isActive(absoluteExpiry), false);
});

void test("session-policy: malformed and future-inconsistent metadata has no deadlines", () => {
  const policy = new SessionPolicy(() => 2_000_000);
  const malformed: readonly unknown[] = [
    null,
    undefined,
    {},
    { userId: "", authenticatedAt: 1_000_000, lastActivityAt: 1_000_000 },
    { userId: VALID_USER_ID, authenticatedAt: "1000000", lastActivityAt: 1_000_000 },
    { userId: VALID_USER_ID, authenticatedAt: Number.NaN, lastActivityAt: 1_000_000 },
    { userId: VALID_USER_ID, authenticatedAt: 1_000_001, lastActivityAt: 1_000_000 },
    { userId: VALID_USER_ID, authenticatedAt: 2_000_001, lastActivityAt: 2_000_001 },
    { userId: VALID_USER_ID, authenticatedAt: 1_000_000, lastActivityAt: 2_000_001 },
  ];

  for (const candidate of malformed) {
    assert.equal(policy.deadlines(candidate), null);
    assert.equal(policy.isActive(candidate), false);
  }
});

void test("session-policy: deadlines reject malformed user ObjectId metadata", () => {
  const policy = new SessionPolicy(() => 2_000_000);
  const malformedIds = ["", "u1", "g".repeat(24), "a".repeat(23), "a".repeat(25)];

  for (const userId of malformedIds) {
    const candidate = sessionMetadata({ userId });
    assert.equal(policy.deadlines(candidate), null, `accepted userId ${JSON.stringify(userId)}`);
    assert.equal(policy.isActive(candidate), false, `activated userId ${JSON.stringify(userId)}`);
  }
});

void test("session-policy: renewal advances idle time without changing authentication time", () => {
  const now = 1_500_000;
  const policy = new SessionPolicy(() => now);
  const auth = sessionMetadata({ lastActivityAt: 1_200_000 });
  const renewed = policy.renew(auth);

  assert.deepEqual(renewed, {
    userId: auth.userId,
    authenticatedAt: auth.authenticatedAt,
    lastActivityAt: now,
  });
  assert.ok(renewed);
  assert.equal(renewed.authenticatedAt, auth.authenticatedAt);
  assert.equal(renewed.lastActivityAt, now);
});

void test("session-policy: expired absolute lifetime cannot be renewed", () => {
  const auth = sessionMetadata();
  const policy = new SessionPolicy(
    () => auth.authenticatedAt + ABSOLUTE_TIMEOUT_MS,
  );

  assert.equal(policy.renew(auth), null);
});
