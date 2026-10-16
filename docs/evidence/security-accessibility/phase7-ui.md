# Phase 7 UI lane (T098–T101, T121–T122)

Updated 2026-10-16. Verification used Node `v24.22.0` and npm `11.19.1` from the persistent toolchain, the healthy project MongoDB service, and Playwright image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`. Browser versions: Chromium `156.0.8078.4`, Firefox `157.0`, WebKit `27.2`. Root owns commits and task-checkbox reconciliation.

## T098 — Tests first

Changed `apps/web/test/forms.test.tsx` and `tests/e2e/accessibility.spec.ts`. Coverage checks signup/signin tab order, visible keyboard focus, Enter/Space password visibility with focus retained, validation announcement and focus of the first invalid control, `aria-invalid`/`aria-describedby`, no duplicate success live region, 320px/desktop overflow, computed contrast and control boundaries, 44px primary target, and reduced motion.

The intentional forms RED was reproduced before implementation:

```text
npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'keyboard order|confirmed identity'
  2 failed, 18 skipped — both validation tests lacked a role=alert summary and first-invalid focus
```

The baseline Chromium browser check also failed on the browser-default focused control outline (`outline-style: auto`) where the check requires a visible solid indicator of at least 2px. This was the unfinished style behavior, not a test setup failure. After implementation, the focused forms selection passed 2/2 and the complete forms file passed 20/20.

K098 passed all five scenarios in all three browsers (15/15). An intermediate run exposed ambiguous `getByLabel("Password")` locators because the show-password button name also contains “Password”; changing the test locator to `{ exact: true }` resolved the selector ambiguity without changing product behavior.

## T099 — Responsive high-contrast styles

Added `apps/web/src/styles.css` and imported it from `apps/web/src/main.tsx`. The final stylesheet is 94 lines. It uses warm paper and panel colors, a restrained serif heading, dark primary controls, a light secondary visibility control, field spacing, 44px minimum control height, and a visible 3px focus ring. Reduced-motion rules remove transition/animation delay.

The built app passed `npm run build`. After the final visual refinement, the focused layout/keyboard rerun passed 9/9 across Chromium, Firefox, and WebKit:

```text
test tests/e2e/accessibility.spec.ts -g 'keyboard order|layout' --output=/tmp/pw-t099-final
  9 passed, 0 failed (3 cases × 3 engines)
```

The layout case checks both 320px and 1280px viewports, main-region bounds, submit target dimensions, each text foreground against its nearest opaque background, and control borders against their surrounding opaque background. Representative final color pairs and ratios are recorded in [accessibility evidence](../accessibility.md); the lowest reported representative ratio is 8.28:1.

## T100 — Field validation announcement and focus

Updated `apps/web/src/components/auth-fields.tsx`. On an invalid submit, one assertive summary lists the invalid fields and focus moves to the first invalid input in visual/form order. Individual error text remains associated with its input. The summary is suppressed when `submissionError` already owns the single `role="alert"`, avoiding duplicate live-region announcements. No change was needed in `auth-status.tsx`; preserving its existing current-generation and uncertainty messages avoids changing authentication status behavior.

The focused validation/confirmed-identity forms passed 2/2 after the fix; all 20 form cases passed. The K098 full browser invocation used `-g 'accessibility:'`, which matches all five current scenarios in `tests/e2e/accessibility.spec.ts` and passed 15/15. That complete file run supplies the K100 browser evidence without repeating an identical test set under an unfiltered command.

## T121 and T122 — Recovery copy follows fresh observations

Independent UI review found that page-local recovery alerts survived later independent `/me` observations. For signup, strengthened the uncertainty test and added acknowledged-POST recovery tests for a verified identity and a later anonymous observation. The three cases failed before the presentation fix: verified identity retained “Sign in is the recovery path; check your session before trying again,” and the anonymous observation retained that same stale instruction. Afterward, a verified uncertain signup keeps the account-creation warning while the status region distinguishes the verified session and possible earlier server work; acknowledged signup verification recovery announces the verified session and offers Continue without an uncertainty warning; a trusted anonymous observation replaces check-again instructions with current anonymous/sign-in guidance and removes the unavailable Check session action.

For signin, added acknowledged-POST tests for a later verified identity and a later anonymous observation. Both failed before the page fix because stale verification/check-again copy remained, with no Continue path for the verified identity. Afterward, verified recovery exposes “Session verified” and Continue without inventing uncertain POST work, while an anonymous observation announces that no session is observed and invites another sign-in attempt. Both changes are presentation-only; the auth controller and its ordering/receipt semantics are unchanged.

The test-first RED selections were:

```text
npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'keeps signup uncertainty visible after a session check observes the user|offers verified signup continuation after an acknowledged response could not be checked|replaces signup recovery instructions after a retry observes an anonymous session'
  3 failed before the signup page fix

npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'offers verified sign-in continuation after verification recovery|replaces sign-in check instructions after anonymous recheck'
  2 failed before the signin page fix
```

After the fixes, those focused selections passed 3/3 and 2/2 respectively. K121 and K122 both use the complete forms file; the fresh final run passed 24/24. The complete web unit suite passed 105/105 across 10 files. The 15-case all-engine accessibility run and the final 9-case keyboard/layout rerun preceded these recovery-copy/action updates; no browser rerun of those recovery states was made. The existing browser evidence remains attributed to its original runs, while T121/T122 recovery behavior is covered by the full form unit suite.

The review also caught a validation-precedence case: after snapshot-derived recovery feedback became current, a later invalid form submit still showed the recovery alert instead of the validation summary. Added assertions to uncertain verified signup and anonymous signup/signin recovery; all three were RED before the final page adjustment. Both pages now give active field errors precedence in the form alert while `AuthStatus` continues to disclose any sticky uncertain server work. The focused three-case regression passed 3/3 after the fix; the final 24/24 and 105/105 suite results above were rerun afterward.

## T101 — Visual and assistive-technology evidence

Captured and visually reviewed real Chromium screenshots at 1280px and 320px for both forms, plus the 320px signup error/focus state. They are committed as evidence assets under `docs/evidence/accessibility/`; links and the environment/results are in [docs/evidence/accessibility.md](../accessibility.md).

The Orca/Firefox AT bridge investigation confirmed Orca and Speech Dispatcher start and Gecko emits document-web focus. A bounded PyAT-SPI tree query timed out; no field node or field/live-region spoken utterance was proven. Therefore the actual screen-reader announcement criterion remains **unverified** and T101 remains open for that criterion. DOM semantics and Playwright assertions are not treated as proof of screen-reader speech. The evidence document records this limitation.

## Final focused checks

```text
npm run build
  passed (shared contract, API, and web production build)

npm run test:unit --workspace @easygen/web -- test/forms.test.tsx
  24 passed, 0 failed (final run covers K121 and K122)

npm run test:unit --workspace @easygen/web
  105 passed, 0 failed across 10 files

Docker Playwright, pinned image, tests/e2e/accessibility.spec.ts -g 'accessibility:'
  15 passed, 0 failed (five scenarios in each of Chromium, Firefox, and WebKit)

Docker Playwright after final CSS refinement, -g 'keyboard order|layout'
  9 passed, 0 failed (three cases in each engine)

Root checks after the final T121/T122 adjustment: `npm run lint` exited 0, `npm run typecheck` exited 0, and `npm run build` exited 0 (Vite production build completed successfully). `git diff --check` exited 0.

git diff --check
  exit 0
```

The E2E-created databases use the exact `easygen_e2e_<32 lowercase hex>` prefix; the temporary screenshot API fixture uses `easygen_e2e_manual_ui`. After the final browser/screenshot run, both remaining names (`easygen_e2e_e3f1edbb799140b3ada85c2b3017093d` and `easygen_e2e_manual_ui`) were dropped. Earlier prefixed fixtures were also dropped; a final query confirmed none remain. No claim of complete accessibility certification is made.
