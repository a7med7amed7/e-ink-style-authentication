# Cache MSSQL connection pool across hot reloads

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/db/client.ts`
- Commit: `ceb3b2a4` — read `DATABASE_URL` directly; introduce `FormsDbOrTx`; stash pool on `globalThis` in non-production
- Commit: `bdce5cb0` — `fix(build-automation): [WMS-000] Adjust consistent connections drizzle` (reuse existing global pool when present)

## Before (rejected / buggy)
```ts
export const pool = new sql.ConnectionPool(...);
export const db = drizzle({ client: pool, schema });
```
Under tsx/watch or Jest re-imports, each evaluation opened a new pool → connection exhaustion / flaky local runs.

## After (accepted / fixed)
```ts
const globalForPool = globalThis as unknown as { formsSqlPool?: sql.ConnectionPool };
export const pool =
  globalForPool.formsSqlPool ?? new sql.ConnectionPool(parseSqlServerDatabaseUrl(url));
if (process.env.NODE_ENV !== 'production') {
  globalForPool.formsSqlPool = pool;
}
export type FormsDbOrTx = FormsDb | Parameters<Parameters<FormsDb['transaction']>[0]>[0];
```

## Why it matters
Drizzle MSSQL clients in Node services need a singleton pool story for local hot reload, plus a `Db | Tx` type so repository helpers accept both outer `db` and transaction clients.

## Skill candidate tag
other:connection-pool-singleton
