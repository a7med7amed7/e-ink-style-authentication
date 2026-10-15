import type { Request, Response } from "express";
import type { ApiConfig } from "../config.js";
import { ApiHttpError } from "../common/api-error.filter.js";
import { clearSessionCookieOptions, installPinnedTouch, pinSessionCookie, sessionCookieConfiguration } from "./cookie.js";
import type { SessionPolicy } from "./policy.js";
import { SessionStoreUnavailableError } from "./store.js";

function detach(request: Request): void {
  Object.defineProperty(request, "session", { configurable: true, writable: true, value: undefined });
}

function sessionFrom(request: Request): Request["session"] | undefined {
  const session: unknown = Reflect.get(request, "session");
  return session === undefined || session === null ? undefined : request.session;
}

function save(session: Request["session"]): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((error) => {
      if (error) reject(error instanceof Error ? error : new Error("Session save failed"));
      else resolve();
    });
  });
}

export class SessionService {
  constructor(
    private readonly policy: SessionPolicy,
    private readonly config: Readonly<ApiConfig>,
    private readonly wallClock: () => number = Date.now,
  ) {}

  async establish(request: Request, response: Response, userId: string): Promise<void> {
    try {
      if (!sessionFrom(request)) request.sessionStore.generate(request);
      await new Promise<void>((resolve, reject) => {
        request.session.regenerate((error) => {
          if (error) reject(error instanceof Error ? error : new Error("Session regeneration failed"));
          else resolve();
        });
      });

      const authenticatedAt = this.wallClock();
      const auth = { userId, authenticatedAt, lastActivityAt: authenticatedAt };
      const deadlines = this.policy.deadlines(auth);
      if (!deadlines) throw new Error("Session authentication timestamp is invalid");

      const authenticatedSession = installPinnedTouch(request.session);
      authenticatedSession.auth = auth;
      pinSessionCookie(authenticatedSession, deadlines.deadline);
      await save(authenticatedSession);
    } catch (error) {
      detach(request);
      response.clearCookie(
        sessionCookieConfiguration(this.config.nodeEnv).name,
        clearSessionCookieOptions(this.config.nodeEnv),
      );
      if (error instanceof SessionStoreUnavailableError) {
        throw new ApiHttpError("SESSION_STORE_UNAVAILABLE");
      }
      throw error;
    }
  }

  requireSession(request: Request, response: Response): string {
    const auth = sessionFrom(request)?.auth;
    if (!this.policy.isActive(auth)) {
      detach(request);
      response.clearCookie(
        sessionCookieConfiguration(this.config.nodeEnv).name,
        clearSessionCookieOptions(this.config.nodeEnv),
      );
      throw new ApiHttpError("UNAUTHENTICATED");
    }
    return auth.userId;
  }

  async renew(request: Request, response: Response): Promise<void> {
    const session = sessionFrom(request);
    const nextAuth = this.policy.renew(session?.auth);
    if (!session || !nextAuth) {
      detach(request);
      response.clearCookie(
        sessionCookieConfiguration(this.config.nodeEnv).name,
        clearSessionCookieOptions(this.config.nodeEnv),
      );
      throw new ApiHttpError("UNAUTHENTICATED");
    }

    const deadlines = this.policy.deadlines(nextAuth);
    if (!deadlines) throw new ApiHttpError("UNAUTHENTICATED");
    session.auth = nextAuth;
    installPinnedTouch(session);
    pinSessionCookie(session, deadlines.deadline);
    try {
      await save(session);
    } catch (error) {
      detach(request);
      response.clearCookie(
        sessionCookieConfiguration(this.config.nodeEnv).name,
        clearSessionCookieOptions(this.config.nodeEnv),
      );
      if (error instanceof SessionStoreUnavailableError) {
        throw new ApiHttpError("SESSION_STORE_UNAVAILABLE");
      }
      throw error;
    }

    if (!this.policy.isActive(nextAuth)) {
      detach(request);
      response.clearCookie(
        sessionCookieConfiguration(this.config.nodeEnv).name,
        clearSessionCookieOptions(this.config.nodeEnv),
      );
      throw new ApiHttpError("UNAUTHENTICATED");
    }
  }

  async destroy(request: Request, response: Response): Promise<void> {
    const session = sessionFrom(request);
    this.requireSession(request, response);
    if (!session) throw new ApiHttpError("UNAUTHENTICATED");
    try {
      await new Promise<void>((resolve, reject) => {
        session.destroy((error) => {
          if (error) reject(error instanceof Error ? error : new Error("Session destruction failed"));
          else resolve();
        });
      });
    } catch (error) {
      if (error instanceof SessionStoreUnavailableError) {
        throw new ApiHttpError("SESSION_STORE_UNAVAILABLE");
      }
      throw error;
    }

    detach(request);
    response.clearCookie(
      sessionCookieConfiguration(this.config.nodeEnv).name,
      clearSessionCookieOptions(this.config.nodeEnv),
    );
  }
}
