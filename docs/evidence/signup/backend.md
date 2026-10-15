# Phase 3 backend lane: signup, signin recovery, and `/me`

Implemented the T041/T042 real-Mongo integration coverage and T046–T056 backend path. Signup and signin persist the account/session before success, rotate the session ID, return the public user DTO, normalize account credentials, and recover after a failed signup session save. `/api/auth/me` now renews only after resolving the referenced account; missing accounts detach the request session, clear the configured cookie, and deny without renewal. Recognized Mongo lookup outages map to a safe `SERVICE_UNAVAILABLE` 503. No persistence occurs before the session save callback.

I closed two review findings with regression tests. Before the fixes, the missing-account case returned 401 without clearing the cookie, and a `MongoNetworkError` during `/me` lookup became 500. Afterward the focused real-Mongo regressions pass 2/2. Session parsing and detached-session handling were also made compatible with strict ESLint/typechecking without suppressions.

Evidence on Node 24.22.0/npm 11.19.1:

- `npm run db:up && npm run test:integration && npm run test:unit --workspace @easygen/web` — exit 0; Docker Mongo healthy, API integration 14/14, web unit 30/30.
- After the final API test/session typing adjustments, `npm run test:integration` — exit 0, 14/14.
- `npm run lint` — exit 0.
- `npm run typecheck` — exit 0 for API, web, and shared contract packages.
- Focused `node --test --test-name-pattern='protected identity|recognized user lookup outages' apps/api/dist-test/test/test/auth.integration.test.js` — 2/2 after fixes.

`SessionService.destroy` remains a deliberate not-yet-implemented method for the later T076 logout task; the logout route is not present in this lane. No commits or task checkboxes were changed.
