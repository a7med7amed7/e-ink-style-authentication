# Phase 6 client implementation checkpoint

Updated 2026-10-16. Source work covers T084–T087 and T118–T120. No commits or task checkboxes were changed by the client owner.

## Implemented

- Preserved the interrupted controller queue/timer work. Signup/signin keep one tracked mutation slot; logout requests coalesce and start only after the tracked POST response/body settles. The queued intent invalidates old confirmation, skips its reconciliation, and transfers pending revalidation waiters to logout.
- Slow timers stay attached to the active mutation identity. While a queued logout still waits on the original POST, its current queued generation may publish `slow`; once logout takes the slot, the original timer is cleared and its old identity cannot update the logout snapshot.
- Focus/navigation revalidation during a mutation defers to a current reconciliation. A focus arriving during an in-flight reconciliation invalidates that read and causes a fresh read; coalesced callers settle after the current operation read. Read responses and cleanup check mutation identity, generation, and read ID.
- Later confirmed authentication preserves `serverOutcomeUncertain` from older rejected transport outcomes.
- `createAppRoutes(controller)` supplies controller-bound memory/browser route definitions. Protected-route loaders revoke trust before rendering; `createAppRouter(controller)` is created in `main.tsx` from the same controller passed to `AuthProvider`.
- `AuthProvider` installs/removes a focus listener that synchronously calls `revalidate('focus')`. StrictMode effects remain GET-only. The forms test helper now creates its router from its test controller.

## RED and focused verification

Runtime for all commands: `/tmp/easygen-node-v24.22.0/bin` (Node v24.22.0, npm 11.19.1).

- Fresh resume baseline: `npm run test:unit --workspace @easygen/web -- apps/web/test/auth-concurrency.test.ts apps/web/test/route-trust.test.tsx` produced the expected 4 failures: 1 in concurrency (focus during an in-flight reconciliation) and 3 route-trust failures (focus invalidation, route factory/navigation, focus handler). Other 8 cases passed.
- Added queued-timer RED first. `npm run test:unit --workspace @easygen/web -- test/auth-concurrency.test.ts --testNamePattern=ordering:.*keeps.*queued` failed because at five seconds the expected `slow: true` was `false` while signin remained pending and logout was queued. After the generation allowance, it passed 1/1.
- `npm run test:unit --workspace @easygen/web -- test/auth-concurrency.test.ts` passed 10/10. This is the final K081/K118 suite evidence and covers K084/K085 as well.
- Targeted queue selector `--testNamePattern=ordering:.*queues` passed 1/1. Targeted timer selector `--testNamePattern=ordering:.*threshold` passed 3/3, including the queued timer and slot-transition stale-timer cases.
- `npm run test:unit --workspace @easygen/web -- test/auth-outcomes.test.ts -t 'outcome:'` passed 12/12 (K086).
- `npm run typecheck --workspace @easygen/web && npm run test:unit --workspace @easygen/web -- test/route-trust.test.tsx -t navigation` passed typecheck and navigation 1/1 (K119) before the parallel T088 auth-status test file appeared.
- `npm run test:unit --workspace @easygen/web -- test/route-trust.test.tsx test/auth-context.test.tsx` passed 6/6 (K120). `npm run test:unit --workspace @easygen/web -- test/route-trust.test.tsx -t 'route-trust:'` passed 4/4 (K087).
- Owned ESLint targets passed after the queued-timer fix: `npm exec -- eslint apps/web/src/auth/auth-controller.ts apps/web/src/auth/auth-context.tsx apps/web/src/router.tsx apps/web/src/main.tsx apps/web/test/auth-concurrency.test.ts apps/web/test/auth-context.test.tsx apps/web/test/forms.test.tsx`.
- A typecheck attempt during T088 was temporarily blocked because its test imported `auth-status.js` before the component existed. After the UI owner added `apps/web/src/components/auth-status.tsx`, `npm run typecheck --workspace @easygen/web` passed again.

The task file's original K084/K085 filters (`-t 'ordering: queue'` and `-t 'ordering: threshold'`) ran zero tests under npm 11/Vitest because the space-containing patterns were split/mismatched. Earlier outputs showed all cases skipped. No success claim is based on those invocations. The no-space regex selectors above selected real cases, and root is updating the task check to use the full 10-test concurrency command.

## Production-line budget

- T084 queued-logout serialization and stale-operation protection: about 53 added production lines in `auth-controller.ts`.
- T085 slow timer setup/cleanup and queued-generation handling: about 29 added production lines in `auth-controller.ts`.
- T086 preservation of older uncertainty: 1 added production line in `auth-controller.ts`.
- T118 deferred/coalesced read handling and retry guards: about 43 added production lines in `auth-controller.ts`; it also removes duplicate old read code.
- T119 adds 19 production lines across `router.tsx` and `main.tsx`.
- T120 adds 6 production lines in `auth-context.tsx`; its context test adds 31 test lines.
- T087 is the integrated checkpoint and adds no separate production block. All task production changes remain below the 100-line per-task budget; test lines are excluded.

## Remaining handoff

Outcome agent review is still requested before phase commit. Root owns the final phase review and commit.
