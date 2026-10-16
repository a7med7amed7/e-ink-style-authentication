# Phase 6 UI lane (T083/T088–T090)

Updated 2026-10-16 after the final UI review adjustment. Owned UI work is complete; root owns task checkboxes, integration, and commits. No task checkbox or commit was changed here.

## Behavior and test-first evidence

- T083 route-trust coverage remains four tests: protected content stays hidden until current-generation trust, controller-bound navigation revalidates before render, focus during a mutation coalesces with its later reconciliation, and StrictMode bootstrap stays GET-only. Fresh route-trust plus auth-context verification was 6/6; the route-trust subset was 4/4.
- T088 binds session-check loading to the current snapshot generation and the newest local check ID. An earlier unresolved check cannot mask a newer signin, and its `finally` cannot clear a newer check's indicator. Pending operations retain their own truthful status; slow operations remain pending and offer no retry. Unknown/logout status offers a GET-only check and does not imply destruction. Local form feedback owns the primary notice when present, while distinct current session observation and earlier-request uncertainty remain visible without repeating the operation instructions.
- T089 mounts the status component in signup and signin, preserves uncertainty across anonymous redirects and later observed authentication, avoids duplicate live-region feedback for verification failures, and suppresses stale rejection/navigation callbacks once a newer controller generation supersedes them. It does not retry POST credentials.

The test-first regression command for the old-check/new-signin and old-check/new-check races failed 2/2 before the component fix, then passed 2/2:

```text
npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx -t 'older session|older check'
```

The stale-form regression command failed 4/4 before generation guards (stale rejection feedback and confirmed navigation both occurred), then passed 4/4:

```text
npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'stale .*|superseded'
```

After final review, assertions for a single primary uncertainty notice, distinct current session observation, sticky earlier-request warning, and no repeated check instruction failed before the consolidation and passed after it:

```text
npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx test/forms.test.tsx -t 'GET-only session check|uncertainty visible|does not duplicate signin verification failure'
  before consolidation: 4 failed
  after consolidation: 4 passed, 20 skipped
```

## Final verification

All commands used Node v24.22.0 and npm 11.19.1 from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin`.

```text
npm run test:unit --workspace @easygen/web -- test/auth-status.test.tsx -t 'auth-status:'
  6 passed, 0 failed (K088)
npm run test:unit --workspace @easygen/web -- test/forms.test.tsx
  18 passed, 0 failed (T089)
npm run test:unit --workspace @easygen/web
  99 passed, 0 failed across 10 files (K090; includes every concurrency, outcome, route, context, and UI case)
npm run lint
  exit 0
npm run typecheck
  exit 0 (API, web, auth-contract)
npm run build
  exit 0 (shared contract, API, Vite web build)
```

After the final production build, the pinned Playwright image was used with the persistent Node 24.22.0 bind mount and project MongoDB 8.0 service:

```text
npx playwright test tests/e2e/auth.spec.ts
  6 passed across Chromium, Firefox, and WebKit (2 per browser)
```

That browser run exercised anonymous direct API denial, persistent signin through refresh and browser restart, simulated logout-store failure with check-session recovery, successful logout, cookie clearing/replay rejection, and an independent authenticated browser profile. Playwright created one random `easygen_e2e_<32 hex>` database; the matching test database was dropped after the run and a database-list query confirmed no `easygen_e2e_*` database remained. Temporary browser profile directories are removed by the test's `finally` block.

## Limits

The browser cannot infer whether a server-side POST will finish after its transport rejects or the client stops waiting. An uncertain result therefore remains disclosed even after a later anonymous or authenticated `/me` observation. These tests do not prove ordering across tabs, devices, or direct clients; they make no cross-tab guarantee and do not claim that rejected or superseded server work was cancelled.
