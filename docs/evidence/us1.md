# US1 signup vertical-slice evidence

Runtime: Node `v24.22.0`, npm `11.19.1`. The Docker Playwright smoke used the digest-pinned official Playwright image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` on `linux/amd64`; Chromium reported `156.0.8078.4`.

## Test gates

- The exact K065 command, `npm run db:up && npm run test:integration && npm run test:unit --workspace @easygen/web`, exited 0. Mongo was healthy, API integration passed 14/14, and the web unit suite passed 30/30 at that run.
- After the final browser run exposed an unbound native `fetch` receiver, the default transport was bound to `globalThis`. Its focused K057 test passed 6/6. The snapshot immutability follow-up passed K059 12/12. The client lane also reported its post-fix web build, web typecheck, and targeted lint green. The full K065 command has not been rerun after these narrow client follow-ups.

## Compiled Chromium smoke

Built shared, API, and web artifacts with `npm run build` (exit 0). Started the compiled API with Node `v24.22.0` in `NODE_ENV=test`, serving the built web app and using a fresh isolated Mongo database named `easygen_us1_browser_smoke`.

The browser filled the semantic Email, Name, and Password fields with a fresh account and submitted once. Observed results:

- `GET /signup` returned 200; the initial bootstrap `GET /api/auth/me` returned 401.
- `POST /api/auth/signup` returned 201; the follow-up `GET /api/auth/me` returned 200.
- The client navigated to `/app` and rendered the exact heading `Welcome to the application.`
- The same-origin `easygen.sid` cookie was present with `HttpOnly` and `SameSite=Strict`. Reload issued another successful `/me`, preserved the `/app` route and welcome page, and the page had zero uncaught errors.
- Exactly one signup POST was sent; no retry occurred.

The first compiled-browser attempt revealed that invoking the saved native `fetch` with the `FetchAuthApi` instance as receiver throws Chromium's `Illegal invocation` error before network dispatch. The client owner bound the default fetch function and added the receiver regression test; the final smoke above ran against that rebuilt client.

The API process was stopped and the dedicated smoke database was dropped after the run. This is a focused compiled Chromium smoke, not the later multi-browser E2E suite.
