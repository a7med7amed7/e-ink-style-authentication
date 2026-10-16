# Easygen authentication assessment

This repository contains a same-origin React and NestJS authentication app backed by MongoDB. The development workflows below are reproducible with the pinned toolchain. The Docker image, HTTP health check, and authenticated private-network smoke passed on Linux/amd64 with a temporary, narrowly scoped host firewalld allow rule. The unmodified host policy rejected the app-to-Mongo bridge flow; see the Compose note below for the tested scope and limits.

## Prerequisites

- Node.js **24.22.0** and npm **11.19.1** (`.nvmrc` and `package.json` pin both) for repository checks and direct-host development.
- Docker Engine and the Compose plugin for MongoDB and the app image workflow. The Docker-only local app path below does not require Node or npm installed on the host.
- A fresh `SESSION_SECRET` containing 32 random bytes encoded as base64. The direct-host workflow can generate it with pinned host Node; the Docker-only workflow uses the pinned Node image as described below. Put it in `.env` and do not commit or log the secret.

Check the runtime before installing dependencies:

```sh
node --version   # v24.22.0
npm --version    # 11.19.1
npm ci
```

The project has been exercised on Linux/amd64. Other operating systems, CPU architectures, Node/ICU versions, and browser/runtime combinations are not certified by that evidence.

## Run locally

The direct-host development setup uses one `localhost` origin in the browser and Vite proxy. Keep `localhost` consistent; `127.0.0.1` is a different browser origin.

```sh
cp .env.example .env
# Set SESSION_SECRET in .env to the generated base64 value.
npm run db:up
```

`npm run db:up` starts the pinned MongoDB 8.0 service on `127.0.0.1:27017` and waits for its ping health check. In separate terminals, start the API and Vite:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Open <http://localhost:5173>. Vite forwards `/api` to the API at `127.0.0.1:3000` while preserving the browser's `Origin`. The API validates the required environment at startup and waits for the MongoDB email-unique and session-TTL indexes before accepting requests. Missing or invalid settings fail startup; there is no in-memory session fallback.

The example `.env` sets `NODE_ENV=development`, `APP_ORIGIN=http://localhost:5173`, `MONGODB_URI=mongodb://127.0.0.1:27017/easygen`, `HOST=127.0.0.1`, and `PORT=3000`. `SESSION_SECRET` must be canonical base64 containing at least 32 decoded bytes. `TRUSTED_PROXY_CIDRS` stays empty for direct local development.

## Run the app image with Compose

`compose.app.yaml` builds a non-root image with production-only runtime dependencies and runs the UI/API beside a private MongoDB service. It sets `APP_ORIGIN=http://localhost:3000` and `MONGODB_URI=mongodb://mongo:27017/easygen`, and publishes only `127.0.0.1:3000`; the browser origin is `http://localhost:3000`. The Compose app uses the local-development cookie policy and HTTP because it is a local assessment workflow, not a production TLS topology. It requires `SESSION_SECRET`, `DOCKER_APP_HOST`, and `DOCKER_APP_SUBNET` in `.env`; `.env.example` gives the current non-overlapping defaults, which must be changed if that range conflicts with a host route or another Docker network.

For this Compose-only path, copy the example file without installing host Node: use `cp .env.example .env` in a POSIX shell or `Copy-Item .env.example .env` in PowerShell. Generate a fresh secret with the same digest-pinned Node base used by the app Dockerfile:

```sh
docker run --rm --entrypoint node node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Paste the one-line output into the `SESSION_SECRET=` entry in `.env`. This prints only the new secret for the local operator to copy; never save it in shell history, logs, or Git. The Compose-only path needs no host Node/npm installation.

```sh
docker compose --project-name easygen-app --file compose.app.yaml up --build --wait
docker compose --project-name easygen-app --file compose.app.yaml ps
```

Compose defines a MongoDB ping health check and an app health check that requires HTTP 200 from `/`. On the observed Linux host, the app became healthy; direct and published app URLs returned HTTP 200; signup returned 201; and cookie-authenticated `/api/auth/me` returned 200. The app ran as `node` under Node 24.22.0. These checks used the private bridge path from app address `172.30.0.3` to MongoDB `172.30.0.2:27017`.

The host's original firewalld policy has a nested `FORWARD` catch-all reject that blocks this new bridge connection. For this QA run only, a narrowly scoped `NEW` TCP/27017 allow for that exact app-to-Mongo bridge flow was inserted before the rejecting policy. Its counter recorded 4 packets / 240 bytes. The temporary rule was removed after the smoke, and the app stack, probe, and diagnostic resources were cleaned up; the separate baseline Mongo service and volume were preserved. This proves the app path after the scoped allowance, not that the original host firewall permits it by default. Other hosts may require their own network-policy adjustment, and Docker behavior has only been verified on Linux/amd64.

Stop the stack and preserve its database volume with:

```sh
docker compose --project-name easygen-app --file compose.app.yaml down
```

## Verification commands

Run the project checks with the pinned Node/npm versions:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

`test:integration` uses the real local MongoDB service (`npm run db:up`). The E2E runner discovers every `*.spec.ts` file and invokes each file in its own Playwright process, so each spec gets a fresh app limiter and generated test database; it stops at the first failing invocation. `npm run test:e2e` builds before running the suite. `npm run verify` runs lint, all typechecks, build, unit, integration, and the full E2E runner.

The root `npm run lint` and `npm run typecheck` commands build the shared contract declarations first, so both work from a fresh install without a preexisting `dist` directory. No TypeScript install hook is required for the production image.

For local E2E execution, install the Playwright 1.64.1 browser binaries with `npx playwright install chromium firefox webkit`. The recorded all-engine run used the pinned official image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` on Linux/amd64.

The final clean-source snapshot `npm run verify` passed all 289 checks on Linux/amd64: 231 unit tests (54 shared-contract, 105 web, 69 API, and 3 tooling), 34 real-Mongo integration tests, and 24 browser tests across Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2 in the pinned Playwright image, with zero skips or failures. Exact archive, runtime, commands, outputs, and cleanup evidence are in [the clean-source reproduction report](docs/evidence/reproducibility.md). This evidence is limited to the recorded environment; it does not close the actual Orca field/error speech gap or certify other operating systems, hardware, or production deployment.

## Authentication and deployment security

### Credentials and duplicate registration

Email is trimmed, lowercased, checked for syntax, and limited to 254 Unicode code points. The database has a real unique index on the canonical email, so concurrent signup requests cannot create two accounts; a duplicate returns **409**. This intentionally reveals whether an email is registered. Signin uses a generic **401** for an unknown email or wrong password.

Names are trimmed and limited to 3–80 Unicode code points. Passwords are canonicalized with NFC only; they are never trimmed or lowercased. Signup requires 8–128 Unicode code points after NFC, at least one Unicode letter (`L`), one decimal digit (`Nd`), and one punctuation character or symbol (`P`/`S`). Signup rejects control, format, surrogate, line-separator, and paragraph-separator characters (`Cc`, `Cf`, `Cs`, `Zl`, `Zp`). Spaces are permitted but do not meet the special-character requirement; a zero-width joiner is rejected. Supplementary-plane symbols such as emoji count as one code point.

Signin applies NFC and the required/nonempty and 128-code-point maximum checks; it does not reapply signup composition or minimum-length rules to existing credentials. Account recovery after an interrupted signup therefore uses an ordinary signin attempt. Email provider-specific normalization rules are not applied.

These rules were exercised with Node 24.22.0 / ICU 78.3 and the pinned Playwright browsers Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2 on Linux/amd64. A shared fixture verified composed/decomposed password signup and signin in all three engines. Unicode category tables may vary for newly assigned characters under other ICU/Unicode data versions; other Node/browser versions and platforms are unverified.

### Origin, proxy, and deployment boundary

Production uses one public HTTPS origin for the React app and `/api`. Set `APP_ORIGIN` to that exact canonical origin, such as `https://auth.example.com`; production rejects HTTP. The TLS-terminating proxy must overwrite client-supplied `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`, and the API must only be reachable through that trusted ingress. Set `TRUSTED_PROXY_CIDRS` to verified proxy addresses; do not enable blanket proxy trust or accept arbitrary client forwarding headers. Configuration rejects wildcard and broad ranges (less specific than `/24` for IPv4 or `/64` for IPv6); prefer an exact peer address.

Every state-changing request, including signup and signin, must have an exact trusted `Origin`, or a trusted `Referer` when `Origin` is absent. It also requires the expected AJAX header and JSON for credential bodies. SameSite cookies provide defense in depth; they do not replace origin checks, and the API does not enable broad credentialed CORS.

Real-Mongo security tests exercised an actual local proxy fixture that replaced spoofable forwarding claims. A trusted upstream at `127.0.0.1` and an untrusted direct client at `127.0.0.2` were used to verify client-IP rate buckets and HTTPS cookie decisions; forged headers from the untrusted peer were ignored. This is evidence for the API trust logic, not proof of any particular production proxy, host firewall, or deployed client-IP path. Validate the actual proxy and network before deployment.

### Sessions and recovery after uncertain requests

Sessions are persisted in MongoDB; the server has no memory-store fallback. Successful authentication regenerates the session ID and saves it before success. In production the cookie is `__Host-easygen.sid`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and has no `Domain`. Development uses a separate non-Secure cookie name. Sessions expire after 30 minutes idle or 8 hours absolute, whichever comes first; activity cannot extend the absolute deadline. Separate browser profiles/devices have independent sessions, while tabs in one profile share the cookie.

Logout returns **204** only after Mongo confirms destruction of the presented session. A following `/me` returning **401** confirms that the browser is currently anonymous, but by itself it does not prove that an earlier unacknowledged logout invalidated a server session. Treat a storage failure as **503**, not as successful signout. An acknowledged destruction followed by anonymous `/me` is the confirmed logout path.

If a signup inserts the user but its session save fails, the account remains and no authenticated success is returned. Sign in normally to recover. The browser never automatically retries signup or signin: a lost response does not prove the original POST stopped, and retrying can produce a duplicate registration or another mutation. After an uncertain credential request, use the available session check and explicit recovery guidance; do not infer failure or success solely from a transport error. An unresolved older server request may still finish because there is no operation-status protocol.

The interface shows “Still verifying” after 5 seconds. This is a waiting message only: it does not cancel the original request, establish failure, or free its serialized mutation slot. When the request settles, the UI reconciles with `/me`; a failed reconciliation remains unknown and offers an explicit check. Tabs share cookies but have no Web Locks/BroadcastChannel or atomic cross-tab ordering. Direct API clients and other tabs are outside the UI's per-tab serialization guarantee.

The initial in-memory per-process rate limits are 5 signup requests per IP per 15 minutes, 10 signin per IP per minute, 120 `/me` per IP per minute, and 30 logout per IP per minute. Rejected requests are limited before expensive password work. These buckets are local to one app process; a multi-instance deployment needs shared or gateway-enforced rate limits and a reconsidered global hash-capacity boundary.

### Hash capacity and observed performance

Argon2id uses 19,456 KiB memory, time cost 2, parallelism 1, and a 32-byte hash. A single process admits at most two active hash/verify jobs and four waiting jobs. The next job is rejected at saturation; queued jobs expire after 1,000 ms. Capacity or queue expiry returns **503** with retry guidance. The four route-specific per-IP limits above run before password hashing.

The recorded benchmark reports below measured the application’s native Argon2 implementation with 100 single-active samples and 200 two-active samples. They are local observations, not a capacity guarantee:

| Run | Resource/runtime scope | Two-active service p95 | Baseline / peak RSS |
| --- | --- | ---: | ---: |
| Native host ([raw report](docs/evidence/hash-benchmark.json)) | Linux x64, Ryzen 5 4500U, Node 24.22.0 / ICU 78.3; six available parallel workers; CPU/memory cgroup limits unavailable | 40.412917 ms | 94,715,904 / 136,658,944 bytes |
| Constrained container ([raw report](docs/evidence/container-hash-benchmark.json)) | Linux/amd64, Node 24.22.0 / ICU 78.3; one-CPU quota (`100000 100000`) and 536,870,912-byte memory limit | 83.297532 ms | 92,663,808 / 134,737,920 bytes |

Both runs observed saturation, four timed-out waiters, and a queue timeout near the configured 1,000 ms. The initial deployment target is one vCPU and 512 MiB. The constrained container used the same reported Ryzen 5 4500U CPU model and Node/ICU versions under one-CPU/512-MiB cgroup limits; it is still a local resource-limited sample, not a measurement of the eventual deployment host. Target hardware and its performance remain **unverified**. The initial objective of two-active p95 below 500 ms is therefore not claimed for the target.

The design targets one application process, so Redis is omitted. Mongo-backed sessions do not make the in-memory rate limiter or hash-work gate global. A multi-instance deployment needs shared or gateway-enforced per-IP limits and a globally coordinated admission/capacity boundary. Redis or a shared session store by itself would not make browser tabs atomically ordered.

An unacknowledged authentication POST may still finish on the server after the browser reports a network error; no operation-status protocol exists to prove it stopped. The 5-second “Still verifying” notice does not cancel work or release the mutation slot. The client waits for the original request and then reconciles with `/me`; when that check fails, the result remains unknown. Tabs share a cookie, and Web Locks, BroadcastChannel coordination, and cross-tab ordering are deferred.

Backups, monitoring, redundancy, email verification, account recovery, and deployment automation remain deferred operational work. The local auth signin path can recover an account created before a failed signup-session save; that is not a general account-recovery feature.
