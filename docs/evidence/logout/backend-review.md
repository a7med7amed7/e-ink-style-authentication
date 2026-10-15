# Phase 5 backend review: acknowledged logout destruction

Reviewed the T074/T076/T077 changes in `apps/api/test/session.integration.test.ts`, `apps/api/src/session/session.service.ts`, and `apps/api/src/auth/auth.controller.ts`, plus session middleware, guard, rate-limit defaults, and the relevant contracts. I did not rerun the real-Mongo suite. `/tmp/easygen-phase5-backend.md` records exact K077 output (3/3), K076 build, targeted lint, API typecheck, and diff check, all exit 0.

## Spec verdict

Pass for the scoped logout requirements. The service validates the presented session without renewal, awaits its `destroy` callback, maps recognized store outages to `SESSION_STORE_UNAVAILABLE`, and clears the configured cookie only after acknowledged deletion. The controller then returns empty 204 and sets `no-store`; failures use the common error writer, which also sets `no-store`. No body, query parameter, or arbitrary session identifier is accepted.

The route has no `@Public()` metadata, so the global SessionGuard protects it. The registered default rate guard runs before SessionGuard and has an exact `POST /api/auth/logout` limit of 30 per 60 seconds; `rate-limit.test.ts` asserts that policy. Origin middleware is installed before session middleware, preserving the mutation Origin/AJAX checks.

Real-Mongo tests cover waiting for acknowledged deletion before response completion, an empty 204 and matching cookie clear, captured-cookie `/me` replay and repeat logout returning 401, one-device destruction while a second device remains valid, and a recognized destroy outage returning 503 with no cookie clear while the session remains usable.

## Quality verdict

No implementation defect found. The delayed-destroy wrapper verifies response ordering against an actual Mongo delete. The outage test checks a single destroy call, no `Set-Cookie`, and successful use of the surviving cookie. Express 1.19's `Session.destroy` deletes `req.session` before delegating to the store; with the configured `unset: "keep"`, its response-end handler skips persistence when no request session remains. This supports the no-response-end-write behavior on a failed destroy as well as the successful path.

No code changes were made. One optional hardening improvement would instrument the underlying `set` count in the failed-destroy integration case; current source/dependency behavior and the retained-session assertions support the required result, but the test does not directly assert zero `set` calls on that path.
