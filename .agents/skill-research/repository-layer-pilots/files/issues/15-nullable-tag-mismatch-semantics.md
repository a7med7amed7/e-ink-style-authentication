# Nullable ownership field: mismatch only when tag is set

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `16359082` — `feat(file): [WMS-388] Fixing security issues`
- Related: `7b84d191` adds nullable `tag` column; `createPendingFile` accepts optional `tag`

## Before (rejected / buggy)
A naive `eq(files.tag, authenticatedTag)` on all rows treats `NULL` tags as mismatches (SQL three-valued logic: `NULL = 'x'` is unknown). Alternatively, requiring tag on every historical row breaks pre-tag data.

## After (accepted / fixed)
```typescript
and(
  inArray(files.id, fileIds),
  isNull(files.deletedAt),
  isNotNull(files.tag),
  not(eq(files.tag, authenticatedTag))
)
```

Only explicit cross-tag rows fail; null-tag legacy/pending rows do not trip the mismatch helper.

## Why it matters
When adding a new tenant/ownership column as nullable, authz SQL must encode the null policy deliberately (`isNotNull` + inequality) rather than relying on `eq` alone.

## Skill candidate tag
authz-in-sql
