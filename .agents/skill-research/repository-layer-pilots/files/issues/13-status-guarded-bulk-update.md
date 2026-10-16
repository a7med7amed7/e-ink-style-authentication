# Status-guarded bulk updates (predicate before promote)

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: upload lifecycle commit `22423fd7` keeps typed `FileStatusType` on status transitions; promotion clears `expiresAt`

## Before (rejected / buggy)
Updating by ID alone can promote PENDING/DELETED/AVAILABLE rows into AVAILABLE, skipping lifecycle invariants and clearing expiry incorrectly.

## After (accepted / fixed)
```typescript
async promoteFiles(fileIds: string[], tx?: FilesDbOrTx): Promise<File[]> {
  if (fileIds.length === 0) return [];
  const dbToUse = tx || this.db;
  return await dbToUse
    .update(files)
    .set({
      status: FileStatus.AVAILABLE,
      expiresAt: null, // Clear expiration when promoted
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.status, FileStatus.STAGED),
        isNull(files.deletedAt)
      )
    )
    .output();
}
```

Rows that fail the predicate are silently skipped (returned set is only successfully promoted rows).

## Why it matters
State-machine transitions belong in the WHERE clause, not only in service `if` checks. Concurrent callers cannot promote the wrong status if the update is status-guarded.

## Skill candidate tag
filter-edge-cases
