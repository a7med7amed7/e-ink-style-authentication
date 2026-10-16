# Phase 6 UI review (T088–T090)

Reviewed 2026-10-16 after the UI owner confirmed the component and form files were stable. Scope is the Phase 6 status component and signup/signin integration. Controller/router behavior is covered by the separate `phase6-review.md`; this report does not replace Phase 6 aggregate verification or Phase 7 accessibility review.

## Requirement review

| Requirement | Result | Evidence |
| --- | --- | --- |
| FR-019, FR-023, FR-024: distinguish pending, unknown, observed identity, and operation evidence | Met in the reviewed UI flow. Pending operations stay in progress; verified identity can be shown alongside older uncertainty; anonymous observation after failed logout is not called confirmed logout. | `auth-status.tsx`; status and form cases below. |
| FR-021, FR-022: preserve duplicate-submit and waiting behavior | Met in the UI integration. Slow copy says “Still verifying”; queued logout copy says it waits until the tracked request settles; Check session is unavailable while a mutation is pending. | `auth-status.test.tsx` queued/slow cases; existing form duplicate-submit cases. |
| FR-023–024: offer an explicit check after ambiguous outcomes | Met. Both forms bind Check session to `controller.revalidate('retry')`; checks do not submit saved credentials. The uncertain logout case checks that only `/me` runs and no destruction receipt is created. | `auth-status.test.tsx`; `forms.test.tsx` uncertainty/logout cases. |
| FR-026: no automatic signup/signin retry | Met in the reviewed forms. A later session check leaves signup/signin call counts at one. | `forms.test.tsx` signup/signin uncertainty cases. |
| FR-027: accessible outcome announcements | Met for the reviewed Phase 6 outcomes. Form alerts are primary when present; status copy carries distinct observations and the sticky older-request warning. Visual focus, contrast, touch size, and reduced-motion evidence belong to Phase 7. | `auth-fields.tsx`, `auth-status.tsx`, `signup.tsx`, `signin.tsx`. |

## Finding and resolution

The initial review found overlapping signup alert/status wording and repeated check-session guidance. The UI owner changed `AuthStatus` so a visible form alert suppresses its duplicate status sentence; the status region then carries the observed anonymous/authenticated state and the older-server-work caveat. The updated tests assert that the signup alert is primary, verification-failure status is absent, and the signin uncertainty announcement does not repeat the generic check instruction.

For uncertain signin, the status includes the operation outcome text and older-request caveat. The operation text says to check again, and the adjacent button is named “Check session.” Root adjudicated that the button’s accessible name is an operable control label, not a duplicate live announcement or contradictory claim; no further copy change is required. The generic unknown state also gives a short check instruction beside the button, which serves the same accessible action purpose.

Evidence: [signup.tsx](/home/ahmed/projects/easygen_assessment/apps/web/src/pages/signup.tsx:70), [auth-status.tsx](/home/ahmed/projects/easygen_assessment/apps/web/src/components/auth-status.tsx:40), and [auth-status.test.tsx](/home/ahmed/projects/easygen_assessment/apps/web/test/auth-status.test.tsx:118). The initial finding is resolved; no Critical, Important, or Minor UI findings remain in this scope.

## Strengths

- `AuthStatus` keys its checking state by both generation and check ID. A new pending operation takes precedence over an older check, and an older check’s `finally` cannot clear a newer check indicator. Both regressions have RED→GREEN evidence.
- Signup and signin callbacks capture the generation after synchronous controller invocation and return before applying messages or navigating when a newer generation supersedes them. Both stale-error and stale-navigation cases have RED→GREEN evidence.
- The check action remains a read-only controller revalidation. Tests verify that an ambiguous logout does not create a destruction receipt and that later checks do not repeat signup/signin POSTs.

## Verification

Before the final announcement-copy refinement, the reviewer ran the focused status/forms command with Node 24.22.0/npm 11.19.1 and observed 24/24 passing. The UI owner then reported these fresh results after the final refinement:

```text
K088 `npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx -t 'auth-status:'`: 6/6
`npm run test:unit --workspace @easygen/web -- test/forms.test.tsx`: 18/18
`npm run test:unit --workspace @easygen/web`: passed
```

The owner also reported:

- Older-check regressions: RED 2/2, then GREEN 2/2.
- Stale form callback regressions: RED 4/4, then GREEN 4/4.
- Uncertain and verification-failure announcement regressions: RED 4/4, then GREEN 4/4.

The phase-wide aggregate, build, lint/typecheck, and Docker evidence remain pending in the root pipeline and are not claimed by this UI review.

## Verdict

The reviewed UI meets the Phase 6 requirements for safe queued-waiting copy, generation-aware Check session state, stale form callback suppression, uncertainty retention on both forms, evidence-based logout wording, and GET-only session checks. The duplicate live-announcement finding is resolved; the root adjudication on control-label wording is recorded above. No UI review issue blocks the lane. Phase 6 aggregate readiness remains pending its separate evidence run.
