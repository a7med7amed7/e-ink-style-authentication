# Allowlist dynamic SQL identifiers and collation fragments

## Service
forms

## Evidence
- File: related shared helper used by forms repos — `platform/backend/shared/lib/src/localization/assert-localized-field-unique.ts`
- Commit: `f10ac6c2` — `feat(localization): [WMS-462] Enhancing code reusability - Making shared functions more generic`
- Call sites: form / sub-form / sub-form-template repositories under SERIALIZABLE writes

## Before (rejected / buggy)
Risk of interpolating table/column/collation names from configuration or callers into raw `sql` fragments. Identifiers cannot be bound as parameters on SQL Server, so naive `${column}` from strings is an injection footgun.

## After (accepted / fixed)
```ts
const SAFE_SQL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_COLLATIONS: Record<string, SQL> = {
  Latin1_General_CS_AS: sql`COLLATE Latin1_General_CS_AS`,
};
// reject unknown identifiers; only emit static collation SQL from the map
```
Values remain parameterized (`OPENJSON`, comparisons); only validated identifiers enter the SQL text.

## Why it matters
Any Drizzle repository that builds dynamic `FROM`/`COLLATE`/JSON path SQL must separate **bindable values** from **allowlisted identifiers**. This is independent of localization—the same rule applies to multi-tenant table names, filtered indexes, etc.

## Skill candidate tag
dynamic-sql-safety
