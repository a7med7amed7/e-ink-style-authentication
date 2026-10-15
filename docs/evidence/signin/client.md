# Phase 4 client signin lane (T068/T070)

Owned files: `apps/web/test/auth-controller.test.ts` and `apps/web/src/auth/auth-controller.ts`.

## Behavior

- The controller now accepts `signin(input: SigninInput)` and shares the signup mutation lock, generation bump, stale-read invalidation, and post-signin `/me` reconciliation.
- Signin confirmation requires the canonical intended email and, when the POST returned a user, the same user ID. A mismatched observed identity stays unknown and cannot be treated as successful signin.
- The controller passes signin input through without signup password-composition validation and sends one POST. A typed explicit signin 401 (`rejected`, status 401) always displays the generic `Invalid email or password.` message. A 400 keeps field feedback; a 503/network failure remains uncertain/unknown until a later explicit identity recheck.
- Tests cover the shared synchronous lock, stale identity reads, intended identity / ID mismatch, refresh after uncertain transport, no automatic retry, and distinct 401/400/503 feedback.

## Verification

Commands used Node 24.22.0/npm 11.19.1 from `/tmp/easygen-node-v24.22.0/bin`.

- K068 RED before controller implementation: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signin-state:'` — exit 1; all five signin tests failed because `controller.signin` was absent (12 signup tests skipped).
- Added a stricter generic-401 regression; before the fix the same targeted command failed because a too-specific API message (`The email address does not exist.`) was displayed instead of the required generic text.
- K070 final: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signin-state:'` — exit 0, 5/5 passed (12 skipped).
- Signup regression: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signup-state:'` — exit 0, 12/12 passed (5 skipped).
- Targeted lint: `npx eslint apps/web/src/auth/auth-controller.ts apps/web/test/auth-controller.test.ts` — exit 0.
- Web typecheck: `npm run typecheck --workspace @easygen/web` — exit 0.
