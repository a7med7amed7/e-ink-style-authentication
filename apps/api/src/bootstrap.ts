import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import type { MongoStore } from "connect-mongo";
import helmet from "helmet";
import type { ApiConfig } from "./config.js";
import { ApiErrorFilter, writeApiError } from "./common/api-error.filter.js";
import {
  AppModule,
  MONGO_SESSION_STORE,
  SESSION_POLICY,
  SESSION_STORE,
  type AppTestHooks,
} from "./app.module.js";
import { createOriginMiddleware } from "./security/origin.middleware.js";
import { createSessionMiddleware } from "./session/session.middleware.js";
import type { SessionPolicy } from "./session/policy.js";
import type { SessionStoreAdapter } from "./session/store.js";
import { USER_MODEL_NAME, UserSchema, type UserRecord } from "./auth/user.schema.js";

export function resolveBuiltAssetsDirectory(
  directory: string,
  required: boolean,
): string | undefined {
  const absoluteDirectory = resolve(directory);
  if (existsSync(resolve(absoluteDirectory, "index.html"))) return absoluteDirectory;
  if (required) throw new Error("Required web assets are missing");
  return undefined;
}

export function resolveWorkspaceAssetsDirectory(
  repositoryRoot: string,
  required: boolean,
): string | undefined {
  return resolveBuiltAssetsDirectory(resolve(repositoryRoot, "apps/web/dist"), required);
}

function resolveAssetsDirectory(options: BuildAppOptions): string | undefined {
  const requestedDirectory = options.test?.assetsDirectory;
  if (requestedDirectory !== undefined) {
    const assetsDirectory = resolveBuiltAssetsDirectory(requestedDirectory, true);
    if (assetsDirectory === undefined) {
      throw new Error("The test web assets directory must contain index.html");
    }
    return assetsDirectory;
  }

  return resolveWorkspaceAssetsDirectory(
    process.cwd(),
    options.config.nodeEnv === "production",
  );
}

function isApiPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === "/api" || normalized.startsWith("/api/");
}

export function createSecurityHeaders(nodeEnv: ApiConfig["nodeEnv"]) {
  if (nodeEnv === "production") return helmet();
  return helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: null },
    },
  });
}

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export interface BuildAppOptions {
  readonly config: Readonly<ApiConfig>;
  readonly test?: AppTestHooks;
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<NestExpressApplication> {
  if (options.test && options.config.nodeEnv !== "test") {
    throw new Error("Test app hooks require NODE_ENV=test");
  }

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(options),
    { abortOnError: false, bodyParser: false, bufferLogs: true },
  );

  try {
    app.disable("x-powered-by");
    app.getHttpAdapter().getInstance().set(
      "trust proxy",
      [...options.config.trustedProxyCidrs],
    );
    app.use((request: Request, response: Response, next: NextFunction) => {
      const requestId = randomUUID();
      request.requestId = requestId;
      response.setHeader("X-Request-Id", requestId);
      next();
    });

    app.use(createSecurityHeaders(options.config.nodeEnv));
    app.use(createOriginMiddleware(options.config.appOrigin));

    const assetsDirectory = resolveAssetsDirectory(options);
    if (assetsDirectory !== undefined) {
      const staticFiles = express.static(assetsDirectory);
      app.use((request: Request, response: Response, next: NextFunction) => {
        if (isApiPath(request.path)) {
          next();
          return;
        }
        staticFiles(request, response, next);
      });
      app.use((request: Request, response: Response, next: NextFunction) => {
        if (request.method !== "GET" || isApiPath(request.path)) {
          next();
          return;
        }
        response.sendFile(resolve(assetsDirectory, "index.html"), (error) => {
          if (error !== undefined) next(error);
        });
      });
    }

    const sessionStore = app.get<SessionStoreAdapter>(SESSION_STORE);
    const sessionPolicy = app.get<SessionPolicy>(SESSION_POLICY);
    app.use("/api/auth", createSessionMiddleware({
      config: options.config,
      store: sessionStore,
      policy: sessionPolicy,
    }));

    app.use(express.json({ limit: "16kb" }));
    const rawBodyErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      writeApiError(request, response, error);
    };
    app.use(rawBodyErrorHandler);
    app.useGlobalFilters(new ApiErrorFilter());

    await app.init();
    const connection = app.get<Connection>(getConnectionToken());
    const userModel = connection.models[USER_MODEL_NAME] ??
      connection.model<UserRecord>(USER_MODEL_NAME, UserSchema);
    await userModel.createIndexes();
    const store = app.get<MongoStore>(MONGO_SESSION_STORE);
    await store.collectionP;
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
