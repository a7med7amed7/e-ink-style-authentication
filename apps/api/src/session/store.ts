import session from 'express-session';
import type { MongoStore } from 'connect-mongo';
import type { SessionData } from 'express-session';
import { createHash } from 'node:crypto';
import {
  MongoClientClosedError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoOperationTimeoutError,
  MongoServerClosedError,
  MongoServerSelectionError,
  MongoTopologyClosedError
} from 'mongodb';

export class SessionStoreUnavailableError extends Error {
  readonly code = 'SESSION_STORE_UNAVAILABLE';

  constructor(options?: ErrorOptions) {
    super('Session store unavailable.', options);
    this.name = 'SessionStoreUnavailableError';
  }
}

const isStoreUnavailable = (error: unknown): boolean =>
  error instanceof MongoNetworkError ||
  error instanceof MongoNotConnectedError ||
  error instanceof MongoOperationTimeoutError ||
  error instanceof MongoServerClosedError ||
  error instanceof MongoServerSelectionError ||
  error instanceof MongoTopologyClosedError ||
  error instanceof MongoClientClosedError;

const mapStoreError = (error: unknown): unknown =>
  isStoreUnavailable(error)
    ? new SessionStoreUnavailableError(error instanceof Error ? { cause: error } : undefined)
    : error;

interface WriteReceipt {
  sid: string;
  digest: string;
}

const serializeSnapshot = (value: unknown): string | undefined => JSON.stringify(value);

const digestSnapshot = (value: SessionData): string => {
  const snapshot = serializeSnapshot(value);
  if (snapshot === undefined) throw new TypeError('Session snapshot is not serializable.');
  return createHash('sha256').update(snapshot, 'utf8').digest('hex');
};

export class SessionStoreAdapter extends session.Store {
  private readonly successfulWrites = new WeakMap<SessionData, WriteReceipt>();

  constructor(private readonly mongoStore: MongoStore) {
    super();
    this.mongoStore.on('error', (error: unknown) => {
      const mapped = mapStoreError(error);
      if (this.listenerCount('error') > 0) this.emit('error', mapped);
    });
  }

  override get(sid: string, callback: (error: unknown, value?: SessionData | null) => void): void {
    this.mongoStore.get(sid, (error, value) => {
      callback(error ? mapStoreError(error) : null, value);
    });
  }

  override set(sid: string, value: SessionData, callback?: (error?: unknown) => void): void {
    let digest: string;
    try {
      digest = digestSnapshot(value);
    } catch (error) {
      callback?.(error);
      return;
    }

    const receipt = this.successfulWrites.get(value);
    if (receipt?.sid === sid && receipt.digest === digest) {
      callback?.(null);
      return;
    }

    this.mongoStore.set(sid, value, (error) => {
      if (error) {
        callback?.(mapStoreError(error));
        return;
      }
      this.successfulWrites.set(value, { sid, digest });
      callback?.(null);
    });
  }

  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    this.mongoStore.destroy(sid, (error) => {
      callback?.(error ? mapStoreError(error) : null);
    });
  }
}
