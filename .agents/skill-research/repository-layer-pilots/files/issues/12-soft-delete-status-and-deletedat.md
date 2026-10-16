# Soft-delete write: status + deletedAt + updatedAt together

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: `updateStatus` also sets `deletedAt` when `status === FileStatus.DELETED`; `softDeleteFiles` WHERE requires `isNull(files.deletedAt)` (idempotent)

## Before (rejected / buggy)
Setting only `status = 'DELETED'` without `deletedAt` breaks read filters that key off `isNull(deletedAt)`. Setting only `deletedAt` leaves status-based queries inconsistent.

## After (accepted / fixed)
```typescript
async softDeleteFiles(fileIds: string[], tx?: FilesDbOrTx): Promise<File[]> {
  if (fileIds.length === 0) return [];
  const dbToUse = tx || this.db;
  return await dbToUse
    .update(files)
    .set({
      status: FileStatus.DELETED,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(inArray(files.id, fileIds), isNull(files.deletedAt)))
    .output();
}
```

## Why it matters
Soft-delete must keep status enums and `deletedAt` in lockstep, and only touch rows not already deleted, so cleanup and list APIs stay coherent.

## Skill candidate tag
timestamps-soft-delete
