# Dev connection pool singleton on globalThis

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/db/client.ts`
- Commit: `bdce5cb0` — `fix(build-automation): [WMS-000] Adjust consistent connections drizzle`
- Related: `afce75f8` — initial pool without reuse

## Before (rejected / buggy)
```typescript
export const pool = new sql.ConnectionPool(parseSqlServerDatabaseUrl(url));
```

Each module reload or test file import created a new pool — connection exhaustion and inconsistent Drizzle client instances in dev/test.

## After (accepted / fixed)
```typescript
const globalForPool = globalThis as unknown as { logsSqlPool?: sql.ConnectionPool };

export const pool =
  globalForPool.logsSqlPool ?? new sql.ConnectionPool(parseSqlServerDatabaseUrl(url));

if (process.env.NODE_ENV !== 'production') {
  globalForPool.logsSqlPool = pool;
}
```

## Why it matters
In non-production environments with hot reload or repeated Jest workers, reusing a single `ConnectionPool` on `globalThis` prevents connection leaks and matches patterns used across other Drizzle services in the monorepo.

## Skill candidate tag
other:connection-pool-singleton
