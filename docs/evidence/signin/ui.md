# Phase 4 UI / E2E report

Owned files: `apps/web/src/pages/signin.tsx`, `apps/web/src/pages/signup.tsx`, `apps/web/src/router.tsx`, `apps/web/test/forms.test.tsx`, `tests/e2e/auth.spec.ts`, `apps/api/src/bootstrap.ts`, `apps/api/test/static.integration.test.ts`, and `docs/evidence/us2.md`. No task checkboxes or commits were changed.

T069's four signin form assertions first failed behaviorally against the absent signin route/page. After T070 was green, T071 added the semantic signin form, `/signin` route, and signup-to-signin link. K071 (`npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'signin-form:'`) passed 4/4; API/web workspace typechecks and targeted ESLint passed. A first browser locator matched both the password input and its “Show password” button; setting exact label matching resolved the ambiguity.

T072 tests seed an isolated account through the public signup API, assert anonymous direct `/api/auth/me` returns `401 UNAUTHENTICATED`, then verify signin, reload, close/relaunch of the same persistent browser profile, `/me` 200 and Welcome. K072 ran in the pinned Playwright image (`mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`, `linux/amd64`, Node 24.22.0) as `npm run build && npx playwright test tests/e2e/auth.spec.ts --project=chromium`; it passed 2/2. The additional all-project run `npx playwright test tests/e2e/auth.spec.ts` passed 6/6 across Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2.

The first all-browser run exposed test-mode Helmet's `upgrade-insecure-requests`: WebKit trace evidence showed HTTP `/app` returning the CSP directive, then the main script requested as `https://127.0.0.1:4173/assets/...` and failing TLS. Bootstrap now disables only that directive outside production; Helmet production defaults remain. A real static HTTP regression and the test/development/production header checks passed 3/3.

Fresh K073 ran in the same pinned image and exited 0: API integration 18/18 (including both exact idle/absolute expiry equality cases), web unit 41/41, shared/API/web build, Chromium E2E 2/2. Strict standalone E2E TypeScript validation, API/web typechecks, and targeted ESLint also exited 0. E2E data was isolated to random `easygen_e2e_<32 hex>` names; all eight exact-prefix run databases observed were dropped afterward. Browser profile directories are removed in `finally`.

The task's original K072 escaped-pipe grep selected zero Playwright tests. Verification therefore used the unfiltered auth spec for Chromium; both tests' titles are signin-scoped. The first no-match command built successfully but reported “No tests found”; it is not counted as a pass.

Full evidence is recorded in `docs/evidence/us2.md`.
