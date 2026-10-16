# Phase 7 security lane (T091–T097)

Updated 2026-10-16. Verification used Node v24.22.0/npm 11.19.1 from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin` and the healthy project MongoDB 8.0 service. This lane changed the HTTP security integration tests, request completion logger and bootstrap registration. The root orchestrator owns task checkbox reconciliation and commits; this report does not change either.

## HTTP boundary and proxy coverage

T091/K091 adds real-Nest, real-Mongo cases for missing, null, malformed, untrusted, and list-valued Origin headers across all POST routes; trusted Referer fallback only when Origin is absent; exact `XMLHttpRequest` requirements; UTF-8 JSON charset; invalid media, malformed JSON, and payloads over 16 KiB; and bodyless logout. Rejected calls check the safe error envelope, no-store, request ID, and absence of account creation. These behaviors already existed, so the targeted tests were green regressions rather than manufactured RED cases.

```text
npm run build:test:api -- apps/api/test/security.integration.test.ts && node --test --test-name-pattern='csrf:' apps/api/dist-test/targets/security.integration.test/test/security.integration.test.js
  4 passed, 0 failed
```

T092/K092 is peer-owned. Its final integration coverage uses an actual HTTP proxy and production Nest app to verify the proxy overwrites forwarded claims, only the configured socket peer influences Express `req.ip`/`req.secure`, rejected spoofing cannot obtain a Secure renewal cookie, and `__Host` cookies have Secure/HttpOnly/SameSite/Path flags with no Domain when the trusted HTTPS proxy is used. The peer reported the strengthened focused lane green 3/3; the final aggregate integration suite below reran it.

T093/K093 is peer-owned. Five real-Mongo cases inject recognized session `get`, renewal `set`, and `destroy` outages; sanitize unexpected read failures; verify no false authentication/invalidation or response-end retry; verify cookie and persisted deadline invariants; and prove rejected Origin/throttling cannot persist a renewal. My read-only review found no blocking gaps.

```text
npm run build:test:api -- apps/api/test/session.integration.test.ts && node --test --test-name-pattern='storage-failure:' apps/api/dist-test/targets/session.integration.test/test/session.integration.test.js
  5 passed, 0 failed
```

T094/K094 covers the exact signup (5), signin (10), `/me` (120), and logout (30) limits; the next request receives 429 and a positive integer `Retry-After` in seconds. It observes the real `PasswordService` and proves a rejected signup/signin causes no additional hash, real verification, or dummy verification. A second real-Mongo fixture repeats the same route/email independently without shared limiter or database state.

```text
npm run build:test:api -- apps/api/test/security.integration.test.ts && node --test --test-name-pattern='throttle:' apps/api/dist-test/targets/security.integration.test/test/security.integration.test.js
  1 passed, 0 failed (the single aggregate case checks all four routes)
```

The first bodyless-logout assertion used a standalone Supertest request for signup and therefore did not retain its cookie. The test now uses the fixture agent; the corrected behavior test passes. This was a fixture setup correction, not a product failure.

## Safe completion logging

T095/K095 followed a test-first redaction cycle. The two request-log tests failed against a no-op middleware (0/2), then passed after the implementation (2/2). The logger emits exactly a generated request ID, method, Express route template, response status, and monotonic elapsed milliseconds. It uses a constant `unmatched` label if Express has no route template and never copies the URL, query, body, authorization/cookie headers, or error/stack data. The tests cover query/body/header secrets, a raw path parameter, a 404, and a failed route.

```text
npm run build:test:api -- apps/api/test/request-log.test.ts && node --test --test-name-pattern='request-log:' apps/api/dist-test/targets/request-log.test/test/request-log.test.js
  2 passed, 0 failed
```

T096 registers the logger directly after the request-ID middleware and before security/origin, static, session, and body handling. A real-Nest integration assertion verifies that a generated ID and `/api/auth/me` route pattern are logged for a 401, while an authorization header and secret query value are omitted. Proxy trust configuration and existing middleware order remain intact. Review found no blocker; it noted and prompted the switch from wall-clock to monotonic elapsed time.

```text
npm run test:integration && npm run test:unit:api
  integration: 34 passed, 0 failed
  API unit:    61 passed, 0 failed
```

## Core security gate

The exact K097 command passed after all changes above. It exercises the real-Mongo integration suite and all unit workspaces, including session deadlines and logout replay, duplicate registration, security middleware, password-work admission, route limits, client outcomes/concurrency, and the request-log allowlist/runtime integration assertion.

```text
npm run test:integration && npm run test:unit
  integration: 34 passed, 0 failed
  shared:      53 passed, 0 failed (2 files)
  web:         99 passed, 0 failed (10 files)
  API unit:    61 passed, 0 failed
  total:       247 passed, 0 failed
```

The focused request-log ESLint check and `git diff --check` also exited 0. K097 is a code/security gate; it does not include the later accessibility, responsive, reduced-motion, or browser E2E checks.

## Limits

An HTTP transport rejection cannot prove that the server stopped processing an earlier credential request. Client-side outcome tests retain that uncertainty after later anonymous/authenticated reads and logout; this lane makes no global ordering claim across tabs, devices, or direct clients. Unmatched/static requests are logged only with `route: "unmatched"`, which limits route-level diagnostic detail while withholding raw paths.
