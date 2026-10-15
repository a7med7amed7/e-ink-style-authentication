# Phase 2 API error boundary lane

Status: T034/K034 GREEN.

Owned files: `apps/api/test/api-error.test.ts` and `apps/api/src/common/api-error.filter.ts` only. T033/K033 was green first (`npm run db:up && npm run build:test:api`, per setup; healthy Mongo and complete API test compilation).

TDD evidence: K034 before the implementation failed specifically on the missing `../src/common/api-error.filter.js` import (TS2307), after correcting strict test typing. With the implementation, K034 passed all 6 focused tests.

`ApiHttpError` carries only allowlisted codes and code-derived status/messages. Validation fields accept recognized `email`, `name`, and `password` names and emit fixed safe messages, discarding caller messages and unknown keys. `writeApiError(request, response, exception)` is the shared helper for the Nest filter and raw middleware: it always sets `Cache-Control: no-store`, uses only a validated server-generated v4 `request.requestId` or generates a new UUID (never reads inbound headers), sets the matching `X-Request-Id`, and emits the shared error envelope. It maps existing session-store and auth-capacity typed errors, includes safe whole-second `Retry-After` when available, normalizes 413/415 parser failures to contract 400, and returns a generic sanitized 500 for unexpected errors.

Checks on the pinned runtime (`PATH=/tmp/easygen-node-v24.22.0/bin:$PATH`):

- K034 exact command: exit 0, 6/6 tests passed.
- Targeted ESLint on both owned files: exit 0.
- `npm run typecheck --workspace @easygen/api`: exit 0.
- Production filter file is 99 lines, within the per-task 100-line cap.

Raw middleware interface shared with `workspace_setup`: `writeApiError(req, res, error)`; `ApiErrorRequest` exposes optional `requestId`, and `ApiErrorResponse` is structural Express-compatible (`setHeader`, `status`, `json`). Throw/use `new ApiHttpError(code, options)` for typed errors.

No task checkboxes or commits were changed.
