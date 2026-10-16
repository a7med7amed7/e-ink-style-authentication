# T134 session recovery review

## Verdict

PASS. The change is limited to `AuthController.revalidate` and route-trust tests. A current failed `/me` read now gives the existing protected-route fallback safe, actionable feedback. It retains any existing operation message and uncertainty; it does not change generation/read guards, mutation serialization, or retry a mutation.

The stale-read check still returns before the error branch can publish. The new controller/route tests cover failed bootstrap followed by authenticated recovery, failed bootstrap followed by anonymous recovery, and a stale failed bootstrap read arriving after a newer successful read. Bootstrap retry assertions confirm only `/me` is called and signup/signin/logout remain untouched.

The added compatibility regression also starts with an uncertain signup and fails a subsequent session recheck. It asserts the original sign-up message, `serverOutcomeUncertain`, and `lastOperationOutcome` survive unchanged. Existing controller coverage separately checks uncertainty preservation across successful and anonymous later observations.

## Verification

- T134 RED was observed before the production change: a settled bootstrap 503/network failure left the protected route at “Checking your session…” with no `Check session` button.
- Focused K134: `npm run test:unit --workspace @easygen/web -- test/route-trust.test.tsx` — 8/8 passed.
- Full web unit suite: `npm run test:unit --workspace @easygen/web` — 109/109 passed across 10 files.
- `npm run lint` — passed.
- `npm run typecheck` — passed, including API, web, shared, and E2E typechecks.

The repository-wide `npm run verify` was not run for this bounded task; it remains the parent orchestration's final gate.
