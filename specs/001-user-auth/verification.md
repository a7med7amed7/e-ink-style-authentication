# Implementation Verification Map

**Planning status**: Every application result below is **pending implementation/execution**. This is an evidence plan, not a passing test report. Dependency/source research and specification checks do not prove runtime behavior.

## Required evidence owners

| ID | Planned suite / command owner | Required assertion |
| --- | --- | --- |
| V01 | `apps/api/test/auth.integration.test.ts`; built-app E2E | New valid user persists, regenerated session is saved, `/me` verifies intended user, exact welcome copy |
| V02 | Shared schema tests and auth integration | Invalid/missing/wrong/unknown fields fail server validation; no user/authenticated success |
| V03 | Auth integration with four concurrent requests | Case/whitespace variants under default rate allowance create one account; one success and three 409s; real unique index inspected |
| V04 | Auth integration | Correct signin succeeds; wrong password and absent account share generic 401; dummy work uses same gate |
| V05 | Auth integration and E2E | Anonymous `/me` rejects; authenticated refresh checks identity before content |
| V06 | Session policy/integration | At idle/absolute equality and beyond, captured cookies fail despite retained records; rolling never moves absolute deadline |
| V07 | Session integration | Await logout destroy, capture cookie before logout and replay afterward for 401; second independent device remains valid |
| V08 | Security integration | Signup/signin/logout reject missing/null/untrusted/malformed origin; absent Origin trusted Referer succeeds; explicit bad Origin cannot use fallback; AJAX/body-media checks |
| V09 | Security integration | Signup/signin exceed exact limits with 429/Retry-After; rejected request never invokes hash/verify; fresh limiter per fixture |
| V10 | `apps/web/test/auth-controller.test.ts` | Old `/me` success/401/error/finally never overrides newer generation or latest read |
| V11 | Root typecheck/lint/build and built-server smoke | Real commands exit zero; no transpiler-only claim of type safety; production assets/API start together |
| V12 | Shared password/schema tests and `tests/e2e/unicode.spec.ts` | All required Unicode examples, post-NFC boundaries, every forbidden category, preserved spaces, canonical-equivalent authentication, signin-specific rules in Node and three engines |
| V13 | `apps/api/test/hash-work.test.ts`; hash benchmark | Active ≤2, waiting ≤4, FIFO/1000-ms dequeue-time expiry, seventh admission rejects, timed-out jobs never run, release after exceptions |
| V14 | Client-controller tests/forms/E2E | Duplicate lock before rerender; logout queues behind original signin; 5-second message does not settle/abort; every ambiguous-result/receipt transition; focus/navigation gating |
| V15 | `tests/e2e/auth.spec.ts` persistent-browser scenario | Actual persistent cookie restored after browser restart; fresh `/me` verifies identity before deadline, no Remember Me flag |
| V16 | Auth/session integration with injected store callbacks | Regenerated ID differs; delayed save prevents early response; failed signup-session save leaves one account and permits later signin; zero delegated response-end writes |
| V17 | Security/session integration and production proxy smoke | Startup rejects unsafe config; exact cookie flags/names/domain omission; fixed cookie/document deadlines; trusted proxy/IP behavior including forged headers; API 404 remains JSON |
| V18 | `apps/web/test/forms.test.tsx`; built browser/manual accessibility review | Keyboard/password visibility/labels/errors/announcements/focus; 320px layout; contrast/touch targets; reduced motion; no animation blocking |
| V19 | `apps/api/src/benchmark-hash.ts`; recorded actual output | One/two-active post-warmup latency/RSS and queue outcomes; CPU/runtime/resources and target verification status; honest misses/unverified target |
| V20 | Documentation/final review and public URL inspection | README/AI content complete and factual; every FR/SC/C section classified with actual evidence; public GitHub source accessible without secrets |

## Functional requirement coverage

| Requirement | Concrete design owner | Evidence |
| --- | --- | --- |
| FR-001 | AuthController/AuthService and three frontend pages; HTTP contract | V01, V04, V05, V07 |
| FR-002 | Shared email schema; Mongoose unique index and code-11000 mapping | V02, V03 |
| FR-003 | Shared trimmed-name code-point validator | V02, V12 |
| FR-004 | Shared NFC/signup predicates and admitted Argon2 hash | V02, V12 |
| FR-005 | Separate signin schema and canonical verification | V04, V12 |
| FR-006 | Shared package exports and identical Node/browser fixtures | V12 |
| FR-007 | HTTP error envelope and duplicate-enumeration disclosure | V03, V04, V20 |
| FR-008 | Backend SessionGuard and pre-render client gate | V05, V10, V14 |
| FR-009 | SessionService regenerate/pin/save and minimal metadata | V16 |
| FR-010 | Session policy, fixed-cookie adapter, explicit renewal | V06, V15, V17 |
| FR-011 | Separate session records and presented-cookie logout | V07, V15 |
| FR-012 | Awaited destroy and operation-specific receipt + `/me` | V07, V14, V16 |
| FR-013 | Branded store errors, raw middleware mapping, detach-on-failure | V16, V17 |
| FR-014 | Auth insert then explicit session commit; signin recovery | V16 |
| FR-015 | Origin/header/media middleware; GET business-state boundary | V08, V17 |
| FR-016 | Validated config/private ingress/HTTPS and cookie policy | V17 |
| FR-017 | One default per-route throttler and isolated storage fixtures | V09, V17 |
| FR-018 | Shared bounded HashWork, monotonic FIFO deadlines | V13 |
| FR-019 | Stable client snapshot/status plus separate observations/receipts | V14 |
| FR-020 | Generation/latest-read checks for every completion path | V10 |
| FR-021 | Synchronous mutation slot and one coalesced queued logout | V14 |
| FR-022 | Independent 5-second message timer retaining original transport | V14 |
| FR-023 | Reconciliation and uncertain-operation policy | V14 |
| FR-024 | Intended-identity matching and logout receipt table | V14 |
| FR-025 | Focus/navigation revalidation with render trust invalidation | V14 |
| FR-026 | Fetch wrapper/controller retry policy; partial-failure docs | V14, V16, V20 |
| FR-027 | Semantic reusable fields, error links, keyboard/focus behavior | V18 |
| FR-028 | Plain CSS e-ink tokens, responsive/reduced-motion behavior | V18 |
| FR-029 | Shared error DTO and raw middleware/Nest error handlers | V02, V04, V08, V09, V13, V16, V17 |
| FR-030 | README/AI deliverables and public source | V20 |
| FR-031 | Required verification aggregate and final per-contract review | V01–V20 |
| FR-032 | Actual hash benchmark and target-status reporting | V19 |
| FR-033 | Deployment-bound readiness claim and deferred operations | V19, V20 |

## Success criterion coverage

| Outcome | Evidence |
| --- | --- |
| SC-001 | V01, V04–V07, V15 |
| SC-002 | V03 |
| SC-003 | V06, V07 |
| SC-004 | V12 |
| SC-005 | V10, V14 |
| SC-006 | V08, V09, V13 |
| SC-007 | V18 |
| SC-008 | V11, V20 |
| SC-009 | V19; target performance may honestly remain unverified |
| SC-010 | V20 plus every mandatory result classification |

## Final contract coverage

| Source section | Evidence / review focus |
| --- | --- |
| C01 | V01, V04, V05, V07, V11, V20; required stack/endpoints |
| C02 | V17, V19, V20; one origin/private proxy/target resources |
| C03 | V06, V07, V15–V17; commits, expiration, failures, independent sessions |
| C04 | V08, V17; login CSRF and exact request-origin policy |
| C05 | V02–V04, V12, V13, V19; canonical inputs, hash resource budget, errors |
| C06 | V03, V10, V14; uniqueness, stale/unknown state and scoped ordering |
| C07 | V09, V17; limits, Retry-After units and verified IP |
| C08 | V01–V20; actual required suites and honest optional-suite status |
| C09 | V18; semantic/keyboard/screen-reader/mobile/motion behavior |
| C10 | V11, V20; mandatory gates first, optional polish later |
| C11 | V01–V20; bounded readiness and operational disclosures |
| C12 | V20; inspect actual implementation rather than infer from tests alone |
| C13 | V07, V14, V16, V20; retry/partial-failure and presented-session scope |
| C14 | V19, V20; complete README, actual AI work/results, final evidence |

## Fixture rules and result recording

- Backend tests compile production/test sources, start the actual Nest HTTP pipeline, and connect to pinned real MongoDB with isolated names. Missing DB is a failing prerequisite. Limiter state and hash gate are new per app fixture; close timers/connections on teardown.
- Inject authorization wall time and hash-queue monotonic clock/timer boundaries. For retained-record expiration tests, advance the policy clock while retaining a Mongo record with a still-readable outer expiry and present the captured cookie directly; this proves backend checks independently of eventual TTL/browser cleanup.
- Real hashing tests use the selected native Argon2 configuration. Queue unit tests can control deferred jobs to measure admission deterministically, with benchmark/native integration verifying the real path separately.
- Test storage callbacks around a real Mongo-backed fixture to force recognized read/set/destroy errors without requiring a full infrastructure outage simulator. Comprehensive outage/advanced fault injection remains optional; fail-closed behavior is mandatory.
- Delayed response/body promises must remain unresolved while checking serialization and waiting-message behavior. A timer or abort is never used as completion evidence.
- Contrast and screen-reader announcements need actual inspection/execution; accessible-name assertions alone do not prove all accessibility criteria. Record the browser/assistive technology and manual observations.
- `docs/evidence/final-review.md` records requirement, implementation location, command/manual procedure, runtime/data conditions, result, and one of the three required status categories. At planning time none of those application statuses is earned.
- Report optional cross-tab coordination E2E, comprehensive outage simulation, advanced concurrency/fault injection, scale tests, and deployment automation as deferred if not run. No screenshots/benchmark values/test counts are invented.
- A mandatory security/correctness requirement left unverified or deferred blocks the chosen production-readiness claim even when documentation explains it. Target benchmark availability is handled according to C05: actual local observations plus explicit unverified target status are permitted; a target performance success claim still requires target evidence.
