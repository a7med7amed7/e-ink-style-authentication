---
name: writing-mssql-drizzle-migrations
description: Use when creating, editing, or reviewing any Drizzle migration for SQL Server (MSSQL) in this monorepo — new tables, columns, indexes, constraints, backfills, or DDL. Covers idempotent DDL (IF EXISTS / IF NOT EXISTS), letting the database generate UUIDs (NEWSEQUENTIALID) instead of the app, ISJSON/CHECK constraints, manual INCLUDE covering-index clauses Drizzle drops, filtered indexes for soft-deleted rows, batched backfills to avoid lock contention, forward-only migration discipline, and DDL that cannot run inside the migrator transaction.
---

# Writing MSSQL / Drizzle Migrations

## Overview

The Drizzle `node-mssql` migrator applies every pending migration inside **one transaction**, by
name, exactly once per environment. Dev often runs a lighter SQL Server edition than production,
so a migration can pass locally and fail on deploy. Migrations are the least-reversible thing we
ship. Core principle: **write every migration so it is safe to run against a live, non-empty
production database with a different feature set than your laptop, in a shared transaction, and
so re-running or partial failure never corrupts schema provenance.**

Review the generated `migration.sql` by hand every time — `pnpm db:generate` produces a draft,
not a finished artifact. The generator drops `INCLUDE` clauses, cannot express filtered indexes,
never batches backfills, and does not know which DDL is transaction-illegal.

## When to Use

Any diff under a `drizzle/` folder, any `migration.sql`, or any change to `src/db/schema.ts` that
will generate one. Also when reviewing a teammate's migration in an MR.

## Rule 1: Forward-only — never edit an applied migration

The migrator selects pending migrations **by folder name**. Any environment that already ran the
original will **never** run your edit, so the file silently misrepresents what actually executed,
and fresh environments run different SQL than deployed ones did.

- To change or drop a released object, generate a **new** forward migration (`DROP INDEX ...`,
  `ALTER TABLE ...`). Never touch a baseline or historical migration file.
- Before editing any migration, check whether it already exists at the merge base
  (`git show <merge-base>:<path>`). If it does, treat it as immutable.
- No nested `BEGIN TRAN` / `COMMIT` — the migrator owns the transaction.
- No second "full schema" migration after incremental ones already created the tables.
- `migration.down.sql` is written manually, for dev/incident rollback only — never run from app
  startup or CI deploy.

## Rule 2: Make DDL idempotent

Migrations get re-attempted (retried deploys, recovered environments, local resets). Bare DDL
throws on the second run and can leave a half-applied batch. Guard object creation and drops.

```sql
-- ✅ Drops: always IF EXISTS
DROP INDEX IF EXISTS [idx_files_uploader] ON [files];

-- ✅ Column add: guard so a re-run is a no-op
IF COL_LENGTH('dbo.comments', 'request_id') IS NULL
  ALTER TABLE [comments] ADD [request_id] uniqueidentifier;

-- ✅ Table create: guard when a re-run is plausible
IF OBJECT_ID('dbo.thumbnail_resolutions', 'U') IS NULL
  CREATE TABLE [thumbnail_resolutions] ( ... );
```

A bare `DROP INDEX [x] ON [t];` (no `IF EXISTS`) is the single most common re-run failure. If you
see one in review, flag it.

## Rule 3: Let the database generate UUID keys

UUID primary keys are `uniqueidentifier` with a **database-side** default, not values the
application invents and inserts. App-generated `randomUUID()` / `NEWID()` produces random keys
that fragment the clustered index and lose the DB-side guarantee.

```sql
-- ✅ DB generates a sequential UUID; index-friendly
[id] uniqueidentifier CONSTRAINT [t_id_default] DEFAULT (NEWSEQUENTIALID()),
CONSTRAINT [t_pkey] PRIMARY KEY ([id])
```

Use the shared `mssqlUuidPrimaryKey` / `NEWSEQUENTIALID()` helpers. Do not use `NEWID()`, app
`randomUUID()`, or `VARCHAR(36)` for DB PKs.

## Rule 4: Constrain data at the schema, not just the app

The database is the last line of defense; app validation can be bypassed by other writers,
scripts, or future services.

- Add `CHECK` constraints for invariants the column must always hold (e.g. `ISJSON([col]) = 1`
  for a JSON text column, allowed-value checks for a status).
- Make columns `NOT NULL` with a sensible `DEFAULT` rather than allowing nulls and back-patching.
- Do **not** pollute rows with sentinel placeholders (`'pending'`, `0`) for incomplete records —
  make the column nullable and enforce the value only at the terminal state.
- `createdAt` / `updatedAt` use DB defaults (`CURRENT_TIMESTAMP` / `GETUTCDATE()`). Remember: the
  `updatedAt` default fires only on INSERT, so application updates must set it explicitly.

## Rule 5: Indexes — INCLUDE and filtered predicates by hand

Drizzle Kit cannot emit SQL Server's `INCLUDE` clause or filtered `WHERE`, so you edit the
generated SQL manually and re-check on every future `db:generate` (Kit may drop your edits).

```sql
-- ✅ Covering index: append INCLUDE for the columns the query returns
CREATE INDEX [audit_logs_resource_createdAt_covering_idx]
  ON [audit_logs] ([resource],[createdAt])
  INCLUDE ([id],[actor],[action],[entity_id]);

-- ✅ Filtered index: exclude soft-deleted rows from list/lookup indexes
CREATE INDEX [workflows_active_list_idx]
  ON [workflows] ([createdAt],[id]) WHERE [deletedAt] IS NULL;

-- ✅ Filtered UNIQUE: uniqueness only among non-null / live rows
CREATE UNIQUE INDEX [users_keycloak_sub_key]
  ON [users] ([keycloak_sub]) WHERE [keycloak_sub] IS NOT NULL;
```

If a table has soft deletes, its list and uniqueness indexes almost always want
`WHERE [deletedAt] IS NULL`.

## Rule 6: Backfills must survive real data

A migration that only ran against an empty local DB has never exercised its backfill.

- Rehearse against a snapshot with **existing rows**; assert the backfilled values, that CHECK
  constraints hold, and that dropped indexes are gone.
- On high-scale tables, **never** run an unbatched `UPDATE`/`DELETE` — it holds locks, bloats the
  transaction log, and times out the deploy. Batch with `UPDATE TOP (N)` in a `WHILE` loop.
- Use `TRY_CAST` / null-safe extraction so malformed source rows keep a safe value instead of
  failing the whole statement.

## Rule 7: Transaction-illegal DDL runs outside the migrator

Some SQL Server DDL (e.g. `CREATE FULLTEXT CATALOG` / `CREATE FULLTEXT INDEX`) throws Msg 574
inside a user transaction and aborts the entire pending batch — including unrelated migrations
queued in the same deploy. An `IF <capability>` guard does not help: it is false on a lighter dev
edition (hiding the bug) and true on production (running the illegal DDL). Move such DDL to a
post-migrate bootstrap step on a raw autocommit connection, after `migrate()` returns, guarded by
the capability check and the runtime feature flag.

## Pre-Push Checklist

- [ ] No already-applied migration was edited (checked against the merge base).
- [ ] Every `DROP`/`CREATE`/`ALTER` that might re-run is guarded (`IF EXISTS` / `IF NOT EXISTS` / `COL_LENGTH` / `OBJECT_ID`).
- [ ] UUID PKs use `NEWSEQUENTIALID()` DB default, not app-generated IDs.
- [ ] Invariants enforced with CHECK / NOT NULL + DEFAULT, not just app code.
- [ ] `INCLUDE` and filtered `WHERE` clauses added by hand and survive re-generation.
- [ ] Soft-delete tables have `WHERE [deletedAt] IS NULL` on list/uniqueness indexes.
- [ ] Backfill rehearsed on non-empty data; large-table updates batched.
- [ ] No nested `BEGIN TRAN`; transaction-illegal DDL bootstrapped separately.
- [ ] Generated SQL reviewed line-by-line before commit.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The generator output is fine as-is" | It drops INCLUDE, can't do filtered/idempotent DDL, never batches. Always review. |
| "It ran fine locally" | Local is empty and a lighter edition. Rehearse on real data + prod feature set. |
| "I'll just make the old migration idempotent" | Editing an applied migration is a forward-only violation. Add a new one. |
| "App code validates it, so no CHECK needed" | Other writers bypass app code. The DB is the last guarantee. |
| "randomUUID() in the app is simpler" | It fragments the clustered index and drops the DB-side default. Let the DB generate it. |
| "IF EXISTS is noise on a fresh DB" | Migrations re-run on retries and resets. Bare DDL fails the second time. |
