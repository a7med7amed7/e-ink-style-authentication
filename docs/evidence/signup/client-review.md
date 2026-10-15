# Phase 3 client lane review

Scope: `apps/web/src/api/auth-api.ts`, `apps/web/src/auth/auth-controller.ts`, `apps/web/src/auth/auth-context.tsx`, `apps/web/src/auth/protected-route.tsx` and their Phase 3 tests. Review basis: `spec.md`, `plan.md`, `tasks.md`, `implementation-contract.md`, and `contracts/client-auth.md`. Verification evidence was supplied by the completed K065 run: API integration 14/14 and web unit 30/30; I did not duplicate the test run.

## Strengths

- The transport uses relative `/api/auth/*` URLs, same-origin credentials, JSON/AJAX headers, no-store reads, validates user/error response schemas, preserves 401/network/malformed distinctions, binds the default native `fetch` to `globalThis`, and has no POST retry path.
- Signup acquires its mutation slot synchronously, advances generation before dispatch, hides prior identity, rejects competing signup and active revalidation, then reconciles through `/me`. It confirms a successful POST only for the intended email and matching returned user ID; uncertain transport plus matching identity stays labeled uncertain. Tests cover duplicate calls, stale success/401/error reads, mismatch, anonymous and malformed reconciliation, and password absence from snapshots.
- The React bridge uses `useSyncExternalStore`; its bootstrap effect performs only a safe GET. `ProtectedRoute` gates content on authenticated status, user presence, current verified generation, and route trust. Tests cover unknown/authenticating/stale/untrusted states and anonymous redirects.

## Findings and resolution

An early version of `AuthController.publish()` froze the snapshot and `submissionErrors` map, but not nested field-error arrays. The client owner now copies and freezes each array, and K059 passes 12/12 with a regression test proving the snapshot array is detached from its mutable source.

The compiled Chromium smoke then exposed a runtime transport issue that unit fakes did not: the saved native `fetch` was called with the `FetchAuthApi` instance as its receiver. Chromium rejected the call with `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation` before any request was dispatched. The owner bound only the default fetch implementation to `globalThis`, added a receiver regression, and K057 passes 6/6. The final compiled browser smoke passed signup, `/me` reconciliation, protected welcome navigation, and reload persistence after that fix.

## Verdict

No unresolved Critical, Important, or Minor issue remains in the reviewed Phase 3 client lane. Verification after the fixes included K057 6/6, K059 12/12, client-owned lint/typecheck/build, and the focused compiled Chromium smoke. The full K065 web unit command was previously 30/30 and has not been rerun after these narrow follow-ups. This review does not assess later signin/logout serialization, focus/navigation revalidation, the full browser E2E suite, or final responsive styling.
