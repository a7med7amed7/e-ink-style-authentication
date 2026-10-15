# Phase 2 bootstrap / fixture report

Owned files:
- `apps/api/src/app.module.ts`
- `apps/api/src/bootstrap.ts`
- `apps/api/test/support/fixture.ts`

Implemented a reusable per-app Nest factory with validated config, app-scoped providers, a bounded Mongoose pool, MongoStore reusing the Mongoose-owned client, native TTL cleanup, and awaited `collectionP`. `buildApp` rejects test hooks outside `NODE_ENV=test`, sets only a server-generated UUID on `req.requestId` and the same `X-Request-Id` header, and closes the app if post-creation readiness fails. Nest initialization uses `abortOnError:false` so a missing MongoDB rejects startup instead of terminating the process.

The real-Mongo fixture restricts URIs to local loopback, replaces the URI database with a unique `easygen_test_<pid>_<uuid>`, creates fresh app providers and controlled clock, returns the app, Supertest agent, database/client/store/adapter and auth headers, and performs idempotent cleanup: drop only that owned database, then close the app once (the MongoStore does not close the shared client).

Checks (Node 24.22.0 / npm 11.19.1):
- K032 `npm run build:api`: exit 0.
- K033 `npm run db:up && npm run build:test:api`: exit 0; Mongo health reported Healthy.
- `npx eslint apps/api/src/app.module.ts apps/api/src/bootstrap.ts apps/api/test/support/fixture.ts`: exit 0.
- Compiled-fixture live smoke: app initialized against Mongo; owned DB matched; `sessions` TTL index existed; unknown route returned 404 with UUID `X-Request-Id`; calling teardown twice completed; independent admin query confirmed owned database removed.
- Missing-Mongo smoke with `mongodb://127.0.0.1:1/easygen`: fixture startup rejected with `MongooseServerSelectionError` after about 5.8 seconds and the probe process exited 0; no skip/fallback.

During verification, K033 first identified invalid `mongoose` exports for MongoDB `Db`/`MongoClient` and exact-optional-property typing in the fixture; corrected by importing from `mongodb` and only including supplied hooks. A first missing-Mongo probe exposed Nest's default process abort; setting `abortOnError:false` made the startup failure catchable. Targeted lint then passed. No task checklist or Git staging/commit changes were made.

## T037–T040 completion

Additional owned files:
- `apps/api/src/session/session.middleware.ts`
- `apps/api/src/main.ts`
- `apps/api/src/common/api-error.filter.ts`
- `apps/api/test/session-middleware.test.ts`
- `apps/api/test/static.integration.test.ts`
- `apps/api/test/api-error.test.ts` (404 regression)

T037 session loading is composed with the Mongo adapter and per-app session policy. It uses the required signed cookie/store settings, pins active cookie expiry to the earlier session deadline, detaches expired/malformed auth, leaves anonymous reads unpersisted, and maps store-read errors before routes. The test-first behavioral run was 0/6 against the temporary pass-through scaffold; after implementation K037 passed 6/6. Targeted ESLint passed after tightening test response/request types.

T038 binds exact-origin checks before `/api/auth`-scoped session loading, then a 16 KiB JSON parser with sanitized parser-error mapping, Helmet, and the Nest API error filter. Throttling is a per-app global guard backed by `ThrottlerModule` and test-only injected route policies. K038 (`npm run build:api && npm run test:unit:api`) exited 0 with 59/59 API unit tests.

T039 adds `startApi`: it parses the explicit environment, builds the app, binds only the validated private host/port, enables SIGINT/SIGTERM shutdown hooks, and closes the app if listen fails. K039 (`npm run build:api`) exited 0. A live compiled startup smoke connected to local Mongo, listened on `127.0.0.1:34179`, returned a Helmet-protected JSON 404 with server request ID for `/api/no-route`, then closed cleanly.

T040 resolves the ordinary build from the repository working directory at `apps/web/dist` in every environment when `index.html` exists; production startup rejects before app initialization when it does not. A test-only assets directory remains an explicit validated override. Non-API GET requests receive static assets or SPA `index.html`, and API paths bypass that fallback. Session loading is scoped to `/api/auth`. There is no Vite import or server launch in the production API path. K040 (`npm run build:test:api -- apps/api/test/static.integration.test.ts && node --test --test-name-pattern='static:' apps/api/dist-test/targets/static.integration.test/test/static.integration.test.js`) exited 0, 2/2, using a real-Mongo fixture and temporary asset directory. It verifies static JS, SPA fallback, Helmet header, API JSON 404, optional/required behavior for missing assets, and normal workspace asset resolution from a temporary root.

K040 exposed that the pre-existing error filter converted Nest 404 to sanitized 500. Added a fixed-message `NOT_FOUND` code preserving 404 and a regression case; focused K034 exited 0, 6/6. Full `npm run typecheck --workspaces` exited 0; targeted ESLint across all touched API implementation/tests exited 0. No files were staged or committed.

Final review fixes: the initial compiled-directory-relative asset lookup failed for focused test output and the Playwright `NODE_ENV=test` main process. The resolver now uses `process.cwd()/apps/web/dist`, with a deterministic helper test rooted in a temporary workspace; production absence tests no longer depend on the repository build state or open a Mongo connection. K037 was rerun after narrowing session middleware to `/api/auth` and passed 6/6. API and workspace typechecks plus targeted lint exited 0. `npm run build:web` was attempted to validate the no-hook E2E path but cannot pass until the web entrypoint is implemented: Vite reports `apps/web/src/main.tsx` is missing. Thus no full built-web/server smoke is claimed yet.
