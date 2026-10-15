# Phase 2 rate-limit guard lane

Status: T036/K036 GREEN.

Owned files: `apps/api/test/rate-limit.test.ts`, `apps/api/src/security/rate-limit.guard.ts` only. T033 and T034 were green first. K036 before the guard failed at the intended missing module (`TS2307`); the test suite then passed 3/3 after implementation.

`RateLimitGuard` extends the pinned Nest throttler guard, uses its `req.ip` tracker, and injects the per-app Throttler storage rather than owning global state. The route policy map is `METHOD /api/auth/path`: signup 5/900000 ms, signin 10/60000 ms, `/me` 120/60000 ms, logout 30/60000 ms; unmatched routes use 120/60000 ms. Optional test route overrides use exported `RATE_LIMIT_POLICIES` injection token and the same map shape as app test hooks. T038 must provide that token from per-app hooks.

The pinned `@nestjs/throttler` storage returns `timeToBlockExpire` in seconds although TTL and block duration inputs are milliseconds. The guard preserves that seconds value in `Retry-After`, clamps a blocked retry to at least one second, and throws `ApiHttpError('RATE_LIMITED')` for the standard sanitized 429 envelope.

Checks on the pinned runtime (`PATH=/tmp/easygen-node-v24.22.0/bin:$PATH`):

- K036 exact command: exit 0, 3/3 tests passed.
- Targeted ESLint on both owned files: exit 0.
- `npm run typecheck --workspace @easygen/api`: exit 0.

No task checkboxes or commits were changed.
