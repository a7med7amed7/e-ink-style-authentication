# Batch multi-ID lookups with inArray

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: `promoteFiles` / `softDeleteFiles` / `isUserAuthorized` / `hasMismatchedTag` all use `inArray(files.id, fileIds)` instead of per-ID loops

## Before (rejected / buggy)
Loading or mutating N files with N separate `findById` / `updateStatus` calls creates an N+1 query pattern and races between checks and writes.

## After (accepted / fixed)
```typescript
async findByIds(ids: string[], includeDeleted = false): Promise<File[]> {
  if (ids.length === 0) return [];
  const conditions = [inArray(files.id, ids)];
  if (!includeDeleted) {
    conditions.push(isNull(files.deletedAt));
  }
  return await this.db.select().from(files).where(and(...conditions));
}

// Bulk promote / soft-delete also filter with inArray in one UPDATE
```

## Why it matters
Repository methods that accept ID lists should issue one set-based query. Service layers can then map results without round-tripping per entity.

## Skill candidate tag
batching-n1
