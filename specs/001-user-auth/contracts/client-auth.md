# Client Authentication Contract

## Ownership and interfaces

One `AuthController` is created per tab outside component render and observed through `useSyncExternalStore`. Do not store a mutable user/session token in localStorage. Only the browser handles the HttpOnly cookie.

Controller surface:

```ts
type Operation = 'signup' | 'signin' | 'logout';
type RecheckReason = 'bootstrap' | 'focus' | 'navigation' | 'retry';
type OperationOutcome =
  | 'confirmed' | 'rejected' | 'uncertain' | 'verification-failed'
  | 'already-anonymous' | 'busy';
interface OperationResult { outcome: OperationOutcome; message?: string }
// PublicUser, SignupInput, SigninInput come from @easygen/auth-contract.
// getSnapshot/subscribe expose the immutable snapshot described below.
```

Methods are `signup(input:SignupInput):Promise<OperationResult>`, `signin(input:SigninInput):Promise<OperationResult>`, `logout():Promise<OperationResult>`, `revalidate(reason:RecheckReason):Promise<void>`, `getSnapshot():AuthSnapshot`, and `subscribe(listener:()=>void):()=>void`.

`AuthSnapshot` contains status (`unknown`, `unauthenticated`, `authenticating`, `authenticated`), optional verified public user, generation/verifiedGeneration/latestReadId, relevant-route trust, pending operation, queued-logout flag, slow flag, safe submission errors, last operation outcome, latest server observation, `serverOutcomeUncertain`, and an operation-specific logout-destruction receipt. It contains no password or replayable request body.

## Mutation serialization

1. Acquire the mutation slot synchronously before POST dispatch, including before React rerenders. Duplicate signup/signin returns busy and sends no second request. Do not queue credential submissions or retain their passwords.
2. Accepted mutation intent increments generation synchronously and invalidates outstanding identity reads/render trust. Signup/signin enter authenticating; logout hides protected content and enters unknown with a pending logout.
3. If logout is requested during signup/signin, coalesce it to one queued logout and invalidate older confirmation. Preserve the original tracked HTTP operation; do not abort it. After its actual response/body handling or rejection settles, process logout before publishing a superseded signin observation. Signin and logout POST transport never overlap within this tab.
4. At five seconds, only set the slow flag and announce `Still verifying`. Do not reject a promise, release a slot, start another POST, or infer failure from that UI timer.
5. Keep the logical operation busy through its reconciliation unless a queued newer logout supersedes that reconciliation. Apply operation IDs/generation checks to timer/finally cleanup so an older completion cannot clear a newer operation.
6. Rejection settles tracked transport, not server work. Record `serverOutcomeUncertain` and reconcile. Queue progress is scoped to tracked transport only. Never claim that a fetch rejection, abort, discarded promise, or later logout guarantees older server work ended.
7. No automatic POST retry. Explicit later actions are allowed after the tracked operation settles; do not create a permanent client lock or add an operation-status protocol.

## Identity reads and render protection

- Begin in unknown; bootstrap `/me`. Every read captures the current generation and a new increasing read ID.
- Apply success, 401, failure, body-parse failure, and cleanup only if both identifiers are still current and no conflicting mutation intent/pending transport exists. Older reads cannot restore identity or clear loading/error state.
- A successful response must pass the shared public-user schema. Unexpected statuses, malformed bodies, network failure, and service errors are unknown, not anonymous/authenticated success.
- Ordinary fresh `/me` 200 establishes observed authenticated identity; 401 establishes observed anonymity. When confirming signup/signin, match the POST user ID where available and the canonical intended email. An unexpected user is unknown, never successful signin to a different account.
- Relevant navigation invalidates route trust before rendering protected content; focus invalidates current trust and revalidates. During a mutation, defer/coalesce focus reads instead of publishing an observation for an unsettled mutation. Do not rely on an effect that runs after a protected screen has already rendered.
- Protected rendering requires status authenticated, matching generation, and validated relevant-route trust. Unknown/authenticating views contain no protected user content. No stale cached user object authorizes rendering.
- Strict Mode may repeat safe bootstrap GETs; it must never originate POSTs from effects.

## Evidence and chosen uncertainty policy

| Observation sequence | UI state/outcome |
| --- | --- |
| Bootstrap or ordinary explicit recheck `/me` 401 | Unauthenticated; observed anonymity |
| Signin explicit 401 | Show `Invalid email or password.`; reconcile; no generic error substitution for network/400/503 |
| Signup/signin 400 or signup 409 | Field/conflict feedback; reconcile; do not label authenticated success |
| Signup/signin 2xx user A, then `/me` A | Authenticated, operation confirmed, unless superseded/conflicting work exists |
| Signup/signin 2xx A, then `/me` B, 401, or failed/malformed read | Unknown; confirmation failed; no success navigation |
| Signup/signin transport rejects, then `/me` intended user | Authenticated observed identity is allowed after the tracked transport settles; message `Session verified`; preserve uncertain POST outcome, do not claim its response succeeded |
| Signup/signin transport rejects, then `/me` 401 | Record anonymous observation but keep unknown for that operation; offer `Check session` and explain the account/session outcome was not confirmed |
| Explicit later `Check session` yields 401 | Unauthenticated observed state is allowed; retain uncertain older-operation disclosure, not a definitive claim that server work stopped |
| Logout 204, then `/me` 401 | Confirmed destruction of the presented session and observed anonymity; scoped to acknowledged operation and documented ordering limits |
| Logout 204, then `/me` user or failed read | Unknown; sign-out verification failed |
| Logout 503 or transport rejection, then `/me` 401 | Unknown for logout; anonymous observation is recorded; no confirmed destruction message |
| Logout 401, then `/me` 401 | Already-anonymous observation; no new destruction receipt or claim that this attempt invalidated a prior session |
| `/me` 401 while signin remains unresolved | No definitive signin/anonymous transition; original tracked mutation remains authoritative for ordering |

An explicit subsequent recheck may establish the currently observed browser state without converting a failed/unacknowledged logout into confirmed invalidation. Use messages such as `We couldn't confirm sign-out. Check your session again.` Separate operation feedback from identity state.

The unavoidable limitation must appear in README and relevant uncertain-result help: an unacknowledged mutation may finish later on the server, including after a subsequent `/me` or logout. This client guarantees serialization only of unresolved HTTP work it tracks. It does not guarantee global ordering across tabs/direct clients or prove that an unknown older signin cannot later establish a session.

## Forms and presentation

Use `/signup`, `/signin`, and protected `/app`. Forms use shared canonical schemas, semantic form/submit buttons, explicit labels, field errors with `aria-invalid`/`aria-describedby`, an announced submission-error region, autocomplete, visible focus, and keyboard-operable password visibility. Disable duplicate submission affordances while retaining the synchronous controller lock as the guarantee.

Use CSS e-ink colors, a restrained paper texture/typographic hierarchy, high-contrast controls, and small opacity/position transitions. Minimum review viewport is 320 CSS pixels; primary touch targets are at least 44×44 CSS pixels. AA contrast thresholds apply, with reduced-motion media rules removing nonessential transitions. Animation never gates validation or submission. No raster assets or animation library is required.

Required controller tests use controllable promises and fake timers: two submissions before rerender, signin/logout ordering, one queued logout, five-second message without cancellation, stale success/401/error/finally, wrong-account confirmation, rejected transport plus each reconciliation result, failed destruction plus anonymous read, deferred focus, navigation gating, and no automatic POST retry.
