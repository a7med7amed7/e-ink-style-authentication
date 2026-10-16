# FULLTEXT DDL must run outside migrator transactions

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/db/ensure-forms-full-text.ts` (companion to search helper)
- File: `platform/backend/services/forms/src/migrate.ts`
- Commit: `d02739e3` — `feat(localization): [WMS-462] Enhancing shared code and fixing drizzle FTS issue`

## Before (rejected / buggy)
Embedding `CREATE FULLTEXT CATALOG/INDEX` inside normal Drizzle migration SQL. SQL Server rejects FULLTEXT DDL inside a user transaction (Drizzle migrator wraps statements), causing migrate failures even when FTS is installed.

## After (accepted / fixed)
Idempotent ensure script run **after** migrator, on the raw pool:

```ts
// migrate.ts
// FULLTEXT DDL cannot run inside drizzle's migrator transaction.
await ensureFormsFullTextObjects(pool);
```

Ensure SQL feature-detects `IsFullTextInstalled`, creates catalog/index only if missing, no-ops on Edge/no-FTS.

## Why it matters
Repository search that depends on FULLTEXT needs a bootstrap pattern: detect capability, run DDL outside transactions, keep app search fallback when FTS is absent. Applies to any MSSQL service adding FTS, not only forms.

## Skill candidate tag
other:fts-ddl-outside-tx
