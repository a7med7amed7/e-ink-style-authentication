# Phase 2 origin middleware T035 evidence

Owned files:
- `apps/api/test/security-primitives.test.ts`
- `apps/api/src/security/origin.middleware.ts`

## K035 red-first and implementation evidence

Before `origin.middleware.ts` existed, the exact K035 command failed during focused TypeScript compilation with the intended missing-module diagnostic:

```text
test/security-primitives.test.ts(5,40): error TS2307: Cannot find module '../src/security/origin.middleware.js' or its corresponding type declarations.
```

The Node test runner did not execute because the build step failed. The first implementation compile also exposed a type-boundary issue: Express `Request` is weakly typed relative to T034's `ApiErrorRequest`. The middleware now passes the generated request ID through the helper's structural request shape; runtime bootstrap attaches that request ID before middleware runs.

Final K035 command:

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/security-primitives.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='origin:' apps/api/dist-test/targets/security-primitives.test/test/security-primitives.test.js
```

Observed exit 0, 8/8 passing: exact Origin and JSON with UTF-8 charset, JSON without charset, null/untrusted/malformed/list Origins, trusted Referer fallback only when Origin is absent, exact AJAX header, bodyless logout without a media type, unsupported media mapping to 400 validation error, and GET bypass of the POST policy. Error cases assert no-store, contract code, matching generated request ID body/header.

Additional checks:

- `PATH=/tmp/easygen-node-v24.22.0/bin:$PATH ./node_modules/.bin/eslint apps/api/src/security/origin.middleware.ts apps/api/test/security-primitives.test.ts` — exit 0.
- `PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run typecheck --workspace @easygen/api` — exit 0.

## Middleware interface

`createOriginMiddleware(trustedOrigin: string): RequestHandler` validates POST requests. Origin is compared exactly; Referer is parsed only when Origin is absent, and credentials or an untrusted origin reject. It requires `X-Requested-With: XMLHttpRequest`, and requires `application/json` for `signup`/`signin` request paths while allowing bodyless logout. Rejections call T034 `writeApiError` with `UNTRUSTED_ORIGIN`, `CSRF_REJECTED`, or `VALIDATION_ERROR`.
