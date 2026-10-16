# Core authentication and security gate

Verified 2026-10-16 with Node `v24.22.0` and npm `11.19.1` from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin`, against the project's healthy MongoDB 8.0 service. The required K097 gate passed after T091–T096 were present.

```text
npm run test:integration && npm run test:unit
  Real-Mongo API integration: 34 passed, 0 failed
  Auth contract unit tests:   53 passed, 0 failed (2 files)
  Web unit tests:             99 passed, 0 failed (10 files)
  API unit tests:             61 passed, 0 failed
  Total:                     247 passed, 0 failed
```

The integration suite exercises signup/signin and anonymous denial, duplicate-account races, idle and absolute session expiry, renewal persistence, logout destruction and captured-cookie replay, recognized session-store outages, proxy trust and secure-cookie behavior, Origin/Referer/AJAX/media/body boundaries, exact per-route throttling, and safe request completion logging. Unit suites include password-work limits, rate-limit retry headers, session policy and middleware behavior, auth outcome/concurrency and route-trust state, and request-log redaction.

Focused checks also passed:

- K091: `npm run build:test:api -- apps/api/test/security.integration.test.ts && node --test --test-name-pattern='csrf:' apps/api/dist-test/targets/security.integration.test/test/security.integration.test.js` — 4/4.
- K092: peer-owned real proxy and production-cookie cases — 3/3 after the added actual API IP/throttle case; rerun in K097's 34/34 integration gate.
- K093: `npm run build:test:api -- apps/api/test/session.integration.test.ts && node --test --test-name-pattern='storage-failure:' apps/api/dist-test/targets/session.integration.test/test/session.integration.test.js` — 5/5.
- K094: `npm run build:test:api -- apps/api/test/security.integration.test.ts && node --test --test-name-pattern='throttle:' apps/api/dist-test/targets/security.integration.test/test/security.integration.test.js` — 1/1 aggregate test, covering four endpoint limits.
- K095: `npm run build:test:api -- apps/api/test/request-log.test.ts && node --test --test-name-pattern='request-log:' apps/api/dist-test/targets/request-log.test/test/request-log.test.js` — 2/2, following an intended no-op-logger RED of 0/2.
- K096: `npm run test:integration && npm run test:unit:api` — 34/34 integration and 61/61 API unit; K097 subsequently reran these same suites on the final monotonic-clock logger code.

The request completion logger writes only a generated request ID, method, route template (or the constant `unmatched`), response status, and monotonic elapsed milliseconds. Tests exercise raw query, body, path-parameter, authorization/cookie, and exception-stack secrets and verify they do not appear in the records. The runtime Nest assertion confirms the middleware is registered after ID generation and emits the API route template without the raw URL.

The core gate does not cover the following visual/accessibility/browser checks; those are subsequent tasks. Client tests also do not claim that a transport-rejected request was cancelled or that operations are globally ordered across browser tabs, devices, or direct clients.
