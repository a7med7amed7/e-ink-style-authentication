# Phase 4 read-only review: signin, retention, and browser restart

Reviewed the US2 contract and tasks, the T066/T067 backend integration coverage, web signin controller/form/router changes, the built-app Playwright tests, and the WebKit CSP compatibility adjustment. No repository source or task files were changed during this review.

## Spec compliance verdict

Pass for the reviewed Phase 4 scope. The signin controller shares the synchronous signup lock and generation invalidation, confirms canonical intended email and POST user ID when returned, and does not apply signup password composition rules. Typed signin 401 responses become exactly `Invalid email or password.`; 400 field feedback stays distinct and 503/network outcomes stay uncertain. The UI submits through the shared signin schema, announces rejection, uses current-password autocomplete, and reaches `/app` only when the controller snapshot has a verified current generation, trusted route, and matching email.

T066/T067 real-Mongo evidence is recorded in `/tmp/easygen-phase4-backend.md`: seeded signin K066 passed 3/3 and idle/absolute expiry K067 passed 2/2. The read-only backend review is `/tmp/easygen-phase4-backend-review.md`; it found no behavior defect.

The built-app E2E case launches a persistent profile, signs in, observes a successful `/me` after reload, closes the first context, launches a new persistent context using the same profile directory, then requires another successful `/me` and protected welcome page. A separate test confirms anonymous navigation remains gated and direct `/api/auth/me` access returns 401. Each project ran both cases. The eight per-run E2E databases and profile directories were manually removed after verification. The named K072 command’s `-g 'signin\|refresh\|restart'` pattern matches zero tests in Playwright’s grep handling, so setup used the valid file-scoped substitute `npm run build && npx playwright test tests/e2e/auth.spec.ts --project=chromium`, which passed 2/2. The full command `npx playwright test tests/e2e/auth.spec.ts` passed 6/6 across Chromium, Firefox, and WebKit in the digest-pinned Playwright container (`mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`). The browser environment report documents that all three engines launch in that image.

## Quality verdict

Pass; no Critical, Important, or Minor implementation defect found in this review. The WebKit finding was traced to Helmet’s default `upgrade-insecure-requests` CSP directive forcing the local HTTP test origin to HTTPS. `createSecurityHeaders` preserves Helmet defaults in production and suppresses only that directive in development/test. The static integration regression checks that development/test omit the directive, production retains it, and test-mode served assets remain usable. Setup reports the static integration suite passed 3/3.

The Phase 4 aggregate gate K073 also passed: real-Mongo integration 18 tests, web unit 41 tests, production build, and Chromium auth E2E 2/2. The broader auth E2E run passed 6/6 across the three configured browser engines. Setup manually removed the eight run-owned Mongo databases and persistent profiles after verification.

One nonblocking test-tooling hygiene follow-up remains: `playwright.config.ts` creates a unique Mongo database for each invocation, but its current runner configuration has no automated teardown for that database. The verified run was manually cleaned. Root accepted this as Phase 8 reproduction-tooling follow-up; it does not block US2 behavior or this phase’s commit.
