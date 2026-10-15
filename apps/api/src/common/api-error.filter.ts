import { randomUUID } from "node:crypto";
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";

export type ApiErrorCode =
  | "VALIDATION_ERROR" | "INVALID_CREDENTIALS" | "UNAUTHENTICATED" | "UNTRUSTED_ORIGIN"
  | "CSRF_REJECTED" | "EMAIL_ALREADY_REGISTERED" | "RATE_LIMITED" | "SESSION_STORE_UNAVAILABLE"
  | "AUTH_CAPACITY_EXCEEDED" | "SERVICE_UNAVAILABLE" | "NOT_FOUND" | "INTERNAL_ERROR";
const definitions: Record<ApiErrorCode, { readonly status: number; readonly message: string }> = {
  VALIDATION_ERROR: { status: 400, message: "The request is invalid." },
  INVALID_CREDENTIALS: { status: 401, message: "Invalid email or password." },
  UNAUTHENTICATED: { status: 401, message: "Authentication is required." },
  UNTRUSTED_ORIGIN: { status: 403, message: "Request origin is not trusted." },
  CSRF_REJECTED: { status: 403, message: "Request could not be verified." },
  EMAIL_ALREADY_REGISTERED: { status: 409, message: "An account with this email address already exists." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Please try again later." },
  SESSION_STORE_UNAVAILABLE: { status: 503, message: "Session service is temporarily unavailable." },
  AUTH_CAPACITY_EXCEEDED: { status: 503, message: "Authentication service is temporarily busy." },
  SERVICE_UNAVAILABLE: { status: 503, message: "Service is temporarily unavailable." },
  NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  INTERNAL_ERROR: { status: 500, message: "An unexpected error occurred." },
};
const fieldMessages = { email: "Enter a valid email address.", name: "Enter a valid name.", password: "Enter a valid password." } as const;
type ValidationField = keyof typeof fieldMessages;
type ErrorFields = Partial<Record<ValidationField, string[]>>;
type ErrorOptions = { readonly fields?: Readonly<Record<string, readonly unknown[]>>; readonly retryAfterSeconds?: number };
type ApiErrorBody = { readonly error: { readonly code: string; readonly message: string; readonly requestId: string; readonly fields?: ErrorFields } };
export interface ApiErrorRequest { readonly requestId?: unknown }
export interface ApiErrorResponse {
  setHeader(name: string, value: string): unknown;
  status(statusCode: number): ApiErrorResponse;
  json(body: ApiErrorBody): unknown;
}

export class ApiHttpError extends HttpException {
  readonly fields?: ErrorFields;
  readonly retryAfterSeconds?: number;

  constructor(readonly code: ApiErrorCode, options: ErrorOptions = {}) {
    super(definitions[code].message, definitions[code].status);
    this.name = "ApiHttpError";
    if (code === "VALIDATION_ERROR" && options.fields) {
      const safe: ErrorFields = {};
      for (const field of Object.keys(fieldMessages) as ValidationField[]) {
        const messages = options.fields[field];
        if (Array.isArray(messages) && messages.length > 0) safe[field] = [fieldMessages[field]];
      }
      if (Object.keys(safe).length > 0) this.fields = safe;
    }
    const retryAfter = options.retryAfterSeconds;
    if (code === "AUTH_CAPACITY_EXCEEDED") this.retryAfterSeconds = 1;
    else if (code === "RATE_LIMITED" && typeof retryAfter === "number" && Number.isSafeInteger(retryAfter) && retryAfter >= 0) this.retryAfterSeconds = retryAfter;
  }
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && Object.hasOwn(definitions, value);
}
function fromStatus(status: number): ApiErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 413 || status === 415) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "UNTRUSTED_ORIGIN";
  if (status === 409) return "EMAIL_ALREADY_REGISTERED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "INTERNAL_ERROR";
}
function mappedError(exception: unknown): { code: ApiErrorCode; fields?: ErrorFields; retryAfterSeconds?: number } {
  if (exception instanceof ApiHttpError) {
    return { code: exception.code, ...(exception.fields ? { fields: exception.fields } : {}), ...(exception.retryAfterSeconds !== undefined ? { retryAfterSeconds: exception.retryAfterSeconds } : {}) };
  }
  if (typeof exception !== "object" || exception === null) return { code: "INTERNAL_ERROR" };
  const candidate = exception as { code?: unknown; status?: unknown; statusCode?: unknown; retryAfterSeconds?: unknown };
  if (isApiErrorCode(candidate.code)) {
    const retryAfter = candidate.code === "AUTH_CAPACITY_EXCEEDED" ? 1 : candidate.retryAfterSeconds;
    return { code: candidate.code, ...(typeof retryAfter === "number" && Number.isSafeInteger(retryAfter) && retryAfter >= 0 ? { retryAfterSeconds: retryAfter } : {}) };
  }
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status === "number") return { code: fromStatus(status) };
  if (exception instanceof HttpException) return { code: fromStatus(exception.getStatus()) };
  return { code: "INTERNAL_ERROR" };
}

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function writeApiError(request: ApiErrorRequest, response: ApiErrorResponse, exception: unknown): void {
  const requestId = typeof request.requestId === "string" && requestIdPattern.test(request.requestId) ? request.requestId : randomUUID();
  const mapped = mappedError(exception);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Request-Id", requestId);
  if (mapped.retryAfterSeconds !== undefined) response.setHeader("Retry-After", String(mapped.retryAfterSeconds));
  const { status, message } = definitions[mapped.code];
  response.status(status).json({ error: { code: mapped.code, message, requestId, ...(mapped.code === "VALIDATION_ERROR" && mapped.fields ? { fields: mapped.fields } : {}) } });
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    writeApiError(http.getRequest<ApiErrorRequest>(), http.getResponse<ApiErrorResponse>(), exception);
  }
}
