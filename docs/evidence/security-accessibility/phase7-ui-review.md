# Phase 7 UI review (T098–T101, T121–T122)

**Verdict:** UI source and specification review passes for T098–T100 and the T121/T122 recovery-copy corrections. T101 is only partially evidenced: actual assistive-technology speech remains unverified, so this is not a complete accessibility or release certification. Review was read-only; owner gates were not rerun.

## Review basis

Reviewed `phase7-ui-brief.md`, `specs/001-user-auth/spec.md` (FR-019, FR-022–FR-028, FR-031, SC-007), `specs/001-user-auth/tasks.md` (T098–T101, T121–T122), `specs/001-user-auth/contracts/client-auth.md`, `apps/web/src/components/auth-fields.tsx`, `apps/web/src/components/auth-status.tsx`, both auth pages, their form tests, the browser accessibility assertions, the owner’s screenshots, and `docs/evidence/accessibility.md`.

## Findings and resolution

The warm-paper page and cream form panel, restrained serif heading, spacing, outlined secondary password control, strong focus indicator, and 44px controls meet the requested e-ink visual direction. The reviewed 320px screenshots show no clipping or visible obstruction; desktop forms have a clear hierarchy. The CSS remains within the T099 task limit. Current browser assertions measure contrast and submit-target geometry at 1280px, then check horizontal overflow and main-region bounds at both 320px and 1280px. The separately reviewed 320px screenshots provide visual evidence for the narrower layout; the test does not measure each control’s dimensions at 320px.

The initial stale-copy cohort was corrected without changing controller generation, operation outcome, or receipt semantics. On a current route-trusted verified identity after an acknowledged operation whose initial identity read failed, each page removes obsolete recovery instructions, announces `Session verified`, and exposes Continue. On an anonymous observation, signup says the account may have been created and directs the user to sign in; signin says no session is observed and invites another sign-in. When a signup outcome remains genuinely uncertain, the account-may-exist alert and AuthStatus’s earlier-server-work disclosure remain, and current verified identity is still required for Continue.

The one-alert form feedback precedence was also checked across the new recovery states. Snapshot-derived copy no longer occupies `AuthFields`’ submission-alert slot while field errors are active, so the existing invalid-field summary can announce the errors. The uncertain signup’s sticky server-work warning remains in `AuthStatus`. The owner reports the three added precedence assertions reproduced RED before the page adjustment and pass afterward. Root adjudicated that a new local validation attempt may temporarily replace the earlier acknowledged-POST recovery copy in the alert slot; no additional persistent notice was required.

Live-region behavior is coherent across the reviewed cases: the summary is suppressed when another submission alert owns that slot; current session observation and older-request uncertainty are distinct; acknowledged recovery does not announce invented POST uncertainty; and no verified Continue action appears without a current trusted authenticated snapshot. The `Check session` button continues to call `controller.revalidate('retry')` (the GET-only path). Signup/signin callback generation guards and logout confirmation/receipt behavior are unchanged.

## Owner verification evidence

The UI owner reports these fresh results; this reviewer did not rerun them:

- K121 focused check: 1/1.
- T121 A/B/C stale-copy cases: 3/3; T122 B/C cases: 2/2.
- The three feedback-precedence regressions: 3/3 after a 3/3 RED reproduction.
- Final full forms suite: 24/24; full web suite: 105/105 across 10 files; `npm run lint`, `npm run typecheck`, and `npm run build` exited 0; `git diff --check` was clean. These were run by the owner after the precedence change and were not independently rerun by this reviewer.
- Earlier Phase 7 evidence in `phase7-ui.md` and `docs/evidence/accessibility.md`: all five accessibility browser scenarios across Chromium, Firefox, WebKit (15/15), focused final layout/keyboard rerun (9/9), build/lint/typecheck, and refreshed mobile/desktop screenshots. Latest owner message reports final CSS-browser checks remain green.

## Assistive-technology limit

The isolated Orca investigation is documented in `accessibility-environment.md`. Orca and Speech Dispatcher started, and the bounded Chromium/Firefox fixture attempts did not produce a spoken form-field or live-error utterance. DOM roles, browser accessibility assertions, screenshots, and focus behavior do not substitute for actual speech evidence. The screen-reader announcement requirement in T101 and SC-007 therefore remains **unverified**. No complete accessibility-conformance claim is made.

## Conclusion

No blocking UI source/specification divergence remains in the reviewed scope. The layout, keyboard interaction, error associations, stale-recovery behavior, and live-region precedence pass source review. The owner’s final forms/web, lint, typecheck, and build results are green as listed above. T101 remains open for actual screen-reader speech evidence, so this review does not certify full accessibility conformance or release readiness.
