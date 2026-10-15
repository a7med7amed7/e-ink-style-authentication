# Binding Implementation Contract: Secure User Authentication

**Created**: 2026-10-15
**Feature**: [Secure User Authentication](spec.md)
**Authority**: The user's Final Security & Reliability Contract, sections 1–14, supersedes the original assessment where they conflict. This document retains those explicit implementation constraints alongside the user-facing specification. It is a requirements document, not an implementation report.

Section C01 corresponds to source section 1, through C14/source section 14. All mandatory constraints apply during planning, implementation, and final review. Defaults explicitly identified in spec.md fill unspecified details only. None of the evidence below has been executed at the specification stage.

## C01 — Assessment and endpoint boundary

- Use React and TypeScript for the frontend, NestJS for the backend, MongoDB for persistence, and Mongoose for application persistence. Use the modern e-ink/Kindle aesthetic.
- Implement signup, signin, the welcome page, at least one protected endpoint, and the deliberately included logout enhancement. Deliver README.md, AI.md, and public GitHub source code.
- Frontend guards protect the user experience; server session checks enforce authorization.

| Endpoint | Authentication | Other mandatory protection / outcome |
| --- | --- | --- |
| `POST /api/auth/signup` | Public | Validation, CSRF/origin checks, throttling; create account and establish persisted session on success |
| `POST /api/auth/signin` | Public | Validation, CSRF/origin checks, throttling; establish persisted session on success |
| `GET /api/auth/me` | Valid session required | Protected identity; invalid/absent/expired session returns 401 |
| `POST /api/auth/logout` | Valid session required | CSRF/origin checks and throttling; successful destruction returns 204; already unauthenticated may return 401 |

The welcome page displays exactly "Welcome to the application.". The original "all endpoints protected" wording does not make signup/signin require a prior authenticated session.

## C02 — Deployment and configuration

- Target exactly one NestJS server instance, with MongoDB running separately. Initial backend target: 1 vCPU and 512 MiB RAM.
- Production requires HTTPS, exactly one public origin for React and `/api`, a TLS-terminating reverse proxy, and no separately public API server.
- Set `APP_ORIGIN` explicitly. Do not use broad credentialed CORS. Trust only verified reverse-proxy headers, with the proxy hop/address assumptions documented and tested. An arbitrary client's forwarding headers must not establish its client IP or transport security.
- Validate required secrets and configuration at startup. Missing/invalid required configuration must prevent insecure startup rather than enable weak defaults.
- Development uses localhost, an explicitly configured development origin, Vite's `/api` proxy, and development-safe cookies. Do not disable CSRF protection to make development requests succeed.
- Do not introduce Redis, Kubernetes, or distributed infrastructure.

## C03 — Sessions, expiry, and storage failure

Use `express-session` with `connect-mongo`, without an in-memory fallback.

| Setting | Required value |
| --- | --- |
| `resave` | `false` |
| `saveUninitialized` | `false` |
| `rolling` | `true` |
| `cookie.httpOnly` | `true` |
| `cookie.sameSite` | `"strict"` |
| `cookie.secure` | `true` in production |
| `cookie.path` | `"/"` |
| `cookie.domain` | Omitted |
| `cookie.maxAge` | 30 minutes as the idle policy; effective lifetime cannot exceed the remaining absolute lifetime |

- Use a `__Host-`-prefixed session cookie under HTTPS, with Secure and Path=/ and no Domain. Use a separate development cookie name when necessary.
- Idle timeout is 30 minutes; absolute timeout is 8 hours from authentication. Enforce both during backend authentication, not through eventual MongoDB cleanup alone.
- Renew idle expiration only for an active valid session. Cookie rolling and store refresh must never extend absolute authentication lifetime. Session-store expiration must match the earlier applicable deadline. Normal requests must not reset the authentication timestamp.
- Expired sessions return 401 and cannot be reused even if their database records remain. A persistent valid cookie survives browser restart until its expiration; no Remember Me feature is required.
- Permit separate device sessions. Browser tabs share the cookie. Logging out one session must not terminate independent sessions.
- Regenerate the session ID after successful authentication. Persist the session before responding with authenticated success. Retain only minimal user/session metadata, never password/hash data in the session.
- Logout destroys the current presented server-side session, clears the cookie using matching applicable attributes, and returns 204 only when successful. Already-unauthenticated requests may return 401 and must not result in authentication.
- Read/save/destroy storage failures fail closed. Recognized session-store unavailability returns 503; do not silently authenticate or report logout success when invalidation fails. Do not fall back to an in-memory store.
- If user insertion succeeds and session save fails, keep the account, do not return authenticated success, and allow normal signin recovery. Document the partial failure.

## C04 — CSRF, origins, and request shape

Apply to every state-changing endpoint, explicitly including signup and signin:

- Compare `Origin` exactly against the configured trusted `APP_ORIGIN`.
- When Origin is absent, parse and validate the trusted Referer origin. Reject an untrusted, null, malformed, or otherwise unverifiable origin. An explicitly null/untrusted Origin does not become acceptable via Referer fallback.
- Reject requests missing both Origin and a verifiable trusted Referer unless another verified CSRF mechanism is in place. No alternative mechanism is assumed for this assessment.
- Require `application/json` where a body is expected, and require the custom AJAX header `X-Requested-With: XMLHttpRequest` with validation of its value.
- Do not expose permissive credentialed CORS. `SameSite=Strict` is defense in depth, not the complete CSRF mechanism.
- Keep GET endpoints free of business-state mutation; normal session idle renewal follows C03.
- Verify login CSRF rejection. Document HTTPS, origin, and proxy assumptions.

## C05 — Credentials, hashing, errors, and resource budget

### Inputs

| Input | Required behavior |
| --- | --- |
| Email | Required; trim; consistently lowercase; maximum 254 characters; syntax validation; no provider-specific Gmail rules; real unique MongoDB index. Count Unicode code points after normalization, as the explicit counting default in spec.md. |
| Name | Required; trim; minimum 3, maximum 80 characters. Count Unicode code points after trimming, as the explicit counting default in spec.md. |
| Signup password | NFC before validation/hash; 8–128 Unicode code points; at least one letter, one decimal digit, and one punctuation/symbol; reject forbidden categories below |
| Signin password | Required; NFC before verification and code-point length check; maximum 128 code points; no signup minimum/composition revalidation; no trimming |

Password category definitions:

- Letter: `\p{L}`.
- Number: Unicode decimal digit `\p{Nd}`.
- Special: punctuation or symbol `[\p{P}\p{S}]`.
- Reject control characters `\p{Cc}`, formatting controls `\p{Cf}`, lone surrogates `\p{Cs}`, line separators `\p{Zl}`, and paragraph separators `\p{Zp}` at signup.
- Spaces are permitted but do not satisfy the special-character rule.
- Apply only NFC; do not trim, lowercase, or otherwise modify passwords. Count Unicode code points after NFC rather than UTF-16 units or bytes.
- Signup rejection of formatting characters intentionally excludes sequences containing zero-width joiners; do not promise support for every emoji sequence.
- Share password canonicalization/validation implementation between frontend and backend. Backend validation remains authoritative. Signin must not reject an existing password merely for failing signup composition rules.
- Test the examples below and boundaries on documented browser and Node runtimes. Record Unicode-version compatibility limits; runtime category tables may differ for newly assigned characters.

| Required example | Expected result |
| --- | --- |
| `Abcdef1!` | Valid signup password |
| `Abcdef1 ` (one trailing space) | Invalid: no punctuation or symbol |
| `Abcdef١!` | Valid: Arabic-Indic decimal digit |
| `Abcdef1😀` | Valid: emoji symbol, counted as one code point |
| `Abcdef1` | Invalid: no special character |
| Password containing a newline | Invalid signup password |
| Password containing U+200D | Invalid signup password |
| Composed/decomposed canonical equivalents | Same NFC output and equivalent authentication |
| Signin input failing signup composition | Required/max-length/canonicalization checks only, then password verification |

Boundary verification includes post-NFC lengths below/at 8 and at/above 128, supplementary-plane characters, forbidden categories, preserved whitespace, and empty signin input. Explicit source password rules take precedence over generic validation-library defaults.

### Response semantics

| Condition | Status |
| --- | --- |
| Invalid signin credentials | Generic 401 |
| Duplicate signup, including MongoDB duplicate-key code 11000 | 409 |
| Invalid request/credential input | 400 |
| Unauthenticated/expired protected request | 401 |
| Untrusted/unverifiable origin | 403 |
| Rate limited | 429 |
| Recognized session-store unavailability | 503 |
| Hash-capacity saturation or queue-wait exhaustion | 503 with retry guidance |
| Successful logout destruction | 204 |

Duplicate signup deliberately exposes registration status through 409. Document that usability/privacy tradeoff; generic signin errors do not eliminate signup enumeration.

### Password hashing and admission control

- Use Argon2id, initially `memoryCost: 19456` KiB (19 MiB), `timeCost: 2`, `parallelism: 1`.
- Verify stored hashes using `argon2.verify()`; stored hashes encode their parameters.
- Signup hashing and signin verification share one small bounded semaphore/queue: at most 2 active operations, at most 4 waiting operations, initial maximum queue wait 1 second.
- Run rate limiting before expensive password work. Saturation and queue-wait exhaustion return 503 with retry guidance. No external queue infrastructure.
- If unknown accounts use dummy verification, use a precomputed dummy hash through the same capacity boundary. Never generate a dummy hash on each request.
- Benchmark the documented target runtime at 1 and 2 active operations, capturing latency and process memory. Verify both saturation rejection and queue-wait bounds.
- Initial objective: p95 hashing latency below 500 ms with 2 active operations. This is a measurement target, not an assumed result or a universal capacity claim.
- Two active operations require about 38 MiB of Argon2 working memory, excluding native overhead and all other allocations. This arithmetic is not measured process memory.
- A development-machine result is not proof for the target 1-vCPU/512-MiB backend. If that target cannot be exercised, label its performance unverified. If measurements miss the objective, report the observations and revise documented capacity/resources before claiming the objective.

## C06 — Concurrency and uncertainty

### Registration

- A real unique MongoDB index on normalized email enforces uniqueness. Handle duplicate-key error code 11000 as 409.
- Application-level check-then-insert is not the guarantee. Do not introduce distributed locks or transactions for single-document signup.

### Frontend state and ordering

| State | Required meaning |
| --- | --- |
| Unauthenticated | Verified anonymous state with no conflicting tracked mutation |
| Authenticating | An authentication mutation is in progress |
| Authenticated | Server identity verified with no conflicting unresolved tracked mutation |
| Unknown | Network/confirmation outcome is ambiguous and authentication cannot be confirmed |

- Track request/authentication generation and ignore stale `/me` responses after a newer transition.
- Block duplicate submissions and serialize session-mutating operations per supported tab. Signin and logout must not overlap within that scope. If logout is requested during pending signin, wait for signin to settle before running logout.
- Keep the original HTTP mutation tracked while unresolved. A UI threshold does not cancel it, prove failure, or release serialization. Show non-blocking "Still verifying" after that threshold; the initial specification default is 5 seconds.
- When a mutation settles, reconcile through `/me`. Failed confirmation retains unknown state and offers an explicit session check.
- `/me` 401 during unresolved signin describes only the session when that check ran; it does not prove signin failed.
- Ignoring a promise or cancelling transport cannot undo cookies already set by the browser. Network rejection does not prove the server stopped processing.
- Without a server operation-status protocol, an unacknowledged mutation cannot always be proven finished. Document this limitation; do not build that protocol for this assessment.
- Prevent protected-content flashes. Session-store errors are errors, never successful authentication or logout.

### Evidence for user-facing outcomes

| Outcome | Evidence required |
| --- | --- |
| Signin success | Successful signin response and/or `/me` confirms intended user; no conflicting unresolved tracked mutation |
| Invalid credentials | Explicit signin 401 |
| Signed-out browser state | `/me` confirms anonymity; no conflicting tracked mutation; uncertain older server work remains disclosed |
| Confirmed logout/invalidation | Server acknowledges destruction of presented session, followed by anonymous `/me` |
| Expiration | Authoritative `/me` 401 without conflicting tracked mutation |
| Network timeout | Unknown until reconciliation; never verified success by inference |

Anonymous `/me` alone does not prove the previous session was destroyed. Do not report confirmed invalidation when destruction failed or was unacknowledged.

### Cross-tab boundary

- Tabs share browser cookies. Revalidate `/me` on focus and relevant navigation.
- Web Locks, BroadcastChannel coordination, and atomic cross-tab ordering are deferred. No global ordering promise applies to other tabs or arbitrary direct API clients.
- Backend authorization remains authoritative even if a background tab temporarily displays stale content.

## C07 — Rate limiting and trusted client IP

Use `@nestjs/throttler` before expensive Argon2 work.

| Endpoint | Initial per-IP limit |
| --- | --- |
| Signup | 5 requests / 15 minutes |
| Signin | 10 requests / minute |
| `/me` | 120 requests / minute |
| Logout | 30 requests / minute |

- Return 429 with usable retry guidance where possible.
- Validate documented proxy/client-IP behavior against the target. Do not trust arbitrary forwarding headers.
- Single-instance in-memory limiter storage is acceptable. Document that multiple instances require shared limit storage or equivalent gateway enforcement.
- Account-aware throttling is a possible future enhancement, not mandatory. Do not add Redis solely for rate limiting.

## C08 — Required verification evidence

Use realistic HTTP requests and a real MongoDB integration path. Prefer deterministic clock/configuration for time-sensitive checks. Isolate limiter state between tests. Prioritize critical integration behavior before new optional infrastructure.

| Evidence ID | Required verification |
| --- | --- |
| V01 | Valid signup creates an account and establishes verified authenticated access |
| V02 | Invalid signup fails authoritative validation without account creation |
| V03 | Concurrent normalized same-email registration creates exactly one user; other otherwise-valid competing registrations return 409 |
| V04 | Valid signin succeeds and invalid credentials receive generic 401 |
| V05 | Protected endpoint rejects anonymous requests; authenticated session survives refresh |
| V06 | Backend enforces idle and absolute expiry independently of record cleanup, cookie rolling, or store refresh |
| V07 | Logout destroys the server session; captured old-cookie replay fails; independent session survives |
| V08 | Untrusted-origin signin/login CSRF is rejected; signup/logout origin enforcement and required request shape are covered |
| V09 | Authentication throttling returns 429; rejected throttled requests perform no expensive password work; limiter state is isolated |
| V10 | Delayed `/me` cannot restore stale client authentication state |
| V11 | Typecheck, lint, and production build pass |
| V12 | Required Unicode examples, NFC equivalence through authentication, code-point boundaries, and signin-specific validation pass across supported Node/browser runtimes |
| V13 | Shared hash-work active/queue limits, 1-second wait exhaustion, and saturation rejection are verified |
| V14 | Stale identity and ambiguous network outcomes never produce false verified success; same-tab mutation serialization and queued logout behavior are verified |
| V15 | Valid persistent session survives documented refresh/browser-restart behavior until expiry |
| V16 | Session regeneration, persistence-before-success, and partial-signup-save failure/recovery behavior are verified |
| V17 | Startup configuration, production/development cookie attributes, exact origin handling, and trusted proxy/IP behavior are verified |
| V18 | Forms meet keyboard, accessible labels/errors/announcements, focus, contrast, responsive layout, touch-target, and reduced-motion requirements |
| V19 | Actual one-/two-operation latency and memory measurements, saturation/wait observations, and target verification status are recorded |
| V20 | Final review inspects all mandatory sections; reproducible README, truthful AI.md, and public source location are present |

V01–V14 preserve the original required critical integration list and additional mandatory targeted checks. V15–V20 make other mandatory behavioral/delivery gates explicit rather than silently leaving them unverified.

Cross-tab browser coordination E2E, comprehensive session-store outage simulation, and advanced concurrency/fault injection are optional bonuses. Tests of fail-closed handling and explicit partial failures remain necessary for their mandatory behavior; the optional bonus does not waive those requirements. Do not imply optional suites ran if deferred.

## C09 — Accessibility and interface

- Use semantic forms/buttons, explicit accessible labels, `aria-invalid` on invalid controls, and `aria-describedby` linking controls to errors.
- Announce submission errors appropriately; preserve visible keyboard focus and logical tab order.
- Password visibility must be keyboard-operable.
- Maintain sufficient text/control contrast, mobile-friendly touch targets, and responsive layouts. Respect `prefers-reduced-motion`.
- Animations must not block form use. Preserve modern e-ink styling while prioritizing usability.
- Review defaults from spec.md: 320-CSS-pixel minimum viewport; AA contrast thresholds; 44-by-44-CSS-pixel primary touch targets. No broad accessibility certification is implied.

## C10 — Delivery gates, order, and deferred work

Mandatory submission gates include the complete authentication flow; required stack; exact validation; Argon2id and bounded hash work; unique email index; session regeneration/persistence/expiry/invalidation; same-origin deployment/secure cookies/CSRF; throttling and verified proxy IP behavior; registration concurrency and stale/unknown client-state correctness; responsive accessible forms; critical integration tests; lint/typecheck/production build; README/AI.md/reproducible setup/public source; and honest benchmarks/target status.

Missing a mandatory security/correctness gate means the chosen production-readiness claim is not met. Critical tests are mandatory internal delivery gates even though testing was a bonus in the original brief.

Execution order:

1. Verify signup, signin, unauthorized access, expiration, logout, validation, CSRF rejection, throttling, and concurrent duplicate registration.
2. Complete responsive design, accessibility, documentation, and reproducible-build gates after the critical path passes.
3. Under time pressure, reduce optional polish rather than silently dropping security gates. Never represent ambiguity as verified success.

Defer Web Locks/sophisticated cross-tab coordination, account-aware throttling/advanced lockout, Redis/distributed throttling, generic Idempotency-Key infrastructure, distributed locks, multi-region sessions, a complete identity platform, advanced fault injection, scale load testing, full monitoring infrastructure, deployment automation, extra animations, API documentation, and nonessential CI improvements when constrained.

Basic logging, error handling, testing, CI, and API documentation were bonus ideas in the original brief. Required error handling and critical tests are promoted to mandatory by the final contract; optional logging/CI/API-documentation enhancements must not displace mandatory work.

## C11 — Bounded production-readiness claim

Production-ready means suitable for the documented single-instance, same-origin HTTPS target, supported by evidence of working critical flow, secure sessions/cookies, authoritative input validation, appropriate errors, concurrency-safe registration, protected API access, throttling, targeted tests, passing lint/typecheck/build, and reproducible setup/configuration.

Disclose unimplemented backup strategy, monitoring, infrastructure redundancy, email verification, and account recovery. Do not claim readiness for arbitrary traffic or deployment architectures.

## C12 — Final implementation review

- Inspect the actual implementation against every section C01–C14 and the user-facing requirements before completion claims.
- Distinguish implemented-and-tested, implemented-but-not-independently-tested, and deferred-and-documented behavior, citing evidence and limitations.
- Unverified/deferred mandatory security or correctness work blocks the selected readiness claim. Documenting deferral is not satisfying the gate.
- Do not add complexity for an impressive technology checklist. Aim for reliable, focused behavior and defensible decisions.

## C13 — Retries and partial failures

- Normalize email consistently and rely on database uniqueness. Duplicate 409 responses do not make signup fully HTTP-idempotent.
- Block duplicate UI submissions and never automatically retry signup/signin POST requests.
- A lost signup response can leave an account. Retry must not duplicate it; normal signin is the recovery path.
- Do not cache/replay credentials or cookies for application retries.
- `/me` is safe to repeat, with no business-state changes; ordinary idle renewal follows C03.
- Logout targets only the presented session, never an arbitrary client-supplied session ID. Repeated logout must not restore authentication; 401 after invalidation is acceptable.
- No generic Idempotency-Key infrastructure is required.

## C14 — Documentation and review evidence

README.md must explain:

- Setup/prerequisites, environment configuration, startup validation, and reproducible verification commands.
- Same-origin HTTPS deployment, explicit APP_ORIGIN, trusted proxy/forwarding assumptions, and target IP-validation evidence.
- Duplicate-registration prevention, partial-signup failure, lost-response recovery, and retry behavior.
- Session lifecycle and cookie/idle/absolute policy, including the distinction between an anonymous browser observation and confirmed server invalidation.
- Per-IP throttling, hash-work capacity, and actual benchmark observations including target-runtime verification status.
- Single-instance scope, why Redis is omitted, and how distributed deployment changes session/rate-limit/admission guarantees.
- NFC canonicalization, exact Unicode composition/code-point rules, supported browser/Node versions, and Unicode-version limits.
- Unknown authentication outcomes, original-request tracking, UI waiting threshold, reconciliation, unacknowledged server-work limits, and deferred cross-tab ordering.
- Deferred operational concerns: backups, monitoring, redundancy, email verification, and account recovery.

AI.md must describe actual AI-assisted work, effective prompts/approaches, refinements, corrections/rework, engineering choices, and verification results. Do not fabricate suggestions rejected, work performed, benchmarks, or tests. Update it as implementation progresses.

Final review must inspect every mandatory contract and distinguish implemented-and-tested, implemented-but-unverified, and deferred-and-documented behavior. At specification time, all application behavior and runtime performance remain unimplemented/unverified; validating documents is not executing application tests.

### User-supplied references

These references were supplied as verified during the user's requirements review; no new conformity claim is made here:

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): selected Argon2id profile and target-system tuning.
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): NFC and Unicode code-point choices. These choices do not imply full NIST conformity; the assessment's eight-character minimum and composition rules differ from its single-factor password requirements.
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): server-side expiry and logout invalidation.

### Specification template provenance

The repository had no `.specify` scaffold or installed `specify` CLI. The minimal local `.specify/templates/spec-template.md` follows the section order of the [standard Spec Kit specification template](https://raw.githubusercontent.com/github/spec-kit/main/templates/spec-template.md), inspected on 2026-10-15. No preset override, constitution, or extension hook was available to apply. Only specification support files are initialized; full planning/execution tooling is not installed by this command.
