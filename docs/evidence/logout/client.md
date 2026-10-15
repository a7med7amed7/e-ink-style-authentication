# Phase 5 client logout lane (T075/T078)

Owned files: `apps/web/test/auth-controller.test.ts` and `apps/web/src/auth/auth-controller.ts`.

## Behavior

`AuthController.logout(): Promise<OperationResult>` shares the synchronous signup/signin mutation slot. Starting logout immediately advances the generation, invalidates pending reads and trust, clears the old identity, and publishes `status: 'unknown'` with `pendingOperation: 'logout'`. It does not queue or abort any request.

The controller treats `api.logout()` resolving (the transport adapter resolves only for HTTP 204) as the destruction acknowledgment, then makes one fresh `/me` request. It publishes `confirmed` and a frozen `{ operationId: generation }` receipt only when that observation is typed 401/anonymous. An explicit logout 401 followed by `/me` 401 returns `already-anonymous`, establishes the observed anonymous state, and leaves the receipt empty. Network/5xx failures remain unknown and untrusted even when `/me` says anonymous, authenticated, or unknown; they never create a receipt. A 204 followed by authenticated or unreadable identity is `verification-failed`, unknown, and receipt-free. A later anonymous recheck may establish current observed anonymity but does not backfill an operation receipt.

Tests exercise the shared synchronous lock, hiding the previous identity, stale read suppression, exactly one POST, acknowledged and failed outcomes, and operation-specific receipt behavior. No queued logout or timer behavior was added.

## Verification

Commands used Node 24.22.0/npm 11.19.1 from `/tmp/easygen-node-v24.22.0/bin`.

- K075 RED before implementation: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'logout-state:'` — exit 1; all 8 initial logout tests failed because `controller.logout` was absent.
- K078 final: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'logout-state:'` — exit 0, 10/10 passed (17 skipped).
- Signup regression: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signup-state:'` — exit 0, 12/12 passed (15 skipped).
- Signin regression: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signin-state:'` — exit 0, 5/5 passed (22 skipped).
- Targeted lint: `npx eslint apps/web/src/auth/auth-controller.ts apps/web/test/auth-controller.test.ts` — exit 0.
- Web typecheck: `npm run typecheck --workspace @easygen/web` — exit 0 after setup completed the shared forms and protected-route fixtures.
