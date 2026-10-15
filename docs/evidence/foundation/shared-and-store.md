# Phase 2 shared and session-store lane evidence

Runtime: Node v24.22.0 and npm 11.19.1 from `/tmp/easygen-node-v24.22.0/bin`.

## Owned files

- `packages/auth-contract/src/password.ts`, `test/password.test.ts`, `test/unicode-cases.ts`
- `packages/auth-contract/src/schemas.ts`, `src/types.ts`, `src/index.ts`, `test/schemas.test.ts`
- `packages/auth-contract/tsconfig.test.json`, `package.json` (strict source+test typecheck)
- `apps/api/src/session/store.ts`, `apps/api/test/session-store.test.ts`

## Task checks

- **K015 RED:** With a temporary exported password-helper scaffold, the exact focused Vitest command collected 19 tests; 16 named behavior assertions failed and 3 passed. Failures covered NFC/code-point boundaries, forbidden categories, astral counting, and signin empty input.
- **K016 GREEN:** The same exact command passed 19/19 after implementing NFC-only canonicalization, Unicode code-point counting, signup predicates, and signin-only required/maximum checks.
- **K017 RED:** Against temporary permissive schema stubs, the exact focused command ran 34 tests; 31 behavior assertions failed and 3 passed. Failures covered canonicalization, limits, strict request fields, public DTO shape, and error fields.
- **K020 GREEN:** The exact focused command passed 34/34 after implementing strict Zod schemas with static validation messages.
- **K023 GREEN:** `npm run build:shared` exited 0; inferred DTO types and validation entry points are exported from the package root.
- **K026 RED:** The exact focused API test command compiled successfully against a temporary behavior-incomplete adapter scaffold, then failed 4/7 behavioral tests for availability mapping, event handling, and duplicate/changed writes. After T029, a rerun had only the two intended receipt failures (5/7 pass).
- **K029 GREEN:** The exact focused API command with `session-store: delegation` passed 4/4, covering delegation, no `touch`, native connection error branding, unexpected error preservation, and safe underlying event relay.
- **K031 GREEN:** The exact focused API command with `session-store:` passed 7/7 after adding weak successful-write receipts.

## Additional checks

- Shared package strict typecheck (`npm run typecheck --workspace @easygen/auth-contract`) exited 0 using `tsconfig.test.json`, which includes both `src/**/*.ts` and `test/**/*.ts`.
- Full shared Vitest passed 53/53; shared ESLint exited 0.
- Focused ESLint for `apps/api/src/session/store.ts` and `apps/api/test/session-store.test.ts` exited 0.

The adapter classifies pinned MongoDB network, selection, timeout, closed-server/topology/client, and not-connected error classes as `SessionStoreUnavailableError` with a generic message and retained cause; other errors pass through for later sanitized handling. It delegates only `get`, `set`, and `destroy`. Successful `set` acknowledgements record `{ sid, SHA-256(JSON.stringify(session)) }` in a `WeakMap`; an identical subsequent write to the same object is completed synchronously, while failures, changed SID, changed snapshot, and a distinct object delegate.

The local pinned connect-mongo 6.0.0 source confirmed its default session serialization is `JSON.stringify`, and that `set` callbacks complete after `updateOne`. express-session 1.19.0 invokes `session.touch()` at response end and then may call `store.set` or `store.touch`; the adapter intentionally has no store `touch` method. The store tests use a controlled fake MongoStore for deterministic delegation/error/receipt behavior. They do not claim real-Mongo outage evidence or full session lifecycle behavior.

No task checkboxes were edited and no files were staged or committed. Root owns phase task bookkeeping and commits.
