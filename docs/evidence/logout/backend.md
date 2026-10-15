# Phase 5 backend logout lane

Implemented only the session integration tests and the API session/logout paths assigned in T074/T076/T077. No task checkboxes, staging, or commits were changed.

## Behavior and TDD evidence

T074 added three real-Mongo HTTP cases in `apps/api/test/session.integration.test.ts`:

- A delayed MongoStore destroy deletes the record but withholds its callback; the request remains pending until callback acknowledgment. The response is then empty 204/no-store, clears the matching configured cookie, and the captured cookie receives 401 on `/me` replay and on repeated logout.
- Logging out one device invalidates only that device; a second signed-in device retains its distinct stored SID and `/me` remains 200.
- An injected Mongo network error during destroy returns 503 `SESSION_STORE_UNAVAILABLE`, does not clear the cookie, and leaves the stored session usable on a later `/me` check.

The exact K074 command was run before implementation and failed as expected: `POST /api/auth/logout` was absent (404), so the destroy callback did not start. After T076/T077, the same focused command passed all three logout cases.

`SessionService.destroy` now validates only the presented request session, awaits its `destroy` callback, maps recognized store outages to 503, and clears the matching cookie only after acknowledged deletion. The protected `POST /api/auth/logout` route returns empty 204 after that service call and sets `Cache-Control: no-store`; existing global origin/AJAX middleware, session guard, and per-route 30/minute policy remain in effect.

## Verification

Using Node 24.22.0/npm 11.19.1 from `/tmp/easygen-node-v24.22.0/bin`:

- K076 `npm run build:api` — exit 0.
- K077 `npm run build:test:api -- apps/api/test/session.integration.test.ts && node --test --test-name-pattern='logout:' apps/api/dist-test/targets/session.integration.test/test/session.integration.test.js` — exit 0, 3/3; real Mongo fixture.
- `npm run typecheck --workspace @easygen/api` — exit 0.
- `npx eslint apps/api/src/session/session.service.ts apps/api/src/auth/auth.controller.ts apps/api/test/session.integration.test.ts` — exit 0.
- `git diff --check` — exit 0.
