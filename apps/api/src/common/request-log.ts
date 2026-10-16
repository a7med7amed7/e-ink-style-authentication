import type { Request, RequestHandler } from "express";
import { performance } from "node:perf_hooks";

export interface RequestCompletionLog {
  readonly requestId: string;
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly elapsedMs: number;
}

export interface RequestCompletionLoggerOptions {
  readonly now?: () => number;
  readonly write?: (record: RequestCompletionLog) => void;
}

export function createRequestCompletionLogger(
  options: RequestCompletionLoggerOptions = {},
): RequestHandler {
  const now = options.now ?? (() => performance.now());
  const write = options.write ?? ((record: RequestCompletionLog) => {
    console.info(JSON.stringify(record));
  });

  return (request, response, next) => {
    const startedAt = now();

    response.once("finish", () => {
      const routePath = (request as unknown as { readonly route?: { readonly path?: unknown } })
        .route?.path;
      const route = typeof routePath === "string"
        ? `${request.baseUrl}${routePath}` || "/"
        : "unmatched";
      const requestId = (request as Request & { requestId?: string }).requestId;
      const record: RequestCompletionLog = {
        requestId: typeof requestId === "string" ? requestId : "unknown",
        method: request.method,
        route,
        status: response.statusCode,
        elapsedMs: Math.max(0, Math.round(now() - startedAt)),
      };
      write(record);
    });

    next();
  };
}
