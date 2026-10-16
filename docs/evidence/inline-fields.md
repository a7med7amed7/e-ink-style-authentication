# Inline password control and field validation

Follow-up T138–T141, verified on Linux/amd64. The user requested an icon at the end of the password input and individual validation bullets below each field, without a duplicated form summary.

# Inline authentication fields implementation

T139/T140 update the shared sign-in and sign-up fields. The password visibility control is an icon-only inline SVG button with `aria-label`, `aria-pressed`, keyboard focus retention, and a 44px target. Each field's messages now appear as separate list items in one `aria-live` list associated through `aria-describedby`; the form-level field summary is removed and the existing first-invalid focus behavior remains. The input reserves inline space for the toggle using logical CSS properties.

`AuthFields` continues to display an explicitly supplied non-field submission error once, at the bottom in an alert list. The sign-in and sign-up pages suppress their generic submission/recovery message when field errors are present and tell `AuthStatus` that those errors already own the feedback, preventing duplicate form/status announcements. Existing labels, autocomplete values, and auth status handling remain intact.

The T138 RED run on the unmodified fields reported 10 expected failures among 29 tests. After T139's component change, the new page case reproduced one expected failure: “Validation failed.” remained beside server field errors (28/29 passed). T140's page handling resolved that behavior. The focused auth-field and forms suites then passed 32/32; the full web unit suite passed 114/114 across 10 files.

Verification used Node v24.22.0 and npm 11.19.1 from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin`:

- `npm run test:unit --workspace @easygen/web -- test/forms.test.tsx test/auth-fields.test.tsx` — 32/32 passed.
- `npm run test:unit --workspace @easygen/web` — 114/114 passed across 10 files.
- `npm run lint` — passed.
- `npm run typecheck` — passed, including E2E TypeScript.
- `npm run build` — passed; shared contract, API, and Vite web bundles built.
- `git diff --check` — passed.
- Accessibility E2E in the pinned Playwright container — 15/15 passed across Chromium, Firefox, and WebKit; exit 0. The host-browser attempt lacked libavif; the successful container invocation was:

  ```sh
  docker run --rm --platform linux/amd64 --ipc=host --network=host --user 1000:1000 \
    --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
    --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
    --mount type=bind,source=/home/ahmed/.cache/easygen-qa/t138-accessibility-container,target=/output \
    --workdir /workspace \
    -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin \
    -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright -e HOME=/tmp \
    mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
    /opt/node/bin/node node_modules/@playwright/test/cli.js test tests/e2e/accessibility.spec.ts \
    --reporter=line --output=/output/results
  ```

  Output is at `/home/ahmed/.cache/easygen-qa/t138-accessibility-container/run.log` with results under `results/`.

Post-E2E cleanup checks found no `easygen_e2e_*` databases and port 4173 was free.

# T138 Inline Field Errors and Password Toggle Test Handoff

## RED against the pre-T139 implementation

Runtime: pinned Node 24.22.0 from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin`.

Command:

```sh
PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run test:unit --workspace @easygen/web -- test/forms.test.tsx
```

The focused run produced 29 tests: 19 passed and 10 failed on the new behavior. The failures showed the old visible “Show password” text, missing associated per-field `<ul>` error lists (including multi-message password errors), the form-level “Check these fields” summary, and a duplicate generic “Validation failed.” message alongside server field errors.

## T138 coverage authored

- `apps/web/test/forms.test.tsx` now checks an icon-only password toggle with accessible pressed state, one associated list item per field message, no form summary, suppression of duplicate generic validation text, and a single bottom-positioned server rejection alert. Existing uncertainty and recovery scenarios remain covered; the anonymous recheck case now checks its subsequent invalid email inline without expecting the removed summary.
- `tests/e2e/accessibility.spec.ts` checks signup/signin field lists and first-invalid focus, keyboard toggle state and focus retention, icon contrast, and the toggle’s 44px target, placement inside the input’s trailing edge, and reserved input padding at 320px and desktop width.
- T141 updates `apps/web/test/auth-fields.test.tsx` to require each `aria-describedby` target to be the field’s single `<ul>` containing its `<li>`, while retaining the distinct account-confirmation alert, keyboard, and autocomplete checks.
- `git diff --check -- apps/web/test/forms.test.tsx apps/web/test/auth-fields.test.tsx tests/e2e/accessibility.spec.ts` passes.

## Post-fix verification

K138 exact command passed **29/29** with Node 24.22.0:

```sh
PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run test:unit --workspace @easygen/web -- test/forms.test.tsx
```

K141 exact command passed **3/3**:

```sh
PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run test:unit --workspace @easygen/web -- test/auth-fields.test.tsx
```

The all-project accessibility spec passed **15/15** in the pinned official Playwright image on Linux/amd64, with Node 24.22.0 and zero skips. The source and Node mounts were read-only; Playwright output and its combined log were written to `/home/ahmed/.cache/easygen-qa/t138-accessibility-container/`.

```sh
docker run --rm --platform linux/amd64 --ipc=host --network=host --user 1000:1000 \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-qa/t138-accessibility-container,target=/output \
  --workdir /workspace \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/bin \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright -e HOME=/tmp \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node node_modules/@playwright/test/cli.js test tests/e2e/accessibility.spec.ts \
  --reporter=line --output=/output/results
```

Post-run inspection found no `easygen_e2e_*` databases and port 4173 was free. A prior direct host launch passed Chromium and Firefox but could not launch WebKit because the host lacks `libavif16`; it produced no assertion failures. No host packages were installed; the pinned image run is the successful browser evidence.

# T138–T141 inline auth fields review

Static review covered `apps/web/src/components/auth-fields.tsx`, `apps/web/src/styles.css`, `apps/web/src/pages/signup.tsx`, `apps/web/src/pages/signin.tsx`, `apps/web/test/auth-fields.test.tsx`, `apps/web/test/forms.test.tsx`, and `tests/e2e/accessibility.spec.ts`.

## Findings

- **Adjudicated nonblocking:** the page boundary suppresses the message whenever field errors exist (`signup.tsx:31–33`, `signin.tsx:27–29`). Root confirmed the current API contract returns field errors only for `VALIDATION_ERROR`, whose accompanying text is generic; no distinct server operation message is lost on the actual page path. `AuthFields` still renders an explicitly provided distinct nonfield `submissionError` once (`auth-fields.tsx:92–94`), covered by its component test. The forms helper’s fieldset-alert prohibition is scoped to the validation fixtures that call it; the legacy explicit-nonfield test separately protects that behavior. No source change is needed under the current API contract.

No other blocking static issue found. The component renders one associated live `<ul>` per invalid field and one `<li>` per message; preserves first-invalid focus handling; uses a single persistent icon-only toggle button with an accessible name and pressed state; and displays a supplied nonfield error once. The page changes only adjust feedback precedence and `AuthStatus` duplication signaling; auth controller and request behavior are unchanged. CSS places the 44px toggle within the input’s trailing edge, reserves input padding, and retains visible keyboard focus styling. The tests cover single/multiple field errors, duplicate generic feedback suppression, preserved explicit nonfield feedback, keyboard toggling/focus, and narrow/desktop layout and contrast. Three-engine E2E remains owned by the docs agent and was not run as part of this review.

Root reported full web unit, lint, typecheck, and build gates green; those commands were not rerun for this static review.

## Live UI smoke

After root rebuilt the Compose app and reported both services healthy, a focused Playwright smoke ran against `http://127.0.0.1:3000` in the pinned official Playwright image (`mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`) with Node 24.22.0. No authentication request was sent and no account was created.

- Signup at 320×900: blank submit showed three inline field lists (email 1 item, name 1 item, password 4 items); each was a `<ul aria-live="polite">` inside its field, following the input and referenced by the input’s `aria-describedby`. There was no form-level alert or “Check these fields” summary. Initial focus moved to email. The icon-only toggle changed password visibility with Enter and Space, exposed `aria-pressed`, and retained focus. Measured document width was exactly 320px; the toggle measured 44×44px within the password input, whose right padding measured 56px.
- Sign-in at 1280×900: invalid email and missing password each displayed one inline list item; no summary or form-level alert appeared. The main region stayed within viewport bounds (left 320px, right 960px), with no horizontal overflow.
- Both pages completed with zero auth POSTs and zero uncaught page errors.

Screenshots, visually inspected:

- `/home/ahmed/.cache/easygen-qa/inline-fields-qa/signup-320.png`
- `/home/ahmed/.cache/easygen-qa/inline-fields-qa/signin-1280.png`

The focused smoke script and its JSON result are under `/home/ahmed/.cache/easygen-qa/inline-fields-qa/` (`run.mjs`; Docker command exited 0). The accessibility suite’s three-engine run is reported separately by its owner.


## Docker deployment and root verification

`docker compose -f compose.app.yaml up --build --wait` exited0 and rebuilt the local app image (`sha256:a7e17571aa79159216a515a6440e0e11dcf48f9f6524897a13d6c2b96b8ab074`). App and Mongo are healthy. Mongo and the existing `easygen-app_mongo-data` / `easygen-app_session-secret` volumes were preserved; the unrelated baseline Mongo also remains healthy. The app runs as `node`. Root independently inspected Compose status and confirmed `/signup` returns200. Worker HTTP checks returned200 for `/` and `/signin`, expected anonymous401 for `/api/auth/me`, and JSON404 for an unknown API path.

Root read the raw web/lint/typecheck/build transcript at `/home/ahmed/.cache/easygen-qa/t139/web-gates.log` and the15/15 accessibility transcript, reviewed all production and test diffs, and visually inspected the live mobile signup and desktop signin screenshots. Each password rule is a separate bullet below the input; the icon fits inside its end and retains visible keyboard focus. No blocking issue remains for this presentation change. Actual screen-reader speech and other OS/architectures are not claimed by these focused checks.
