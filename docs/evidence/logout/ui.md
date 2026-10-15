# Phase 5 UI and browser work

Owned files: `apps/web/src/auth/protected-route.tsx`, `apps/web/test/protected-route.test.tsx`, `apps/web/src/pages/welcome.tsx`, `apps/web/test/forms.test.tsx`, `tests/e2e/auth.spec.ts`, and `docs/evidence/us3.md`.

## T117 protected fallback

RED was observed for two intended behaviors: pending logout showed only the generic `Checking your session…` status, and an unknown logout with a safe message had no visible feedback or retry action. The default protected fallback now says `Signing out…` while logout is pending, renders the controller’s safe snapshot message after an unknown outcome, and exposes a `Check session` button that calls `revalidate('retry')` only for an unknown non-pending state with feedback. It never renders protected children or infers destruction from an anonymous observation.

- `npm run test:unit --workspace @easygen/web -- test/protected-route.test.tsx` — exit 0, 8/8.

## T079 welcome logout UI

RED was observed: all three `logout-ui:` tests failed because the welcome page had no semantic Sign out button. Welcome now provides a keyboard-operable Sign out button and disables it while the controller reports a pending logout. Tests cover pending feedback without a success claim, uncertainty feedback with a retry action, and anonymous state without a destruction receipt without labeling it confirmed logout.

- `npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'logout-ui:'` — exit 0, 3/3.

## Shared checks

- `npm run typecheck --workspace @easygen/web` — exit 0.
- `npx eslint apps/web/src/auth/protected-route.tsx apps/web/test/protected-route.test.tsx apps/web/src/pages/welcome.tsx apps/web/test/forms.test.tsx tests/e2e/auth.spec.ts` — exit 0.
- `git diff --check` for owned tracked files — exit 0.
- `npx playwright test tests/e2e/auth.spec.ts --list` — exit 0, lists two tests in each of Chromium, Firefox, and WebKit.

## T080 browser and real-Mongo results

The existing persistent-browser signin/restart test reuses one seeded account, creates a distinct browser profile for the same account, tests the built UI's safe logout uncertainty/recheck path, then performs an actual logout in the first profile. It asserts the original cookie is cleared, `/me` returns 401 in that profile, replaying the captured old cookie returns 401, and the independent profile remains authenticated. Both persistent contexts and temporary profile directories close/remove in `finally`. No second account or rate-limit bypass was added.

The exact K080 sequence ran inside the digest-pinned Docker image with `/workspace` mounted read/write, the exact Node 24.22.0 runtime mounted at `/opt/node`, and `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`:

```sh
docker run --rm --platform linux/amd64 --ipc=host --network host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace \
  --mount type=bind,source=/home/ahmed/.local/share/easygen-node-v24.22.0-container,target=/opt/node,readonly \
  --workdir /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /bin/bash -lc 'export PATH=/opt/node/bin:$PATH; npm run test:integration && npm run test:unit --workspace @easygen/web && npm run build && npx playwright test tests/e2e/auth.spec.ts --project=chromium'
```

Observed: integration 21/21, web unit 56/56, shared/API/web production builds passed, Chromium auth E2E 2/2. A separate run of `npx playwright test tests/e2e/auth.spec.ts` in the same pinned image passed 6/6 across Chromium `156.0.8078.4`, Firefox `157.0`, and WebKit `27.2`.

The real-Mongo K077 logout cases passed 3/3: acknowledged destroy waits for deletion and returns 204, captured-cookie replay fails, a second device remains valid, and an actual store destroy outage returns 503 without clearing the cookie or invalidating the still-usable session. The browser's 503 response is a deliberate one-request interception to verify the UI feedback path; it is not represented as a database outage injection. K078 and K117 supply the controller/fallback failure-state evidence.

The K080 and all-project runs each created one random `easygen_e2e_<32 hex>` database. Both matching databases were dropped after verification; a post-cleanup query found none with that exact prefix. No test-owned persistent profile directories remained in `/tmp`.

Final user-story evidence is in `docs/evidence/us3.md`.
