# Quickstart and Validation Guide

**Planning artifact**: The commands below define the scripts/setup that implementation must deliver. No application source, package lockfile, Docker image, or runtime test exists yet; these commands have not been executed as application verification. Do not mistake this guide for a passing run log.

## Prerequisites

- Node 24.22.0 LTS/npm 11.19.1 (use the documented pinned runtime), Docker with Compose, and browser-test system dependencies.
- Separate MongoDB access for production; local Compose exposes Mongo only on loopback. Tests use isolated database names, never production data.
- Start from the public repository checkout once publication is complete. A local Node 22 installation does not fulfill the Node 24 verification gate.

## Initial setup

From repository root, after implementation:

```bash
nvm install 24.22.0
nvm use 24.22.0
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Use the generated value for SESSION_SECRET in the untracked `.env`; do not reuse an example secret. Do not overwrite an existing `.env` during repeat setup. If nvm is unavailable, install the same official Node version using the evaluator's runtime manager.

Required local settings:

| Setting | Local value |
| --- | --- |
| `NODE_ENV` | `development` |
| `APP_ORIGIN` | `http://localhost:5173` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/easygen` |
| `SESSION_SECRET` | Generated 32-byte random secret, base64 encoded |
| `HOST` / `PORT` | `127.0.0.1` / `3000` |
| `TRUSTED_PROXY_CIDRS` | Empty |

```bash
npm run db:up
npm run build
```

Expected: pinned Mongo container healthy; shared → API → web production builds pass. Backend startup separately waits for unique-email/session-TTL indexes. Missing secret/origin/database configuration must fail startup with a safe explanatory message.

## Local run and core manual path

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

`dev:api` builds the backend and runs its compiled ESM with the local environment; rerun `npm run build:api` after backend source edits (compiled output may be watched). No metadata-losing TypeScript runtime transpiler is assumed. Vite serves the browser and proxies `/api` while retaining its Origin. Open `http://localhost:5173`.

1. Sign up with a new email, a 3+-character name, and `Abcdef1!`; expect the exact welcome message after verified identity. Refresh; expect the same verified session.
2. Log out; expect destruction acknowledgment and anonymous confirmation. Protected `/app` and direct `/api/auth/me` reject access afterward.
3. Sign in with the same normalized email/password; expect verified identity. Wrong password returns a generic credential error. Invalid signup reports accessible field errors.
4. Inspect development cookie flags (HttpOnly, Strict, Path=/, separate dev name). Production Secure/__Host behavior is tested using the trusted HTTPS-proxy fixture, not inferred from localhost HTTP.

For browser-restart evidence, automated tests use persistent storage/context behavior and verify `/me` after restart before expiration; never treat a cached welcome screen as proof.

## Verification commands

These script names are the planned root interface. Missing database/browser prerequisites must fail required checks rather than auto-skip them.

```bash
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
npm run verify
```

Expected: unit tests cover Unicode/canonicalization, queue limits, and deferred client promises; integration tests start real Nest HTTP against real Mongo; browser suites use built frontend/backend and pinned engines. `verify` aggregates typecheck/lint/build/unit/integration/E2E in a documented order and exits nonzero for any failure or missing mandatory dependency. It excludes benchmarks from pass/fail performance claims; run those separately and record observations.

The API test command compiles test/server TypeScript before `node --test`; do not replace it with an unconfigured Vite transform that loses decorator metadata. Integration fixtures own fresh limiter instances, deterministic clocks, and unique database names; cleanup only their own test databases.

Refer to [verification.md](verification.md) for individual evidence IDs and expected assertions. Required direct HTTP cases include concurrent same-email signup, exact statuses, CSRF rejection, rate limiting with no hash work, delayed session saves, retained-record expiry, failed invalidation, and captured-cookie replay. Use at most four concurrent duplicate attempts under default signup throttling so 429 does not mask the uniqueness assertion.

## Direct origin-rejection smoke check

Against the local server, after implementation:

```bash
curl -i http://127.0.0.1:3000/api/auth/signin \
  -H 'Origin: https://untrusted.example' \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: XMLHttpRequest' \
  --data '{"email":"example@example.com","password":"Abcdef1!"}'
```

Expected: 403, no successful authentication or password work. Full same-origin flow tests use browser/Supertest fixtures rather than manually caching credentials/cookies for retries. Test-only captured cookies are deliberately reused to prove invalidation; the application must never implement such replay as retry behavior.

## Hash measurements

```bash
npm run benchmark:hash
```

The command writes actual environment and raw/summarized observations to `docs/evidence/hash-benchmark.json`: at least 100 post-warmup samples for each of one/two active jobs, p50/p95/max, throughput, baseline/peak RSS, runtime/CPU/resource limits, and queue saturation/wait outcomes. Service latency is distinct from queue/admission latency. Do not invent a <500-ms result or infer full-process memory from Argon2's 38-MiB working-memory arithmetic.

For a resource-constrained local proxy of the target, the planned Docker image's benchmark command is:

```bash
docker build -t easygen-auth:assessment .
docker run --rm --cpus=1 --memory=512m easygen-auth:assessment npm run benchmark:hash -- --stdout
```

The image must include the compiled benchmark entry point but no browser/test toolchain. This is not proof on the deployment's CPU. If the target cannot be exercised, mark its performance unverified and report local observations separately; if the objective is missed, revise documented resource/capacity expectations before claiming it.

## Production and final evidence

Build/serve the SPA in Nest behind the documented HTTPS proxy using the same public origin for browser and API. Set production environment and narrowly trusted ingress addresses. See [deployment](contracts/deployment.md) and [session lifecycle](contracts/session-lifecycle.md) for the settings and verification boundary.

Before delivery, rerun the complete critical flow plus lint/typecheck/build, fill the per-contract report in `docs/evidence/final-review.md`, update README.md/AI.md with actual decisions/corrections/results, and verify public GitHub source. Classify every requirement as implemented-and-tested, implemented-but-unverified, or deferred-and-documented. Any missing mandatory security/correctness gate prevents the selected production-readiness claim.
