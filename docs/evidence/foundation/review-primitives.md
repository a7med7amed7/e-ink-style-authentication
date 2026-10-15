# Phase 2 shared and session primitive review

## Spec compliance verdict

Shared password behavior and schemas comply with the reviewed contracts: passwords are NFC-normalized only, counted by Unicode code point, checked against L/Nd/P-or-S signup predicates, and reject Cc/Cf/Cs/Zl/Zp; signin requires a nonempty value and enforces only the 128-code-point maximum. The fixtures explicitly exercise post-NFC lengths 7/8/128/129, composed/decomposed equivalence, a preserved combining mark, paired/lone surrogates, all forbidden categories, and signin-only rules. Email/name canonicalization, code-point bounds, strict fields, and safe static validation messages are covered. See `packages/auth-contract/src/password.ts:1-50`, `test/unicode-cases.ts:1-30`, `test/password.test.ts:17-71`, and `test/schemas.test.ts:18-120`.

Session deadline arithmetic, equality expiry, malformed/future timestamp rejection, idle renewal without changing `authenticatedAt`, cookie flags/clear behavior, effective deadline pinning, and nonenumerable no-op `touch` match the reviewed lifecycle requirements. The store delegates get/set/destroy, exposes no touch, maps recognized Mongo outages, preserves unexpected errors, suppresses unhandled underlying `error` events, and uses a weak receipt only after successful persistence. Tests isolate same-object duplicate writes, failed writes, changed snapshot, changed SID, and a distinct object with the same snapshot. See `apps/api/src/session/{policy,cookie,store}.ts` and matching tests.

One session metadata gap remains: `SessionPolicy.#validMetadata` accepts any nonblank string for `userId` (`apps/api/src/session/policy.ts:82-97`), while the data model requires an Account ObjectId string (`specs/001-user-auth/data-model.md:35`) and the lifecycle contract says malformed metadata must be rejected (`contracts/session-lifecycle.md:11`). The current tests use `u1` as a valid ID and reject only an empty value (`apps/api/test/session-policy.test.ts:8-16,52-69`). A malformed stored ID can pass this policy and fail later during a Mongo lookup. Validate the canonical ObjectId representation here, or ensure the protected route boundary rejects it as unauthenticated before any cast/lookup.

A separate foundation review identified one config compliance gap that the config lane is addressing: production currently accepts broad nonzero trusted-proxy prefixes such as `/1` (`apps/api/src/config.ts:175-187`), while T018 explicitly says broad proxy trust must reject. The tests currently cover `/0` but not broad nonzero prefixes (`apps/api/test/config.test.ts:137-153`).

## Quality verdict

Coverage is behavior-oriented and directly matches the stated boundary cases. The shared test TypeScript project includes both source and tests (`packages/auth-contract/tsconfig.test.json`); its strict typecheck passed. Existing evidence records full shared tests 53/53, package lint exit 0, API production typecheck exit 0, focused policy tests 5/5, cookie tests 6/6, and store tests 7/7. See `/tmp/easygen-phase2-shared.md` and `/tmp/easygen-phase2-session-primitives.md`; no broad suites were rerun for this read-only review.

The shared schemas, session policy, cookie helper, and store adapter remain within the per-file 100-line implementation target. `apps/api/src/config.ts` is 245 lines and exceeds the same target; root owns splitting/housekeeping after its proxy-policy fix. No changes were made for this review.

## Follow-up status

The trusted-proxy prefix finding is now fixed in the config lane: K021 red reproduced acceptance of `10.0.0.0/8`; the updated focused suite passes 8/8 with the requested IPv4 `/24` and IPv6 `/64` minimums and individual addresses covered. Root assigned the session `userId` ObjectId validation finding to `workspace_setup`; this review lane made no changes to session primitives.

The session metadata issue has since been corrected by `workspace_setup`: `userId` now requires a 24-hex ObjectId representation; K028 red reproduced acceptance of `u1`, and the follow-up reports K025 6/6, K028 2/2, K030 7/7, and targeted lint exit 0 (`/tmp/easygen-session-metadata-validation.md`).
