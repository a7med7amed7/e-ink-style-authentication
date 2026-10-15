# Phase 2 session primitives T025/T028/T030 evidence

Owned files:
- `apps/api/test/session-policy.test.ts`
- `apps/api/src/session/policy.ts`
- `apps/api/src/types/express-session.d.ts`
- `apps/api/test/session-cookie.test.ts`
- `apps/api/src/session/cookie.ts`

## T025 / K025 — policy tests and implementation

The red-first K025 attempt was run before `policy.ts` existed:

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/session-policy.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='session-policy:' apps/api/dist-test/targets/session-policy.test/test/session-policy.test.js
```

Observed exit 1 during compilation, with the expected missing-module diagnostic only:

```text
test/session-policy.test.ts(3,57): error TS2307: Cannot find module '../src/session/policy.js' or its corresponding type declarations.
```

The test runner did not execute because the build command failed. After implementation, the exact K025 command passed all five session-policy tests (exit 0): deadline calculation, idle/absolute equality, malformed/future metadata, renewal preserving authentication time, and rejection after absolute expiry.

## T028 / K028 — policy implementation

Command:

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/session-policy.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='session-policy: deadlines' apps/api/dist-test/targets/session-policy.test/test/session-policy.test.js
```

Observed exit 0; the focused deadline test passed (1/1). The focused TypeScript test build also compiled the policy implementation and Express session declaration augmentation.

## T030 / K030 — cookie policy and pinned touch

The red-first K030 attempt was run before `cookie.ts` existed. It exited 1 during compilation with the expected missing-module diagnostic:

```text
test/session-cookie.test.ts(9,8): error TS2307: Cannot find module '../src/session/cookie.js' or its corresponding type declarations.
```

The first post-implementation run had 5/6 assertions pass. The remaining assertion's fixture expected the absolute deadline while its `lastActivityAt` made the idle deadline earlier; the implementation correctly returned `min(idle, absolute)`. I moved the fixture activity time to seven hours fifty minutes after authentication so the absolute bound is the earlier deadline. The exact K030 rerun then passed all six tests (exit 0): production `__Host-`/Secure options, development and test cookie name, minimum deadline pinning, clear options without lifetime attributes, nonenumerable no-op touch, and Date validation/cloning.

Final command:

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/session-cookie.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='session-cookie:' apps/api/dist-test/targets/session-cookie.test/test/session-cookie.test.js
```

## Additional strict checks

- `PATH=/tmp/easygen-node-v24.22.0/bin:$PATH ./node_modules/.bin/eslint apps/api/src/session/policy.ts apps/api/src/types/express-session.d.ts apps/api/src/session/cookie.ts apps/api/test/session-policy.test.ts apps/api/test/session-cookie.test.ts` — exit 0 after adding explicit `void` markers to Node test registrations and tightening non-null assertions.
- `PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:api` — exit 0 (`tsc -p tsconfig.json`).

## Interfaces for dependent lanes

- `SessionPolicy(wallClock?: () => number)` uses epoch-millisecond metadata and exports `deadlines(value: unknown): SessionDeadlines | null`, `isActive(value: unknown): value is SessionAuthMetadata`, and `renew(value: unknown): SessionAuthMetadata | null`. `SessionDeadlines` carries `idleDeadline`, `absoluteDeadline`, and `deadline`; equality is inactive. The `express-session` module augmentation adds optional `SessionData.auth` with `{userId, authenticatedAt, lastActivityAt}`.
- `sessionCookieConfiguration(nodeEnv)` returns the cookie name plus HttpOnly, SameSite Strict, Path=/ and 30-minute maxAge; production uses `__Host-easygen.sid` and Secure, while development/test use `easygen.sid` without Secure.
- `clearSessionCookieOptions(nodeEnv)` returns matching flags and omits `maxAge`, `expires`, and `domain`.
- `pinSessionCookie(session, deadline: number | Date)` clones and pins the explicit expiry; invalid timestamps throw `RangeError`.
- `installPinnedTouch(session)` installs an own nonenumerable no-op `touch()` returning the same session and leaving cookie expiry unchanged.
