# Phase 6 controller and route review

Reviewed 2026-10-16 against `specs/001-user-auth/spec.md`, `specs/001-user-auth/contracts/client-auth.md`, and phase 6 tasks T081–T090 and T118–T120. The initial pass was read-only; the root-triggered follow-up below added the queued-logout regression tests and the minimal controller fix.

## Review result

The root-triggered follow-up found a controller gap after the first read-only review. That earlier unqualified pass is superseded. The gap is now fixed and covered by test-first regressions; no remaining blocking contract divergence was found in the reviewed controller, concurrency/outcome tests, router, or auth context.

- Mutation ownership is synchronous. Signup/signin hold the slot through the awaited AuthApi promise, including response-body parsing in `FetchAuthApi`. A queued logout is coalesced, waits for tracked POST settlement, invalidates the older confirmation, and proceeds before publishing that superseded reconciliation. Duplicate credential POSTs remain busy, and no request is retried or aborted.
- The five-second timer changes only the slow snapshot flag. It remains attached to the active mutation identity while logout is queued; logout handoff clears the old timer, starts a new timer, and resets the visible slow flag. Cleanup checks both the active mutation object and generation.
- Identity reads are guarded by generation and read ID. Focus during a pending POST joins its later reconciliation; focus during an in-flight reconciliation invalidates that result and triggers a fresh read. Old responses cannot publish after a newer mutation or read.
- Outcomes follow the evidence table: confirmed authentication requires the intended canonical email and, when the POST supplied one, the same user ID. Rejected transport can leave an observed matching identity authenticated while keeping the operation outcome uncertain. That uncertainty survives later reads and confirmed authentication. A logout destruction receipt is set only after acknowledged logout plus anonymous identity confirmation.
- `AuthProvider` observes the stable controller through `useSyncExternalStore`, starts a read-only bootstrap, and synchronously invalidates trust on focus; its listener is removed on unmount. The router's protected loaders call the controller before rendering, and production creates both router and provider from the same controller. `ProtectedRoute` requires authenticated status, user, matching verified generation, and route trust.
- The current concurrency tests cover synchronous duplicate blocking, queued logout/body settlement, timer threshold and handoff, and both focus-revalidation races. Outcome tests cover rejected response classes, both wrong-account dimensions, uncertainty persistence, later observation, and failed logout without a receipt. Route tests cover focus, navigation, pending mutation coalescing, and StrictMode's GET-only behavior.

### Queued logout uncertainty follow-up

The original review missed that `runSignup`/`runSignin` classified a rejected POST only after `/me` returned. A queued logout could therefore supersede that read first, leaving `serverOutcomeUncertain` false even though the earlier server operation might still complete. This happened both when logout was queued before the POST settled and when it was queued during an in-flight reconciliation.

The controller now records uncertain POST settlement before starting reconciliation or handing off to queued logout. The write checks the active mutation identity and accepts only its current generation or the generation of its active queued logout. It shares the existing uncertainty classifier, so a transport/malformed/5xx outcome is retained, while an explicit typed signin 401 remains a definitive rejection. The queued logout may still complete its own destruction receipt after an acknowledged response and anonymous observation; that does not clear the earlier uncertainty. Superseded signin callers still receive `uncertain`, and the old `/me` result cannot publish.

Three regression cases were added: network rejection followed by an already queued logout, explicit signin 401 under the same ordering, and network rejection followed by logout queued during reconciliation. Before the fix, the two network cases failed with `serverOutcomeUncertain: false`; the typed 401 case passed. All three pass after the fix.

One verification boundary remains: the current route test uses the production route factory with a memory router; `createAppRouter`'s browser-history construction is reviewed at its call site in `main.tsx`, but was not separately instantiated in a browser test. This does not block the route-trust contract because the same controller-bound route definitions are exercised and the production wiring is direct.

## Fresh verification after the queued-logout fix

All commands used the persistent official Node 24.22.0/npm 11.19.1 installation and selected real tests:

```text
npm run test:unit --workspace @easygen/web -- test/auth-concurrency.test.ts -t 'latches'
  RED before fix: 2 expected network-uncertainty failures; explicit 401 case passed
  GREEN after fix: 3 passed, 0 failed
npm run test:unit --workspace @easygen/web -- test/auth-concurrency.test.ts
  13 passed, 0 failed
npm run test:unit --workspace @easygen/web -- test/auth-outcomes.test.ts -t 'outcome:'
  12 passed, 0 failed
npm exec -- eslint apps/web/src/auth/auth-controller.ts apps/web/test/auth-concurrency.test.ts
  passed (exit 0)
git diff --check
  passed (exit 0)
```

The route-trust focused test passed 4/4 in the preceding review, before this controller-only uncertainty latch. It was not rerun for that change; the root/UI owner was notified and is running the final web K090 suite once. The separate auth-context test was reviewed but not freshly rerun in this pass; the earlier `phase6-client.md` checkpoint records route plus context at 6/6.

Root lint/typecheck were intentionally deferred while the UI lane was still red, per the handoff. Owned lint for the changed controller/test is green; no result here claims root lint/typecheck are currently green.

## Persistent toolchain

The official archive and its official `SHASUMS256.txt` entry were downloaded from `https://nodejs.org/dist/v24.22.0/`. The archive SHA-256 matched:

```text
cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008  node-v24.22.0-linux-x64.tar.xz
```

The extracted runtime is `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0`; it reports Node `v24.22.0` and bundled npm `11.19.1`. `/tmp/easygen-node-v24.22.0` points to that persistent install for existing command compatibility. Existing `node_modules` was reused; system Node was not changed.
