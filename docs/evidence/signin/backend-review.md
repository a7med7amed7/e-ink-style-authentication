# Phase 4 backend review: seeded signin and expiry regressions

Reviewed `apps/api/test/auth.integration.test.ts`, `apps/api/test/session.integration.test.ts`, the relevant auth/session services, `specs/001-user-auth/tasks.md`, and the HTTP/session lifecycle contracts. This was a read-only review; I did not rerun the real-Mongo suite. The evidence report `/tmp/easygen-phase4-backend.md` records exact K066 and K067 runs, both exit 0 (K066 3/3, K067 2/2), plus targeted ESLint and API typecheck exit 0.

## Spec verdict

Pass for the scoped T066/T067 requirements. The seeded-account test inserts a preexisting one-character password hash directly, then submits canonicalized signin credentials with a signed preexisting anonymous SID. It asserts 200/public identity, a changed cookie value and stored SID, exactly one persisted authenticated session, no credential/hash data in the serialized session, and no additional account. It separately checks invalid signin input returns 400 without creating an account. The existing credential regression sends both unknown-email and wrong-password cases and checks the same 401 `INVALID_CREDENTIALS` message, separate request IDs, and no leaked email/password/hash/stack/URI content. The auth service/error mapping uses the contract's exact `Invalid email or password.` message.

The expiry tests submit manually captured cookies at exact idle and absolute equality with injected clock time. Both assert 401, retained Mongo records, unchanged authenticated metadata and cookie expiry after rejection. The rolling case repeatedly renews activity without rotating SID, verifies the outgoing HTTP cookie expires within the final second before the absolute deadline, preserves `authenticatedAt`, and denies at absolute equality. Existing renewal integration coverage also checks persisted cookie expiry against the minimum idle/absolute deadline and denies if save crosses the absolute boundary.

## Quality verdict

The tests use real Mongo state and manual cookie replay, so their conclusions do not depend on the in-memory test agent or Mongo TTL cleanup. The cookie date precision allowance is correctly bounded to under one second. I found no implementation defect in the reviewed scope.

Two low-severity assertion opportunities remain: the generic-credential integration test compares the two messages but does not itself pin the exact contract copy (the centralized error definition currently does); and the final absolute-cap integration test asserts the response cookie cap but does not directly compare the persisted serialized-cookie / top-level Mongo `expires` value to that same absolute timestamp. These do not block the observed behavior or the T066/T067 task criteria, but explicit assertions would make those contract edges more regression-resistant.
