# Phase 3 client transport/controller lane

Runtime for all checks: Node `v24.22.0`, npm `11.19.1` from `/tmp/easygen-node-v24.22.0/bin`.

## Checks

All commands below ran with `export PATH=/tmp/easygen-node-v24.22.0/bin:$PATH`.

- K043/K057: `npm run test:unit --workspace @easygen/web -- test/auth-api.test.ts -t 'auth-api:'` — exit 0, 5/5 tests.
- K044/K058: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signup-state: bootstrap'` — exit 0, 2/2 selected tests (9 skipped).
- K059: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signup-state:'` — exit 0, 11/11 tests.
- K060: `npm run test:unit --workspace @easygen/web -- test/auth-context.test.tsx -t 'auth-context:'` — exit 0, 1/1 test.
- K061: `npm run test:unit --workspace @easygen/web -- test/protected-route.test.tsx -t 'protected-route:'` — exit 0, 6/6 tests.
- Owned-file lint: `npx eslint apps/web/src/api/auth-api.ts apps/web/src/auth/auth-controller.ts apps/web/src/auth/auth-context.tsx apps/web/src/auth/protected-route.tsx apps/web/test/auth-api.test.ts apps/web/test/auth-controller.test.ts apps/web/test/support/deferred.ts apps/web/test/auth-context.test.tsx apps/web/test/protected-route.test.tsx` — exit 0.
- Strict web workspace typecheck: `npm run typecheck --workspace @easygen/web` — exit 0.

## Implemented interfaces and behavior

`FetchAuthApi` implements signup/signin/me/logout through relative same-origin requests, validates success/error bodies against shared schemas, sends JSON/AJAX headers for mutations, does not retry, distinguishes network/malformed/401 outcomes, and accepts logout 204 without parsing JSON.

`AuthController` exposes stable `getSnapshot`/`subscribe`, `revalidate(reason)`, and the Phase 3 `signup(input)` action. Reads use generation plus increasing read IDs; stale success/error completions cannot republish identity. Signup acquires its lock synchronously, clears route trust, posts once, then verifies the canonical intended email and POST user ID through `/me` before trusting the authenticated snapshot. Failed transport remains uncertain; failed or mismatched reconciliation is not treated as signup success. No password is stored in snapshots. Signin/logout controller actions and later focus/navigation/slow-timer ordering are intentionally left for their assigned phases.

`AuthProvider` bridges the one controller into React using `useSyncExternalStore` and runs only a safe bootstrap GET from its effect. `ProtectedRoute` requires authenticated status, a public user, current verified generation, and route trust; an observed trusted anonymous state redirects to `/signin`, while unknown/authenticating/untrusted states render only the checking fallback.

## RED/GREEN evidence

The initial K043 and K044 attempts failed because the transport/controller modules were absent. K058/K059 initially failed because the controller surface/signup action was absent. K060/K061 initially failed because their context/protected-route modules were absent. After implementation, the final exact-runtime results above passed. K061 also caught test DOM leakage in an intermediate run; explicit per-test cleanup was added and its final 6/6 run passed.

No task checkboxes or git staging/commits were changed.

## 2026-10-15 snapshot immutability follow-up

`AuthSnapshot.submissionErrors` now uses an explicit readonly field-to-readonly-string-array map type. Publication copies and freezes each field-error array as well as the map. A new signup controller test proves each nested array is frozen and detached from the mutable API error source.

- K059 exact command: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signup-state:'` — exit 0, 12/12 passing.
- Targeted lint: `npx eslint apps/api/src/security/hash-work.ts apps/api/test/hash-work.test.ts apps/web/src/auth/auth-controller.ts apps/web/test/auth-controller.test.ts` — exit 0.
- Web strict typecheck: `npm run typecheck --workspace @easygen/web` — exit 0.
- API strict typecheck: `npm run typecheck --workspace @easygen/api` — exit 0.
