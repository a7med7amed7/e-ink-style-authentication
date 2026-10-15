import { randomBytes, randomUUID } from "node:crypto";
import { getConnectionToken } from "@nestjs/mongoose";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { MongoStore } from "connect-mongo";
import type { Db, MongoClient } from "mongodb";
import type { Agent } from "supertest";
import supertest from "supertest";
import type { Connection } from "mongoose";
import { parseConfig } from "../../src/config.js";
import {
  MONGO_SESSION_STORE,
  SESSION_STORE,
  type AppTestHooks,
  type RoutePolicyOverride,
  type SessionStoreCallbacks,
} from "../../src/app.module.js";
import { buildApp } from "../../src/bootstrap.js";
import type { SessionStoreAdapter } from "../../src/session/store.js";

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/easygen";
const TEST_DATABASE_PREFIX = "easygen_test";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface ControlledClock {
  now(): number;
  set(timestamp: number): void;
  advance(milliseconds: number): number;
}

export function createControlledClock(initialTimestamp = Date.now()): ControlledClock {
  if (!Number.isSafeInteger(initialTimestamp) || initialTimestamp < 0) {
    throw new RangeError("Initial test clock value must be a non-negative epoch millisecond value");
  }

  let timestamp = initialTimestamp;
  return Object.freeze({
    now: () => timestamp,
    set: (nextTimestamp: number) => {
      if (!Number.isSafeInteger(nextTimestamp) || nextTimestamp < 0) {
        throw new RangeError("Test clock value must be a non-negative epoch millisecond value");
      }
      timestamp = nextTimestamp;
    },
    advance: (milliseconds: number) => {
      if (!Number.isSafeInteger(milliseconds)) {
        throw new RangeError("Test clock advance must be an integer millisecond value");
      }
      timestamp += milliseconds;
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
        throw new RangeError("Test clock value is outside the supported epoch range");
      }
      return timestamp;
    },
  });
}

function makeTestDatabaseName(): string {
  return `${TEST_DATABASE_PREFIX}_${String(process.pid)}_${randomUUID().replaceAll("-", "")}`;
}

function isolateMongoUri(sourceUri: string, databaseName: string): string {
  if (!/^easygen_test_[0-9]+_[a-f0-9]{32}$/.test(databaseName)) {
    throw new Error("Test database name is not an owned fixture database");
  }

  let uri: URL;
  try {
    uri = new URL(sourceUri);
  } catch {
    throw new Error("A valid local MongoDB URI is required for integration fixtures");
  }

  const hostname = uri.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    uri.protocol !== "mongodb:" ||
    !LOOPBACK_HOSTS.has(hostname) ||
    uri.hash.length > 0
  ) {
    throw new Error("Integration fixtures are restricted to a local MongoDB server");
  }

  uri.pathname = `/${databaseName}`;
  return uri.toString();
}

export interface MongoFixtureOptions {
  readonly mongodbUri?: string;
  readonly clock?: ControlledClock;
  readonly storeCallbacks?: SessionStoreCallbacks;
  readonly routePolicies?: Readonly<Record<string, RoutePolicyOverride>>;
  readonly assetsDirectory?: string;
}

export interface MongoFixture {
  readonly app: NestExpressApplication;
  readonly agent: Agent;
  readonly config: ReturnType<typeof parseConfig>;
  readonly clock: ControlledClock;
  readonly databaseName: string;
  readonly database: Db;
  readonly client: MongoClient;
  readonly store: MongoStore;
  readonly sessionStore: SessionStoreAdapter;
  readonly authHeaders: Readonly<Record<string, string>>;
  teardown(): Promise<void>;
}

export async function createRealMongoFixture(
  options: MongoFixtureOptions = {},
): Promise<MongoFixture> {
  const databaseName = makeTestDatabaseName();
  const sourceUri =
    options.mongodbUri ??
    process.env["TEST_MONGODB_URI"] ??
    process.env["MONGODB_URI"] ??
    DEFAULT_MONGO_URI;
  const mongodbUri = isolateMongoUri(sourceUri, databaseName);
  const config = parseConfig({
    NODE_ENV: "test",
    APP_ORIGIN: "http://127.0.0.1:5173",
    MONGODB_URI: mongodbUri,
    SESSION_SECRET: randomBytes(32).toString("base64"),
  });
  const clock = options.clock ?? createControlledClock();
  const testHooks: AppTestHooks = {
    wallClock: () => clock.now(),
    ...(options.storeCallbacks ? { storeCallbacks: options.storeCallbacks } : {}),
    ...(options.routePolicies ? { routePolicies: options.routePolicies } : {}),
    ...(options.assetsDirectory ? { assetsDirectory: options.assetsDirectory } : {}),
  };
  const app = await buildApp({ config, test: testHooks });

  let database: Db | undefined;
  try {
    const connection = app.get<Connection>(getConnectionToken());
    const client = connection.getClient();
    database = connection.db;
    if (!database || database.databaseName !== databaseName) {
      throw new Error("Fixture connection did not select its owned test database");
    }

    const store = app.get<MongoStore>(MONGO_SESSION_STORE);
    await store.collectionP;
    const sessionStore = app.get<SessionStoreAdapter>(SESSION_STORE);
    const authHeaders = Object.freeze({
      origin: config.appOrigin,
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/json",
    });
    const agent = supertest.agent(app.getHttpServer());

    let teardownPromise: Promise<void> | undefined;
    const teardown = (): Promise<void> => {
      teardownPromise ??= (async () => {
        let dropError: Error | undefined;
        try {
          if (database?.databaseName === databaseName) await database.dropDatabase();
        } catch (error) {
          dropError = error instanceof Error
            ? error
            : new Error("Fixture database cleanup failed", { cause: error });
        }

        try {
          // Mongoose owns this one client; MongoStore shares it and is not closed separately.
          await app.close();
        } catch (closeError) {
          if (dropError !== undefined) {
            throw new AggregateError([dropError, closeError], "Fixture database cleanup and app close failed");
          }
          throw closeError;
        }

        if (dropError !== undefined) throw dropError;
      })();
      return teardownPromise;
    };

    return Object.freeze({
      app,
      agent,
      config,
      clock,
      databaseName,
      database,
      client,
      store,
      sessionStore,
      authHeaders,
      teardown,
    });
  } catch (error) {
    try {
      if (database?.databaseName === databaseName) await database.dropDatabase();
    } finally {
      await app.close();
    }
    throw error;
  }
}
