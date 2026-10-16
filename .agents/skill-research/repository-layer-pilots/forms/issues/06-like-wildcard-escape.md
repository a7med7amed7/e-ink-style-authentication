# Escape user input in LIKE patterns

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form-list-search.ts`
- File: `platform/backend/services/forms/src/modules/sub-form/__tests__/sub-form-list-search.test.ts`
- Commit: `63c73ac1` — introduced `escapeSqlServerLikeWildcards` on list search (replaced raw `` like(col, `%${search}%`) ``)

## Before (rejected / buggy)
```ts
like(subForms.name, `%${filters.search}%`)
// or prefix: like(subForms.name, `${filters.search}%`)
```
User input containing `%` or `_` changed match semantics (and could broaden scans unexpectedly).

## After (accepted / fixed)
```ts
const pattern = `%${escapeSqlServerLikeWildcards(search)}%`;
// ...
sql`... LIKE ${pattern} ESCAPE '\\'`
```
Unit test: `escapes LIKE wildcards in the fallback branch` for inputs like `100%`.

## Why it matters
SQL Server `LIKE` treats `%`/`_` as metacharacters. Every Drizzle repository that builds LIKE from request params needs escape + an `ESCAPE` clause (or equivalent), independent of column type.

## Skill candidate tag
like-search
