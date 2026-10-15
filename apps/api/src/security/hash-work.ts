import { performance } from "node:perf_hooks";

const MAX_ACTIVE = 2;
const MAX_WAITING = 4;
const MAX_QUEUE_WAIT_MS = 1_000;

export type AuthCapacityFailureReason = "saturated" | "queue-timeout";

export class AuthCapacityExceededError extends Error {
  readonly code = "AUTH_CAPACITY_EXCEEDED" as const;
  readonly retryAfterSeconds = 1 as const;

  constructor(readonly reason: AuthCapacityFailureReason) {
    super("Authentication capacity is temporarily unavailable");
    this.name = "AuthCapacityExceededError";
  }
}

export class HashWorkClosedError extends Error {
  readonly code = "HASH_WORK_CLOSED" as const;

  constructor() {
    super("Hash work is closed");
    this.name = "HashWorkClosedError";
  }
}

export interface HashWorkClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface HashWorkOptions {
  readonly clock?: HashWorkClock;
}

interface WaitingJob {
  readonly deadline: number;
  readonly start: () => void;
  readonly reject: (reason: unknown) => void;
  state: "waiting" | "started" | "rejected";
  timer: unknown;
  hasTimer: boolean;
}

const systemClock: HashWorkClock = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

export class HashWork {
  readonly #clock: HashWorkClock;
  readonly #waiting: WaitingJob[] = [];
  #active = 0;
  #closed = false;

  constructor(options: HashWorkOptions = {}) {
    this.#clock = options.clock ?? systemClock;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new HashWorkClosedError());

    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        void Promise.resolve()
          .then(work)
          .then(resolve, reject)
          .finally(() => {
            this.#active -= 1;
            this.#drain();
          });
      };

      if (this.#active < MAX_ACTIVE) {
        this.#active += 1;
        start();
        return;
      }

      if (this.#waiting.length >= MAX_WAITING) {
        reject(new AuthCapacityExceededError("saturated"));
        return;
      }

      const job: WaitingJob = {
        deadline: this.#clock.now() + MAX_QUEUE_WAIT_MS,
        start,
        reject,
        state: "waiting",
        timer: undefined,
        hasTimer: false,
      };
      this.#waiting.push(job);
      this.#scheduleExpiry(job);
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;

    for (const job of this.#waiting.splice(0)) {
      if (job.state !== "waiting") continue;
      job.state = "rejected";
      this.#clearExpiry(job);
      job.reject(new HashWorkClosedError());
    }
  }

  #scheduleExpiry(job: WaitingJob): void {
    const remaining = Math.max(0, job.deadline - this.#clock.now());
    job.hasTimer = true;
    job.timer = this.#clock.setTimeout(() => {
      this.#expire(job);
    }, remaining);
  }

  #expire(job: WaitingJob): void {
    if (job.state !== "waiting") return;

    const remaining = job.deadline - this.#clock.now();
    if (remaining > 0) {
      this.#scheduleExpiry(job);
      return;
    }

    const index = this.#waiting.indexOf(job);
    if (index < 0) return;
    this.#waiting.splice(index, 1);
    job.state = "rejected";
    this.#clearExpiry(job);
    job.reject(new AuthCapacityExceededError("queue-timeout"));
  }

  #clearExpiry(job: WaitingJob): void {
    if (!job.hasTimer) return;
    this.#clock.clearTimeout(job.timer);
    job.hasTimer = false;
    job.timer = undefined;
  }

  #drain(): void {
    while (!this.#closed && this.#active < MAX_ACTIVE && this.#waiting.length > 0) {
      const job = this.#waiting.shift();
      if (!job || job.state !== "waiting") continue;

      this.#clearExpiry(job);
      if (this.#clock.now() >= job.deadline) {
        job.state = "rejected";
        job.reject(new AuthCapacityExceededError("queue-timeout"));
        continue;
      }

      job.state = "started";
      this.#active += 1;
      job.start();
    }
  }
}
