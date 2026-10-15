import type { NextFunction, Request, RequestHandler, Response } from "express";
import session, { type SessionOptions, type Store } from "express-session";
import type { ApiConfig } from "../config.js";
import { writeApiError, type ApiErrorRequest } from "../common/api-error.filter.js";
import { clearSessionCookieOptions, installPinnedTouch, pinSessionCookie, sessionCookieConfiguration } from "./cookie.js";
import type { SessionPolicy } from "./policy.js";

export interface SessionMiddlewareDependencies {
  readonly config: Readonly<ApiConfig>;
  readonly store: Store;
  readonly policy: SessionPolicy;
}

export function createSessionOptions(
  config: Readonly<ApiConfig>,
  store: Store,
): SessionOptions {
  const cookieConfiguration = sessionCookieConfiguration(config.nodeEnv);
  return {
    name: cookieConfiguration.name,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: "keep",
    cookie: { ...cookieConfiguration.cookie },
  };
}

export function createSessionMiddleware(
  dependencies: SessionMiddlewareDependencies,
): RequestHandler {
  const middleware = session(createSessionOptions(dependencies.config, dependencies.store));

  return (request: Request, response: Response, next: NextFunction): void => {
    middleware(request, response, (error?: unknown) => {
      if (error) {
        writeApiError(request as ApiErrorRequest, response, error);
        return;
      }

      const loadedSession = request.session;
      installPinnedTouch(loadedSession);
      const auth = loadedSession.auth;
      if (auth !== undefined) {
        if (!dependencies.policy.isActive(auth)) {
          Object.defineProperty(request, "session", {
            configurable: true,
            writable: true,
            value: undefined,
          });
          response.clearCookie(
            sessionCookieConfiguration(dependencies.config.nodeEnv).name,
            clearSessionCookieOptions(dependencies.config.nodeEnv),
          );
          next();
          return;
        }

        const deadlines = dependencies.policy.deadlines(auth);
        if (!deadlines) {
          Object.defineProperty(request, "session", {
            configurable: true,
            writable: true,
            value: undefined,
          });
          response.clearCookie(
            sessionCookieConfiguration(dependencies.config.nodeEnv).name,
            clearSessionCookieOptions(dependencies.config.nodeEnv),
          );
          next();
          return;
        }

        pinSessionCookie(loadedSession, deadlines.deadline);
      }

      next();
    });
  };
}
