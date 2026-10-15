# Phase 3 UI lane evidence

Runtime for all recorded checks: Node v24.22.0 and npm 11.19.1 from `/tmp/easygen-node-v24.22.0/bin`.

- T045/K045: `npm run test:unit --workspace @easygen/web -- test/forms.test.tsx -t 'signup-form:'` — 4/4 pass. The first early attempt before UI modules existed failed during module resolution; it was not counted as behavioral RED. The test now covers shared schema feedback, duplicate submit locking, verified-only navigation, exact welcome text, hidden protected content, and safe recovery feedback when session verification fails.
- T062/K062: `npm run test:unit --workspace @easygen/web -- test/auth-fields.test.tsx -t 'auth-fields:'` — an empty-component scaffold produced 3/3 expected behavioral failures; implemented fields then passed 3/3. Cases verify labels/autocomplete and error associations/announcement, no password `minlength`/`maxlength`, keyboard visibility toggle, and signin field mode.
- T063/K063: the K045 command above — 4/4 pass after connecting shared signup validation, controller signup, recovery messaging, and verified-only navigation.
- T064/K064: `npm run build && npm run test:unit --workspace @easygen/web` — shared, API, and web production builds pass; all web unit tests pass, 30/30.
- Additional gates: `npm run typecheck --workspace @easygen/web` passes; targeted ESLint over all seven owned UI files passes.

Owned files:
`apps/web/test/forms.test.tsx`, `apps/web/test/auth-fields.test.tsx`, `apps/web/src/components/auth-fields.tsx`, `apps/web/src/pages/signup.tsx`, `apps/web/src/pages/welcome.tsx`, `apps/web/src/main.tsx`, `apps/web/src/router.tsx`.

No sign-in page or later-phase controller behavior was added in this lane.

## T065 compiled browser follow-up

- The exact K065 gate exited 0: Mongo healthy, API integration 14/14, web unit 30/30. This run preceded the narrow client transport and nested-array immutability follow-ups below.
- Final client follow-ups passed K057 (6/6) for default-fetch receiver binding and K059 (12/12) for signup snapshot behavior. The client owner reported post-fix web build, web typecheck, and targeted lint green. The full web suite was not rerun after those follow-ups.
- After rebuilding the client, Chromium 156 in the pinned Playwright image exercised the compiled app against an isolated real Mongo database. `/signup` returned 200, bootstrap `/me` returned 401, signup POST returned 201, reconciliation `/me` returned 200, and the UI navigated to `/app` with `Welcome to the application.`. Reload revalidated `/me` with 200 and preserved the welcome route. The observed cookie was HttpOnly and SameSite Strict; one signup POST and zero uncaught page errors were observed.
- The first browser diagnostic identified the saved native-fetch receiver error before network dispatch. The default transport was bound to `globalThis`; K057 and the final browser run passed afterward. The smoke database was dropped and the API process stopped.

The browser check was a focused compiled Chromium smoke, not the later multi-browser E2E suite.
