# US2 signin and retained-session evidence

Runtime: Node `v24.22.0`, npm `11.19.1`, Docker Engine `29.8.0`. Browser tests used the digest-pinned official Playwright image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` on `linux/amd64`, with real MongoDB from the project Compose service.

## Signin and session behavior

The E2E test creates a unique account through public `POST /api/auth/signup`, then signs in through the browser UI. It does not seed the signin account directly in MongoDB. A fresh browser visiting `/app` is redirected to `/signin`; a direct same-origin `GET /api/auth/me` returns 401 with `UNAUTHENTICATED`, and the Welcome page is absent.

For each browser project, the test observes `POST /api/auth/signin` 200 and the controller's verifying `/api/auth/me` 200 before Welcome appears. Reload triggers another successful `/me` and preserves Welcome. The test then closes the persistent browser context, relaunches the same temporary profile directory, navigates directly to `/app`, and observes `/me` 200 with Welcome. Each profile directory is removed in `finally`.

The Chromium-only K072 run passed 2/2. The additional full Playwright project run passed 6/6: Chromium `156.0.8078.4`, Firefox `157.0`, and WebKit `27.2`, with anonymous gating and signin/refresh/profile-restart passing in each project. All eight uniquely named `easygen_e2e_<32 hex>` databases created by these browser-runner invocations were dropped afterward; no production-named database was touched.

## Signin and expiry integration gates

Fresh K073 sequence exited 0:

```sh
npm run test:integration && npm run test:unit --workspace @easygen/web && npm run build && npx playwright test tests/e2e/auth.spec.ts --project=chromium
```

The real-Mongo API integration suite passed 18/18, including seeded signin, generic wrong/unknown credential errors, invalid-input rejection, and both retained-cookie expiry cases. The idle case submitted its captured cookie at exact 30-minute deadline equality and received 401 while the session record remained readable and its auth metadata stayed unchanged. The absolute case proved rolling activity did not move the eight-hour authenticated-at deadline; the captured cookie received 401 at equality, the retained record and auth metadata were unchanged, and the rolling cookie expiry stopped at the absolute deadline (allowing the HTTP date's one-second precision). The web unit suite passed 41/41, the shared/API/web production build succeeded, and the final Chromium E2E passed 2/2.

The backend lane also ran focused K066 seeded-signin tests 3/3 and K067 expiry tests 2/2 before K073; the fresh K073 integration run repeated those cases.

## Browser compatibility finding

The first all-browser run failed in WebKit because Helmet's default test-mode Content Security Policy included `upgrade-insecure-requests`. The trace showed the page loaded over HTTP, then attempted to fetch the main JavaScript asset over HTTPS and failed its TLS handshake; the application never mounted. Bootstrap now disables only that directive in development and test while retaining Helmet's production defaults. The focused static HTTP regression passed 3/3, including assertions that development/test omit the upgrade directive and production retains it. After the fix, the all-browser E2E run passed 6/6.

The task's original K072 grep form `-g 'signin\|refresh\|restart'` selected zero tests under Playwright's regular-expression matching. K072 was therefore verified with the file-scoped Chromium command below, which executes both signin scenarios:

```sh
npm run build && npx playwright test tests/e2e/auth.spec.ts --project=chromium
```

API and web workspace typechecks, targeted ESLint for changed API/web/E2E files, and a strict standalone TypeScript check of `tests/e2e/auth.spec.ts` all exited 0.
