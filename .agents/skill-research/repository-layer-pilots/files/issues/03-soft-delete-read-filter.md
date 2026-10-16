# Soft-delete filter on every read path

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup` (pattern present from day one)
- Related: `ThumbnailRepository.ts` (`8bbdb581`) — `findByFileAndSize` / `findThumbnailsByFileId` use `isNull(fileThumbnails.deletedAt)`; `findByStatus` added in `cf03e71d` with `includeDeleted` default false

## Before (rejected / buggy)
Without `isNull(deletedAt)`, soft-deleted rows surface as live entities. Any new find method that omits the filter re-introduces the leak (common review miss).

## After (accepted / fixed)
```typescript
async findById(id: string, includeDeleted = false): Promise<File | null> {
  const conditions = [eq(files.id, id)];
  if (!includeDeleted) {
    conditions.push(isNull(files.deletedAt));
  }
  // ...
}

// Same optional includeDeleted pattern on findByIds / findByStatus
// Thumbnail reads always AND isNull(fileThumbnails.deletedAt)
```

## Why it matters
Soft-delete is only real if every default read path excludes deleted rows. An `includeDeleted` opt-in keeps admin/cleanup paths possible without weakening the default.

## Skill candidate tag
timestamps-soft-delete
