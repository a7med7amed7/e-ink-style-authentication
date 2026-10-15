# Phase 4 backend tests: seeded signin and session expiry

Added only real-Mongo integration coverage in `apps/api/test/auth.integration.test.ts` and `apps/api/test/session.integration.test.ts`.

The seeded-signin case hashes and inserts an account directly through the API's existing model/service, then signs in with a one-character preexisting password. This verifies signin does not reapply signup composition rules. The test presents a valid signed anonymous-session cookie and confirms signin returns 200 for the intended normalized account, replaces the old session ID, persists one authenticated session, stores no credential fields, and does not create an account. It also checks invalid signin input returns 400. Existing `signin:` cases cover canonical NFC equivalence and indistinguishable wrong-password/unknown-account 401s.

Expiry coverage submits captured cookie values manually at exact 30-minute idle and eight-hour absolute deadline equality. It confirms expired Mongo records remain readable, both equality requests return 401 without changing stored auth metadata, repeated activity preserves the authenticated-at timestamp and session ID, and the rolling cookie deadline stops at the absolute deadline. The Set-Cookie `Expires` value has one-second HTTP date precision, so the test allows at most 999 ms before the exact absolute timestamp.

Validation on Node 24.22.0/npm 11.19.1:

- K066 exact command (`npm run build:test:api -- apps/api/test/auth.integration.test.ts && node --test --test-name-pattern='signin:' apps/api/dist-test/targets/auth.integration.test/test/auth.integration.test.js`) — exit 0, 3/3.
- K067 exact command (`npm run build:test:api -- apps/api/test/session.integration.test.ts && node --test --test-name-pattern='expiration:' apps/api/dist-test/targets/session.integration.test/test/session.integration.test.js`) — exit 0, 2/2.
- `npx eslint apps/api/test/auth.integration.test.ts apps/api/test/session.integration.test.ts` — exit 0.
- `npm run typecheck --workspace @easygen/api` — exit 0; both targeted test builds also compiled the changed tests.

No production code changes, task checkbox edits, or commits were made. The initial K067 run exposed only an over-precise test comparison against an HTTP date rounded to seconds; the assertion was corrected to reflect the wire format and the rerun passed without backend changes.
