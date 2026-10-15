# Phase 3 backend review

Scope: read-only review of the Phase 3 auth/session path through T056: account schema and startup index readiness, shared validation, signup and signin services/controllers, session establishment and renewal, `/me`, default-protected authorization, throttling, origin checks, and the real-Mongo integration assertions. Review basis: `specs/001-user-auth/spec.md`, `plan.md`, `tasks.md` T046–T056, `data-model.md`, `contracts/http-api.md`, and `contracts/session-lifecycle.md`.

## Spec verdict: PASS

The integrated path matches the reviewed contracts. Startup explicitly awaits the named unique email index before `buildApp` returns and the listener can accept traffic. Signup uses one authoritative insert and maps Mongo duplicate-key code 11000 to the typed 409; ordinary reads exclude `passwordHash`, while signin explicitly selects it and sends real and dummy verification through the per-app `HashWork` gate. Public responses are built from only `id`, canonical email, and name.

The global guard order places route throttling ahead of session authorization and password work. Signup/signin are the explicitly public routes; the session guard protects other routes by default. Origin, AJAX-header, and required JSON media checks precede session loading on POSTs. Route limits match the contract.

Signup and signin await ID regeneration, minimal metadata installation, pinned cookie expiry, and an acknowledged session save before returning success. Failures detach the request session and clear the configured cookie; failed saves do not trigger a response-end retry. `/me` validates the stored reference, loads only a public DTO, renews and persists activity before success, and checks the deadline again after save. Missing accounts are denied with cookie clearing and no activity renewal; recognized lookup outages return sanitized 503. Idle and absolute deadlines use injected wall time, equality is expired, and renewal preserves `authenticatedAt`.

## Quality verdict: PASS

The implementation keeps storage/security boundaries visible in small services and middleware, and the tests use real Mongo for uniqueness races, persisted session metadata, delayed/failed writes, renewal, missing-account detachment, and account-lookup outage mapping. The regression assertions specifically verify that missing-account `/me` does not change stored auth timestamps and that database lookup failures do not become successful identity responses.

No critical or important findings remain in this scope. `SessionService.destroy` is an explicit later logout task dependency and is not part of the T046–T056 route set.

## Verification evidence

Evidence was supplied by the completed backend lane; I did not rerun the broad suite during review.

- K054 protected-identity command — passed.
- K056 signin recovery selector — passed.
- `npm run test:integration` — exit 0, API integration 14/14 after the final regressions.
- `npm run lint` — exit 0.
- `npm run typecheck` — exit 0 for API, web, and shared contracts.
- The final lane report is `/tmp/easygen-phase3-backend.md`.
