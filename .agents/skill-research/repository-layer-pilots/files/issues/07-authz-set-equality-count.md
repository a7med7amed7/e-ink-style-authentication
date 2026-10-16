# Authorization via set-equality count in SQL

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: pairs with later `hasMismatchedTag` (`16359082`) for service-tag authz; both project only `{ id }`

## Before (rejected / buggy)
Fetching full rows and filtering ownership in application memory is slower and easier to get wrong (e.g. treating “found some” as “found all”). Missing IDs silently pass if the check is `some` instead of `every`.

## After (accepted / fixed)
```typescript
async isUserAuthorized(userId: string, fileIds: string[]): Promise<boolean> {
  if (fileIds.length === 0) return true;

  const userFiles = await this.db
    .select({ id: files.id })
    .from(files)
    .where(
      and(inArray(files.id, fileIds), eq(files.uploadedById, userId), isNull(files.deletedAt))
    );

  return userFiles.length === fileIds.length;
}
```

Any missing or unauthorized ID shrinks the result set → `false`.

## Why it matters
Batch authorization must prove *all* requested IDs are allowed. Comparing result cardinality to input length is a simple, SQL-backed all-or-nothing check.

## Skill candidate tag
authz-in-sql
