# Research: Secure User Authentication

**Date**: 2026-10-15 | **Scope**: decisions for [plan.md](plan.md)

All design questions are resolved below. Dependency metadata and pinned library sources were inspected; no application packages were installed, application tests run, or hashing benchmarks performed. Source analysis supports a design, not an execution claim.

## R1 — Runtime and a single module format

**Decision**: Node 24.22.0 LTS with its npm 11.19.1; native ESM npm workspaces `apps/api`, `apps/web`, and `packages/auth-contract`. TypeScript 5.9.3 is deliberately conservative. Backend compilation uses `NodeNext`, explicit `.js` relative imports, decorators and emitted decorator metadata; frontend uses bundler resolution. Shared exports point to built ESM/declarations, never a source alias.

**Rationale**: Nest 12 is ESM, and Mongoose 9 uses MongoDB driver 7, whose support table includes Node 24. One shared output avoids CJS/ESM dual-build hazards. The available workstation is Node 22.23.2/npm 10.9.8; its presence is not Node 24 execution evidence. TypeScript 7 is not required and the selected typescript-eslint peer range supports 5.9.

**Alternatives considered**: Nest 11/CommonJS plus dual shared outputs adds packaging work; adopting the newest TypeScript major adds tool compatibility work without assessment value.

Exact implementation baseline (pin direct versions and commit one root lockfile):

| Packages | Version |
| --- | --- |
| `@nestjs/common`, `core`, `platform-express`, `testing` | 12.1.3, kept identical |
| `@nestjs/mongoose` / `mongoose` / explicit `mongodb` peer | 12.0.0 / 9.11.2 / 7.7.0 |
| `@nestjs/throttler` | 6.7.1 |
| `express-session` / `connect-mongo` | 1.19.0 / 6.0.0 |
| `argon2` / `helmet` | 0.45.1 / 8.3.0 |
| `reflect-metadata` / `rxjs` | 0.2.2 / 7.8.2 |
| `react` / `react-dom` / `react-router-dom` | 19.3.1 / 19.3.1 / 7.18.4 |
| `vite` / `@vitejs/plugin-react` | 8.3.4 / 6.1.2 |
| `zod` / `typescript` | 4.6.7 / 5.9.3 |
| `vitest` / `supertest` / `@playwright/test` | 5.0.4 / 7.3.1 / 1.64.1 |
| `eslint` / `typescript-eslint` | 10.12.0 / 8.71.2 |
| `@testing-library/react` / `@testing-library/user-event` / `jsdom` | 16.3.3 / 14.6.8 / 30.1.2 |

Use Node-24-matching type definitions; resolve remaining type/lint packages without peer overrides and lock exact selections at scaffolding. `npm ci` must reproduce the committed lockfile. No `--legacy-peer-deps`.

**Sources**: [Node releases](https://nodejs.org/dist/index.json), [Nest 12 manifest](https://raw.githubusercontent.com/nestjs/nest/v12.1.3/packages/core/package.json), [Nest Mongoose peers](https://raw.githubusercontent.com/nestjs/mongoose/12.0.0/package.json), [MongoDB compatibility](https://www.mongodb.com/docs/drivers/compatibility/), [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/). Exact versions were also read directly from `https://registry.npmjs.org/<package>/<version>` and latest metadata for auxiliary packages, including [Zod](https://registry.npmjs.org/zod/4.6.7), [typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.71.2), and [Vitest](https://registry.npmjs.org/vitest/5.0.4).

## R2 — Persistence and deployment

**Decision**: One Nest Express process serves the built React SPA and `/api`, behind a single TLS proxy. MongoDB 8.0 runs separately. Use one application-owned Mongoose connection, its `getClient()` for connect-mongo, and one small pool. No Redis, transactions, repository framework, or distributed coordination.

Create the unique normalized-email index explicitly with `UserModel.createIndexes()` at startup and await it; `unique: true` alone is not validation. Do not use `syncIndexes()` to drop unrelated indexes. Await MongoStore `collectionP`, which resolves after native TTL-index setup. Fail startup on connection/index failures. Provisioning must allow the documented index creation; existing duplicate data blocks startup instead of silently weakening uniqueness.

**Rationale**: Single-document inserts plus a real unique index solve duplicate signup. A shared client avoids duplicate pools within the 512-MiB backend budget.

**Alternatives considered**: Check-then-insert cannot guarantee uniqueness; transactions and locks are unnecessary. MongoDB TTL cleanup is delayed and cannot enforce authorization.

Pin image manifests in implementation. Registry metadata inspected on this date:

- MongoDB: `mongo:8.0@sha256:6657bf2413fefc5be649390318f5b4cd7328e982722f8ce2ac6dfa6f0a42cb03`.
- Node build/runtime base: `node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`.

These image manifests were inspected, not pulled or exercised. Target platform/native Argon2 loading must be tested when building.

**Sources**: [Mongoose uniqueness](https://mongoosejs.com/docs/validation.html#the-unique-option-is-not-a-validator), [Mongoose connections](https://mongoosejs.com/docs/api/connection.html#Connection.prototype.getClient()), [MongoDB TTL](https://www.mongodb.com/docs/manual/core/index-ttl/), [official Mongo image metadata](https://hub.docker.com/v2/namespaces/library/repositories/mongo/tags/8.0), [official Node image metadata](https://hub.docker.com/v2/namespaces/library/repositories/node/tags/24.22.0-bookworm-slim).

## R3 — Explicit session commits and fixed deadlines

**Decision**: Retain all mandated express-session options. Add a narrow, pinned-source compatibility adapter around MongoStore; define its exact rules in [session-lifecycle.md](contracts/session-lifecycle.md).

**Findings**:

- express-session can begin response output before asynchronous automatic save/touch finishes. A later storage error cannot reliably become a clean 503.
- Native MongoStore `touch` updates outer expiration without updating serialized idle metadata. Sliding that timestamp alone cannot implement the full policy.
- express-session `touch()` resets cookie expiration from `originalMaxAge`; a response-time reset can move a deadline calculated earlier.
- Regeneration creates a replacement session without the middleware's normal save wrapper. Therefore, explicit save after regenerate does not by itself prevent a second automatic save.

**Chosen design**: Adapter exposes `get/set/destroy`, not `touch`. Pin per-session cookie expiry and replace the session's `touch` with a nonenumerable no-op after load and regeneration. Explicitly save accepted renewal/authentication before success. Adapter `set` retains only a weak object-keyed successful-write receipt `(sid, SHA-256 serialized snapshot)`; an identical same-object repeat completes locally. This handles regeneration's end-time duplicate write without caching an HTTP response or replaying credentials. Different SID/content/object always delegates; failures never create receipts. No session changes are allowed after commit. Failure detaches the request session before sending an error. Tests must prove no delegated end-time writes remain.

Expired sessions are detached, their browser cookie cleared, and access returns 401. No synchronous cleanup write is required to prove expiry; both backend deadlines continue to reject replay and TTL cleanup removes records eventually. Logout separately requires acknowledged destruction. This preserves the distinction between expiry/anonymous observation and logout invalidation.

**Rationale**: Keeps express-session/connect-mongo while putting failure-prone persistence before success and preventing response-time lifetime extension. The extra adapter is justified by the explicit 503/deadline contract, not by anticipated scale.

**Alternatives considered**: Default rolling/touch misses deadline/error requirements; `resave:true` conflicts with the contract; arithmetic changes to `originalMaxAge` still allow response-time shifts; a new bespoke session system would replace required libraries. A full revocation/tombstone/operation-status system is out of scope.

**Risk and mandatory proof**: This is the highest-risk design seam. Pin dependencies and cover load, regenerate, save failure, duplicate end-save, cookie/store deadline equality, rejected requests, and destroy failure against real HTTP/Mongo behavior. Revisit this adapter if the source assumptions fail; do not weaken the contract to make tests pass.

**Sources**: [express-session 1.19 middleware](https://raw.githubusercontent.com/expressjs/session/v1.19.0/index.js), [session methods](https://raw.githubusercontent.com/expressjs/session/v1.19.0/session/session.js), [store regeneration](https://raw.githubusercontent.com/expressjs/session/v1.19.0/session/store.js), [cookie behavior](https://raw.githubusercontent.com/expressjs/session/v1.19.0/session/cookie.js), [connect-mongo 6 source](https://raw.githubusercontent.com/jdesboeufs/connect-mongo/v6.0.0/src/lib/MongoStore.ts).

## R4 — Origin, proxy, throttling, and errors

**Decision**: Validate exact Origin (or Referer origin only when Origin is absent), AJAX header, and expected JSON shape before session loading for POSTs. Use one default Nest throttler with per-route overrides, followed by session authorization, request validation, and service work. Nest throttler TTL/block duration inputs are milliseconds; its retry-duration output is seconds. Use verified Express `req.ip`, never a raw forwarding header.

Production binds a private interface behind a proxy which overwrites forwarding headers. Trust explicit verified proxy IPs/CIDRs, not `true`; omit express-session's independent `proxy` override. Development trusts no proxy. No CORS middleware is needed for same-origin requests.

Raw session middleware maps recognized store failures before entering Nest routes. Route/filter errors use one sanitized response envelope; password/hash/cookie/Authorization/body values are never logged. Use Nest structured JSON logging with request ID, route, status, and elapsed time; keep logging small.

**Alternatives considered**: SameSite alone misses login CSRF; permissive credentialed CORS weakens the origin boundary; arbitrary hop-count trust allows bypass when routing differs; distributed throttling is unnecessary for one instance.

**Sources**: [Nest throttling](https://docs.nestjs.com/security/rate-limiting), [pinned guard](https://raw.githubusercontent.com/nestjs/throttler/v6.7.1/src/throttler.guard.ts), [pinned storage](https://raw.githubusercontent.com/nestjs/throttler/v6.7.1/src/throttler.service.ts), [Express proxies](https://expressjs.com/en/guide/behind-proxies/), [Nest session middleware](https://docs.nestjs.com/techniques/session).

## R5 — Password and validation implementation

**Decision**: Shared pure ESM module implements NFC, post-NFC code-point counting, exact Unicode predicates, and Zod request schemas. Use strict objects, type checks, email trim/lowercase plus Zod syntax validation, trimmed 3–80-code-point names, and the specified distinct signup/signin password policies. Schema parsing returns canonical credentials; hash/verify consume that result without additional transformations.

Do not use HTML password minlength/maxlength as the authority: those count UTF-16 units. Use semantic input types/autocomplete with `noValidate` and shared accessible validation. Verify the same fixtures in Node and Chromium/Firefox/WebKit; record versions and Unicode compatibility limits.

Argon2id uses 19456 KiB, time 2, parallelism 1, 32-byte hash output, random library-generated salt. One singleton bounded worker gate per Nest app permits 2 active and 4 waiting jobs; FIFO waiters expire after 1000 ms. Check monotonic deadlines at dequeue as well as with timers. Always release slots in `finally`. Unknown-user signin verifies a precomputed dummy hash through that same gate; never hash dummy input per request.

**Alternatives considered**: HTML length rules and ordinary string length violate code-point requirements; generic password validators use different categories; unbounded Argon2 promises can exhaust memory. A single active job would change the chosen contract and is not silently substituted.

**Sources**: [Zod API](https://zod.dev/api), [Unicode categories](https://unicode.org/reports/tr44/#General_Category_Values), [ECMAScript string iteration](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype-@@iterator), [HTML length constraints](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-minlength), [Node ICU](https://nodejs.org/api/intl.html), [Argon2 package](https://raw.githubusercontent.com/ranisalt/node-argon2/master/README.md), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## R6 — Client ordering and evidence

**Decision**: One stable controller per tab owns generation/read counters, a single transport-mutation slot, one optional queued logout, and separate operation receipts/session observations. React observes it with `useSyncExternalStore`. Auth POSTs originate from explicit actions, never effects. No automatic POST retries or waiting-threshold aborts.

After transport rejection, the slot may progress but the uncertain server outcome stays recorded. A later successful identity check can establish observed identity; it cannot prove older server work ended. Failed or contradictory confirmation stays unknown. Logout success needs its own 204 receipt plus subsequent anonymous identity, and never claims global ordering or invalidation of an unknown older operation. The exact transition policy is in [client-auth.md](contracts/client-auth.md).

**Rationale**: React render timing cannot act as a mutex. Generation checking must apply to all responses and cleanup. Route/focus revalidation invalidates trust before protected rendering, avoiding effect-time content flashes.

**Alternatives considered**: Independent form fetches allow races; abort/timeouts do not cancel server work; Web Locks/BroadcastChannel and server operation-status protocols exceed the agreed scope.

**Sources**: [React stale fetch guidance](https://react.dev/learn/synchronizing-with-effects#fetching-data), [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore), [Fetch standard](https://fetch.spec.whatwg.org/#fetch-method). The incomplete-server-cancellation conclusion is a design inference from transport semantics, not a browser acknowledgment guarantee.

## R7 — Tests and benchmark evidence

**Decision**: Compile backend and its Node `node:test` suites with TypeScript before execution, preserving Nest decorator metadata without a second transpiler. Supertest exercises actual Nest HTTP against isolated real MongoDB databases. Vitest covers shared validation and the pure client controller; React Testing Library covers forms. Playwright runs the built application and shared Unicode fixtures in Chromium, Firefox, and WebKit.

Use fresh Nest modules/limiter storage per fixture, deterministic injected authorization clocks and hash-queue schedulers, and captured cookies for expiry/logout replay. Missing database/browser dependencies fail required commands; do not silently skip critical suites. Test native Argon2 and built artifacts, not just mocks.

Benchmark one/two active operations after warmup, at least 100 samples per concurrency level, recording p50/p95/max, throughput, baseline/peak RSS, runtime/CPU/resource limits, and native versions. Record service-time and end-to-end admitted latency separately. Exercise queue saturation/wait bounds independently. A constrained local container is only a local proxy for the target; deployment hardware remains unverified unless actually exercised.

**Alternatives considered**: mongodb-memory-server introduces download/runtime dependencies and may hide real deployment differences; default Vite transpilation loses Nest decorator metadata; unit-only or skipped-integration green results cannot satisfy delivery.

**Sources**: [Node test runner](https://nodejs.org/api/test.html), [TypeScript decorator metadata](https://www.typescriptlang.org/tsconfig/emitDecoratorMetadata.html), [Nest testing](https://docs.nestjs.com/fundamentals/testing), [Playwright browser support](https://playwright.dev/docs/browsers).

## R8 — Planning scaffold and governance

**Decision**: Restore upstream `common.sh`, `setup-plan.sh`, and plan template; run setup against `.specify/feature.json`. Use the upstream agent-context extension script with explicit Cursor target configuration, without registering automatic hooks. Do not create a constitution or change Git branch history.

Setup reports `FEATURE_DIR` (not the older `SPECS_DIR`) and labels its `BRANCH` field `001-user-auth`, derived from feature metadata. The actual Git branch remains `master` and has no commits; report these separately. No before/after plan hooks are configured. Missing constitution is disclosed, with the user's binding contract serving as the review authority.

**Sources**: [setup-plan](https://raw.githubusercontent.com/github/spec-kit/main/scripts/bash/setup-plan.sh), [common functions](https://raw.githubusercontent.com/github/spec-kit/main/scripts/bash/common.sh), [plan template](https://raw.githubusercontent.com/github/spec-kit/main/templates/plan-template.md), [agent-context extension](https://github.com/github/spec-kit/tree/main/extensions/agent-context). Retrieved 2026-10-15; scaffold checks are distinct from application verification.
