# Phase 7 proxy and session-store review

Updated 2026-10-16. Scope: T092/K092 and T093/K093. The focused integration suites use the persistent official Node v24.22.0/npm 11.19.1 runtime at `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin` and the project’s real local MongoDB service. No production source change was needed for T092/T093, and this lane did not change task checkboxes.

## T092 — verified proxy behavior

`apps/api/test/support/proxy.ts` now provides a real Node HTTP proxy and a production-mode API fixture. The proxy replaces the incoming `Host`, `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` with values derived from the socket and its configured HTTPS public host. Its upstream socket binds to the explicit trusted address `127.0.0.1`; clients can bind to the separate loopback address `127.0.0.2` to exercise an untrusted peer.

The API fixture constructs production config with only `127.0.0.1` trusted, an HTTPS app origin, a unique local Mongo database, and no `AppTestHooks` or test environment bypass. Tests confirm the rewritten headers at an actual HTTP upstream, the Express `req.ip`/`req.secure` behavior for a trusted proxy and an untrusted direct peer, and production `__Host-easygen.sid` cookie attributes. A Nest API rate-bucket regression sends 120 requests from client `.2` while changing spoofed XFF, observes 429 on request 121, then confirms client `.1` gets its own bucket and a direct untrusted `.2` request cannot spoof into a new one. The real production Nest app issues the Secure, HttpOnly, SameSite=Strict, Path=/ cookie without Domain through the trusted HTTPS proxy; a direct `.2` request with forged HTTPS does not get a refreshed cookie.

Exact final K092 command and result:

```text
npm run build:test:api -- apps/api/test/proxy.integration.test.ts && node --test --test-name-pattern='proxy:' apps/api/dist-test/targets/proxy.integration.test/test/proxy.integration.test.js
  3 passed, 0 failed
```

The production app factory requires built web assets. `apps/web/dist/index.html` was present for this run; clean-checkout execution therefore depends on running the normal build before K092.

## T093 — session-store failures and rejected renewal

`apps/api/test/session.integration.test.ts` now exercises the recognized read outage and `/me` renewal-save outage with one-shot callbacks against the real Mongo-backed fixture. A failed read returns `503 SESSION_STORE_UNAVAILABLE`, does not authenticate from fallback state or retry, leaves Mongo unchanged, and allows a later independent request to recover. A renewal-save outage returns 503, emits only the cookie deletion, makes exactly one underlying set call, performs no response-end retry, and leaves persisted activity and cookie expiry unchanged. An unrecognized read error remains a sanitized `500 INTERNAL_ERROR`.

The rejected-request regression proves a bad Origin performs no store write and leaves the prior session deadline unchanged. An admitted `/me` request performs one write; the immediately throttled follow-up performs no additional write and leaves both persisted timestamps and expiry unchanged. The existing destroy-outage test was tagged into K093 and continues to prove 503 without clearing the still-valid cookie or claiming logout succeeded.

Exact final K093 command and result:

```text
npm run build:test:api -- apps/api/test/session.integration.test.ts && node --test --test-name-pattern='storage-failure:' apps/api/dist-test/targets/session.integration.test/test/session.integration.test.js
  5 passed, 0 failed
```

No production fix was needed: the existing store adapter and session service meet these observed failure contracts.

## Owned lint and adjacent review

Targeted ESLint passed for the three owned files:

```text
npx eslint apps/api/test/support/proxy.ts apps/api/test/proxy.integration.test.ts apps/api/test/session.integration.test.ts
  exit 0
```

Read-only review of `apps/api/test/security.integration.test.ts` against T091/T094 found no blocker. Its POST matrix covers the origin/Referer/AJAX/media/body boundary, and its throttle test covers all four exact limits, seconds-based Retry-After, no password work on rejected credentials, and independent fixture limiter state. The owner reported fresh K091/K094 green runs (4/4 and 1/1 respectively); this review did not rerun them.

## Adjacent T095/T096 logging review

Read-only review against T095/T096 and the deployment logging contract found no blocker. The logger serializes only five fields: generated request ID, method, matched route template (or the constant `unmatched`), status, and elapsed milliseconds. It does not read the query, body, headers, URI, connection settings, or exception, so matched dynamic paths do not log their parameter values and unmatched requests do not expose raw paths. A 5xx is recorded as status metadata without a stack or error message. Bootstrap sets the explicit proxy trust list first, generates and returns the request ID before installing the completion logger, then installs the logger before security/origin/static/session/body middleware so API errors and assets pass through it without moving the existing middleware boundaries.

The unit tests check dynamic route pattern capture, body/password/hash/cookie/authorization/query redaction, unmatched URI handling, and a private stack marker. The real Nest integration assertion verifies the emitted request ID matches the response header and checks route/status/elapsed plus query and authorization redaction. The security lane reported K095 as 2/2 green with a recorded RED and K096 as 34/34 integration plus 61/61 API-unit tests. After that K096 run, the owner changed the production elapsed clock to `performance.now()` and fixed an error-handler lint issue in the test; those K096 figures are prior-tree evidence. The current logger uses a monotonic clock.

The final-tree K097 aggregate is green:

```text
npm run test:integration && npm run test:unit
  34 integration + 53 shared + 99 web + 61 API = 247 passed
```
