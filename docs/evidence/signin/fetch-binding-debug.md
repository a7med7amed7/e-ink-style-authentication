# Browser fetch receiver root-cause and fix

## Root cause evidence

The compiled Chromium smoke showed signup followed by the app's recovery/uncertain state with no API request. Browser diagnostics localized the failure to the default transport: `window.fetch('/api/auth/me')` returned 401 when called as a detached native function; `fetch.call({}, '/api/auth/me')` raised `TypeError: Illegal invocation`. In `FetchAuthApi.send`, `this.fetcher(...)` invoked the saved Web IDL `fetch` function with the `FetchAuthApi` instance as its receiver. `send()` correctly converted that pre-dispatch exception to a network `AuthApiError`, so the controller did not falsely confirm signup and no POST retry occurred.

Hypothesis: the default native `fetch` receiver, rather than server routing or the browser timeout, prevented dispatch. A new K057 receiver-regression test replaced global fetch with a receiver-checking stub and exercised `new FetchAuthApi().me()`. Before the fix, exact K057 failed 1/6: the check threw under the `FetchAuthApi` receiver and `me()` rejected as `AuthApiError(kind="network")`.

## Fix and verification

The default constructor now stores `globalThis.fetch.bind(globalThis)`; explicit injected fetchers remain supported. The regression test asserts the default implementation is called with `this === globalThis`. The controller's temporary unused-argument ESLint suppression was also removed; a no-op exhaustive switch over the current `RecheckReason` values keeps the parameter lint-checked until later trigger-specific behavior, with no runtime behavior change.

Node 24.22.0/npm 11.19.1 checks:

- K057: `npm run test:unit --workspace @easygen/web -- test/auth-api.test.ts -t 'auth-api:'` — exit 0, 6/6.
- K059: `npm run test:unit --workspace @easygen/web -- test/auth-controller.test.ts -t 'signup-state:'` — exit 0, 12/12.
- `npx eslint apps/web/src/api/auth-api.ts apps/web/test/auth-api.test.ts apps/web/src/auth/auth-controller.ts` — exit 0.
- `npm run typecheck --workspace @easygen/web` — exit 0.
- `npm run build --workspace @easygen/web` — exit 0; the rebuilt bundle included the bound default fetch.

The post-fix compiled Chromium smoke ran in the digest-pinned Playwright container (`mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`, network host) against a real isolated Mongo database; the API was started with `/tmp/easygen-us1-smoke.env`. It observed signup page 200, bootstrap `/me` 401, exactly one signup POST 201, reconciliation `/me` 200, exact `Welcome to the application.` on `/app`, a reload `/me` 200, HttpOnly + SameSite Strict session cookie, and zero uncaught page errors. The smoke teardown dropped the isolated database and stopped the API process. This was a focused Chromium smoke, not the full multi-browser E2E suite.
