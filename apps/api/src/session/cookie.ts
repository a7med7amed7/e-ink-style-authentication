import type { NodeEnvironment } from "../config.js";
import { SESSION_IDLE_TIMEOUT_MS } from "./policy.js";

const DEVELOPMENT_COOKIE_NAME = "easygen.sid";
const PRODUCTION_COOKIE_NAME = "__Host-easygen.sid";

export interface SessionCookieAttributes {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "strict";
  readonly path: "/";
  readonly maxAge: number;
}

export interface SessionCookieClearAttributes {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "strict";
  readonly path: "/";
}

export interface SessionCookieConfiguration {
  readonly name: string;
  readonly cookie: SessionCookieAttributes;
}

export function sessionCookieConfiguration(
  nodeEnv: NodeEnvironment,
): SessionCookieConfiguration {
  const production = nodeEnv === "production";
  return Object.freeze({
    name: production ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME,
    cookie: Object.freeze({
      httpOnly: true,
      secure: production,
      sameSite: "strict" as const,
      path: "/" as const,
      maxAge: SESSION_IDLE_TIMEOUT_MS,
    }),
  });
}

export function clearSessionCookieOptions(
  nodeEnv: NodeEnvironment,
): SessionCookieClearAttributes {
  return Object.freeze({
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "strict",
    path: "/",
  });
}

interface SessionCookieTarget {
  cookie: {
    expires?: Date | null | undefined;
  };
}

export function pinSessionCookie(
  session: SessionCookieTarget,
  deadline: number | Date,
): Date {
  const timestamp = deadline instanceof Date ? deadline.getTime() : deadline;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError("Session cookie deadline must be a valid epoch millisecond value");
  }

  const expires = new Date(timestamp);
  if (!Number.isFinite(expires.getTime())) {
    throw new RangeError("Session cookie deadline is outside the supported date range");
  }

  session.cookie.expires = expires;
  return expires;
}

export function installPinnedTouch<T extends { touch: () => unknown }>(session: T): T {
  Object.defineProperty(session, "touch", {
    configurable: true,
    enumerable: false,
    value: () => session,
    writable: true,
  });
  return session;
}
