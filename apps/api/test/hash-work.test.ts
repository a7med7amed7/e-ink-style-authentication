import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthCapacityExceededError,
  HashWork,
  HashWorkClosedError,
  type HashWorkClock,
} from "../src/security/hash-work.js";

interface FakeTimer {
  readonly dueAt: number;
  readonly callback: () => void;
}

class FakeClock implements HashWorkClock {
  #time = 0;
  #nextTimerId = 0;
  readonly #timers = new Map<number, FakeTimer>();

  now = (): number => this.#time;

  setTimeout = (callback: () => void, delayMs: number): unknown => {
    const id = ++this.#nextTimerId;
    this.#timers.set(id, { dueAt: this.#time + delayMs, callback });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    this.#timers.delete(handle as number);
  };

  get pendingTimerCount(): number {
    return this.#timers.size;
  }

  advanceBy(milliseconds: number, runDueTimers = true): void {
    this.#time += milliseconds;
    if (!runDueTimers) return;

    while (true) {
      const next = [...this.#timers.entries()]
        .filter(([, timer]) => timer.dueAt <= this.#time)
        .sort(([firstId, first], [secondId, second]) =>
          first.dueAt - second.dueAt || firstId - secondId,
        )[0];
      if (!next) return;
      const [id, timer] = next;
      this.#timers.delete(id);
      timer.callback();
    }
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (value) => resolve(value),
    reject,
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function capacityFailure(reason: "saturated" | "queue-timeout") {
  return (error: unknown): boolean => {
    if (!(error instanceof AuthCapacityExceededError)) return false;
    const capacityError = error as {
      readonly code: unknown;
      readonly retryAfterSeconds: unknown;
      readonly reason: unknown;
    };
    assert.equal(capacityError.code, "AUTH_CAPACITY_EXCEEDED");
    assert.equal(capacityError.retryAfterSeconds, 1);
    assert.equal(capacityError.reason, reason);
    return true;
  };
}

function closedFailure(error: unknown): boolean {
  if (!(error instanceof HashWorkClosedError)) return false;
  const closedError = error as { readonly code: unknown };
  assert.equal(closedError.code, "HASH_WORK_CLOSED");
  return true;
}

test("hash-work: runs two jobs and admits four FIFO waiters before typed saturation", async (t) => {
  const clock = new FakeClock();
  const work = new HashWork({ clock });
  const started: number[] = [];
  const completions = Array.from({ length: 6 }, () => deferred<number>());
  let activeCount = 0;
  let maxActiveCount = 0;
  t.after(() => {
    work.close();
    completions.forEach((completion, index) => completion.resolve(index + 1));
  });

  const jobs = completions.map((completion, index) => {
    const id = index + 1;
    const job = work.run(async () => {
      started.push(id);
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      try {
        return await completion.promise;
      } finally {
        activeCount -= 1;
      }
    });
    void job.catch(() => undefined);
    return job;
  });

  await nextTurn();
  assert.deepEqual(started, [1, 2]);
  assert.equal(clock.pendingTimerCount, 4);

  await assert.rejects(
    work.run(async () => {
      started.push(7);
      return 7;
    }),
    capacityFailure("saturated"),
  );
  assert.deepEqual(started, [1, 2]);

  for (const id of [1, 2, 3, 4, 5, 6]) {
    completions[id - 1]?.resolve(id);
    assert.equal(await jobs[id - 1], id);
    await nextTurn();
    assert.deepEqual(
      started,
      Array.from({ length: Math.min(6, id + 2) }, (_, index) => index + 1),
    );
  }

  assert.equal(maxActiveCount, 2);
  assert.equal(clock.pendingTimerCount, 0);
});

test("hash-work: expires a waiter at 1000ms without invoking its work", async (t) => {
  const clock = new FakeClock();
  const work = new HashWork({ clock });
  const first = deferred<number>();
  const second = deferred<number>();
  const started: number[] = [];
  const active = [
    work.run(async () => {
      started.push(1);
      return first.promise;
    }),
    work.run(async () => {
      started.push(2);
      return second.promise;
    }),
  ];
  t.after(() => {
    work.close();
    first.resolve(1);
    second.resolve(2);
  });

  const timedOutWork = work.run(async () => {
    started.push(3);
    return 3;
  });
  void timedOutWork.catch(() => undefined);
  const settled: string[] = [];
  void timedOutWork.then(
    () => settled.push("resolved"),
    () => settled.push("rejected"),
  );

  await nextTurn();
  assert.deepEqual(started, [1, 2]);
  clock.advanceBy(999);
  await nextTurn();
  assert.deepEqual(settled, []);
  assert.deepEqual(started, [1, 2]);

  clock.advanceBy(1);
  await assert.rejects(timedOutWork, capacityFailure("queue-timeout"));
  assert.deepEqual(started, [1, 2]);
  first.resolve(1);
  second.resolve(2);
  await Promise.all(active);
});

test("hash-work: rejects an expired waiter at dequeue even if its timer did not run", async (t) => {
  const clock = new FakeClock();
  const work = new HashWork({ clock });
  const first = deferred<number>();
  const second = deferred<number>();
  const started: number[] = [];
  const firstJob = work.run(async () => {
    started.push(1);
    return first.promise;
  });
  const secondJob = work.run(async () => {
    started.push(2);
    return second.promise;
  });
  t.after(() => {
    work.close();
    first.resolve(1);
    second.resolve(2);
  });

  const expiredJob = work.run(async () => {
    started.push(3);
    return 3;
  });
  void expiredJob.catch(() => undefined);
  const rejection = assert.rejects(expiredJob, capacityFailure("queue-timeout"));
  await nextTurn();
  clock.advanceBy(1000, false);

  first.resolve(1);
  assert.equal(await firstJob, 1);
  await nextTurn();
  await rejection;
  assert.deepEqual(started, [1, 2]);
  assert.equal(clock.pendingTimerCount, 0);

  second.resolve(2);
  assert.equal(await secondJob, 2);
});

test("hash-work: releases capacity after active work rejects", async (t) => {
  const clock = new FakeClock();
  const work = new HashWork({ clock });
  const first = deferred<number>();
  const second = deferred<number>();
  const third = deferred<number>();
  const started: number[] = [];
  const jobs = [
    work.run(async () => {
      started.push(1);
      return first.promise;
    }),
    work.run(async () => {
      started.push(2);
      return second.promise;
    }),
    work.run(async () => {
      started.push(3);
      return third.promise;
    }),
  ];
  jobs.forEach((job) => void job.catch(() => undefined));
  t.after(() => {
    work.close();
    first.resolve(1);
    second.resolve(2);
    third.resolve(3);
  });

  await nextTurn();
  assert.deepEqual(started, [1, 2]);
  const failure = new Error("hash operation failed");
  first.reject(failure);
  await assert.rejects(jobs[0]!, (error: unknown) => error === failure);
  await nextTurn();
  assert.deepEqual(started, [1, 2, 3]);

  second.resolve(2);
  third.resolve(3);
  assert.deepEqual(await Promise.all(jobs.slice(1)), [2, 3]);
});

test("hash-work: close rejects waiters and later admissions while active work settles", async (t) => {
  const clock = new FakeClock();
  const work = new HashWork({ clock });
  const activeCompletions = [deferred<number>(), deferred<number>()];
  const active = activeCompletions.map((completion, index) =>
    work.run(async () => completion.promise.then(() => index + 1)),
  );
  const waiters = Array.from({ length: 4 }, (_, index) =>
    work.run(async () => index + 3),
  );
  const waiterRejections = waiters.map((waiter) => assert.rejects(waiter, closedFailure));
  t.after(() => {
    work.close();
    activeCompletions.forEach((completion, index) => completion.resolve(index + 1));
  });

  await nextTurn();
  assert.equal(clock.pendingTimerCount, 4);
  work.close();
  await Promise.all(waiterRejections);
  assert.equal(clock.pendingTimerCount, 0);

  let laterWorkStarted = false;
  await assert.rejects(
    work.run(async () => {
      laterWorkStarted = true;
      return 5;
    }),
    closedFailure,
  );
  assert.equal(laterWorkStarted, false);

  activeCompletions.forEach((completion, index) => completion.resolve(index + 1));
  assert.deepEqual(await Promise.all(active), [1, 2]);
});
