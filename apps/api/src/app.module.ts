import { Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { getConnectionToken, MongooseModule } from "@nestjs/mongoose";
import { ThrottlerModule } from "@nestjs/throttler";
import type { MongoStore as MongoSessionStore } from "connect-mongo";
import MongoStore from "connect-mongo";
import type { SessionData } from "express-session";
import type { Connection as MongooseConnection } from "mongoose";
import type { ApiConfig } from "./config.js";
import { HashWork } from "./security/hash-work.js";
import { PasswordService } from "./security/password.service.js";
import { sessionCookieConfiguration } from "./session/cookie.js";
import { SessionPolicy } from "./session/policy.js";
import { SessionStoreAdapter } from "./session/store.js";
import { RateLimitGuard, RATE_LIMIT_POLICIES } from "./security/rate-limit.guard.js";

export const APP_CONFIG = Symbol("APP_CONFIG");
export const APP_TEST_HOOKS = Symbol("APP_TEST_HOOKS");
export const HASH_WORK = Symbol("HASH_WORK");
export const PASSWORD_SERVICE = Symbol("PASSWORD_SERVICE");
export const SESSION_POLICY = Symbol("SESSION_POLICY");
export const MONGO_SESSION_STORE = Symbol("MONGO_SESSION_STORE");
export const SESSION_STORE = Symbol("SESSION_STORE");

export type StoreGetCallback = (
  error: unknown,
  session?: SessionData | null,
) => void;
export type StoreSetCallback = (error?: unknown) => void;

export interface SessionStoreCallbacks {
  readonly get?: (sid: string, callback: StoreGetCallback) => void;
  readonly set?: (
    sid: string,
    session: SessionData,
    callback?: StoreSetCallback,
  ) => void;
  readonly destroy?: (sid: string, callback?: StoreSetCallback) => void;
}

export interface RoutePolicyOverride {
  readonly limit: number;
  readonly ttl: number;
  readonly blockDuration?: number;
}

export interface AppTestHooks {
  readonly wallClock?: () => number;
  readonly storeCallbacks?: SessionStoreCallbacks;
  readonly routePolicies?: Readonly<Record<string, RoutePolicyOverride>>;
  readonly assetsDirectory?: string;
}

export interface AppFactoryOptions {
  readonly config: Readonly<ApiConfig>;
  readonly test?: AppTestHooks;
}

function installStoreCallbacks(
  store: MongoSessionStore,
  callbacks: SessionStoreCallbacks | undefined,
): MongoSessionStore {
  if (callbacks?.get) Object.defineProperty(store, "get", { configurable: true, value: callbacks.get });
  if (callbacks?.set) Object.defineProperty(store, "set", { configurable: true, value: callbacks.set });
  if (callbacks?.destroy) {
    Object.defineProperty(store, "destroy", { configurable: true, value: callbacks.destroy });
  }
  return store;
}

@Module({})
// Nest requires a module class token even though registration is static.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {
  static register(options: AppFactoryOptions): DynamicModule {
    const { config, test } = options;
    const sessionCookie = sessionCookieConfiguration(config.nodeEnv);

    return {
      module: AppModule,
      imports: [
        ThrottlerModule.forRoot([{ limit: 120, ttl: 60_000 }]),
        MongooseModule.forRoot(config.mongodbUri, {
          retryAttempts: 1,
          retryDelay: 100,
          maxPoolSize: 10,
          minPoolSize: 0,
          connectTimeoutMS: 5_000,
          serverSelectionTimeoutMS: 5_000,
          waitQueueTimeoutMS: 5_000,
        }),
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_TEST_HOOKS, useValue: test ?? Object.freeze({}) },
        {
          provide: RATE_LIMIT_POLICIES,
          useValue: test?.routePolicies ?? Object.freeze({}),
        },
        RateLimitGuard,
        { provide: APP_GUARD, useExisting: RateLimitGuard },
        { provide: HASH_WORK, useFactory: () => new HashWork() },
        {
          provide: PASSWORD_SERVICE,
          inject: [HASH_WORK],
          useFactory: (hashWork: HashWork) => PasswordService.create(hashWork),
        },
        {
          provide: SESSION_POLICY,
          useFactory: () => new SessionPolicy(test?.wallClock),
        },
        {
          provide: MONGO_SESSION_STORE,
          inject: [getConnectionToken()],
          useFactory: (connection: MongooseConnection) => installStoreCallbacks(
            MongoStore.create({
              client: connection.getClient(),
              dbName: connection.name,
              collectionName: "sessions",
              autoRemove: "native",
              touchAfter: 0,
              ttl: sessionCookie.cookie.maxAge / 1_000,
            }),
            test?.storeCallbacks,
          ),
        },
        {
          provide: SESSION_STORE,
          inject: [MONGO_SESSION_STORE],
          useFactory: (store: MongoSessionStore) => new SessionStoreAdapter(store),
        },
      ],
      exports: [
        APP_CONFIG,
        APP_TEST_HOOKS,
        RATE_LIMIT_POLICIES,
        HASH_WORK,
        PASSWORD_SERVICE,
        SESSION_POLICY,
        MONGO_SESSION_STORE,
        SESSION_STORE,
      ],
    };
  }
}
