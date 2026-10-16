# MSSQL-safe lexicographic cursor seek

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/form/infrastructure/form.repository.ts`
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form.repository.ts`
- File: `platform/backend/services/forms/src/modules/form-template/infrastructure/form-template.repository.ts`
- File: `platform/backend/services/forms/src/modules/sub-form-template/infrastructure/sub-form-template.repository.ts`
- Commit: `75df0386` — `fix(forms): [WMS-422] paginate entity lists newest-first on createdAt`

## Before (rejected / buggy)
Row-value / tuple predicates in raw SQL, e.g. ``sql`(${col.createdAt}, ${col.id}) > (${cursor.createdAt}, ${cursor.id})` `` (or `<` with `updatedAt`), mixed ASC/DESC orders across entity lists. Unreliable on SQL Server via Drizzle and easy to invert relative to `orderBy`.

## After (accepted / fixed)
Stable newest-first lists: `orderBy(desc(createdAt), desc(id))` plus an expanded seek:

```ts
or(
  lt(table.createdAt, cursorCreatedAt),
  and(eq(table.createdAt, cursorCreatedAt), lt(table.id, cursor.id))
)
```

Cursor timestamp parsed with `new Date(cursor.createdAt)` before comparison.

## Why it matters
Drizzle/MSSQL repositories should not rely on PostgreSQL-style row constructors for keyset pagination. Explicit lexicographic `OR`/`AND` seeks stay portable, match DESC/ASC, and keep id as a deterministic tie-breaker.

## Skill candidate tag
cursor-pagination
