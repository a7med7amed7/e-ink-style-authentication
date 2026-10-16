# Dev-only SQL pool singleton on `globalThis`

## Service
users

## Evidence
- File: `modules/users/backend/src/db/client.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- Commit: `bdce5cb0` — fix(build-automation): [WMS-000] Adjust consistent connections drizzle

## Before (rejected / buggy)
Each hot-reload created a new `ConnectionPool` — connection exhaustion in dev:

```typescript
export const pool = new sql.ConnectionPool(parseSqlServerDatabaseUrl(url));
export const db = drizzle({ client: pool, schema: usersServiceSchema });
```

## After (accepted / fixed)
Pool reused via `globalThis` in non-production:

```typescript
const globalForPool = globalThis as unknown as { usersSqlPool?: sql.ConnectionPool };

export const pool =
  globalForPool.usersSqlPool ?? new sql.ConnectionPool(parseSqlServerDatabaseUrl(url));

if (process.env.NODE_ENV !== 'production') {
  globalForPool.usersSqlPool = pool;
}

export const db = drizzle({ client: pool, schema: usersServiceSchema });
```

`UsersDbOrTx` type exported after pool init (`5276a42d`).

## Why it matters
Repository code assumes injected `UsersDb` from singleton client. Skill for service bootstrap should document pool dedup pattern for MSSQL + Drizzle in monorepo services.

## Skill candidate tag
other:dev-pool-singleton
