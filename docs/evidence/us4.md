# User Story 4: Concurrent authentication and truthful client outcomes

Runtime: Node `v24.22.0` and npm `11.19.1` from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0`. Browser regressions used the digest-pinned Playwright image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` on `linux/amd64`, with the project MongoDB 8.0 Compose service. The image provides Chromium `156.0.8078.4`, Firefox `157.0`, and WebKit `27.2`.

The client holds a single tracked signup/signin mutation through response-body settlement. Duplicate credential submits remain blocked; logout requests coalesce and run after the tracked request settles, superseding stale confirmation/reconciliation. Slow status is nonblocking. Protected route trust is revoked before protected content renders and is rechecked on focus/navigation. A session check is a GET-only read. Form feedback is guarded by controller generation, so callbacks superseded by newer authentication work cannot announce stale rejection or navigate from stale confirmation.

## Test-first UI regressions

The old-check/new-signin and old-check/new-check tests failed 2/2 before the current-generation check-state fix and passed 2/2 afterward:

```text
npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx -t 'older session|older check'
```

The stale-form tests failed 4/4 before generation guards because superseded rejection feedback and navigation occurred. After the guards they passed 4/4:

```text
npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'stale .*|superseded'
```

After review, a test-first consolidation check failed 4 cases where uncertainty operation copy or repeated session-check guidance was announced alongside local form feedback. The final behavior passed all four and keeps a distinct current session observation and sticky earlier-request uncertainty visible:

```text
npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx test/forms.test.tsx -t 'GET-only session check|uncertainty visible|does not duplicate signin verification failure'
```

## Verification

The final K090 web run included all controlled concurrency, outcome, route-trust, context, and form/status regressions:

```text
npm run test:unit --workspace @easygen/web -- test/auth-concurrency.test.ts
  13 passed, 0 failed
npm run test:unit --workspace @easygen/web -- test/auth-outcomes.test.ts -t 'outcome:'
  12 passed, 0 failed
npm run test:unit --workspace @easygen/web -- test/route-trust.test.tsx -t 'route-trust:'
  4 passed, 0 failed
npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx -t 'auth-status:'
  6 passed, 0 failed (K088)
npm run test:unit --workspace @easygen/web -- test/forms.test.tsx
  18 passed, 0 failed
npm run test:unit --workspace @easygen/web
  99 passed, 0 failed across 10 files (K090)
npm run lint
  exit 0
npm run typecheck
  exit 0 (API, web, and auth-contract)
npm run build
  exit 0 (shared contract, API, and web production build)
```

Final built-app auth E2E used the pinned Playwright image with the persistent Node runtime mounted read-only:

```sh
docker run --rm --platform linux/amd64 --ipc=host --network host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /bin/bash -lc 'export PATH=/opt/node/bin:$PATH; npx playwright test tests/e2e/auth.spec.ts'
```

Observed result: exit 0, 6 passed across Chromium, Firefox, and WebKit (2 per browser).

The E2E coverage includes anonymous direct API denial, signin persistence through refresh and persistent browser restart, a simulated logout-store failure with safe session recheck, successful logout with cookie clearing and replay rejection, and an independent authenticated profile. The run's one random `easygen_e2e_<32 hex>` MongoDB database was dropped afterward; a follow-up database query found no remaining database with that prefix. Both temporary browser profile directories are removed by the E2E test in `finally`.

## Transport and ordering limits

A rejected transport does not establish whether its server-side operation stopped or may still complete. The client preserves uncertainty about earlier rejected signup/signin work across later anonymous or authenticated observations, including a confirmed logout. The tests do not establish a global order across tabs, devices, or direct clients and do not claim that rejected or superseded requests were cancelled.
