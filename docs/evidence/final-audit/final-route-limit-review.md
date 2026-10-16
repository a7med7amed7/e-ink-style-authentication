# Final route-limit source review

**Verdict:** T133 source/spec review passes. No defect found in the scoped API guard or integration-test change. The separate protected-route recovery gap below is a follow-up worth fixing before the final verification pass; it is outside T133's two-file scope.

## T133 — canonical matched-route throttling

The task contract is T133/K133 in `specs/001-user-auth/tasks.md`, covering FR-017, FR-018, V09, and V17. `RateLimitGuard` now builds the key from Express's matched `baseUrl` plus `route.path` when available, instead of preferring raw `originalUrl`; the resolver strips query text and trailing slashes, lowercases the path, and uppercases the method before looking up the unchanged configured limits. Unmatched-request fallback still resolves from request path/URL. Therefore a case-insensitive matched auth route receives its route policy instead of the 120/minute default.

The new real-HTTP integration test exercises the actual boundary paths: sixth signup `/API/AUTH/SIGNUP/?source=case`, eleventh signin `/API/AUTH/SIGNIN?source=case`, and thirty-first logout `/API/AUTH/LOGOUT/?source=case`; the existing 121st `/me` request now also uses an uppercase, trailing-slash, query-string alias. It asserts 429 and a positive numeric `Retry-After` for the auth limits. Signup remains at five hashes and five users; signin remains at ten dummy verifications, showing the rejected requests did not perform password work. The existing limit values and fixture isolation are unchanged.

**Owner-reported verification (not rerun by this reviewer):** Before the fix, the matched case variants produced signup `201` with six hashes/six users, signin `401` with eleven dummy verifications, and logout `401`. After the fix, K133's real-Mongo security integration passed; the focused regression passed 1/1 with zero skips; the rate-limit unit file passed 3/3; `npm run test:unit` passed 231/231 (54 shared, 105 web, 69 API, 3 tooling), and `npm run test:integration` passed 35/35, with zero skips/failures. The exact K133 command is recorded in `specs/001-user-auth/tasks.md`; I did not execute it.

## Separate finding — protected route has no retry after a settled identity-read failure

**Severity:** Important recovery gap; adjacent to, but broader than, T133.

`AuthController.revalidate()` catches a non-401 `/me` failure and publishes `unknown`/untrusted state while leaving `message` unset when the initial snapshot had none (`apps/web/src/auth/auth-controller.ts:99–107`). The auth provider's bootstrap and the protected-route navigation loader both call this method. `ProtectedRoute` only renders “Check session” when `snapshot.message !== undefined` (`apps/web/src/auth/protected-route.tsx:20–26`); otherwise it continues to announce “Checking your session…” after the read has settled, with no recovery action. The protected-route tests cover the unknown state only for hiding private content and cover the retry button only when an uncertain logout has already supplied a message (`apps/web/test/protected-route.test.tsx:55–63, 84–104`).

This does not expose protected content: the state remains unknown. FR-023/C06 explicitly requires a recheck after a mutation's failed confirmation; the identified case is a failed bootstrap/navigation read without a pending mutation, so it is adjacent rather than an unambiguous literal violation of that sentence. It is still a concrete recovery defect: transient 503/network failure can strand a visitor on the protected-route fallback without a visible way to retry. A bounded fix is to provide safe fallback feedback on a current failed read only when no operation-specific message already exists, and add a real-controller/ProtectedRoute regression for settled bootstrap/navigation failures and retry. Keep older-mutation uncertainty copy and the existing generation/read guards intact.

## Evidence boundaries and documentation notes

The API results above are implementer-reported; this review inspected the changed source/test and did not run tests. Historical Phase 8 progress notes that say T112 is outstanding are stale records, not the current verification status: the current `docs/evidence/reproducibility.md` and `AI.md` record the successful refreshed clean-source run. `docs/evidence/delivery/phase8-docs.md` still contains earlier pending-status lines and should be read as a lane-history snapshot or refreshed separately. T101 actual Orca field/error speech, T116 public GitHub publication, deployment-target performance, and non-Linux/amd64 execution remain unverified/outstanding.
