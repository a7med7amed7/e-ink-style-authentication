import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiHttpError, writeApiError } from "../common/api-error.filter.js";

function hasTrustedReferer(request: Request, trustedOrigin: string): boolean {
  const referer = request.get("referer");
  if (referer === undefined || referer.length === 0 || referer === "null") return false;

  try {
    const parsed = new URL(referer);
    return parsed.origin === trustedOrigin && parsed.username.length === 0 && parsed.password.length === 0;
  } catch {
    return false;
  }
}

function hasTrustedRequestOrigin(request: Request, trustedOrigin: string): boolean {
  const origin = request.get("origin");
  if (origin !== undefined) return origin === trustedOrigin;
  return hasTrustedReferer(request, trustedOrigin);
}

function requiresJsonBody(request: Request): boolean {
  const path = request.path.replace(/\/+$/, "").toLowerCase();
  const finalSegment = path.slice(path.lastIndexOf("/") + 1);
  return finalSegment === "signup" || finalSegment === "signin";
}

function reject(
  request: Request,
  response: Response,
  code: "UNTRUSTED_ORIGIN" | "CSRF_REJECTED" | "VALIDATION_ERROR",
): void {
  const requestId = (request as Request & { readonly requestId?: unknown }).requestId;
  writeApiError({ requestId }, response, new ApiHttpError(code));
}

export function createOriginMiddleware(trustedOrigin: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method !== "POST") {
      next();
      return;
    }

    if (!hasTrustedRequestOrigin(request, trustedOrigin)) {
      reject(request, response, "UNTRUSTED_ORIGIN");
      return;
    }

    if (request.get("x-requested-with") !== "XMLHttpRequest") {
      reject(request, response, "CSRF_REJECTED");
      return;
    }

    if (requiresJsonBody(request) && request.is("application/json") !== "application/json") {
      reject(request, response, "VALIDATION_ERROR");
      return;
    }

    next();
  };
}
