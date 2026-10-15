import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { SessionData } from 'express-session';
import type { MongoStore } from 'connect-mongo';
import { MongoNetworkError } from 'mongodb';
import { SessionStoreAdapter, SessionStoreUnavailableError } from '../src/session/store.js';

type GetCallback = (error: unknown, value?: SessionData | null) => void;
type SetCallback = (error?: unknown) => void;

interface RecordedCall {
  method: 'get' | 'set' | 'destroy';
  sid: string;
  value?: SessionData;
}

class FakeMongoStore extends EventEmitter {
  readonly calls: RecordedCall[] = [];
  getValue: SessionData | null = null;
  getError: unknown = null;
  setError: unknown = null;
  destroyError: unknown = null;

  get(sid: string, callback: GetCallback): void {
    this.calls.push({ method: 'get', sid });
    callback(this.getError, this.getValue);
  }

  set(sid: string, value: SessionData, callback: SetCallback = () => {}): void {
    this.calls.push({ method: 'set', sid, value });
    callback(this.setError);
  }

  destroy(sid: string, callback: SetCallback = () => {}): void {
    this.calls.push({ method: 'destroy', sid });
    callback(this.destroyError);
  }
}

const sessionValue = (): SessionData => ({
  cookie: {
    originalMaxAge: 1_800_000,
    expires: new Date('2026-10-15T12:00:00.000Z')
  }
});

const makeAdapter = (store = new FakeMongoStore()): { adapter: SessionStoreAdapter; store: FakeMongoStore } => ({
  adapter: new SessionStoreAdapter(store as unknown as MongoStore),
  store
});

void test('session-store: delegation forwards get, set, and destroy arguments and results', () => {
  const { adapter, store } = makeAdapter();
  const value = sessionValue();
  store.getValue = value;

  let getResult: [unknown, SessionData | null | undefined] | undefined;
  adapter.get('get-sid', (error, result) => { getResult = [error, result]; });
  assert.deepEqual(getResult, [null, value]);

  let setError: unknown = 'not-called';
  adapter.set('set-sid', value, (error) => { setError = error; });
  assert.equal(setError, null);

  let destroyError: unknown = 'not-called';
  adapter.destroy('destroy-sid', (error) => { destroyError = error; });
  assert.equal(destroyError, null);
  assert.deepEqual(store.calls, [
    { method: 'get', sid: 'get-sid' },
    { method: 'set', sid: 'set-sid', value },
    { method: 'destroy', sid: 'destroy-sid' }
  ]);
});

void test('session-store: delegation exposes no store touch method', () => {
  const { adapter } = makeAdapter();
  assert.equal(Reflect.get(adapter, 'touch'), undefined);
});

void test('session-store: delegation brands Mongo availability errors and preserves unexpected errors', () => {
  const { adapter, store } = makeAdapter();
  const networkError = new MongoNetworkError('private host and credentials');
  store.getError = networkError;

  let getError: unknown;
  adapter.get('sid', (error) => { getError = error; });
  assert.ok(getError instanceof SessionStoreUnavailableError);
  assert.notEqual((getError as Error).message, networkError.message);

  const bug = new TypeError('unexpected implementation bug');
  store.setError = bug;
  let setError: unknown;
  adapter.set('sid', sessionValue(), (error) => { setError = error; });
  assert.equal(setError, bug);
});

void test('session-store: delegation handles and relays underlying error events safely', () => {
  const { adapter, store } = makeAdapter();
  let received: unknown;
  adapter.on('error', (error: unknown) => { received = error; });

  assert.doesNotThrow(() => store.emit('error', new MongoNetworkError('private connection details')));
  assert.ok(received instanceof SessionStoreUnavailableError);
});

void test('session-store: receipt skips an identical acknowledged snapshot synchronously', () => {
  const { adapter, store } = makeAdapter();
  const value = sessionValue();
  adapter.set('same-sid', value, (error) => { assert.equal(error, null); });
  assert.equal(store.calls.length, 1);

  let callbackRanDuringCall = false;
  let inCall = true;
  adapter.set('same-sid', value, (error) => {
    assert.equal(error, null);
    callbackRanDuringCall = inCall;
  });
  inCall = false;

  assert.equal(callbackRanDuringCall, true);
  assert.equal(store.calls.length, 1);
});

void test('session-store: receipt never caches failed writes', () => {
  const { adapter, store } = makeAdapter();
  const value = sessionValue();
  store.setError = new Error('write not acknowledged');
  let firstError: unknown;
  adapter.set('same-sid', value, (error) => { firstError = error; });
  assert.ok(firstError instanceof Error);

  store.setError = null;
  adapter.set('same-sid', value, (error) => { assert.equal(error, null); });
  assert.equal(store.calls.length, 2);
});

void test('session-store: receipt delegates changed SID, object, and serialized snapshot', () => {
  const { adapter, store } = makeAdapter();
  const first = sessionValue();
  const distinct = sessionValue();
  first.auth = { userId: '507f1f77bcf86cd799439011', authenticatedAt: 1, lastActivityAt: 1 };
  distinct.auth = { userId: '507f1f77bcf86cd799439011', authenticatedAt: 1, lastActivityAt: 2 };
  adapter.set('sid-a', first, (error) => { assert.equal(error, null); });
  adapter.set('sid-a', first, (error) => { assert.equal(error, null); });
  first.auth = { userId: '507f1f77bcf86cd799439011', authenticatedAt: 1, lastActivityAt: 2 };
  adapter.set('sid-a', first, (error) => { assert.equal(error, null); });
  adapter.set('sid-b', first, (error) => { assert.equal(error, null); });
  adapter.set('sid-a', distinct, (error) => { assert.equal(error, null); });

  assert.deepEqual(store.calls.map(({ sid }) => sid), ['sid-a', 'sid-a', 'sid-b', 'sid-a']);
});
