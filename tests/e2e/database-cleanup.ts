import { MongoClient } from 'mongodb';
import type { FullConfig } from '@playwright/test';

interface CleanupConfig {
  metadata: Record<string, unknown>;
  webServer: { env?: Record<string, string | undefined> } | null;
}

interface CleanupClient {
  connect(): Promise<unknown>;
  db(name: string): { dropDatabase(): Promise<unknown> };
  close(): Promise<void>;
}

function cleanupTarget(config: CleanupConfig): { uri: string; databaseName: string } {
  const marker = config.metadata['easygenE2eDatabase'];
  if (typeof marker !== 'object' || marker === null) throw new Error('Refusing E2E cleanup without runner metadata.');
  const { runId, databaseName } = marker as Record<string, unknown>;
  if (typeof runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId)) {
    throw new Error('Refusing E2E cleanup without a generated runner ID.');
  }
  const expectedName = `easygen_e2e_${runId.replaceAll('-', '')}`;
  if (databaseName !== expectedName || !/^easygen_e2e_[0-9a-f]{32}$/.test(expectedName)) {
    throw new Error('Refusing E2E cleanup for a database not owned by this runner.');
  }
  const uri = config.webServer?.env?.['MONGODB_URI'];
  if (typeof uri !== 'string') throw new Error('Refusing E2E cleanup without the runner MongoDB URI.');
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Refusing E2E cleanup for an invalid MongoDB URI.');
  }
  if (parsed.protocol !== 'mongodb:' || parsed.hostname !== '127.0.0.1' || parsed.port !== '27017'
    || parsed.username !== '' || parsed.password !== '' || parsed.pathname !== `/${expectedName}`
    || parsed.search !== '' || parsed.hash !== '' || uri !== `mongodb://127.0.0.1:27017/${expectedName}`) {
    throw new Error('Refusing E2E cleanup outside the exact runner-owned loopback database.');
  }
  return { uri, databaseName: expectedName };
}

export async function cleanupE2EDatabase(
  config: CleanupConfig,
  createClient: (uri: string) => CleanupClient = (uri) => new MongoClient(uri),
): Promise<void> {
  const { uri, databaseName } = cleanupTarget(config);
  const client = createClient(uri);
  try {
    await client.connect();
    await client.db(databaseName).dropDatabase();
  } finally {
    await client.close();
  }
}

export default async function globalTeardown(config: FullConfig): Promise<void> {
  await cleanupE2EDatabase(config);
}
