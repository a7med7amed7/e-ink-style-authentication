# Phase 2 HashWork T019/T022 evidence

Owned files:
- `apps/api/test/hash-work.test.ts`
- `apps/api/src/security/hash-work.ts`

## T019 red-first test evidence

Command (with the required Node 24.22.0/npm 11.19.1 runtime prepended to `PATH`):

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/hash-work.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='hash-work:' apps/api/dist-test/targets/hash-work.test/test/hash-work.test.js
```

Observed before adding `hash-work.ts`: exit 1 during the build step. The only remaining diagnostic after fixing strict typing in the test was the expected missing implementation module:

```text
test/hash-work.test.ts(8,8): error TS2307: Cannot find module '../src/security/hash-work.js' or its corresponding type declarations.
```

Because the build was the left side of `&&` and failed, the Node test runner did not execute. This was a compile-time red caused by the absent T022 module; the assertions were not observed failing at runtime.

## T022 green verification

Command rerun after implementation:

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/hash-work.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='hash-work:' apps/api/dist-test/targets/hash-work.test/test/hash-work.test.js
```

Observed exit 0:

```text
✔ hash-work: runs two jobs and admits four FIFO waiters before typed saturation
✔ hash-work: expires a waiter at 1000ms without invoking its work
✔ hash-work: rejects an expired waiter at dequeue even if its timer did not run
✔ hash-work: releases capacity after active work rejects
✔ hash-work: close rejects waiters and later admissions while active work settles
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

The verification was rerun during final review on 2026-10-15, with the same 5/5 passing result and exit 0.

## Exports for dependent lanes

- `new HashWork(options?: { readonly clock?: HashWorkClock })`
- `HashWork.run<T>(work: () => Promise<T>): Promise<T>`
- `HashWork.close(): void` is idempotent, rejects queued jobs and future admissions with `HashWorkClosedError`, and permits already-active jobs to settle.
- `HashWorkClock` exposes `now(): number`, `setTimeout(callback, delayMs): unknown`, and `clearTimeout(handle): void`. Production defaults use `performance.now()` and platform timers; tests inject a deterministic monotonic clock.
- `AuthCapacityExceededError` exposes `code: "AUTH_CAPACITY_EXCEEDED"`, `retryAfterSeconds: 1`, and `reason: "saturated" | "queue-timeout"`, for the API error mapper.

The gate permits two active jobs and four waiting jobs. Queue deadlines are 1000 ms; expiry is enforced both by the timer and before dequeue so an expired callback cannot begin work.
