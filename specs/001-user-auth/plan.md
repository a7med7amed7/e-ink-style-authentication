# Implementation Plan: Secure User Authentication

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Branch**: `master` (unchanged) | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)
**Input**: `specs/001-user-auth/spec.md` and [binding implementation contract](implementation-contract.md)
**Status**: Design complete; implementation and runtime verification pending.
**Goal**: Deliver a small, secure authentication application with accurate session outcomes and reproducible evidence.
**Architecture**: One NestJS Express process serves a React SPA and four authentication endpoints on one public origin, with MongoDB separate. A browser-safe shared package owns canonical credential schemas. A bounded password-work gate and a narrow session-store adapter enforce resource and persistence guarantees.
**Tech Stack**: React, TypeScript, NestJS, Mongoose/MongoDB, express-session/connect-mongo, Argon2id, npm workspaces, Vite, Zod; Node test runner/Supertest, Vitest, and Playwright.

## Summary

Implement signup, signin, protected identity/welcome, and current-session logout. Use a modern e-ink interface with accessible forms. Backend authorization is authoritative; browser state uses generations, serialized mutation transport, and separate observation/destruction evidence. Preserve every C01–C14 contract, including expiry enforcement, partial signup recovery, exact Unicode rules, bounded hashing, and honest uncertainty/performance disclosures.

Scope is intentionally one process and one origin. No Redis, distributed locks, server operation-status protocol, refresh-token system, or full identity platform. Public GitHub delivery is a final gate, not something accomplished by writing this plan.

## Global Constraints

- React, TypeScript, NestJS, MongoDB, and Mongoose are mandatory; logout is included.
- Production: HTTPS, one explicit APP_ORIGIN, private API behind a verified TLS proxy; development: localhost with Vite `/api` proxy and CSRF still enabled.
- Session: `resave:false`, `saveUninitialized:false`, `rolling:true`, HttpOnly, SameSite Strict, Path=/, no Domain; Secure and `__Host-` cookie in production, separate development name.
- Idle timeout: 30 minutes. Absolute timeout: 8 hours from authentication. Neither rolling nor store refresh extends absolute lifetime.
- Password: NFC; signup 8–128 code points; Unicode L/Nd/P-or-S; reject Cc/Cf/Cs/Zl/Zp; preserve spaces; signin only required/max-128/NFC checks before verification.
- Argon2id: 19456 KiB, time 2, parallelism 1. Shared admission: 2 active, 4 waiting, initial queue-wait maximum 1 second.
- Signup limit 5/15 minutes; signin 10/minute; identity 120/minute; logout 30/minute, all per verified IP before password work.
- No automatic signup/signin POST retry. No ambiguous result is reported as verified success. Confirmed logout requires destruction acknowledgment plus anonymous identity confirmation.
- Target: one 1-vCPU, 512-MiB backend with MongoDB separate. Initial p95 hashing objective <500 ms with two active operations is measured, never assumed.
- README.md, truthful AI.md, public source, critical integration tests, typecheck, lint, and production build are delivery gates.

## Technical Context

**Language/Version**: TypeScript 5.9.3; Node 24.22.0 LTS/npm 11.19.1. ESM throughout; backend/shared NodeNext, frontend bundler resolution.
**Primary Dependencies**: Nest 12.1.3, React 19.3.1, Vite 8.3.4, Mongoose 9.11.2, MongoDB driver 7.7.0, express-session 1.19.0, connect-mongo 6.0.0, Argon2 0.45.1, throttler 6.7.1, Zod 4.6.7. Full pinned baseline in [research](research.md).
**Storage**: MongoDB 8.0; `users` and `sessions` collections; real unique email index and native session TTL index. Reuse the Mongoose-owned client; no in-memory session fallback.
**Testing**: Backend compiled with tsc then Node `node:test` + Supertest/real Mongo; Vitest for shared/client; React Testing Library for form behavior; Playwright Chromium/Firefox/WebKit against built assets. Inject time/scheduling only at application policy boundaries.
**Target Platform**: Linux/glibc Node runtime behind a TLS proxy; modern browser engines with exact versions recorded during tests. Browser automation tools run outside the production resource limit.
**Project Type**: Small full-stack web application in three npm workspaces, one root lockfile, one production server process.
**Performance Goals**: Measure one/two-operation latency and memory, p95 target <500 ms at two active operations; reject queue saturation immediately and waiting jobs at 1000 ms. No throughput/user-count promise without measurement.
**Constraints**: 1 vCPU/512 MiB initial backend; explicit secrets/origin/proxy validation; no distributed infrastructure; mandatory security gates take precedence over polish.
**Scale/Scope**: One ordinary user role, three screens, four endpoints. Independent device sessions permitted. Cross-tab atomic ordering, recovery/verification flows, redundancy, backups, and full monitoring are disclosed gaps.

## Constitution Check

No `.specify/memory/constitution.md` exists. Do not invent a ratified constitution or claim constitutional compliance. The user-approved spec and final contract are the governing gates for this plan.

| Gate | Before research | After design | Evidence / design owner |
| --- | --- | --- | --- |
| Required stack and small deployment | Compatible in principle | Covered | R1–R2; C01–C02; API/static workspace structure |
| Exact credentials and bounded work | Requires API/version research | Covered | R5; shared schema and hash-work contracts |
| Session expiry, persistence, and failure semantics | Requires pinned-source research | Covered with targeted adapter risk | R3; session-lifecycle contract; V06/V07/V16/V17 |
| CSRF, proxy trust, and rate limits | Requires middleware-order research | Covered | R4; HTTP/deployment contracts; V08/V09/V17 |
| Client race/unknown-state behavior | Requires transition design | Covered | R6; client-auth contract; V10/V14 |
| Accessibility and reproducible evidence | Required | Covered | Quickstart and verification matrix; V11/V12/V15/V18–V20 |
| No speculative distributed features | Required | Covered | Deferred scope remains unchanged |

“Covered” means a concrete design and verification path exists. Every application runtime gate remains pending execution; none is marked passing here. No unresolved design question or unjustified contract deviation remains.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-auth/
├── spec.md
├── implementation-contract.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── verification.md
├── tasks.md             # Subsequent task-generation output
├── contracts/
│   ├── http-api.md
│   ├── session-lifecycle.md
│   ├── client-auth.md
│   └── deployment.md
└── checklists/
    ├── requirements.md
    └── plan-review.md
```

`tasks.md` belongs to the subsequent speckit-tasks command; this command does not generate or execute it.

### Source Code (planned repository root)

```text
package.json / package-lock.json       npm workspaces, ordered build and verification scripts
.nvmrc / .npmrc                        pinned Node; exact installs/engine checks
.env.example / .gitignore              documented safe inputs; exclude secrets/artifacts
eslint.config.js / tsconfig.base.json  shared strict checks
vitest.config.ts                      shared/web named test projects
scripts/build-api-test.mjs            target-isolated tsc test compilation
compose.yaml / Dockerfile              local Mongo only; reproducible app image
README.md / AI.md                      setup/security/limitations; actual assistance log
apps/api/
  package.json / tsconfig.json / tsconfig.test.json
  src/main.ts                          production bootstrap, listen, shutdown
  src/benchmark-hash.ts                compiled standalone latency/RSS benchmark
  src/app.module.ts                    Nest composition; global guard/filter bindings
  src/config.ts                        parsed validated environment
  src/bootstrap.ts                     reusable app assembly; startup/index readiness
  src/common/api-error.filter.ts       sanitized error envelope and request ID
  src/common/request-log.ts            metadata-only completion logs
  src/security/origin.middleware.ts    exact origin/header/media checks before session read
  src/security/rate-limit.guard.ts     default tracker and per-route policy integration
  src/security/hash-work.ts            shared bounded FIFO admission
  src/security/password.service.ts     Argon2 hash/verify and precomputed dummy verifier
  src/session/store.ts                 MongoStore compatibility adapter and error branding
  src/session/policy.ts                deterministic idle/absolute deadline calculation
  src/session/cookie.ts                required cookie flags and pinned-touch helper
  src/session/session.service.ts       explicit regenerate/save/destroy and failure detach
  src/session/session.middleware.ts    load, pin, raw-middleware failure mapping
  src/session/session.guard.ts         protected route authorization without early renewal
  src/auth/user.schema.ts              Mongoose account model and unique index
  src/auth/auth.service.ts             insert/lookup/verify; typed duplicate mapping
  src/auth/auth.controller.ts          four endpoint orchestration; no password duplication
  src/auth/validation.pipe.ts          shared schema parsing into canonical inputs
  src/types/express-session.d.ts        minimal typed auth metadata
  test/support/fixture.ts              fresh app/clock/limiter/database; no silent skips
  test/auth.integration.test.ts        signup/signin/protection/duplicate/recovery
  test/session.integration.test.ts     expiry/invalidation/commit failures/deadlines
  test/security.integration.test.ts    CSRF/headers/throttling/proxy behavior
  test/hash-work.test.ts               capacity, FIFO deadlines, release-on-failure
  test/session-policy.test.ts          exact deadline boundaries
apps/web/
  package.json / tsconfig.json / vite.config.ts / index.html
  src/main.tsx / src/router.tsx        bootstrap and pre-render route revalidation
  src/api/auth-api.ts                  same-origin fetch, typed envelopes; no POST retries
  src/auth/auth-controller.ts          stable per-tab generation/queue/evidence owner
  src/auth/auth-context.tsx            useSyncExternalStore bridge
  src/auth/protected-route.tsx         verified-generation render gate
  src/components/auth-fields.tsx       labels/errors/password visibility/form affordances
  src/components/auth-status.tsx       waiting/unknown/session-recheck feedback
  src/pages/signup.tsx / signin.tsx    shared schema feedback and submit actions
  src/pages/welcome.tsx                required copy and logout
  src/styles.css                       e-ink tokens, responsive/focus/reduced-motion rules
  test/auth-controller.test.ts         deferred promises and every uncertainty transition
  test/forms.test.tsx                  keyboard, validation, announcements, duplicate submit
packages/auth-contract/
  package.json / tsconfig.json
  src/password.ts                      pure NFC/code-point/category functions
  src/schemas.ts                       strict request/user/error schemas and canonical inputs
  src/types.ts / src/index.ts          transport DTOs and public package exports
  test/password.test.ts / schemas.test.ts
  test/unicode-cases.ts                one fixture source for Node/browser parity
playwright.config.ts
tests/e2e/auth.spec.ts                built app core flow, restart persistence, keyboard
tests/e2e/unicode.spec.ts             shared fixtures in three real browser engines
docs/evidence/                       generated review reports/benchmark observations
```

**Structure Decision**: Three build units separate server-only secrets/native hashing from browser code while sharing actual validation. AuthService uses the Mongoose model directly; no extra repository/service hierarchy or generic framework. Test files are grouped by the security behaviors they prove. Exact task-level file lists and code belong to tasks.md.

Task generation refines the test file map with focused config, store, cookie, middleware, proxy, transport, route-trust, outcome, status and benchmark suites. `scripts/build-api-test.mjs` preserves tsc metadata while compiling one test entry/transitive graph into `apps/api/dist-test/targets/<suite>/`; no-argument mode compiles the full suite to `apps/api/dist-test/test/`. This prevents unrelated deliberately RED suites and concurrent output writes from invalidating focused checks. It uses the standard library and selected TypeScript compiler, not another transpiler or test framework. Workspace Vitest commands explicitly select the root configuration's shared/web projects.

## Complexity Tracking

No constitution exemption is requested. One deliberate addition needs justification:

| Addition | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Small pinned-source session adapter and explicit commit policy | Make 503 storage failure semantics and non-extendable cookie/store deadlines enforceable | Default asynchronous response-end saves/touches can fail after headers and can move expiration; replacing required session libraries would violate scope |

The adapter must remain local to session code. Its successful-write receipt is ephemeral, weakly object-keyed, and only suppresses duplicate library writes of an already-acknowledged identical snapshot. It is not an HTTP idempotency mechanism or a cache of replayable credentials.

## Phase 0 — Research decisions

[research.md](research.md) resolves runtime/package compatibility, schema ownership, persistence/index initialization, response-end session behavior, proxy/rate-limit units, client transitions, tests, and benchmarks. Use pinned-source assumptions in tests. No target performance or installed-dependency compatibility is claimed before execution.

## Phase 1 — Design and interface contracts

- [data-model.md](data-model.md): account/session fields, indexes, canonicalization, transient state, transitions.
- [contracts/http-api.md](contracts/http-api.md): methods, auth/origin requirements, exact envelopes/statuses, no-store responses.
- [contracts/session-lifecycle.md](contracts/session-lifecycle.md): deadlines, successful-write receipts, explicit commit/invalidation, failures.
- [contracts/client-auth.md](contracts/client-auth.md): generation/read checks, serialized mutations, UI threshold, observations and receipts.
- [contracts/deployment.md](contracts/deployment.md): validated configuration, private ingress, trusted IPs, cookie/static behavior.
- [quickstart.md](quickstart.md): planned runnable setup and validation commands with expected outcomes.
- [verification.md](verification.md): all FR/C/V obligations mapped to evidence; all application checks initially pending.

Agent context is refreshed only inside `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` in `.cursor/rules/specify-rules.mdc`, using the restored upstream context-update script. Existing manual content outside the block must be preserved. No automatic hook is installed.

## Phase 2 — Implementation sequencing and task handoff

This is a dependency order for subsequent task generation, not executable multi-file tasks. The task artifact refines it into user-story increments: backend support precedes its corresponding UI claim, the client controller core precedes forms, and the complete critical security gate precedes visual finish. Shared primitives are established once rather than duplicating them for each story.

1. Establish pinned toolchain/workspaces, shared canonical schemas and fixtures, strict builds, and actual Mongo fixture prerequisites.
2. Prove backend capabilities in vertical story increments: unique index and duplicate insert mapping; bounded hash work; explicit session commits/deadlines; signup/signin/me/logout; CSRF/throttling/proxy behavior; partial failure and captured-cookie replay. Signup includes backend signin recovery because its NFC/partial-failure acceptance criteria require it.
3. Implement and prove the pure client controller core before connecting forms, then extend its focused adversarial cases with the relevant story: stale reads, duplicate submission, queued logout, threshold, transport ambiguity, and evidence distinctions. Internal early checkpoints do not waive the final mandatory client-state gates.
4. Connect minimal forms and protected page; exercise the complete built flow before optional polish. Then complete responsive e-ink styling, accessibility, browser/runtime Unicode parity, restart persistence, and reproducible build checks.
5. Measure hashing/capacity, record actual environment/results, complete README/AI disclosures and per-contract final review, and verify public source delivery. Optional CI/API docs/polish only follow mandatory gates.

When speckit-tasks expands this sequence, each independently reviewable code change must be 2–5 minutes, modify at most 2 files, and add at most 100 production lines. Separate tests/implementation where that bound requires it; name exact files/interfaces, failure assertion, command, and expected result. Do not treat an entire phase or directory as one task. Use failing behavior tests before security/feature implementation; do not invent tests for documentation-only scaffolding.

## Post-design review and current evidence

Design coverage is recorded in [plan-review.md](checklists/plan-review.md). All 33 functional requirements, 10 measurable outcomes, and C01–C14 have owners and verification paths. The highest-risk seam is session compatibility; it must be proven before UI polish. Confirmed logout and unknown-server-work limitations are explicit rather than collapsed into one boolean.

Planning validation checks links, identifiers, no unresolved markers, script syntax, setup idempotency, and context-update scope. Runtime tests, production builds, image/native loading, accessibility checks, public publication, and target benchmarks are not executed in the planning phase. Missing mandatory evidence still blocks a production-readiness claim.
