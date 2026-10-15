# Data Model: Secure User Authentication

**Status**: Planned schema and state; no collections or indexes created by this command.

## Persistent user account (`users`)

| Field | Representation | Rules |
| --- | --- | --- |
| `_id` | MongoDB ObjectId | Database-generated identity; public DTO uses its 24-character hexadecimal string |
| `email` | String | Required; trim then lowercase; syntax checked by the shared schema; ≤254 Unicode code points; no provider rewriting or additional NFC transformation |
| `name` | String | Required; trim; 3–80 Unicode code points; preserve internal whitespace/case |
| `passwordHash` | String | Encoded Argon2id verifier; excluded from ordinary selection/serialization; explicitly selected for signin |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps; never supplied by client |

Unique index: `{email:1}`, named `users_email_unique`, `unique:true`. Set automatic index creation off and explicitly await schema index creation at startup. Do not accept traffic if creation fails. No soft-delete, roles, reset tokens, or email-verification state is introduced.

Insert after authoritative validation and admitted hashing; no check-then-insert uniqueness claim. Recognize MongoDB duplicate-key code 11000 as 409. A user created before session-save failure remains stored and can sign in later.

Public identity is exactly `{id, email, name}`. Never return or log the password/hash. React renders name as text, not HTML.

## Persisted browser session (`sessions`)

connect-mongo owns the storage format:

| Field | Meaning |
| --- | --- |
| `_id` | Opaque server session key, not an application-supplied user identifier |
| `session` | connect-mongo serialized express-session data |
| `expires` | Date equal to the effective cookie deadline; native TTL index on this field with `expireAfterSeconds:0` |

Serialized application metadata:

| Field | Representation | Invariant |
| --- | --- | --- |
| `auth.userId` | Account ObjectId string | References one persisted user; no credentials/hash in session |
| `auth.authenticatedAt` | Epoch milliseconds | Set on successful authentication only; never changed by renewal |
| `auth.lastActivityAt` | Epoch milliseconds | Set at authentication and accepted active renewal only |
| `cookie` | express-session cookie data | Required flags; expires at the effective deadline |

Derived values, not extra independent sources of truth:

- `idleDeadline = lastActivityAt + 1_800_000`.
- `absoluteDeadline = authenticatedAt + 28_800_000`.
- `effectiveDeadline = min(idleDeadline, absoluteDeadline)`.
- A request is expired when `now >= idleDeadline` or `now >= absoluteDeadline`. Reject malformed/missing authenticated metadata rather than infer a valid lifetime.

One user has zero or more independent sessions. No global user-session revocation list or cross-device logout exists. A browser's tabs share its cookie. Read `/me` may renew a valid idle lifetime but never changes account/business data.

Transitions: anonymous → regenerated/persisted authenticated session; active → renewed within absolute bound; expired → denied/cleared browser state and eventual TTL removal; active logout → acknowledged store deletion/cleared cookie. A save failure does not make an authenticated session; a destroy failure does not prove invalidation.

The nonenumerable pinned-touch helper and weak successful-write receipts are process-local compatibility machinery, excluded from Mongo serialization. They are not durable entities or authentication evidence. See [session lifecycle](contracts/session-lifecycle.md).

## Shared credential values

`SignupInput`: canonical email, trimmed name, canonical password. `SigninInput`: canonical email and canonical password. Request parsing rejects non-string credentials, missing required fields, and unknown fields. A password is transformed only with NFC, then counted by string code-point iteration.

Signup predicates: length 8–128; at least one `\p{L}`, one `\p{Nd}`, one `[\p{P}\p{S}]`; reject `[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]`. Spaces and combining marks are not forbidden simply because they fail a composition predicate. Signin applies required/nonempty and maximum-128 checks after NFC without signup minimum/category restrictions. This permits verification of existing passwords without retroactively enforcing signup rules.

Fixtures belong to `packages/auth-contract/test/unicode-cases.ts` and are executed in Node plus the three browser engines. Canonical-equivalent examples must produce identical normalized values and verify across signup/signin. Length boundaries use code points after normalization, including astral characters. Email/name counting defaults are documented in spec.md.

## Transient admission state

- A per-app `HashWork` instance tracks active count (0–2), a FIFO list of at most four waiting jobs, enqueue/deadline times, and timer handles. It is shared by signup hashing, known-account verification, and dummy verification. Monotonic time governs waiting; wall time governs session policy.
- A fresh per-app throttler store tracks independent route/IP windows. It is in-memory for one process, resets on restart, and is isolated between tests.
- Neither is a durable user record. Do not put either in a module-level global that leaks across test fixtures.

## Transient client state

Auth status is `unknown | unauthenticated | authenticating | authenticated`. Logout uses `unknown` while pending rather than inventing authenticated success during invalidation. Snapshot fields include public user when verified, generation, latest read ID, pending operation, queued-logout flag, slow indicator, and current observation.

Evidence is separate: `lastOperation` stores only kind/outcome/status (never credentials); `serverOutcomeUncertain` records rejected transport ambiguity; a logout receipt records acknowledged destruction for that operation. Credentials live only in the active form/request lifetime and are not cached for retry.

The render gate requires current-generation verified identity and current relevant-route trust. Old identity payloads never authorize content. Detailed transitions and transport-settlement scope are specified in [client-auth.md](contracts/client-auth.md).
