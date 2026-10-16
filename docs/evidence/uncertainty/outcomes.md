# Phase 6 outcome-test checkpoint

Runtime for all commands below: Node v24.22.0 and npm 11.19.1 from `/tmp/easygen-node-v24.22.0/bin`.

## T082 outcome coverage

The exact K082 command was run before editing the identity fixtures:

```text
npm run test:unit --workspace @easygen/web -- test/auth-outcomes.test.ts -t 'outcome:'
```

Observed result: 10 passed, 1 failed. The failure was `outcome: a later confirmed signin does not clear an earlier rejected signup uncertainty`: after a rejected signup, a successful signin and matching `/me` changed `serverOutcomeUncertain` from `true` to `false`. The assertion expected the earlier uncertain operation to remain disclosed. This is a controller behavior failure, not a test or environment error. The result was sent to the controller owner.

The wrong-account coverage previously paired the intended ID with a different email. The fixture now checks both independent mismatches: same email with a different ID, and same ID with a different email. The focused identity cases passed 2/2:

```text
npm run test:unit --workspace @easygen/web -- test/auth-outcomes.test.ts -t 'wrong account'
```

After the controller owner preserved prior uncertainty, the full K082 command was rerun and passed: 12 tests passed, 0 failed (exit 0). The focused wrong-account cases also passed 2/2. K086 lists the same exact command; the controller owner independently confirmed its K086 run also passed 12/12.

## Quality checks

After the K086 outcome target passed, the exact root checks were run with the pinned runtime before later T085/T088 edits:

```text
npm run typecheck
```

Observed result at that point: exit 0 for API, web, and auth-contract strict typechecks. This is historical and must be refreshed after the in-progress UI status changes settle.

```text
npm run lint
```

Observed result at that point: exit 1 with 14 lint errors. Two were in `apps/web/src/auth/auth-controller.ts` (line 165 `no-confusing-void-expression`; line 318 `no-unnecessary-condition`). Twelve were in `apps/web/test/route-trust.test.tsx` (one `no-confusing-void-expression` and eleven `unbound-method` reports on mock assertions). The controller owner has since addressed both controller findings. The UI owner reports the route-test findings are fixed and its focused ESLint/K087 checks are clean; root lint remains to be refreshed. No changes were made outside the outcome test.

The read-only T085 review found a slow-message edge case: queueing logout advanced the global generation while leaving the signin transport active, so its five-second timer was suppressed before the queued logout timer began. The controller owner confirmed it with a failing controlled-timer case, adjusted the timer guard to allow the current queued generation while the original mutation still owns the slot, and added regression cases for the queued wait and slot transition. My corrected focused selector passed 3/3:

```text
npm run test:unit --workspace @easygen/web -- test/auth-concurrency.test.ts -t 'threshold:'
```

The initially listed K085 selector, `-t 'ordering: threshold'`, matched no tests and exited 0 with 10 skipped. This is explicitly not evidence. Root corrected K084/K085 to run the full `auth-concurrency.test.ts` file. One independent run of that exact full-file command passed 10/10 (exit 0), which covers K084, K085, and K118. No broad web suite was run.

## Pending

- Re-run lint and typecheck after the respective owners finish the UI status changes.
- Complete and persist the read-only specification and quality review of the controller, concurrency tests, and router in `phase6-review.md` after owner fixes settle.
- Do not edit source outside `apps/web/test/auth-outcomes.test.ts`.
