import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupE2EDatabase } from '../e2e/database-cleanup.ts';

const runId = 'a1234567-b89c-4def-8012-3456789abcde';
const databaseName = `easygen_e2e_${runId.replaceAll('-', '')}`;

function runnerConfig(uri = `mongodb://127.0.0.1:27017/${databaseName}`) {
  return {
    metadata: { easygenE2eDatabase: { runId, databaseName } },
    webServer: { env: { MONGODB_URI: uri } },
  };
}

test('teardown drops only the exact runner-owned database and closes its client', async () => {
  const dropped: string[] = [];
  let closed = false;
  await cleanupE2EDatabase(runnerConfig(), (uri) => {
    assert.equal(uri, `mongodb://127.0.0.1:27017/${databaseName}`);
    return {
      async connect() {},
      db(name) {
        return { async dropDatabase() { dropped.push(name); } };
      },
      async close() { closed = true; },
    };
  });
  assert.deepEqual(dropped, [databaseName]);
  assert.equal(closed, true);
});

test('teardown refuses caller-selected and non-loopback databases before connecting', async () => {
  const rejectedConfigs = [
    runnerConfig('mongodb://127.0.0.1:27017/easygen_e2e_caller_selected'),
    runnerConfig(`mongodb://db.example.test:27017/${databaseName}`),
    runnerConfig(`mongodb://user:pass@127.0.0.1:27017/${databaseName}`),
    {
      metadata: { easygenE2eDatabase: { runId, databaseName: `easygen_e2e_${'f'.repeat(32)}` } },
      webServer: { env: { MONGODB_URI: `mongodb://127.0.0.1:27017/${databaseName}` } },
    },
  ];
  let factoryCalls = 0;
  for (const config of rejectedConfigs) {
    await assert.rejects(cleanupE2EDatabase(config, () => {
      factoryCalls += 1;
      throw new Error('unsafe cleanup must not create a client');
    }));
  }
  assert.equal(factoryCalls, 0);
});

test('teardown closes the client when connect or drop fails', async () => {
  for (const failure of ['connect', 'drop'] as const) {
    let closed = false;
    await assert.rejects(cleanupE2EDatabase(runnerConfig(), () => ({
      async connect() {
        if (failure === 'connect') throw new Error('connect failed');
      },
      db() {
        return { async dropDatabase() {
          if (failure === 'drop') throw new Error('drop failed');
        } };
      },
      async close() { closed = true; },
    })), new RegExp(`${failure} failed`));
    assert.equal(closed, true);
  }
});
