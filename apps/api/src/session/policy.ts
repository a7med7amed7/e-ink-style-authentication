export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1_000;

export interface SessionAuthMetadata {
  readonly userId: string;
  readonly authenticatedAt: number;
  readonly lastActivityAt: number;
}

export interface SessionDeadlines {
  readonly idleDeadline: number;
  readonly absoluteDeadline: number;
  readonly deadline: number;
}

const objectIdPattern = /^[0-9a-f]{24}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEpochMilliseconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export class SessionPolicy {
  constructor(private readonly wallClock: () => number = Date.now) {}

  deadlines(value: unknown): SessionDeadlines | null {
    const now = this.wallClock();
    const auth = this.#validMetadata(value, now);
    if (!auth) return null;

    const idleDeadline = auth.lastActivityAt + SESSION_IDLE_TIMEOUT_MS;
    const absoluteDeadline = auth.authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
    if (!Number.isSafeInteger(idleDeadline) || !Number.isSafeInteger(absoluteDeadline)) {
      return null;
    }

    return {
      idleDeadline,
      absoluteDeadline,
      deadline: Math.min(idleDeadline, absoluteDeadline),
    };
  }

  isActive(value: unknown): value is SessionAuthMetadata {
    const now = this.wallClock();
    const auth = this.#validMetadata(value, now);
    if (!auth) return false;

    const idleDeadline = auth.lastActivityAt + SESSION_IDLE_TIMEOUT_MS;
    const absoluteDeadline = auth.authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
    return Number.isSafeInteger(idleDeadline) &&
      Number.isSafeInteger(absoluteDeadline) &&
      now < Math.min(idleDeadline, absoluteDeadline);
  }

  renew(value: unknown): SessionAuthMetadata | null {
    const now = this.wallClock();
    const auth = this.#validMetadata(value, now);
    if (!auth) return null;

    const idleDeadline = auth.lastActivityAt + SESSION_IDLE_TIMEOUT_MS;
    const absoluteDeadline = auth.authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(idleDeadline) ||
      !Number.isSafeInteger(absoluteDeadline) ||
      now >= Math.min(idleDeadline, absoluteDeadline)
    ) {
      return null;
    }

    return {
      userId: auth.userId,
      authenticatedAt: auth.authenticatedAt,
      lastActivityAt: now,
    };
  }

  #validMetadata(value: unknown, now: number): SessionAuthMetadata | null {
    if (!isRecord(value) || !Number.isSafeInteger(now) || now < 0) return null;

    const userId = value["userId"];
    const authenticatedAt = value["authenticatedAt"];
    const lastActivityAt = value["lastActivityAt"];
    if (
      typeof userId !== "string" ||
      !objectIdPattern.test(userId) ||
      !isEpochMilliseconds(authenticatedAt) ||
      !isEpochMilliseconds(lastActivityAt) ||
      lastActivityAt < authenticatedAt ||
      authenticatedAt > now ||
      lastActivityAt > now
    ) {
      return null;
    }

    return { userId, authenticatedAt, lastActivityAt };
  }
}
