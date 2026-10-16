# Phase 7 security review: T091 and T094

## Verdict

**Source/spec review: pass.** I found no material T091/T094 contract gap or code defect in the current changes. This was a read-only review, not a fresh test run. The current owner evidence in [phase7-security.md](phase7-security.md) records the focused test build and Node run as green (five tests total); retain that evidence as owner-run until the aggregate gate.

## T091 — origin, CSRF, body media, and size

The four `csrf:` cases in `apps/api/test/security.integration.test.ts` cover all three POST routes for missing, `null`, malformed, untrusted, and comma-list Origin values; trusted Referer fallback only when Origin is absent; explicit bad Origin taking precedence over a trusted Referer; exact `X-Requested-With: XMLHttpRequest`; JSON with charset; unsupported media; malformed/oversized JSON; and a successful bodyless logout. Rejection assertions validate the API error schema/code, request-ID agreement, `Cache-Control: no-store`, and no account creation. This matches K091 and the HTTP contract's request-shape rules.

The implementation follows those cases: `createOriginMiddleware` requires exact Origin equality or a parsed trusted Referer only when Origin is absent, checks the exact AJAX header, and requires JSON for signup/signin before the 16 KiB parser. Request ID and security headers are installed before this middleware. No finding in scope.

## T094 — route limits, Retry-After, password work, and isolation

The `throttle:` case covers all four specified boundaries on one fixture/IP: signup 5 then 429, signin 10 then 429, `/me` 120 then 429, and logout 30 then 429. It checks positive whole-second `Retry-After` on each 429. It counts actual `PasswordService.hash`, `verify`, and `verifyDummy` calls, asserting the rejected signup and signin do no password work; the allowed unknown-account signin attempts exercise the dummy-verification path. A second real-Mongo fixture accepts the same signup route/email from the same loopback client, which is a meaningful check that app limiter state is not shared between fixtures.

`DEFAULT_RATE_LIMIT_POLICIES` matches the contract values (5/900000 ms, 10/60000 ms, 120/60000 ms, 30/60000 ms). `RateLimitGuard` resolves the route after stripping query/trailing slash, delegates to Nest's per-request IP tracker, and adds `Retry-After` as `ceil(timeToBlockExpire)` seconds; the installed `@nestjs/throttler` 6.7.1 storage computes that value in seconds. The guard is registered before `SessionGuard`, and controller password work occurs after global guards; the test also verifies the service-call behavior directly. No finding in scope.

## Remaining boundary

This review does not certify the adjacent proxy/IP contract (T092), rejected-request session-renewal behavior (T093), request-log redaction (T095/T096), or the core gate (T097). Those remain owned by their respective tasks. No tests were rerun here to avoid duplicating the active verification lane.
