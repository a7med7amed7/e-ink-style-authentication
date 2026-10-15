# User Story 3: Logout and session invalidation

Runtime: Node `v24.22.0`, npm `11.19.1`, Docker Engine `29.8.0`. Built browser runs used the official Playwright image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` (`linux/amd64`) and the project MongoDB 8.0 Compose service. The image's browser versions were Chromium `156.0.8078.4`, Firefox `157.0`, and WebKit `27.2`.

The browser scenario seeds one account through public signup, signs in, verifies refresh and same-profile browser restart, then signs the same account into a second independent profile. On the first profile it first intercepts one logout response as a schema-valid `503` to exercise the built UI's uncertain path: Welcome disappears, the UI says it could not confirm sign-out, and `Check session` performs a fresh `/me`; only after `/me` confirms the still-valid identity does Welcome return. The test then removes the interceptor and exercises the real logout endpoint: it observes `204`, the browser cookie is cleared, `/me` returns `401`, the pre-logout cookie replay receives `401 UNAUTHENTICATED`, and the independent profile remains authenticated with `/me` `200`.

The failed-destruction case is also exercised against real Mongo in K077: a store destroy outage returns `503 SESSION_STORE_UNAVAILABLE`, retains the cookie, and leaves the session usable. K078 verifies that an unacknowledged controller logout remains unknown and receipt-free even when the identity read is anonymous, with safe `We couldn't confirm sign-out. Check your session again.` feedback. K117 verifies the protected fallback displays that feedback and offers a retry without rendering protected children. The browser's simulated `503` checks those UI states in the built app; the real-Mongo integration independently verifies server outage behavior.

## Verification

- K076 `npm run build:api` — exit 0.
- K077 `npm run build:test:api -- apps/api/test/session.integration.test.ts && node --test --test-name-pattern='logout:' apps/api/dist-test/targets/session.integration.test/test/session.integration.test.js` — exit 0, 3/3 real-Mongo logout integration tests.
- K078 `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'logout-state:'` — exit 0, 10/10; signup regression 12/12 and signin regression 5/5. Client targeted ESLint and web workspace typecheck exited 0.
- K117 `npm run test:unit --workspace @easygen/web -- test/protected-route.test.tsx` — exit 0, 8/8.
- K079 `npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'logout-ui:'` — exit 0, 3/3. Owned UI ESLint and web workspace typecheck exited 0.
- K080 exact sequence — exit 0: real-Mongo integration 21/21; web unit 56/56; shared, API, and web production builds; Chromium auth E2E 2/2.
- Additional all-project Docker run `npx playwright test tests/e2e/auth.spec.ts` — exit 0, 6/6 across Chromium, Firefox, and WebKit.

K080 and the all-project browser run each created one random `easygen_e2e_<32 hex>` database. Both matching databases were dropped after verification; a post-cleanup query found no databases with that exact prefix. The browser tests remove both persistent profile directories in `finally`.
